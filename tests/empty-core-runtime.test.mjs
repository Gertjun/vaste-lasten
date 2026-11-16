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
        async reset() {
          envelope = null; dataKey = null; data = null; meta = { sha: null, dirty: false };
          events.push(id + ':reset');
        },
        lock() { dataKey = null; data = null; events.push(id + ':lock'); },
        async dispose() { this.lock(); },
        getDataKey: () => dataKey,
        getRevision: () => 1,
        getPersistedRevision: () => 1,
        markSynced(sha) { meta = { ...meta, sha, dirty: false }; },
        getSyncDevices: () => [],
        async deactivateSyncDevice() {},
        reconcileRestoredBackup: (value) => clone(value),
        async setData(next) {
          data = clone(next);
          envelope = { ...envelope, payload: await encryptJSON(data, dataKey), updatedAt: Date.now() };
          meta = { ...meta, dirty: true };
        },
      };
      vaults[id] = vault;
      return vault;
    },
    createSync: ({ vault }) => ({
      async syncNow(options) {
        const path = options.settings.path;
        syncCalls.push(path);
        if (path === failPath) { failPath = null; throw new Error('synthetic upload failure'); }
        const remote = remoteFiles.get(path);
        const meta = vault.getSyncMeta();
        if (!remote) {
          const sha = 'sha-' + (++nextSha);
          remoteFiles.set(path, { sha, envelope: vault.getEnvelope() });
          vault.markSynced(sha);
          return 'uploaded';
        }
        if (remote.sha === meta.sha) {
          if (meta.dirty) {
            const sha = 'sha-' + (++nextSha);
            remoteFiles.set(path, { sha, envelope: vault.getEnvelope() });
            vault.markSynced(sha);
            return 'uploaded';
          }
          await vault.decryptRemote(remote.envelope);
          return 'up-to-date';
        }
        const incoming = await vault.decryptRemote(remote.envelope);
        if (meta.dirty) {
          await vault.setData(options.merge(vault.getData(), incoming));
        } else {
          await vault.setData(options.migrate(incoming));
        }
        const sha = 'sha-' + (++nextSha);
        remoteFiles.set(path, { sha, envelope: vault.getEnvelope() });
        vault.markSynced(sha);
        return 'merged';
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
  const vault = h.vaults.shared;
  await vault.create(passwords.shared, {
    items: [{ id: 'keep-me', name: 'Bestaand record' }],
    del: {}, paid: {}, meta: null, schema: 2, domain: 'shared',
  });
  const result = await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  assert.equal(result.complete, false);
  assert.equal(result.failedDomain, 'shared');
  await vault.unlockWithPassword(passwords.shared);
  assert.equal(vault.getData().items[0].id, 'keep-me');
  await h.core.lock();
});


test('runtime: lokale kluizen publiceren hun bestaande gegevens versleuteld naar GitHub', async () => {
  const h = runtimeHarness();
  await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  const state = h.core.getState();
  state.samen.items.push({ id: 'shared-record', name: 'Gezamenlijke last' });
  state.eigen.items.push({ id: 'private-record', name: 'Eigen last' });
  await h.core.persistState(state);

  const result = await h.core.publishLocal({
    me: 'p1', passwords: { shared: passwords.shared, 'personal-p1': passwords['personal-p1'] }, settings: connection,
  });
  assert.equal(result.complete, true);
  assert.deepEqual([...h.remoteFiles.keys()].sort(), ['pwa-core-v1/eigen-p1.json', 'pwa-core-v1/samen.json']);
  assert.deepEqual((await h.vaults.shared.decryptRemote(h.remoteFiles.get('pwa-core-v1/samen.json').envelope)).items.map(x => x.id), ['shared-record']);
  assert.deepEqual((await h.vaults['personal-p1'].decryptRemote(h.remoteFiles.get('pwa-core-v1/eigen-p1.json').envelope)).items.map(x => x.id), ['private-record']);
  await h.core.lock();
});

test('runtime: onbekend bestaand remote bestand wordt geweigerd zonder overschrijven', async () => {
  const remoteFiles = new Map([['pwa-core-v1/samen.json', { sha: 'foreign-sha', envelope: { format: 'foreign' } }]]);
  const h = runtimeHarness({ remoteFiles });
  await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  const before = clone(remoteFiles.get('pwa-core-v1/samen.json'));
  const result = await h.core.publishLocal({
    me: 'p1', passwords: { shared: passwords.shared, 'personal-p1': passwords['personal-p1'] }, settings: connection,
  });
  assert.equal(result.complete, false);
  assert.match(result.error.message, /bestaat al|hoort niet aantoonbaar/);
  assert.deepEqual(remoteFiles.get('pwa-core-v1/samen.json'), before);
  assert.equal(remoteFiles.has('pwa-core-v1/eigen-p1.json'), false);
});

test('runtime: verkeerd wachtwoord publiceert geen enkel bestand', async () => {
  const h = runtimeHarness();
  await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  const result = await h.core.publishLocal({
    me: 'p1', passwords: { shared: passwords.shared, 'personal-p1': 'wrong-password' }, settings: connection,
  });
  assert.equal(result.complete, false);
  assert.equal(h.remoteFiles.size, 0);
});

test('runtime: gedeeltelijke publicatie kan veilig worden hervat', async () => {
  const h = runtimeHarness({ failUploadPath: 'pwa-core-v1/eigen-p1.json' });
  await h.core.initializeEmptyLocal({ me: 'p1', passwords });
  const first = await h.core.publishLocal({
    me: 'p1', passwords: { shared: passwords.shared, 'personal-p1': passwords['personal-p1'] }, settings: connection,
  });
  assert.equal(first.complete, false);
  assert.equal(first.failedDomain, 'personal-p1');
  assert.equal(h.remoteFiles.has('pwa-core-v1/samen.json'), true);
  assert.equal(h.remoteFiles.has('pwa-core-v1/eigen-p1.json'), false);

  const resumed = await h.core.publishLocal({
    me: 'p1', passwords: { shared: passwords.shared, 'personal-p1': passwords['personal-p1'] }, settings: connection,
  });
  assert.equal(resumed.complete, true);
  assert.equal(h.remoteFiles.has('pwa-core-v1/eigen-p1.json'), true);
  await h.core.lock();
});

test('runtime: nieuw apparaat koppelt bestaande gedeelde kluis en maakt alleen eigen ontbrekende kluis aan', async () => {
  const first = runtimeHarness();
  const created = await first.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  const shared = clone(first.remoteFiles.get('pwa-core-v1/samen.json'));
  await first.core.lock();

  const second = runtimeHarness({ remoteFiles: first.remoteFiles });
  const result = await second.core.connectExisting({
    me: 'p2',
    passwords: { shared: passwords.shared, 'personal-p2': passwords['personal-p2'] },
    settings: connection,
  });
  assert.equal(result.complete, true);
  assert.deepEqual(second.remoteFiles.get('pwa-core-v1/samen.json'), shared);
  assert.equal(second.vaults['personal-p1'].hasVault(), false);
  assert.equal(second.vaults['personal-p2'].hasVault(), true);
  assert.deepEqual([...second.remoteFiles.keys()].sort(), [
    'pwa-core-v1/eigen-p1.json', 'pwa-core-v1/eigen-p2.json', 'pwa-core-v1/samen.json',
  ]);
  await second.core.lock();
});

test('runtime: koppelen van bestaand Core-bestand met inhoud importeert gegevens ongewijzigd', async () => {
  const first = runtimeHarness();
  await first.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  const state = first.core.getState();
  state.samen.items.push({ id: 'already-there', name: 'Bestaande last' });
  await first.core.persistState(state);
  await first.core.sync();
  const expected = clone(first.remoteFiles.get('pwa-core-v1/samen.json'));
  await first.core.lock();

  const second = runtimeHarness({ remoteFiles: first.remoteFiles });
  const result = await second.core.connectExisting({
    me: 'p1',
    passwords: { shared: passwords.shared, 'personal-p1': passwords['personal-p1'] },
    settings: connection,
  });
  assert.equal(result.complete, true);
  assert.deepEqual(second.core.getState().samen.items.map(x => x.id), ['already-there']);
  assert.deepEqual(second.remoteFiles.get('pwa-core-v1/samen.json'), expected);
  await second.core.lock();
});


test('runtime: nieuw apparaat weigert een te kort of gedeeld wachtwoord voor een nieuwe persoonlijke kluis', async () => {
  const first = runtimeHarness();
  await first.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  await first.core.lock();

  const short = runtimeHarness({ remoteFiles: first.remoteFiles });
  const rejectedShort = await short.core.connectExisting({
    me: 'p2',
    passwords: { shared: passwords.shared, 'personal-p2': 'te-kort' },
    settings: connection,
  });
  assert.equal(rejectedShort.complete, false);
  assert.match(rejectedShort.error.message, /minstens 12 tekens/);
  assert.equal(short.remoteFiles.has('pwa-core-v1/eigen-p2.json'), false);

  const same = runtimeHarness({ remoteFiles: first.remoteFiles });
  const rejectedSame = await same.core.connectExisting({
    me: 'p2',
    passwords: { shared: passwords.shared, 'personal-p2': passwords.shared },
    settings: connection,
  });
  assert.equal(rejectedSame.complete, false);
  assert.match(rejectedSame.error.message, /ander wachtwoord/);
  assert.equal(same.remoteFiles.has('pwa-core-v1/eigen-p2.json'), false);
});


test('runtime: expliciete lokale reset wist alle drie lokale Core-kluizen, behoudt GitHub en laat een nieuwe lege start toe', async () => {
  const h = runtimeHarness();
  const first = await h.core.initializeEmpty({ me: 'p1', passwords, settings: connection });
  assert.equal(first.complete, true);
  assert.equal(h.vaults.shared.hasVault(), true);
  assert.equal(h.vaults['personal-p1'].hasVault(), true);
  const remoteBefore = [...h.remoteFiles.entries()].map(([path, value]) => [path, clone(value)]);

  await h.core.lock();
  await h.core.resetLocalVaults();

  assert.equal(h.vaults.shared.hasVault(), false);
  assert.equal(h.vaults['personal-p1'].hasVault(), false);
  assert.equal(h.vaults['personal-p2'].hasVault(), false);
  assert.deepEqual([...h.remoteFiles.entries()], remoteBefore);

  const nextPasswords = {
    shared: 'another-new-shared-password',
    'personal-p1': 'another-new-personal-password',
    'personal-p2': 'another-new-p2-password',
  };
  const second = await h.core.initializeEmptyLocal({ me: 'p1', passwords: nextPasswords });
  assert.equal(second.complete, true);
  assert.deepEqual(second.state.samen.items, []);
  assert.deepEqual(second.state.eigen.items, []);
  await h.core.lock();
});
