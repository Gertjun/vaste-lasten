import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VAULT_DOMAINS, splitLegacyState, validateDomainPayload, mergeDomainPayload,
  createVaultRegistry, acquireActiveLocks, openAndSyncDomain,
  raiseLegacyUpdateBarrier, migrateActiveDomains, requireLegacyEnvelope,
} from '../js/multi-vault-adapter.js';

test('migration preflight fails closed when an active legacy JSON is missing from the configured repository', () => {
  const env = { app: 'vaste-lasten', kdf: { salt: 'synthetic-salt' }, iv: 'iv', ct: 'ciphertext' };
  assert.equal(requireLegacyEnvelope({ env, file: 'samen.json', owner: 'Gertjun', repo: 'SyncData' }), env);
  assert.equal(requireLegacyEnvelope({ env, file: 'eigen-p1.json', owner: 'Gertjun', repo: 'SyncData' }), env);
  assert.throws(
    () => requireLegacyEnvelope({ env: null, file: 'samen.json', owner: 'Gertjun', repo: 'vaste-lasten-data' }),
    /samen\.json ontbreekt in Gertjun\/vaste-lasten-data.*voordat er iets is geschreven/,
  );
});

const store = (items = [], extra = {}) => ({ items, del: {}, paid: {}, meta: null, ...extra });
const mergeStore = (a, b) => {
  const out = { ...a, ...b };
  out.items = [...new Map([...(a.items || []), ...(b.items || [])].map((item) => [item.id, item])).values()];
  out.del = { ...(a.del || {}), ...(b.del || {}) };
  return out;
};

test('legacy state is split without crossing shared and private fields', () => {
  const legacy = {
    samen: store([{ id: 'shared' }], {
      meta: { p1: 'A', p2: 'B' }, cats: { home: { id: 'home' } },
      inc: { p1: { amount: 1 } }, settle: { one: { amount: 2 } },
      prof: { shouldNotLeak: true }, scen: { shouldNotLeak: true },
    }),
    eigen: store([{ id: 'private-p1' }], {
      prof: { income: 100 }, scen: { plan: {} },
      meta: { shouldNotLeak: true }, cats: { shouldNotLeak: true },
      inc: { shouldNotLeak: true }, settle: { shouldNotLeak: true },
    }),
  };
  const split = splitLegacyState(legacy, 'p1');
  assert.equal(split.shared.domain, 'shared');\n  assert.equal(split.shared.schema, 2);\n  assert.equal(split['personal-p1'].schema, 2);
  assert.equal(split['personal-p1'].domain, 'personal-p1');
  assert.deepEqual(split.shared.items.map((x) => x.id), ['shared']);
  assert.deepEqual(split['personal-p1'].items.map((x) => x.id), ['private-p1']);
  for (const key of ['prof', 'scen']) assert.equal(Object.hasOwn(split.shared, key), false);
  for (const key of ['meta', 'cats', 'inc', 'settle']) assert.equal(Object.hasOwn(split['personal-p1'], key), false);
  assert.deepEqual(split.shared.meta, { p1: 'A', p2: 'B' });
  assert.deepEqual(split['personal-p1'].prof, { income: 100 });
});

test('each Core payload is bound to exactly one domain', () => {
  const shared = { ...store(), schema: 1, domain: 'shared' };
  const personal = { ...store(), schema: 1, domain: 'personal-p1' };
  assert.equal(validateDomainPayload(shared, 'shared'), shared);
  assert.throws(() => validateDomainPayload(personal, 'shared'), /hoort niet bij het domein/);
  assert.throws(() => mergeDomainPayload(shared, personal, 'shared', mergeStore), /hoort niet bij het domein/);
  assert.throws(() => validateDomainPayload({ ...shared, prof: { income: 1 } }, 'shared'), /buiten het toegestane gegevensdomein/);
  assert.throws(() => validateDomainPayload({ ...personal, cats: {} }, 'personal-p1'), /buiten het toegestane gegevensdomein/);
  assert.throws(() => mergeDomainPayload(shared, shared, 'shared', (a, b) => ({ ...mergeStore(a, b), scen: {} })), /buiten het toegestane gegevensdomein/);
  const next = mergeDomainPayload(shared, shared, 'shared', mergeStore);
  assert.equal(next.domain, 'shared');
  assert.equal(next.schema, 2);
  assert.equal(validateDomainPayload({ ...shared, schema: 2 }, 'shared').schema, 2);
});

