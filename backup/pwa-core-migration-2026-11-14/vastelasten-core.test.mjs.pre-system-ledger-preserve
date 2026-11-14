import test from 'node:test';
import assert from 'node:assert/strict';
import { createVasteLastenCore } from '../js/vastelasten-core.js';

const clone = (value) => structuredClone(value);
const domainForPrefix = (prefix) => prefix.endsWith('-shared')
  ? 'shared'
  : prefix.endsWith('-p1') ? 'personal-p1' : 'personal-p2';
const mergeStore = (a, b) => {
  const out = { ...a, ...b };
  out.items = [...new Map([...(a.items || []), ...(b.items || [])].map((item) => [item.id, item])).values()];
  out.del = { ...(a.del || {}), ...(b.del || {}) };
  out.paid = { ...(a.paid || {}), ...(b.paid || {}) };
  return out;
};

function setup({ biometricKey = 'synthetic-key' } = {}) {
  const events = [];
  const vaults = {};
  const syncCalls = [];
  const settingsSeen = [];
  const factories = {
    createVault: ({ storagePrefix }) => {
      const id = domainForPrefix(storagePrefix);
      let unlocked = false;
      let data = { items: [], del: {}, paid: {}, ...(id === 'shared' ? { meta: null } : {}), schema: 1, domain: id };
      const vault = {
        hasVault: () => true,
        isUnlocked: () => unlocked,
        async unlockWithPassword(password) { assert.ok(password); unlocked = true; events.push(id + ':password'); },
        async unlockWithKey(key) { assert.equal(key, biometricKey); unlocked = true; events.push(id + ':biometric'); },
        getData: () => clone(data),
        async setData(next) { data = clone(next); events.push(id + ':setData'); },
        async flush() { events.push(id + ':flush'); },
        lock() { unlocked = false; events.push(id + ':lock'); },
        getDataKey: () => 'synthetic-data-key-' + id,
        getSyncMeta: () => ({ sha: null, dirty: false }),
        setSyncMeta: () => {},
        async changePassword(current, next) { assert.ok(current); assert.ok(next); events.push(id + ':password-change'); },
        getSyncDevices: () => [],
        async deactivateSyncDevice() {},
        async decryptRemote(envelope) { return clone(envelope.payload); },
        reconcileRestoredBackup(value) { return clone(value); },
      };
      vaults[id] = vault;
      return vault;
    },
    createSync: ({ vault }) => ({
      async syncNow(options) {
        syncCalls.push({ vault, options });
        return 'up-to-date';
      },
    }),
    createSessionLock: ({ storagePrefix }) => ({
      async acquireSessionLock() {
        const id = domainForPrefix(storagePrefix);
        events.push(id + ':acquire');
        return { release: async () => events.push(id + ':release') };
      },
    }),
    createBiometric: ({ storagePrefix }) => ({
      async unlock() { events.push(domainForPrefix(storagePrefix) + ':biometric-prompt'); return biometricKey; },
      async enroll(key) { assert.ok(key); events.push(domainForPrefix(storagePrefix) + ':enroll'); },
      async enrollExisting(key) { assert.ok(key); events.push(domainForPrefix(storagePrefix) + ':enroll-existing'); },
      isEnrolled: () => true,
    }),
  };
  const clientFactory = (settings) => ({
    async checkRepo() { return { private: true, defaultBranch: 'main' }; },
    async getFile() {
      settingsSeen.push(settings);
      const id = settings.path.endsWith('samen.json')
        ? 'shared'
        : settings.path.endsWith('eigen-p1.json') ? 'personal-p1' : 'personal-p2';
      const payload = { items: [], del: {}, paid: {}, ...(id === 'shared' ? { meta: null } : {}), schema: 1, domain: id };
      return { sha: 'remote-' + id, envelope: { payload } };
    },
  });
  const core = createVasteLastenCore({
    storage: { getItem() { return null; }, setItem() {}, removeItem() {}, key() { return null; }, length: 0 },
    mergeStore,
    clientFactory,
    factories,
  });
  return { core, vaults, events, syncCalls, settingsSeen };
}

const connection = { owner: 'synthetic-owner', repo: 'synthetic-private-repo', token: 'synthetic-token' };

test('password unlock opens and syncs only shared plus the active personal vault', async () => {
  const { core, vaults, events, syncCalls } = setup();
  const state = await core.unlock({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
    settings: connection,
  });
  assert.equal(state.samen.domain, 'shared');
  assert.equal(state.eigen.domain, 'personal-p1');
  assert.equal(vaults.shared.isUnlocked(), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), true);
  assert.equal(vaults['personal-p2'].isUnlocked(), false);
  assert.equal(syncCalls.length, 2);
  assert.ok(events.includes('shared:acquire'));
  assert.ok(events.includes('personal-p1:acquire'));
  assert.equal(events.includes('personal-p2:acquire'), false);
  await core.lock();
});

