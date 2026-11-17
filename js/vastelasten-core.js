// Vaste Lasten bridge tussen de bestaande Store-state en PWA-Core v1.1.0.
import { createVault } from './core/vault-factory.js';
import { createSync } from './core/sync-factory.js';
import { createSessionLock } from './core/session-lock-factory.js';
import { createBiometric } from './core/biometric-factory.js';
import { createBundleBiometric, generateBundleKey, wrapVaultKey, unwrapVaultKey } from './bundle-biometric.js';
import { createClient } from './core/github.js';
import {
  VAULT_DOMAINS,
  createVaultDomains,
  createVaultRegistry,
  acquireActiveLocks,
  openAndSyncDomain,
  migrateActiveDomains,
  mergeDomainPayload,
  splitLegacyState,
  validateDomainPayload,
  assertEmptyDomainPayload,
  initializeEmptyDomain,
} from './multi-vault-adapter.js';

const clone = (value) => structuredClone(value);
const emptyPayload = (id, domains = VAULT_DOMAINS) => ({
  items: [], del: {}, paid: {},
  ...(id === 'shared' ? { meta: null } : {}),
  schema: 2, domain: domains[id].domain,
});

export function createVasteLastenCore({
  storage = globalThis.localStorage,
  kdfIterations = 600000,
  appName = 'Vaste Lasten',
  mergeStore,
  clientFactory = createClient,
  factories = {},
  workspaceId = 'default',
} = {}) {
  if (typeof mergeStore !== 'function') throw new TypeError('De bestaande Vaste Lasten merge-functie is verplicht.');
  const domains = createVaultDomains({ workspaceId });
  const registry = createVaultRegistry({
    createVault: factories.createVault || createVault,
    createSync: factories.createSync || createSync,
    createSessionLock: factories.createSessionLock || createSessionLock,
    createBiometric: factories.createBiometric || createBiometric,
    storage,
    kdfIterations,
    appName,
    domains,
  });

  const makeBundleKey = factories.generateBundleKey || generateBundleKey;
  const wrapBundleKey = factories.wrapVaultKey || wrapVaultKey;
  const unwrapBundleKey = factories.unwrapVaultKey || unwrapVaultKey;
  const bundleStorageKey = (person) => workspaceId === 'default'
    ? `vaste-lasten:biometric-bundle:${person}:v1`
    : `vaste-lasten:${workspaceId}:biometric-bundle:${person}:v1`;
  const deviceBiometricFor = (person) => {
    if (!['p1', 'p2'].includes(person)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    if (!deviceBiometrics.has(person)) {
      const factory = factories.createDeviceBiometric || createBundleBiometric;
      deviceBiometrics.set(person, factory({
        storagePrefix: workspaceId === 'default' ? `vaste-lasten-device-${person}` : `vaste-lasten-${workspaceId}-device-${person}`,
        // Herkoppelen accepteert uitsluitend de eigen actieve Core-domeinen
        // (plus de nieuwe device-bundel), niet de persoonlijke kluis van de ander.
        allowedUserHandlePrefixes: [
          domains.shared.storagePrefix,
          domains[`personal-${person}`].storagePrefix,
        ],
        appName,
        storage,
      }));
    }
    return deviceBiometrics.get(person);
  };
  const activeIdsFor = (person) => ['shared', `personal-${person}`];
  async function createBiometricBundle(person, bundleKey) {
    const keys = {};
    for (const id of activeIdsFor(person)) {
      keys[id] = await wrapBundleKey(registry[id].vault.getDataKey(), bundleKey);
    }
    return { schema: 1, me: person, keys, createdAt: Date.now() };
  }
  function readBiometricBundle(person) {
    const raw = storage.getItem(bundleStorageKey(person));
    if (!raw) throw new Error('De lokale sleutelbundel ontbreekt. Ontgrendel beide kluizen met hun wachtwoorden en koppel daarna je bestaande passkey opnieuw.');
    let record;
    try { record = JSON.parse(raw); } catch {
      throw new Error('De lokale passkey-sleutelbundel is beschadigd. Ontgrendel met je wachtwoorden en koppel de passkey opnieuw.');
    }
    const ids = activeIdsFor(person);
    if (!record || record.schema !== 1 || record.me !== person || !record.keys
      || ids.some((id) => !record.keys[id])
      || Object.keys(record.keys).some((id) => !ids.includes(id))) {
      throw new Error('De lokale passkey-sleutelbundel hoort niet bij deze gebruiker of mist een actieve kluis. Koppel de passkey opnieuw.');
    }
    return record;
  }

  let me = null;
  let settings = null;
  let session = null;
  const deviceBiometrics = new Map();
  let persistQueue = Promise.resolve();
  let persistFailure = null;

  const activeIds = () => {
    if (!me) throw new Error('Kies eerst wie dit apparaat gebruikt.');
    return ['shared', `personal-${me}`];
  };
  const requireSession = () => {
    if (!session) throw new Error('De Core-kluizen zijn vergrendeld.');
    for (const id of activeIds()) {
      if (!registry[id].vault.isUnlocked()) throw new Error('Niet alle actieve Core-kluizen zijn ontgrendeld.');
    }
  };
  const requireActiveVault = (id) => {
    if (!session) throw new Error('De Core-kluizen zijn vergrendeld.');
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    if (!registry[id].vault.isUnlocked()) throw new Error(`De kluis ${id} is vergrendeld.`);
  };

  async function resolveSettings(input) {
    if (!input || !input.owner || !input.repo || !input.token) {
      throw new Error('De GitHub-instellingen zijn onvolledig.');
    }
    const probe = clientFactory({
      ...input,
      branch: input.branch || 'main',
      path: domains.shared.path,
    });
    const info = await probe.checkRepo();
    if (!info.private) throw new Error('De gegevensrepository moet privé zijn.');
    return { ...input, branch: input.branch || info.defaultBranch };
  }

  async function acquire(meValue) {
    if (!['p1', 'p2'].includes(meValue)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    if (session) {
      if (me !== meValue) throw new Error('Vergrendel eerst de huidige sessie voordat je van persoon wisselt.');
      return;
    }
    me = meValue;
    session = await acquireActiveLocks(registry, me);
  }

  async function release() {
    if (!session) return;
    // Wacht eerst alle al gestarte app-saves af; pas daarna flushen en vergrendelen.
    // Zo kan een persistState-bewerking niet na de lock nog data proberen te schrijven.
    await persistQueue;
    if (persistFailure) throw persistFailure;
    // acquireActiveLocks flushes, locks and then releases both Web Locks.
    await session.release();
    session = null;
    me = null;
    settings = null;
    persistQueue = Promise.resolve();
  }

  function getState() {
    requireSession();
    return {
      samen: clone(registry.shared.vault.getData()),
      eigen: clone(registry[`personal-${me}`].vault.getData()),
    };
  }

  function syncOptions(id) {
    if (!settings) throw new Error('Er is nog geen actieve GitHub-verbinding; synchroniseren kan pas na verbinden.');
    const spec = domains[id];
    return {
      settings: { ...settings, path: spec.path },
      merge: (local, remote) => mergeDomainPayload(local, remote, id, mergeStore, domains),
      migrate: (remote) => validateDomainPayload(remote, id, domains),
      schemaVersion: 2,
    };
  }

  async function syncDomain(id) {
    requireActiveVault(id);
    const options = syncOptions(id);
    const remote = await clientFactory(options.settings).getFile();
    if (!remote) throw new Error(`Het remote Core-bestand voor ${id} ontbreekt. De bestaande lokale kluis wordt niet automatisch opnieuw gepubliceerd.`);
    return registry[id].sync.syncNow(options);
  }

  async function connect(inputSettings) {
    requireSession();
    settings = await resolveSettings(inputSettings);
    return sync();
  }

  async function flushLocal() {
    requireSession();
    await persistQueue;
    if (persistFailure) throw persistFailure;
    for (const id of activeIds()) await registry[id].vault.flush();
  }

  async function sync() {
    requireSession();
    await flushLocal();
    const results = {};
    for (const id of activeIds()) results[id] = await syncDomain(id);
    return { results, state: getState() };
  }

  function persistState(nextState) {
    requireSession();
    const snapshot = clone(nextState);
    const work = async () => {
      const split = splitLegacyState(snapshot, me);
      for (const id of activeIds()) {
        const vault = registry[id].vault;
        const current = vault.getData();
        // __pwaSync is owned by Core, not by the Vaste Lasten UI snapshot.
        // Keep the latest deletion/device ledger even when the UI snapshot is older.
        const appPayload = { ...split[id] };
        if (Object.hasOwn(current, '__pwaSync')) appPayload.__pwaSync = clone(current.__pwaSync);
        else delete appPayload.__pwaSync;
        const next = mergeDomainPayload(current, appPayload, id, mergeStore, domains);
        if (JSON.stringify(next) !== JSON.stringify(current)) await vault.setData(next);
        await vault.flush();
      }
    };
    const run = persistQueue.then(work);
    // Een volgende volledige snapshot mag een eerdere mislukte write inhalen.
    // Bewaar de fout totdat zo'n latere volledige opslag daadwerkelijk slaagt,
    // zodat flush/lock geen onbewaarde wijziging stilzwijgend kan afsluiten.
    persistQueue = run.then(
      () => { persistFailure = null; },
      (error) => { persistFailure = error; },
    );
    return run;
  }

  async function unlock({ me: meValue, passwords, settings: inputSettings } = {}) {

    const resolved = await resolveSettings(inputSettings);
    await acquire(meValue);
    settings = resolved;
    try {
      for (const id of activeIds()) {
        await openAndSyncDomain({
          id,
          password: passwords?.[id],
          legacyData: emptyPayload(id, domains),
          registry,
          settings,
          createClient: clientFactory,
          mergeStore,
          domains,
          allowCreate: false,
        });
      }
      return getState();
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Ontgrendelen mislukte en de sessie kon niet veilig worden vrijgegeven.');
      }
      throw error;
    }
  }

  /**
   * Veilige schone start: maakt alleen de actieve shared + persoonlijke kluis aan.
   * Deze route leest of migreert nooit legacygegevens en behoudt gedeeltelijk succes.
   */

  /**
   * Publiceert bestaande lokale-only kluizen veilig naar een nieuwe GitHub-repository.
   * Bestaande remote bestanden zijn alleen toegestaan als hun SHA al lokaal is bevestigd
   * (hervatten na een gedeeltelijke upload). Onbekende remote bestanden worden nooit samengevoegd of overschreven.
   */
  async function publishLocal({ me: meValue, passwords, settings: inputSettings } = {}) {
    const resolved = await resolveSettings(inputSettings);
    if (session) await release();
    await acquire(meValue);
    settings = resolved;
    const ids = activeIds();
    const results = {};
    let activeId = ids[0];
    try {
      const remotes = {};
      // Eerst alle remote bestanden lezen; vóór deze volledige preflight wordt niets gepubliceerd.
      for (const id of ids) {
        activeId = id;
        const options = { ...settings, path: domains[id].path };
        remotes[id] = await clientFactory(options).getFile();
      }
      for (const id of ids) {
        activeId = id;
        const vault = registry[id].vault;
        if (!vault.hasVault()) throw new Error(`De lokale kluis ${id} ontbreekt. Er is niets naar GitHub geschreven.`);
        await vault.unlockWithPassword(passwords?.[id]);
        validateDomainPayload(vault.getData(), id, domains);
        await vault.flush();
        const remote = remotes[id];
        if (remote) {
          const meta = vault.getSyncMeta();
          if (!meta.sha || meta.sha !== remote.sha) {
            throw new Error(`Het GitHub-bestand voor ${id} bestaat al, maar hoort niet aantoonbaar bij deze lokale kluis. Er is niets overschreven. Controleer de repository.`);
          }
          // De SHA moet niet alleen bekend zijn; de inhoud moet ook met deze lokale datasleutel ontsleutelen.
          validateDomainPayload(await vault.decryptRemote(remote.envelope), id, domains);
        }
      }
      for (const id of ids) {
        activeId = id;
        const vault = registry[id].vault;
        const remoteSettings = { ...settings, path: domains[id].path };
        const rejectUnexpectedRemote = () => {
          throw new Error(`Tijdens het koppelen verscheen onverwacht een ander GitHub-bestand voor ${id}. De lokale kluis is behouden; controleer de repository voordat je opnieuw probeert.`);
        };
        results[id] = await registry[id].sync.syncNow({
          settings: remoteSettings,
          merge: rejectUnexpectedRemote,
          migrate: rejectUnexpectedRemote,
          schemaVersion: 2,
        });
        await vault.flush();
        const confirmed = await clientFactory(remoteSettings).getFile();
        if (!confirmed || confirmed.sha !== vault.getSyncMeta().sha) {
          throw new Error(`GitHub heeft de publicatie van ${id} niet bevestigd. De lokale kluis is behouden; je kunt veilig opnieuw proberen.`);
        }
        validateDomainPayload(await vault.decryptRemote(confirmed.envelope), id, domains);
      }
      return { complete: true, results, state: getState() };
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Het koppelen is mislukt en de lokale kluizen konden niet veilig worden vergrendeld.');
      }
      return { complete: false, results, failedDomain: activeId, error };
    }
  }

  /**
   * Koppelt een nieuw apparaat aan bestaande PWA-Core-kluizen.
   * De gedeelde remote kluis moet bestaan; een ontbrekende persoonlijke kluis
   * wordt voor deze gebruiker leeg aangemaakt. Legacybestanden worden niet gelezen.
   */
  async function connectExisting({ me: meValue, passwords, settings: inputSettings } = {}) {
    const resolved = await resolveSettings(inputSettings);
    if (session) await release();
    await acquire(meValue);
    settings = resolved;
    const ids = activeIds();
    const results = {};
    let activeId = ids[0];
    try {
      const remotes = {};
      for (const id of ids) {
        activeId = id;
        remotes[id] = await clientFactory({ ...settings, path: domains[id].path }).getFile();
      }
      if (!remotes.shared) {
        throw new Error('De gedeelde PWA-Core-kluis ontbreekt in deze repository. Controleer de repository; er is niets aangemaakt of overschreven.');
      }
      const personalId = `personal-${me}`;
      if (!remotes[personalId]) {
        const newPersonalPassword = passwords?.[personalId];
        if (typeof newPersonalPassword !== 'string' || newPersonalPassword.length < 12) {
          throw new Error('Voor een nieuwe persoonlijke kluis is een wachtwoord van minstens 12 tekens nodig.');
        }
        if (newPersonalPassword === passwords?.shared) {
          throw new Error('Kies voor je persoonlijke kluis een ander wachtwoord dan het gezamenlijke wachtwoord.');
        }
      }
      for (const id of ids) {
        activeId = id;
        const vault = registry[id].vault;
        const password = passwords?.[id];
        if (typeof password !== 'string' || !password) {
          throw new Error(`Vul het wachtwoord voor ${id} in.`);
        }
        const remote = remotes[id];
        if (vault.hasVault()) {
          await vault.unlockWithPassword(password);
          validateDomainPayload(vault.getData(), id, domains);
          const meta = vault.getSyncMeta();
          if (remote) {
            if (!meta.sha || meta.sha !== remote.sha) {
              throw new Error(`De lokale kluis ${id} en het GitHub-bestand verschillen. Er is niets overschreven; herstel eerst de juiste koppeling.`);
            }
            validateDomainPayload(await vault.decryptRemote(remote.envelope), id, domains);
          } else if (id === 'shared' || meta.sha) {
            throw new Error(`Het eerder gekoppelde GitHub-bestand voor ${id} ontbreekt. De lokale kluis is behouden en wordt niet opnieuw gepubliceerd.`);
          }
        } else if (remote) {
          await vault.importEnvelope(remote.envelope, password);
          validateDomainPayload(vault.getData(), id, domains);
          vault.setSyncMeta({ ...vault.getSyncMeta(), sha: remote.sha, dirty: false });
        } else {
          if (id === 'shared') throw new Error('De gedeelde PWA-Core-kluis ontbreekt. Er is niets aangemaakt.');
          await vault.create(password, emptyPayload(id, domains));
          validateDomainPayload(vault.getData(), id, domains);
        }
        await vault.flush();
      }
      for (const id of ids) {
        activeId = id;
        const options = syncOptions(id);
        results[id] = await registry[id].sync.syncNow(options);
        await registry[id].vault.flush();
        const confirmed = await clientFactory({ ...settings, path: domains[id].path }).getFile();
        if (!confirmed || confirmed.sha !== registry[id].vault.getSyncMeta().sha) {
          throw new Error(`GitHub heeft de koppeling van ${id} niet bevestigd. Probeer opnieuw; bestaande gegevens blijven behouden.`);
        }
        validateDomainPayload(await registry[id].vault.decryptRemote(confirmed.envelope), id, domains);
      }
      return { complete: true, results, state: getState() };
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Het koppelen is mislukt en de lokale kluizen konden niet veilig worden vergrendeld.');
      }
      return { complete: false, results, failedDomain: activeId, error };
    }
  }

  async function initializeEmpty({ me: meValue, passwords, settings: inputSettings } = {}) {
    const resolved = await resolveSettings(inputSettings);
    await acquire(meValue);
    settings = resolved;
    const ids = activeIds();
    const results = {};
    try {
      for (const id of ids) {
        results[id] = await initializeEmptyDomain({
          id,
          password: passwords?.[id],
          registry,
          settings,
          createClient: clientFactory,
          mergeStore,
          domains,
        });
      }
      return { complete: true, results, state: getState() };
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'De lege start is gestopt en de sessie kon niet veilig worden vrijgegeven.');
      }
      return { complete: false, results, failedDomain: ids[Object.keys(results).length], error };
    }
  }

  /** Maakt gedeelde + persoonlijke lege kluizen uitsluitend lokaal aan, zonder GitHub-client. */
  async function initializeEmptyLocal({ me: meValue, passwords } = {}) {
    if (!['p1', 'p2'].includes(meValue)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    await acquire(meValue);
    settings = null;
    const ids = activeIds();
    const results = {};
    try {
      for (const id of ids) {
        const vault = registry[id].vault;
        const password = passwords?.[id];
        if (typeof password !== 'string' || password.length < 12) {
          throw new Error(`Kies voor ${id} een wachtwoord van minstens 12 tekens.`);
        }
        if (vault.hasVault()) {
          await vault.unlockWithPassword(password);
          assertEmptyDomainPayload(vault.getData(), id, domains);
          results[id] = { id, existing: true, localOnly: true };
        } else {
          await vault.create(password, emptyPayload(id, domains));
          assertEmptyDomainPayload(vault.getData(), id, domains);
          results[id] = { id, created: true, localOnly: true };
        }
        await vault.flush();
      }
      return { complete: true, localOnly: true, results, state: getState() };
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'De lokale lege start is gestopt en de sessie kon niet veilig worden vrijgegeven.');
      }
      return { complete: false, localOnly: true, results, failedDomain: ids[Object.keys(results).length], error };
    }
  }

  async function unlockLocal({ me: meValue, passwords } = {}) {

    await acquire(meValue);
    settings = null;
    try {
      for (const id of activeIds()) {
        if (!registry[id].vault.hasVault()) {
          throw new Error(`De lokale kluis ${id} ontbreekt. Verbind met internet om de bestaande remote kluis te importeren.`);
        }
        await registry[id].vault.unlockWithPassword(passwords?.[id]);
      }
      return getState();
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Lokale ontgrendeling mislukte en de sessie kon niet veilig worden vrijgegeven.');
      }
      throw error;
    }
  }

  async function unlockWithBiometric({ me: meValue, settings: inputSettings } = {}) {
    if (!['p1', 'p2'].includes(meValue)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    const ids = activeIdsFor(meValue);
    for (const id of ids) {
      if (!registry[id].vault.hasVault()) {
        throw new Error(`De lokale kluis ${id} ontbreekt. Ontgrendel eerst online met beide wachtwoorden en koppel daarna je bestaande passkey opnieuw.`);
      }
    }
    const biometric = deviceBiometricFor(meValue);
    if (!isBiometricEnrolled(meValue)) {
      throw new Error('Voor beide actieve kluizen is nog geen gezamenlijke passkey ingesteld.');
    }
    const bundle = readBiometricBundle(meValue);
    const bundleKey = await biometric.unlock();
    const dataKeys = {};
    for (const id of ids) dataKeys[id] = await unwrapBundleKey(bundle.keys[id], bundleKey);
    // Vraag pas na de biometrische bevestiging de twee Web Locks aan.
    // Annuleren van Face ID laat zo geen sessielock achter.
    await acquire(meValue);
    try {
      for (const id of ids) await registry[id].vault.unlockWithKey(dataKeys[id]);
      settings = inputSettings ? await resolveSettings(inputSettings) : null;
      if (settings) for (const id of ids) await syncDomain(id);
      return getState();
    } catch (error) {
      if (session) {
        try { await release(); } catch (releaseError) {
          throw new AggregateError([error, releaseError], 'Biometrisch ontgrendelen mislukte en de sessie kon niet veilig worden vrijgegeven.');
        }
      }
      throw error;
    }
  }

  async function unlockWithBiometricLocal({ me: meValue } = {}) {
    return unlockWithBiometric({ me: meValue });
  }

  async function migrate({
    state,
    getState: getLatestState,
    me: meValue,
    passwords,
    settings: inputSettings,
    legacySync,
    raiseBarrier,
  } = {}) {
    const resolved = await resolveSettings(inputSettings);
    await acquire(meValue);
    settings = resolved;
    let result;
    try {
      result = await migrateActiveDomains({
        state,
        getState: getLatestState,
        me,
        passwords,
        registry,
        settings,
        createClient: clientFactory,
        mergeStore,
        domains,
        legacySync,
        raiseBarrier,
      });
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Migratie mislukte en de sessie kon niet veilig worden vrijgegeven.');
      }
      throw error;
    }
    if (!result.complete) {
      await release();
      return result;
    }
    return { ...result, state: getState() };
  }

  async function changePassword(id, currentPassword, nextPassword) {
    requireSession();
    if (!settings) throw new Error('Wachtwoord wijzigen vereist een actieve GitHub-verbinding.');
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    await registry[id].vault.changePassword(currentPassword, nextPassword);
    return syncDomain(id);
  }

  async function enrollBiometric() {
    requireSession();
    const person = me;
    const biometric = deviceBiometricFor(person);
    if (biometric.isEnrolled()) throw new Error('Er is al een passkey voor beide actieve kluizen ingesteld. Kies Bestaande passkey koppelen als je deze opnieuw wilt verbinden.');
    const bundleKey = await makeBundleKey();
    const record = await createBiometricBundle(person, bundleKey);
    const key = bundleStorageKey(person);
    storage.setItem(key, JSON.stringify(record));
    try {
      await biometric.enroll(bundleKey);
    } catch (error) {
      storage.removeItem(key);
      throw error;
    }
    return isBiometricEnrolled(person);
  }

  async function enrollExistingBiometric() {
    requireSession();
    const person = me;
    const biometric = deviceBiometricFor(person);
    if (typeof biometric.enrollExisting !== 'function') {
      throw new Error('Deze Core-release ondersteunt het opnieuw koppelen van een bestaande passkey niet.');
    }
    const bundleKey = await makeBundleKey();
    const record = await createBiometricBundle(person, bundleKey);
    const key = bundleStorageKey(person);
    const previous = storage.getItem(key);
    storage.setItem(key, JSON.stringify(record));
    try {
      await biometric.enrollExisting(bundleKey);
    } catch (error) {
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
      throw error;
    }
    return isBiometricEnrolled(person);
  }

  async function restoreDomain(id, envelope, asNewest) {
    requireSession();
    if (!settings) throw new Error('Herstellen vereist een actieve GitHub-verbinding.');
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    if (typeof asNewest !== 'function') throw new TypeError('De bestaande app-herstelbewerking ontbreekt.');
    const vault = registry[id].vault;
    const current = vault.getData();
    const previous = validateDomainPayload(await vault.decryptRemote(envelope), id, domains);
    const newest = validateDomainPayload(asNewest(previous, current, Date.now()), id, domains);
    const reconciled = validateDomainPayload(vault.reconcileRestoredBackup(newest), id, domains);
    await vault.setData(reconciled);
    await vault.flush();
    return syncDomain(id);
  }

  function hasVault(id) {
    if (!Object.hasOwn(domains, id)) throw new TypeError('Onbekend gegevensdomein.');
    return registry[id].vault.hasVault();
  }

  /** Verwijdert uitsluitend de lokale Core-kluizen op dit apparaat; remote GitHub-bestanden blijven intact. */
  async function resetLocalVaults() {
    if (session) await release();
    for (const id of Object.keys(domains)) await registry[id].vault.reset();
    for (const person of ['p1', 'p2']) deviceBiometricFor(person).disable();
  }

  function isBiometricEnrolled(person = me) {
    if (!['p1', 'p2'].includes(person)) return false;
    return deviceBiometricFor(person).isEnrolled() && !!storage.getItem(bundleStorageKey(person));
  }

  function getSyncDevices(id) {
    requireSession();
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    return registry[id].vault.getSyncDevices();
  }

  async function deactivateSyncDevice(id, deviceId) {
    requireSession();
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    await registry[id].vault.deactivateSyncDevice(deviceId);
    return syncDomain(id);
  }

  return {
    unlock,
    unlockLocal,
    unlockWithBiometric,
    unlockWithBiometricLocal,




    connect,
    publishLocal,
    connectExisting,
    initializeEmpty,
    initializeEmptyLocal,
    migrate,
    getState,
    persistState,
    flushLocal,
    sync,
    syncDomain,
    changePassword,
    enrollBiometric,
    enrollExistingBiometric,
    restoreDomain,
    hasVault,
    resetLocalVaults,
    isBiometricEnrolled,
    getSyncDevices,
    deactivateSyncDevice,
    lock: async () => release(),
    getRegistry: () => registry,
  };
}