test('real app merge defaults do not reintroduce empty shared metadata into a personal vault', () => {
  const personal = { items: [], del: {}, paid: {}, schema: 1, domain: 'personal-p1' };
  const appMerge = (a, b) => ({ ...mergeStore(a, b), meta: null });
  const result = mergeDomainPayload(personal, personal, 'personal-p1', appMerge);
  assert.equal(Object.hasOwn(result, 'meta'), false);
  assert.equal(result.domain, 'personal-p1');
  assert.throws(() => mergeDomainPayload(personal, personal, 'personal-p1',
    (a, b) => ({ ...mergeStore(a, b), meta: { leaked: true } })),
  /buiten het toegestane gegevensdomein/);
});

test('registry creates three independent vault, sync, lock and biometric instances', () => {
  const calls = { vault: [], sync: [], lock: [], biometric: [] };
  const createVault = (options) => { calls.vault.push(options); return { id: options.storagePrefix }; };
  const registry = createVaultRegistry({
    createVault,
    createSync: (options) => { calls.sync.push(options); return { id: options.vault.id }; },
    createSessionLock: (options) => { calls.lock.push(options); return {}; },
    createBiometric: (options) => { calls.biometric.push(options); return {}; },
    storage: { test: true },
    kdfIterations: 600000,
  });
  assert.deepEqual(Object.keys(registry), ['shared', 'personal-p1', 'personal-p2']);
  assert.deepEqual(calls.vault.map((x) => x.storagePrefix), Object.values(VAULT_DOMAINS).map((x) => x.storagePrefix));
  assert.equal(new Set(calls.vault.map((x) => x.storagePrefix)).size, 3);
  assert.equal(calls.sync.length, 3);
  assert.equal(calls.lock.length, 3);
  assert.equal(calls.biometric.length, 3);
});

test('active lock acquisition rolls back the first lock if the second is busy', async () => {
  const events = [];
  const registry = {
    shared: { lock: { acquireSessionLock: async () => ({ release: async () => events.push('shared released') }) } },
    'personal-p1': { lock: { acquireSessionLock: async () => null } },
  };
  await assert.rejects(acquireActiveLocks(registry, 'p1'), /al ontgrendeld/);
  assert.deepEqual(events, ['shared released']);
});

test('releasing active locks flushes and locks vaults before releasing Web Locks', async () => {
  const events = [];
  const makeEntry = (id) => ({
    vault: {
      flush: async () => events.push(`${id}:flush`),
      lock: () => events.push(`${id}:lock`),
    },
    lock: { acquireSessionLock: async () => ({ release: async () => events.push(`${id}:release`) }) },
  });
  const session = await acquireActiveLocks({ shared: makeEntry('shared'), 'personal-p1': makeEntry('personal-p1') }, 'p1');
  await session.release();
  assert.deepEqual(events, [
    'shared:flush', 'personal-p1:flush',
    'shared:lock', 'personal-p1:lock',
    'personal-p1:release', 'shared:release',
  ]);
});

test('registry disposes earlier vault instances if later factory creation fails', () => {
  const disposed = [];
  let syncCount = 0;
  assert.throws(() => createVaultRegistry({
    createVault: ({ storagePrefix }) => ({
      id: storagePrefix,
      lock: () => {},
      dispose: () => disposed.push(storagePrefix),
    }),
    createSync: ({ vault }) => {
      syncCount++;
      if (syncCount === 2) throw new Error('synthetic factory failure');
      return { id: vault.id };
    },
    createSessionLock: () => ({}),
    createBiometric: () => ({}),
  }), /synthetic factory failure/);
  assert.deepEqual(disposed, ['vaste-lasten-shared', 'vaste-lasten-personal-p1']);
});


