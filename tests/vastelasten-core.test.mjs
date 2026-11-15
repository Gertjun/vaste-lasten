import test from 'node:test';
import assert from 'node:assert/strict';
import { createVasteLastenCore } from '../js/vastelasten-core.js';
import { webcrypto } from 'node:crypto';
import { generateDataKey, encryptJSON, decryptJSON } from '../js/core/crypto.js';
import {
  createBundleBiometric, generateBundleKey, wrapVaultKey, unwrapVaultKey, unwrapBundleKey,
  isForeignUserHandle,
} from '../js/bundle-biometric.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test('existing passkey relinking accepts only the shared and matching personal vault userHandles', () => {
  const encode = (value) => new TextEncoder().encode(value).buffer;
  const allowed = [
    'vaste-lasten-device-p1',
    'vaste-lasten-shared',
    'vaste-lasten-personal-p1',
  ];
  assert.equal(isForeignUserHandle(encode('vaste-lasten-shared:credential'), allowed), false);
  assert.equal(isForeignUserHandle(encode('vaste-lasten-personal-p1:credential'), allowed), false);
  assert.equal(isForeignUserHandle(encode('vaste-lasten-device-p1:credential'), allowed), false);
  assert.equal(isForeignUserHandle(encode('vaste-lasten-personal-p2:credential'), allowed), true);
  assert.equal(isForeignUserHandle(encode('cryptotracker:credential'), allowed), true);
  // Legacy passkeys used random user handles without an app prefix.
  assert.equal(isForeignUserHandle(encode('legacy-random-user-handle'), allowed), false);
});


test('real Web Crypto passkey bundle wraps and restores both independent vault keys', async () => {
  const bundleKey = await generateBundleKey();
  const passkeyKek = await generateBundleKey();
  const sharedDataKey = await generateDataKey();
  const personalDataKey = await generateDataKey();
  assert.deepEqual([...bundleKey.usages].sort(), ['unwrapKey', 'wrapKey']);

  const wrappedBundle = await wrapVaultKey(bundleKey, passkeyKek);
  const restoredBundleKey = await unwrapBundleKey(wrappedBundle, passkeyKek);
  const [wrappedShared, wrappedPersonal] = await Promise.all([
    wrapVaultKey(sharedDataKey, restoredBundleKey),
    wrapVaultKey(personalDataKey, restoredBundleKey),
  ]);
  const [restoredShared, restoredPersonal] = await Promise.all([
    unwrapVaultKey(wrappedShared, restoredBundleKey),
    unwrapVaultKey(wrappedPersonal, restoredBundleKey),
  ]);
  const sharedBox = await encryptJSON({ domain: 'shared' }, restoredShared);
  const personalBox = await encryptJSON({ domain: 'personal-p1' }, restoredPersonal);
  assert.deepEqual(await decryptJSON(sharedBox, restoredShared), { domain: 'shared' });
  assert.deepEqual(await decryptJSON(personalBox, restoredPersonal), { domain: 'personal-p1' });
});


