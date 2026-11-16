import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createVasteLastenCore } from '../js/vastelasten-core.js';
import {
  randomBytes, bytesToB64, b64ToBytes, generateDataKey, passwordKey,
  wrapDataKey, unwrapDataKey, encryptJSON, decryptJSON,
} from '../js/core/crypto.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const clone = (value) => structuredClone(value);
const domainFor = (prefix) => prefix.endsWith('-shared')
  ? 'shared'
  : prefix.endsWith('-p1') ? 'personal-p1' : 'personal-p2';
const mergeStore = (a, b) => ({
  ...a, ...b,
  items: [...(a.items || []), ...(b.items || [])],
  del: { ...(a.del || {}), ...(b.del || {}) },
  paid: { ...(a.paid || {}), ...(b.paid || {}) },
});

async function makeEnvelope(password, data) {
  const salt = randomBytes(16);
  const kdf = { name: 'PBKDF2-SHA256', iterations: 1000, salt: bytesToB64(salt) };
  const kek = await passwordKey(password, salt, kdf.iterations);
  const key = await generateDataKey();
  return {
    format: 'pwa-vault', version: 1, kdf,
    wrappedKey: await wrapDataKey(key, kek),
    payload: await encryptJSON(data, key),
    updatedAt: Date.now(),
  };
}

async function openEnvelope(envelope, password) {
  const kek = await passwordKey(password, b64ToBytes(envelope.kdf.salt), envelope.kdf.iterations);
  const key = await unwrapDataKey(envelope.wrappedKey, kek);
  return { key, data: await decryptJSON(envelope.payload, key) };
}

function runtimeHarness({ remoteFiles = new Map(), failUploadPath = null } = {}) {
  const localStorageFor = () => {
    const map = new Map();
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
      key: (index) => [...map.keys()][index] ?? null,
      get length() { return map.size; },
    };
  };
  const localStorage = localStorageFor();
  const vaults = {};
  const syncCalls = [];
  const events = [];
  let nextSha = 0;
  let failPath = failUploadPath;

  const factories = {
    createVault: ({ storagePrefix }) => {
      const id = domainFor(storagePrefix);
      let envelope = null, dataKey = null, data = null, meta = { sha: null, dirty: false };
      const vault = {
        KEYS: { vault: storagePrefix + ':vault' },
        hasVault: () => !!envelope,
        isUnlocked: () => !!dataKey,
        validateEnvelope(env) {
          if (!env || env.format !== 'pwa-vault' || !env.kdf || !env.wrappedKey || !env.payload) {
            throw new Error('invalid envelope');
          }
        },
        async create(password, initial) {
          if (envelope) throw new Error('already exists');
          envelope = await makeEnvelope(password, initial);
          const opened = await openEnvelope(envelope, password);
          dataKey = opened.key; data = opened.data; meta = { sha: null, dirty: true };
          events.push(id + ':create');
        },
        async unlockWithPassword(password) {
          if (!envelope) throw new Error('missing local vault');
          const opened = await openEnvelope(envelope, password);
          dataKey = opened.key; data = opened.data;
          events.push(id + ':unlock');
        },
        async importEnvelope(env, password) {
          const opened = await openEnvelope(env, password);
          envelope = clone(env); dataKey = opened.key; data = opened.data;
          events.push(id + ':import');
        },
        async decryptRemote(env) {
          if (!dataKey) throw new Error('locked');
          return decryptJSON(env.payload, dataKey);
        },
        getData: () => clone(data),
        getEnvelope: () => clone(envelope),
        getSyncMeta: () => ({ ...meta }),
        setSyncMeta: (next) => { meta = { ...next }; },
        async flush() {},
        lock() { dataKey = null; data = null; events.push(id + ':lock'); },
        async dispose() { this.lock(); },
        getDataKey: () => dataKey,
        getRevision: () => 1,
        getPersistedRevision: () => 1,
        markSynced(sha) { meta = { ...meta, sha, dirty: false }; },
        getSyncDevices: () => [],
        async deactivateSyncDevice() {},
        reconcileRestoredBackup: (value) => clone(value),
        async setData(next) { data = clone(next); },
      };
      vaults[id] = vault;
      return vault;
    },
    createSync: ({ vault }) => ({
      async syncNow(options) {
        const path = options.settings.path;
        syncCalls.push(path);
        if (path === failPath) { failPath = null; throw new Error('synthetic upload failure'); }
        if (!remoteFiles.has(path)) {
          remoteFiles.set(path, { sha: 'sha-' + (++nextSha), envelope: vault.getEnvelope() });
          return 'uploaded';
        }
        // Decrypt with the local key to ensure the remote file belongs to this vault.
        await vault.decryptRemote(remoteFiles.get(path).envelope);
        return 'up-to-date';
      },
    }),
    createSessionLock: ({ storagePrefix }) => ({
      async acquireSessionLock() {
        const id = domainFor(storagePrefix);
        events.push(id + ':acquire');
        return { release: async () => events.push(id + ':release') };
      },
    }),
    createBiometric: () => ({
      async unlock() { throw new Error('not used'); },
      async enroll() {},
      async enrollExisting() {},
      isEnrolled: () => false,
    }),
  };
  const clientFactory = (settings) => ({
    async checkRepo() { return { private: true, defaultBranch: 'main' }; },
    async getFile() { return clone(remoteFiles.get(settings.path) || null); },
  });
  const core = createVasteLastenCore({ storage: localStorage, mergeStore, clientFactory, factories });
  return { core, remoteFiles, vaults, syncCalls, events };
}