function fakeVault({ remotePayload = null } = {}) {
  let data = null;
  let exists = false;
  let syncMeta = { sha: null, dirty: false };
  return {
    hasVault: () => exists,
    async create(password, initial) { assert.ok(password); data = structuredClone(initial); exists = true; syncMeta = { sha: null, dirty: true }; },
    async unlockWithPassword(password) { assert.ok(password); if (!exists) throw new Error('missing local vault'); },
    async importEnvelope(envelope, password) {
      assert.ok(password);
      data = structuredClone(envelope.payload);
      exists = true;
    },
    getData: () => structuredClone(data),
    async setData(next) { data = structuredClone(next); syncMeta = { ...syncMeta, dirty: true }; },
    async flush() {},
    getSyncMeta: () => ({ ...syncMeta }),
    setSyncMeta: (next) => { syncMeta = { ...next }; },
  };
}

test('existing Core remote envelope is imported before legacy data is merged', async () => {
  const vault = fakeVault();
  const remoteData = { ...store([{ id: 'remote' }]), schema: 1, domain: 'shared' };
  const calls = [];
  const entry = {
    vault,
    sync: { syncNow: async (options) => { calls.push(options); return 'uploaded'; } },
  };
  const result = await openAndSyncDomain({
    id: 'shared', password: 'shared-password',
    legacyData: { ...store([{ id: 'legacy' }]), schema: 1, domain: 'shared' },
    registry: { shared: entry },
    settings: { owner: 'synthetic', repo: 'synthetic', branch: 'main', token: 'synthetic' },
    createClient: (settings) => ({
      getFile: async () => {
        assert.equal(settings.path, 'pwa-core-v1/samen.json');
        return { sha: 'remote-sha', envelope: { payload: remoteData } };
      },
    }),
    mergeStore,
  });
  assert.equal(result.result, 'uploaded');
  assert.deepEqual(result.data.items.map((x) => x.id).sort(), ['legacy', 'remote']);
  assert.equal(vault.getSyncMeta().sha, 'remote-sha');
  assert.equal(calls.length, 1);
});

test('missing remote Core file does not silently republish an existing local vault during normal unlock', async () => {
  let unlocks = 0, syncs = 0;
  const vault = {
    hasVault: () => true,
    async unlockWithPassword() { unlocks++; },
  };
  await assert.rejects(openAndSyncDomain({
    id: 'shared',
    password: 'shared-password',
    legacyData: { ...store(), schema: 1, domain: 'shared' },
    registry: { shared: { vault, sync: { syncNow: async () => { syncs++; } } } },
    settings: {},
    createClient: () => ({ getFile: async () => null }),
    mergeStore,
    allowCreate: false,
  }), /remote Core-bestand.*ontbreekt/);
  assert.equal(unlocks, 0);
  assert.equal(syncs, 0);
});