test('app passkey adapter stores and restores a wrapping-capable bundle key with WebAuthn PRF', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const secret = new Uint8Array(32).fill(23);
  const credentialId = new Uint8Array([1, 2, 3, 4]).buffer;
  let createOptions = null;
  let getOptions = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { credentials: {
      async create(options) {
        createOptions = options;
        return {
          rawId: credentialId,
          getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: secret.buffer } } }),
        };
      },
      async get(options) {
        getOptions = options;
        return { getClientExtensionResults: () => ({ prf: { results: { first: secret.buffer } } }) };
      },
    } },
  });
  try {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
    const biometric = createBundleBiometric({ storagePrefix: 'vaste-lasten-device-p1', storage });
    const bundleKey = await generateBundleKey();
    await biometric.enroll(bundleKey);
    assert.equal(biometric.isEnrolled(), true);
    assert.equal(createOptions.publicKey.extensions.prf.eval.first instanceof Uint8Array, true);
    const unlocked = await biometric.unlock();
    assert.deepEqual([...unlocked.usages].sort(), ['unwrapKey', 'wrapKey']);
    assert.equal(getOptions.publicKey.userVerification, 'required');

    const vaultKey = await generateDataKey();
    const wrapped = await wrapVaultKey(vaultKey, unlocked);
    const restored = await unwrapVaultKey(wrapped, unlocked);
    const box = await encryptJSON({ restored: true }, restored);
    assert.deepEqual(await decryptJSON(box, restored), { restored: true });
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

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

function setup() {
  const events = [];
  const vaults = {};
  const syncCalls = [];
  const settingsSeen = [];
  const stored = new Map();
  const storage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
    key(index) { return [...stored.keys()][index] ?? null; },
    get length() { return stored.size; },
  };
  let bundleCounter = 0;
  const deviceStates = new Map();
  const factories = {
    createVault: ({ storagePrefix }) => {
      const id = domainForPrefix(storagePrefix);
      let unlocked = false;
      let data = { items: [], del: {}, paid: {}, ...(id === 'shared' ? { meta: null } : {}), schema: 1, domain: id };
      const vault = {
        hasVault: () => true,
        isUnlocked: () => unlocked,
        async unlockWithPassword(password) { assert.ok(password); unlocked = true; events.push(id + ':password'); },
        async unlockWithKey(key) { assert.equal(key, 'synthetic-data-key-' + id); unlocked = true; events.push(id + ':biometric'); },
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
      async unlock() { events.push(domainForPrefix(storagePrefix) + ':unused-vault-biometric-prompt'); return 'unused'; },
      async enroll(key) { assert.ok(key); events.push(domainForPrefix(storagePrefix) + ':unused-vault-enroll'); },
      async enrollExisting(key) { assert.ok(key); events.push(domainForPrefix(storagePrefix) + ':unused-vault-enroll-existing'); },
      isEnrolled: () => false,
    }),
    createDeviceBiometric: ({ storagePrefix }) => {
      const person = storagePrefix.endsWith('-p1') ? 'p1' : 'p2';
      const state = { key: null, enrolled: false };
      deviceStates.set(person, state);
      return {
        async unlock() {
          events.push('device-' + person + ':biometric-prompt');
          if (!state.enrolled) throw new Error('No device passkey');
          if (state.unlockError) throw state.unlockError;
          return state.key;
        },
        async enroll(key) {
          state.key = key;
          state.enrolled = true;
          events.push('device-' + person + ':enroll');
        },
        async enrollExisting(key) {
          state.key = key;
          state.enrolled = true;
          events.push('device-' + person + ':enroll-existing');
        },
        isEnrolled: () => state.enrolled,
      };
    },
    generateBundleKey: async () => 'synthetic-bundle-key-' + (++bundleCounter),
    wrapVaultKey: async (dataKey, bundleKey) => ({ dataKey, bundleKey }),
    unwrapVaultKey: async (wrapped, bundleKey) => {
      if (!wrapped || wrapped.bundleKey !== bundleKey) throw new Error('Bundle key mismatch');
      return wrapped.dataKey;
    },
  };
  const clientFactory = (settings) => ({
    async checkRepo() { events.push('repo-check'); return { private: true, defaultBranch: 'main' }; },
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
    storage,
    mergeStore,
    clientFactory,
    factories,
  });
  return { core, vaults, events, syncCalls, settingsSeen, storage, deviceStates };
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

test('one biometric prompt unlocks the shared and active personal vaults, then syncs both', async () => {
  const { core, vaults, syncCalls, events } = setup();
  await core.unlock({
    me: 'p2',
    passwords: { shared: 'shared-password', 'personal-p2': 'personal-password' },
    settings: connection,
  });
  await core.enrollBiometric();
  await core.lock();
  const before = events.length;
  const state = await core.unlockWithBiometric({ me: 'p2', settings: connection });
  const during = events.slice(before);
  assert.equal(state.samen.domain, 'shared');
  assert.equal(state.eigen.domain, 'personal-p2');
  assert.equal(vaults.shared.isUnlocked(), true);
  assert.equal(vaults['personal-p2'].isUnlocked(), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(syncCalls.length, 4);
  assert.equal(during.filter((event) => event === 'device-p2:biometric-prompt').length, 1);
  assert.ok(during.indexOf('device-p2:biometric-prompt') < during.indexOf('repo-check'));
  assert.ok(events.includes('shared:biometric'));
  assert.ok(events.includes('personal-p2:biometric'));
  await core.lock();
});

test('cancelling the single biometric prompt does not leave session locks held', async () => {
  const { core, events, deviceStates } = setup();
  await core.unlock({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
    settings: connection,
  });
  await core.enrollBiometric();
  await core.lock();
  deviceStates.get('p1').unlockError = new Error('biometric cancelled');
  const before = events.length;
  await assert.rejects(core.unlockWithBiometric({ me: 'p1' }), /biometric cancelled/);
  const during = events.slice(before);
  assert.equal(during.filter((event) => event === 'device-p1:biometric-prompt').length, 1);
  assert.equal(during.some((event) => event.endsWith(':acquire')), false);
});

test('the device passkey bundle contains exactly the shared and active personal key', async () => {
  const { core, storage, events } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  await core.enrollBiometric();
  const record = JSON.parse(storage.getItem('vaste-lasten:biometric-bundle:p1:v1'));
  assert.equal(record.schema, 1);
  assert.equal(record.me, 'p1');
  assert.deepEqual(Object.keys(record.keys).sort(), ['personal-p1', 'shared']);
  assert.equal(events.filter((event) => event === 'device-p1:enroll').length, 1);
  assert.equal(events.some((event) => event.endsWith(':unused-vault-enroll')), false);
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

test('offline biometric unlock uses one prompt and does not contact GitHub', async () => {
  const { core, vaults, syncCalls, events } = setup();
  await core.unlock({
    me: 'p2',
    passwords: { shared: 'shared-password', 'personal-p2': 'personal-password' },
    settings: connection,
  });
  await core.enrollBiometric();
  const beforeSync = syncCalls.length;
  await core.lock();
  const before = events.length;
  const state = await core.unlockWithBiometricLocal({ me: 'p2' });
  assert.equal(state.eigen.domain, 'personal-p2');
  assert.equal(vaults.shared.isUnlocked(), true);
  assert.equal(vaults['personal-p2'].isUnlocked(), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(syncCalls.length, beforeSync);
  assert.equal(events.slice(before).filter((event) => event === 'device-p2:biometric-prompt').length, 1);
  assert.equal(events.slice(before).includes('repo-check'), false);
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

test('history restore rejects a payload from another vault domain', async () => {
  const { core } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  await core.connect(connection);
  await assert.rejects(core.restoreDomain(
    'shared',
    { payload: { items: [], del: {}, paid: {}, schema: 1, domain: 'personal-p1' } },
    (old) => old,
  ), /hoort niet bij het domein shared/);
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

test('one existing passkey can be relinked to both imported Core data keys', async () => {
  const { core, events, storage } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  await core.enrollExistingBiometric();
  const record = JSON.parse(storage.getItem('vaste-lasten:biometric-bundle:p1:v1'));
  assert.deepEqual(Object.keys(record.keys).sort(), ['personal-p1', 'shared']);
  assert.equal(events.filter((event) => event === 'device-p1:enroll-existing').length, 1);
  assert.equal(events.some((event) => event.endsWith(':unused-vault-enroll-existing')), false);
  await core.lock();
});

test('app saves cannot roll back a newer Core device and deletion ledger snapshot', async () => {
  const { core, vaults } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  const stale = core.getState();
  const sharedVault = core.getRegistry().shared.vault;
  await sharedVault.setData({ ...sharedVault.getData(), __pwaSync: { devices: { deviceA: { lastSeenAt: 10 } }, deletions: { itemA: 10 } } });
  stale.samen.items.push({ id: 'app-change', u: 20 });
  await core.persistState(stale);
  assert.deepEqual(vaults.shared.getData().__pwaSync, {
    devices: { deviceA: { lastSeenAt: 10 } },
    deletions: { itemA: 10 },
  });
  assert.deepEqual(vaults.shared.getData().items.map((x) => x.id), ['app-change']);
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
