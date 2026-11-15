// Vaste Lasten bridge tussen de bestaande Store-state en PWA-Core v1.1.0.
import { createVault } from './core/vault-factory.js';
import { createSync } from './core/sync-factory.js';
import { createSessionLock } from './core/session-lock-factory.js';
import { createBiometric } from './core/biometric-factory.js';
import { createBundleBiometric, generateBundleKey, wrapVaultKey, unwrapVaultKey } from './bundle-biometric.js';
import { createClient } from './core/github.js';
import {
  VAULT_DOMAINS,
  createVaultRegistry,
  acquireActiveLocks,
  openAndSyncDomain,
  migrateActiveDomains,
  mergeDomainPayload,
  splitLegacyState,
  validateDomainPayload,
} from './multi-vault-adapter.js';

const clone = (value) => structuredClone(value);
const emptyPayload = (id) => ({
  items: [], del: {}, paid: {},
  ...(id === 'shared' ? { meta: null } : {}),
  schema: 1, domain: VAULT_DOMAINS[id].domain,
});

export function createVasteLastenCore({
  storage = globalThis.localStorage,
  kdfIterations = 600000,
  appName = 'Vaste Lasten',
  mergeStore,
  clientFactory = createClient,
  factories = {},
} = {}) {
  if (typeof mergeStore !== 'function') throw new TypeError('De bestaande Vaste Lasten merge-functie is verplicht.');
  const registry = createVaultRegistry({
    createVault: factories.createVault || createVault,
    createSync: factories.createSync || createSync,
    createSessionLock: factories.createSessionLock || createSessionLock,
    createBiometric: factories.createBiometric || createBiometric,
    storage,
    kdfIterations,
    appName,
  });

  const makeBundleKey = factories.generateBundleKey || generateBundleKey;
  const wrapBundleKey = factories.wrapVaultKey || wrapVaultKey;
  const unwrapBundleKey = factories.unwrapVaultKey || unwrapVaultKey;
  const bundleStorageKey = (person) => `vaste-lasten:biometric-bundle:${person}:v1`;
  const deviceBiometricFor = (person) => {
    if (!['p1', 'p2'].includes(person)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    if (!deviceBiometrics.has(person)) {
      const factory = factories.createDeviceBiometric || createBundleBiometric;
      deviceBiometrics.set(person, factory({
        storagePrefix: `vaste-lasten-device-${person}`,
        // Herkoppelen accepteert uitsluitend de eigen actieve Core-domeinen
        // (plus de nieuwe device-bundel), niet de persoonlijke kluis van de ander.
        allowedUserHandlePrefixes: [
          VAULT_DOMAINS.shared.storagePrefix,
          VAULT_DOMAINS[`personal-${person}`].storagePrefix,
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
      path: VAULT_DOMAINS.shared.path,
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
    const spec = VAULT_DOMAINS[id];
    return {
      settings: { ...settings, path: spec.path },
      merge: (local, remote) => mergeDomainPayload(local, remote, id, mergeStore),
      migrate: (remote) => validateDomainPayload(remote, id),
      schemaVersion: 1,
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
        const next = mergeDomainPayload(current, appPayload, id, mergeStore);
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
          legacyData: emptyPayload(id),
          registry,
          settings,
          createClient: clientFactory,
          mergeStore,
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
    const previous = validateDomainPayload(await vault.decryptRemote(envelope), id);
    const newest = validateDomainPayload(asNewest(previous, current, Date.now()), id);
    const reconciled = validateDomainPayload(vault.reconcileRestoredBackup(newest), id);
    await vault.setData(reconciled);
    await vault.flush();
    return syncDomain(id);
  }

  function hasVault(id) {
    if (!Object.hasOwn(VAULT_DOMAINS, id)) throw new TypeError('Onbekend gegevensdomein.');
    return registry[id].vault.hasVault();
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
    isBiometricEnrolled,
    getSyncDevices,
    deactivateSyncDevice,
    lock: async () => release(),
    getRegistry: () => registry,
  };
}