test('remote password change adopts the new wrapper while preserving local edits under the same DEK', async () => {
  const localPayload = { ...store([{ id: 'local-unsynced', u: 20 }]), schema: 1, domain: 'shared' };
  const remotePayload = { ...store([{ id: 'remote', u: 10 }]), schema: 1, domain: 'shared' };
  const localEnvelope = { dek: 'same', payload: localPayload };
  const remoteEnvelope = { dek: 'same', payload: remotePayload };
  const storageValues = new Map([['shared:vault', JSON.stringify(localEnvelope)]]);
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
  };
  let data = null, syncMeta = { sha: 'old-sha', dirty: true };
  const vault = {
    KEYS: { vault: 'shared:vault' },
    hasVault: () => true,
    async unlockWithPassword() { throw new Error('Onjuist wachtwoord.'); },
    async importEnvelope(env, password) { assert.equal(password, 'new-password'); data = structuredClone(env.payload); },
    async decryptRemote(env) {
      if (env.dek !== 'same') throw new Error('different DEK');
      return structuredClone(env.payload);
    },
    getData: () => structuredClone(data),
    async setData(next) { data = structuredClone(next); syncMeta.dirty = true; },
    getSyncMeta: () => ({ ...syncMeta }),
    setSyncMeta: (next) => { syncMeta = { ...next }; },
    async flush() {},
  };
  const entry = { vault, storage, sync: { syncNow: async () => 'merged' } };
  const result = await openAndSyncDomain({
    id: 'shared',
    password: 'new-password',
    legacyData: { ...store(), schema: 1, domain: 'shared' },
    registry: { shared: entry },
    settings: {},
    createClient: () => ({ getFile: async () => ({ sha: 'new-sha', envelope: remoteEnvelope }) }),
    mergeStore,
  });
  assert.equal(result.result, 'merged');
  assert.deepEqual(result.data.items.map((item) => item.id).sort(), ['local-unsynced', 'remote']);
  assert.equal(vault.getSyncMeta().sha, 'new-sha');
});