test('biometric unlock can open and sync the two vaults sequentially', async () => {
  const { core, vaults, syncCalls, events } = setup();
  const state = await core.unlockWithBiometric({ me: 'p2', settings: connection });
  assert.equal(state.samen.domain, 'shared');
  assert.equal(state.eigen.domain, 'personal-p2');
  assert.equal(vaults.shared.isUnlocked(), true);
  assert.equal(vaults['personal-p2'].isUnlocked(), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(syncCalls.length, 2);
  assert.ok(events.includes('shared:biometric'));
  assert.ok(events.includes('personal-p2:biometric'));
  await core.lock();
});

test('offline password unlock opens local encrypted vaults without contacting GitHub', async () => {
  const { core, vaults, syncCalls, events } = setup();
  const state = await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  assert.equal(state.samen.domain, 'shared');
  assert.equal(state.eigen.domain, 'personal-p1');
  assert.equal(vaults.shared.isUnlocked(), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), true);
  assert.equal(vaults['personal-p2'].isUnlocked(), false);
  assert.equal(syncCalls.length, 0);
  assert.equal(events.includes('shared:acquire'), true);
  await core.lock();
});

test('offline edits can be durably flushed without a GitHub connection', async () => {
  const { core, vaults, events } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  const state = core.getState();
  state.samen.items.push({ id: 'offline-change', u: 3 });
  await core.persistState(state);
  await core.flushLocal();
  assert.deepEqual(vaults.shared.getData().items.map((x) => x.id), ['offline-change']);
  assert.ok(events.includes('shared:flush'));
  assert.ok(events.includes('personal-p1:flush'));
  await core.lock();
});

test('offline biometric unlock opens local encrypted vaults without contacting GitHub', async () => {
  const { core, vaults, syncCalls } = setup();
  const state = await core.unlockWithBiometricLocal({ me: 'p2' });
  assert.equal(state.eigen.domain, 'personal-p2');
  assert.equal(vaults.shared.isUnlocked(), true);
  assert.equal(vaults['personal-p2'].isUnlocked(), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(syncCalls.length, 0);
  await core.lock();
});

test('an offline-unlocked session can connect later and sync both active vaults', async () => {
  const { core, syncCalls } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  const result = await core.connect(connection);
  assert.equal(syncCalls.length, 2);
  assert.equal(result.state.samen.domain, 'shared');
  assert.equal(result.state.eigen.domain, 'personal-p1');
  await core.lock();
});

test('persistState writes the current shared and active personal snapshots only', async () => {
  const { core, vaults, events } = setup();
  await core.unlock({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
    settings: connection,
  });
  const state = core.getState();
  state.samen.items.push({ id: 'shared-change', u: 1 });
  state.eigen.items.push({ id: 'private-change', u: 2 });
  await core.persistState(state);
  assert.deepEqual(vaults.shared.getData().items.map((x) => x.id), ['shared-change']);
  assert.deepEqual(vaults['personal-p1'].getData().items.map((x) => x.id), ['private-change']);
  assert.deepEqual(vaults['personal-p2'].getData().items, []);
  assert.ok(events.includes('shared:setData'));
  assert.ok(events.includes('personal-p1:setData'));
  await core.lock();
});

test('Core password changes update only the selected active vault and sync it', async () => {
  const { core, events, syncCalls } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  await core.connect(connection);
  const result = await core.changePassword('shared', 'shared-password', 'new-shared-password');
  assert.equal(result, 'up-to-date');
  assert.ok(events.includes('shared:password-change'));
  assert.equal(events.includes('personal-p1:password-change'), false);
  assert.equal(syncCalls.length, 3); // connect synchronizes both; password change syncs shared
  await core.lock();
});

test('existing passkeys can be relinked to the imported Core data keys', async () => {
  const { core, events } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  await core.enrollExistingBiometric('shared');
  await core.enrollExistingBiometric('personal-p1');
  assert.ok(events.includes('shared:enroll-existing'));
  assert.ok(events.includes('personal-p1:enroll-existing'));
  await core.lock();
});

test('lock flushes and locks both active vaults before releasing their session locks', async () => {
  const { core, events } = setup();
  await core.unlock({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
    settings: connection,
  });
  await core.lock();
  const sharedFlush = events.lastIndexOf('shared:flush');
  const personalFlush = events.lastIndexOf('personal-p1:flush');
  const sharedLock = events.lastIndexOf('shared:lock');
  const personalLock = events.lastIndexOf('personal-p1:lock');
  const personalRelease = events.lastIndexOf('personal-p1:release');
  const sharedRelease = events.lastIndexOf('shared:release');
  assert.ok(sharedFlush < sharedLock);
  assert.ok(personalFlush < personalLock);
  assert.ok(sharedLock < personalRelease);
  assert.ok(personalLock < personalRelease);
  assert.ok(personalRelease < sharedRelease);
});
