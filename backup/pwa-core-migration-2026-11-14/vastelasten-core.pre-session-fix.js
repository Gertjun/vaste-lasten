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
  items: [], del: {}, paid: {}, meta: null,
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
    const spec = VAULT_DOMAINS[id];
    return {
      settings: { ...settings, path: spec.path },
      merge: (local, remote) => mergeDomainPayload(local, remote, id, mergeStore),
      migrate: (remote) => validateDomainPayload(remote, id),
      schemaVersion: 1,
    };
  }

  async function syncDomain(id) {
    requireSession();
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    return registry[id].sync.syncNow(syncOptions(id));
  }

  async function sync() {
    requireSession();
    await persistQueue;
    const results = {};
    for (const id of activeIds()) {
      await registry[id].vault.flush();
      results[id] = await syncDomain(id);
    }
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
        const next = mergeDomainPayload(current, split[id], id, mergeStore);
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

  async function unlockWithBiometric({ me: meValue, settings: inputSettings } = {}) {
    const resolved = await resolveSettings(inputSettings);
    await acquire(meValue);
    settings = resolved;
    try {
      for (const id of activeIds()) {
        const key = await registry[id].biometric.unlock();
        await registry[id].vault.unlockWithKey(key);
        await syncDomain(id);
      }
      return getState();
    } catch (error) {
      try { await release(); } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Biometrisch ontgrendelen mislukte en de sessie kon niet veilig worden vrijgegeven.');
      }
      throw error;
    }
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
    const result = await migrateActiveDomains({
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
    if (!result.complete) {
      await release();
      return result;
    }
    return { ...result, state: getState() };
  }

  async function changePassword(id, currentPassword, nextPassword) {
    requireSession();
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

  async function restoreDomain(id, envelope, asNewest) {
    requireSession();
    if (!activeIds().includes(id)) throw new Error('Deze persoonlijke kluis is niet actief op dit apparaat.');
    if (typeof asNewest !== 'function') throw new TypeError('De bestaande app-herstelbewerking ontbreekt.');
    const vault = registry[id].vault;
    const current = vault.getData();
    const previous = await vault.decryptRemote(envelope);
    const newest = asNewest(previous, current, Date.now());
    await vault.setData(vault.reconcileRestoredBackup(newest));
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
    unlockWithBiometric,
    migrate,
    getState,
    persistState,
    sync,
    syncDomain,
    changePassword,
    enrollBiometric,
    restoreDomain,
    hasVault,
    isBiometricEnrolled,
    getSyncDevices,
    deactivateSyncDevice,
    lock: release,
    getRegistry: () => registry,
  };
}