test('remote password change with a different DEK restores the original local envelope', async () => {
  const localEnvelope = { dek: 'old', payload: { ...store(), schema: 1, domain: 'shared' } };
  const remoteEnvelope = { dek: 'new', payload: { ...store(), schema: 1, domain: 'shared' } };
  const raw = JSON.stringify(localEnvelope), values = new Map([['shared:vault', raw]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let data = null;
  const vault = {
    KEYS: { vault: 'shared:vault' },
    hasVault: () => true,
    async unlockWithPassword() { throw new Error('Onjuist wachtwoord.'); },
    async importEnvelope(env) { data = structuredClone(env.payload); },
    async decryptRemote(env) { if (env.dek !== 'old') throw new Error('different DEK'); return env.payload; },
    lock() { data = null; },
    getData: () => data,
    async flush() {},
  };
  await assert.rejects(openAndSyncDomain({
    id: 'shared', password: 'new-password',
    legacyData: { ...store(), schema: 1, domain: 'shared' },
    registry: { shared: { vault, storage, sync: { syncNow: async () => 'up-to-date' } } },
    settings: {},
    createClient: () => ({ getFile: async () => ({ sha: 'new-sha', envelope: remoteEnvelope }) }),
    mergeStore,
  }), /oorspronkelijke lokale kluis is hersteld/);
  assert.equal(values.get('shared:vault'), raw);
});

test('missing remote Core file cannot silently recreate a retired vault', async () => {
  const vault = fakeVault();
  await assert.rejects(openAndSyncDomain({
    id: 'shared',
    password: 'shared-password',
    legacyData: { ...store(), schema: 1, domain: 'shared' },
    registry: { shared: { vault, sync: { syncNow: async () => 'uploaded' } } },
    settings: { owner: 'synthetic', repo: 'synthetic', branch: 'main', token: 'synthetic' },
    createClient: () => ({ getFile: async () => null }),
    mergeStore,
    allowCreate: false,
  }), /er wordt geen nieuwe kluis aangemaakt/);
  assert.equal(vault.hasVault(), false);
});

test('concurrent first creation adopts the winning remote DEK and preserves local data', async () => {
  const vault = fakeVault();
  const localData = { ...store([{ id: 'local' }]), schema: 1, domain: 'shared' };
  const winningData = { ...store([{ id: 'winner' }]), schema: 1, domain: 'shared' };
  let reads = 0, syncCalls = 0;
  const entry = {
    vault,
    sync: { syncNow: async () => {
      syncCalls++;
      if (syncCalls === 1) throw new Error('Het bestand op GitHub is met een andere sleutel versleuteld.');
      return 'merged';
    } },
  };
  const result = await openAndSyncDomain({
    id: 'shared', password: 'same-shared-password',
    legacyData: localData,
    registry: { shared: entry },
    settings: { owner: 'synthetic', repo: 'synthetic', branch: 'main', token: 'synthetic' },
    createClient: () => ({
      getFile: async () => {
        reads++;
        return reads === 1 ? null : { sha: 'winner-sha', envelope: { payload: winningData } };
      },
    }),
    mergeStore,
  });
  assert.equal(result.recoveredConcurrentCreate, true);
  assert.equal(result.result, 'merged');
  assert.deepEqual(result.data.items.map((x) => x.id).sort(), ['local', 'winner']);
  assert.equal(vault.getSyncMeta().sha, 'winner-sha');
  assert.equal(syncCalls, 2);
});


test('legacy update barrier preserves encrypted store data and retries a conflict', async () => {
  let attempts = 0;
  let stored = { minApp: '2.20.0', items: [{ id: 'shared' }], inc: { p1: 1 } };
  const result = await raiseLegacyUpdateBarrier({
    readLegacy: async () => ({ env: { marker: true }, sha: `sha-${attempts}` }),
    openLegacy: async () => structuredClone(stored),
    writeLegacy: async (next, sha) => {
      attempts++;
      if (attempts === 1) return null;
      stored = next;
      return 'sha-updated';
    },
    compareVersions: (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  });
  assert.equal(result.alreadyMarked, false);
  assert.equal(result.sha, 'sha-updated');
  assert.equal(attempts, 2);
  assert.equal(stored.minApp, '3.0.0');
  assert.deepEqual(stored.items, [{ id: 'shared' }]);
  assert.deepEqual(stored.inc, { p1: 1 });
});

test('legacy update barrier refuses to proceed when the shared file is missing', async () => {
  await assert.rejects(raiseLegacyUpdateBarrier({
    readLegacy: async () => ({ env: null }),
    openLegacy: async () => ({}),
    writeLegacy: async () => 'sha',
    compareVersions: () => 0,
  }), /legacybestand ontbreekt/);
});

test('migration coordinator keeps partial success explicit and does not retire legacy source', async () => {
  const calls = [];
  const result = await migrateActiveDomains({
    state: { samen: store([{ id: 'shared' }]), eigen: store([{ id: 'private' }]) },
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
    registry: {
      shared: {
        vault: fakeVault(),
        sync: { syncNow: async () => 'uploaded' },
      },
    },
    settings: {},
    createClient: () => ({ getFile: async () => null }),
    mergeStore,
    legacySync: async () => calls.push('legacy-sync'),
    raiseBarrier: async () => calls.push('barrier'),
  });
  assert.deepEqual(calls, ['legacy-sync', 'barrier']);
  assert.equal(result.complete, false);
  assert.equal(result.failedDomain, 'personal-p1');
  assert.equal(result.results.shared.result, 'uploaded');
  assert.equal(result.legacySourceCanBeRetired, undefined);
});


test('migration completes only after both active vaults confirm remote sync', async () => {
  const state = { samen: store([{ id: 'shared' }]), eigen: store([{ id: 'private-p2' }]) };
  const registry = {};
  for (const id of ['shared', 'personal-p2']) {
    registry[id] = {
      vault: fakeVault(),
      sync: { syncNow: async ({ settings }) => {
        assert.equal(settings.path, VAULT_DOMAINS[id].path);
        return 'uploaded';
      } },
    };
  }
  const result = await migrateActiveDomains({
    state, me: 'p2',
    passwords: { shared: 'shared-password', 'personal-p2': 'personal-password' },
    registry,
    settings: { owner: 'synthetic', repo: 'synthetic', branch: 'main', token: 'synthetic' },
    createClient: (settings) => ({ getFile: async () => { assert.ok(settings.path); return null; } }),
    mergeStore,
    legacySync: async () => {},
    raiseBarrier: async () => {},
  });
  assert.equal(result.complete, true);
  assert.equal(result.legacySourceCanBeRetired, true);
  assert.deepEqual(Object.keys(result.results), ['shared', 'personal-p2']);
});