const connection = { owner: 'synthetic-owner', repo: 'synthetic-private-repo', token: 'synthetic-token' };
const passwords = {
  shared: 'new-shared-password',
  'personal-p1': 'new-p1-password',
  'personal-p2': 'new-p2-password',
};

test('runtime: eerste apparaat maakt shared + eigen lege kluis aan, niet de kluis van de ander', async () => {
  const h = runtimeHarness();
  const result = await h.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  assert.equal(result.complete, true);
  assert.deepEqual([...h.remoteFiles.keys()].sort(), [
    'pwa-core-v1/eigen-p1.json', 'pwa-core-v1/samen.json',
  ]);
  assert.deepEqual(result.state.samen.items, []);
  assert.deepEqual(result.state.eigen.items, []);
  assert.equal(h.vaults['personal-p2'].hasVault(), false);
  await h.core.lock();
});

test('runtime: tweede apparaat sluit aan op shared en maakt alleen personal-p2 aan', async () => {
  const first = runtimeHarness();
  await first.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  await first.core.lock();

  const originalShared = clone(first.remoteFiles.get('pwa-core-v1/samen.json'));
  const second = runtimeHarness({ remoteFiles: first.remoteFiles });
  const result = await second.core.initializeEmpty({ me: 'p2', passwords, settings: connection });

  assert.equal(result.complete, true);
  assert.deepEqual([...second.remoteFiles.keys()].sort(), [
    'pwa-core-v1/eigen-p1.json', 'pwa-core-v1/eigen-p2.json', 'pwa-core-v1/samen.json',
  ]);
  assert.deepEqual(second.remoteFiles.get('pwa-core-v1/samen.json'), originalShared);
  assert.equal(second.events.includes('personal-p1:acquire'), false);
  assert.equal(second.vaults['personal-p1'].hasVault(), false);
  assert.deepEqual(result.state.samen.items, []);
  assert.deepEqual(result.state.eigen.items, []);
  await second.core.lock();
});

test('runtime: gedeeltelijk succes blijft behouden en lege start kan veilig worden hervat', async () => {
  const shared = new Map();
  const first = runtimeHarness({ remoteFiles: shared, failUploadPath: 'pwa-core-v1/eigen-p1.json' });
  const partial = await first.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  assert.equal(partial.complete, false);
  assert.equal(partial.failedDomain, 'personal-p1');
  assert.ok(shared.has('pwa-core-v1/samen.json'));
  assert.equal(shared.has('pwa-core-v1/eigen-p1.json'), false);
  assert.ok(first.vaults['personal-p1'].hasVault());

  // Hetzelfde runtimeobject en dezelfde lokale opslag worden hervat.
  const resumed = await first.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  assert.equal(resumed.complete, true);
  assert.ok(shared.has('pwa-core-v1/eigen-p1.json'));
  await first.core.lock();
});


test('runtime: lokale lege Core-kluizen werken zonder GitHub-client of synchronisatie', async () => {
  const h = runtimeHarness();
  const result = await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  assert.equal(result.complete, true);
  assert.equal(result.localOnly, true);
  assert.deepEqual(h.syncCalls, []);
  assert.equal(h.remoteFiles.size, 0);
  assert.equal(h.vaults.shared.hasVault(), true);
  assert.equal(h.vaults['personal-p1'].hasVault(), true);
  assert.equal(h.vaults['personal-p2'].hasVault(), false);
  assert.deepEqual(result.state.samen.items, []);
  assert.deepEqual(result.state.eigen.items, []);
  await h.core.lock();

  const reopened = await h.core.unlockLocal({
    me: 'p1',
    passwords: { shared: passwords.shared, 'personal-p1': passwords['personal-p1'] },
  });
  assert.deepEqual(reopened.samen.items, []);
  assert.deepEqual(reopened.eigen.items, []);
  await h.core.lock();
});

test('runtime: lokale lege start weigert niet-lege bestaande kluis en overschrijft niets', async () => {
  const h = runtimeHarness();
  await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  await h.core.lock();
  // Bewijs dat een bestaande lokale kluis niet wordt vervangen door een nieuwe lege.
  const vault = h.vaults.shared;
  await vault.unlockWithPassword(passwords.shared);
  const before = vault.getData();
  before.items.push({ id: 'keep-me', name: 'Bestaand record' });
  await vault.setData(before);
  await vault.flush();
  await h.core.lock();

  const result = await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  assert.equal(result.complete, false);
  assert.equal(result.failedDomain, 'shared');
  await vault.unlockWithPassword(passwords.shared);
  assert.equal(vault.getData().items[0].id, 'keep-me');
  await h.core.lock();
});
