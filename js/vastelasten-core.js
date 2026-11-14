// Vaste Lasten bridge tussen de bestaande Store-state en PWA-Core v1.1.0.
import { createVault } from './core/vault-factory.js';
import { createSync } from './core/sync-factory.js';
import { createSessionLock } from './core/session-lock-factory.js';
import { createBiometric } from './core/biometric-factory.js';
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

  let me = null;
  let settings = null;
  let session = null;
  let pendingBiometricKeys = {};
  let persistQueue = Promise.resolve();

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
    clearBiometricPending();
    if (!session) return;
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
    // Een volgende volledige snapshot mag een eerdere mislukte write inhalen;
    // de aanroeper van deze specifieke write krijgt de fout wel terug.
    persistQueue = run.catch(() => {});
    return run;
  }

  async function unlock({ me: meValue, passwords, settings: inputSettings } = {}) {
    clearBiometricPending();
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
    clearBiometricPending();
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

  async function prepareBiometricUnlock(id, meValue) {
    if (!['p1', 'p2'].includes(meValue)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    if (!['shared', `personal-${meValue}`].includes(id)) throw new Error('Deze kluis is niet actief op dit apparaat.');
    if (!registry[id].biometric.isEnrolled()) throw new Error(`Voor de kluis ${id} is nog geen passkey ingesteld.`);
    pendingBiometricKeys[id] = await registry[id].biometric.unlock();
    return true;
  }

  function isBiometricPending(id) {
    return Object.hasOwn(pendingBiometricKeys, id);
  }

  function clearBiometricPending() {
    pendingBiometricKeys = {};
  }

  async function finishBiometricUnlock({ me: meValue, settings: inputSettings } = {}) {
    if (!['p1', 'p2'].includes(meValue)) throw new TypeError('Persoon moet p1 of p2 zijn.');
    const ids = ['shared', `personal-${meValue}`];
    if (ids.some((id) => !Object.hasOwn(pendingBiometricKeys, id))) {
      throw new Error('Ontgrendel eerst beide kluizen afzonderlijk met hun passkey.');
    }
    try {
      await acquire(meValue);
      for (const id of ids) await registry[id].vault.unlockWithKey(pendingBiometricKeys[id]);
      clearBiometricPending();
      settings = inputSettings ? await resolveSettings(inputSettings) : null;
      if (settings) for (const id of ids) await syncDomain(id);
      return getState();
    } catch (error) {
      clearBiometricPending();
      if (session) {
        try { await release(); } catch (releaseError) {
          throw new AggregateError([error, releaseError], 'Biometrisch ontgrendelen mislukte en de sessie kon niet veilig worden vrijgegeven.');
        }
      }
      throw error;
    }
  }

  async function unlockWithBiometric({ me: meValue, settings: inputSettings } = {}) {
    const ids = ['shared', `personal-${meValue}`];
    for (const id of ids) await prepareBiometricUnlock(id, meValue);
    return finishBiometricUnlock({ me: meValue, settings: inputSettings });
  }

  async function unlockWithBiometricLocal({ me: meValue } = {}) {
    const ids = ['shared', `personal-${meValue}`];
    for (const id of ids) {
      if (!registry[id].vault.hasVault()) {
        throw new Error(`De lokale kluis ${id} ontbreekt. Gebruik online ontgrendelen om de remote kluis te importeren.`);
      }
      await prepareBiometricUnlock(id, meValue);
    }
    return finishBiometricUnlock({ me: meValue });
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

  async function enrollBiometric(id) {
    requireSession();
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    await registry[id].biometric.enroll(registry[id].vault.getDataKey());
    return registry[id].biometric.isEnrolled();
  }

  async function enrollExistingBiometric(id) {
    requireSession();
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    if (typeof registry[id].biometric.enrollExisting !== 'function') {
      throw new Error('Deze Core-release ondersteunt het opnieuw koppelen van een bestaande passkey niet.');
    }
    await registry[id].biometric.enrollExisting(registry[id].vault.getDataKey());
    return registry[id].biometric.isEnrolled();
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

  function isBiometricEnrolled(id) {
    if (!Object.hasOwn(VAULT_DOMAINS, id)) throw new TypeError('Onbekend gegevensdomein.');
    return registry[id].biometric.isEnrolled();
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
    prepareBiometricUnlock,
    isBiometricPending,
    clearBiometricPending,
    finishBiometricUnlock,
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
    lock: async () => { clearBiometricPending(); return release(); },
    getRegistry: () => registry,
  };
}
