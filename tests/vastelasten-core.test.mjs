import test from 'node:test';
import assert from 'node:assert/strict';
import { createVasteLastenCore } from '../js/vastelasten-core.js';
import { createVault } from '../js/core/vault-factory.js';
import { webcrypto } from 'node:crypto';
import { generateDataKey, encryptJSON, decryptJSON, b64ToBytes } from '../js/core/crypto.js';
import {
  createBundleBiometric, generateBundleKey, wrapVaultKey, unwrapVaultKey, unwrapBundleKey,
} from '../js/bundle-biometric.js';
import { createUserHandle as createCoreUserHandle, isForeignUserHandle as isCoreForeignUserHandle } from '../js/core/biometric-factory.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;


test('Core bundle userHandles are compact, scope-bound and accept only explicit legacy formats', async () => {
  const storagePrefix = `vaste-lasten-${'very-long-workspace-name-'.repeat(5)}device-p1`;
  const userHandle = await createCoreUserHandle({ storagePrefix, scope: 'bundle' });
  assert.ok(userHandle.byteLength <= 64);
  assert.match(new TextDecoder().decode(userHandle), /^pwc1:bundle:[a-f0-9]{24}:/);
  assert.equal(await isCoreForeignUserHandle(userHandle, { storagePrefix, scope: 'bundle' }), false);
  assert.equal(await isCoreForeignUserHandle(userHandle, { storagePrefix, scope: 'vault' }), true);

  const legacyPrefixHandle = new TextEncoder().encode(`${storagePrefix}:legacy`);
  assert.equal(await isCoreForeignUserHandle(legacyPrefixHandle, { storagePrefix, scope: 'bundle' }), false);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(storagePrefix)));
  const oldHash = [...digest.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const legacyCompactHandle = new TextEncoder().encode(`vl1-${oldHash}:legacy`);
  assert.equal(await isCoreForeignUserHandle(legacyCompactHandle, {
    storagePrefix, scope: 'bundle', legacyTags: [`vl1-${oldHash}:`],
  }), false);

  const foreignWorkspaceHandle = await createCoreUserHandle({ storagePrefix: 'cryptotracker-device-p1', scope: 'bundle' });
  assert.equal(await isCoreForeignUserHandle(foreignWorkspaceHandle, { storagePrefix, scope: 'bundle' }), true);
});

test('Core relinking accepts only the active vault domains and legacy random handles', async () => {
  const encode = (value) => new TextEncoder().encode(value);
  const options = {
    storagePrefix: 'vaste-lasten-device-p1',
    scope: 'bundle',
    legacyPrefixes: ['vaste-lasten-device-p1', 'vaste-lasten-shared', 'vaste-lasten-personal-p1'],
  };
  assert.equal(await isCoreForeignUserHandle(encode('vaste-lasten-shared:credential'), options), false);
  assert.equal(await isCoreForeignUserHandle(encode('vaste-lasten-personal-p1:credential'), options), false);
  assert.equal(await isCoreForeignUserHandle(encode('vaste-lasten-device-p1:credential'), options), false);
  assert.equal(await isCoreForeignUserHandle(encode('vaste-lasten-personal-p2:credential'), options), true);
  assert.equal(await isCoreForeignUserHandle(encode('cryptotracker:credential'), options), true);
  // Legacy passkeys used random user handles without an app prefix.
  assert.equal(await isCoreForeignUserHandle(encode('legacy-random-user-handle'), options), false);
});


test('bundle passkey relinking accepts an active vault credential and rejects the other person', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const secret = new Uint8Array(32).fill(29);
  let userHandle = new TextEncoder().encode('vaste-lasten-shared:existing-credential').buffer;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      credentials: {
        async get() {
          return {
            rawId: new Uint8Array([9, 8, 7]).buffer,
            response: { userHandle },
            getClientExtensionResults: () => ({ prf: { results: { first: secret.buffer } } }),
          };
        },
      },
    },
  });
  try {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
    const biometric = createBundleBiometric({
      storagePrefix: 'vaste-lasten-device-p1',
      allowedUserHandlePrefixes: ['vaste-lasten-shared', 'vaste-lasten-personal-p1'],
      storage,
    });
    const bundleKey = await generateBundleKey();
    await biometric.enrollExisting(bundleKey);
    assert.equal(biometric.isEnrolled(), true);

    // The compact vl1 format introduced by app PR #20 remains linkable.
    const legacyDigest = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('vaste-lasten-device-p1'),
    ));
    const legacyHash = [...legacyDigest.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    userHandle = new TextEncoder().encode(`vl1-${legacyHash}:legacy-credential`);
    await biometric.enrollExisting(bundleKey);
    const previous = storage.getItem('vaste-lasten-device-p1:biometric-bundle');

    // A vault-scoped Core passkey must not be mistaken for the bundle passkey.
    userHandle = await createCoreUserHandle({ storagePrefix: 'vaste-lasten-device-p1', scope: 'vault' });
    await assert.rejects(biometric.enrollExisting(bundleKey), /andere app/);

    userHandle = new TextEncoder().encode('vaste-lasten-personal-p2:other-person').buffer;
    await assert.rejects(biometric.enrollExisting(bundleKey), /andere app/);
    assert.equal(storage.getItem('vaste-lasten-device-p1:biometric-bundle'), previous);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
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
    const expectedPrfSalt = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`vaste-lasten-device-p1:biometric-bundle-prf:v1`),
    ));
    assert.deepEqual([...createOptions.publicKey.extensions.prf.eval.first], [...expectedPrfSalt]);
    const storedBundle = JSON.parse(values.get('vaste-lasten-device-p1:biometric-bundle'));
    assert.deepEqual([...b64ToBytes(storedBundle.prfSalt)], [...expectedPrfSalt]);
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

test('new passkeys use a compact userHandle tag for long workspace prefixes and can be relinked', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const secret = new Uint8Array(32).fill(41);
  const longPrefix = `vaste-lasten-${'very-long-workspace-name-'.repeat(5)}device-p1`;
  let createOptions = null;
  let userHandle = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { credentials: {
      async create(options) {
        createOptions = options;
        userHandle = options.publicKey.user.id.slice();
        return {
          rawId: new Uint8Array([5, 4, 3, 2, 1]).buffer,
          getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: secret.buffer } } }),
        };
      },
      async get() {
        return {
          rawId: new Uint8Array([5, 4, 3, 2, 1]).buffer,
          response: { userHandle },
          getClientExtensionResults: () => ({ prf: { results: { first: secret.buffer } } }),
        };
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
    const biometric = createBundleBiometric({ storagePrefix: longPrefix, storage });
    const bundleKey = await generateBundleKey();
    await biometric.enroll(bundleKey);

    const expectedPrfSalt = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${longPrefix}:biometric-bundle-prf:v1`),
    ));
    assert.deepEqual([...createOptions.publicKey.extensions.prf.eval.first], [...expectedPrfSalt]);
    const storedBundle = JSON.parse(values.get(`${longPrefix}:biometric-bundle`));
    assert.deepEqual([...b64ToBytes(storedBundle.prfSalt)], [...expectedPrfSalt]);

    const userId = new Uint8Array(createOptions.publicKey.user.id);
    assert.ok(userId.byteLength <= 64, `WebAuthn user.id was ${userId.byteLength} bytes`);
    assert.match(new TextDecoder().decode(userId), /^pwc1:bundle:[0-9a-f]{24}:/);
    assert.equal(await isCoreForeignUserHandle(userId, { storagePrefix: longPrefix, scope: 'bundle' }), false);
    assert.equal(await isCoreForeignUserHandle(userId, { storagePrefix: longPrefix, scope: 'vault' }), true);
    assert.equal(biometric.isEnrolled(), true);

    // A newly-created compact tag must also be recognized by the relinking flow.
    await biometric.enrollExisting(bundleKey);
    assert.equal(biometric.isEnrolled(), true);
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

function setup({ remoteEnvelopes = {} } = {}) {
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
        KEYS: { vault: `${storagePrefix}:vault` },
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
      return { sha: 'remote-' + id, envelope: remoteEnvelopes[id] || { payload } };
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

let fixtureVaultCounter = 0;
async function makeEncryptedEnvelope(password, payload) {
  const values = new Map();
  const fixtureStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const fixture = createVault({ storagePrefix: `verify-fixture-${++fixtureVaultCounter}`, kdfIterations: 100000, storage: fixtureStorage });
  await fixture.create(password, payload);
  const envelope = clone(fixture.getEnvelope());
  await fixture.dispose();
  return envelope;
}

test('persoonlijk wachtwoord wordt vooraf gecontroleerd zonder een kluis te openen', async () => {
  const { core, storage, events, vaults } = setup();
  const envelope = await makeEncryptedEnvelope('persoonlijk-testwachtwoord', {
    items: [], del: {}, paid: {}, schema: 1, domain: 'personal-p1',
  });
  storage.setItem('vaste-lasten-personal-p1:vault', JSON.stringify(envelope));
  assert.equal(await core.verifyPersonalPassword({ me: 'p1', password: 'persoonlijk-testwachtwoord' }), true);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(vaults.shared.isUnlocked(), false);
  assert.ok(events.includes('personal-p1:acquire'));
  assert.ok(events.includes('personal-p1:release'));
  assert.equal(events.includes('shared:acquire'), false);
});

test('onjuist persoonlijk wachtwoord stopt vóór het gezamenlijke domein wordt benaderd', async () => {
  const { core, storage, events, vaults } = setup();
  const envelope = await makeEncryptedEnvelope('persoonlijk-testwachtwoord', {
    items: [], del: {}, paid: {}, schema: 1, domain: 'personal-p1',
  });
  storage.setItem('vaste-lasten-personal-p1:vault', JSON.stringify(envelope));
  await assert.rejects(core.verifyPersonalPassword({ me: 'p1', password: 'verkeerd-wachtwoord' }), /eigen wachtwoord klopt niet/i);
  assert.equal(vaults.shared.isUnlocked(), false);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(events.includes('shared:acquire'), false);
});

test('persoonlijk wachtwoord kan op een nieuw apparaat tegen de remote envelope worden gecontroleerd zonder import', async () => {
  const envelope = await makeEncryptedEnvelope('persoonlijk-testwachtwoord', {
    items: [], del: {}, paid: {}, schema: 1, domain: 'personal-p1',
  });
  const { core, storage, settingsSeen, events, vaults } = setup({ remoteEnvelopes: { 'personal-p1': envelope } });
  assert.equal(await core.verifyPersonalPassword({ me: 'p1', password: 'persoonlijk-testwachtwoord', settings: connection }), true);
  assert.equal(storage.getItem('vaste-lasten-personal-p1:vault'), null);
  assert.equal(settingsSeen.at(-1).path, 'pwa-core-v1/eigen-p1.json');
  assert.equal(vaults.shared.isUnlocked(), false);
  assert.equal(vaults['personal-p1'].isUnlocked(), false);
  assert.equal(events.includes('shared:acquire'), false);
});


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
  assert.deepEqual(syncCalls.map(call => call.options.schemaVersion), [2, 2]);
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

test('failed persistence blocks flush and lock until a later full save succeeds', async () => {
  const { core, vaults } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  const snapshot = core.getState();
  snapshot.samen.items.push({ id: 'must-not-be-lost', u: 101 });
  const originalSetData = vaults.shared.setData;
  vaults.shared.setData = async () => { throw new Error('synthetic persistence failure'); };
  await assert.rejects(core.persistState(snapshot), /synthetic persistence failure/);
  await assert.rejects(core.flushLocal(), /synthetic persistence failure/);
  await assert.rejects(core.lock(), /synthetic persistence failure/);
  assert.equal(vaults.shared.isUnlocked(), true);

  vaults.shared.setData = originalSetData;
  await core.persistState(snapshot);
  await core.flushLocal();
  assert.deepEqual(vaults.shared.getData().items.map((item) => item.id), ['must-not-be-lost']);
  await core.lock();
  assert.equal(vaults.shared.isUnlocked(), false);
});

test('lock waits for an in-flight persistState operation before locking vaults', async () => {
  const { core, vaults, events } = setup();
  await core.unlockLocal({
    me: 'p1',
    passwords: { shared: 'shared-password', 'personal-p1': 'personal-password' },
  });
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let finishWrite;
  const gate = new Promise((resolve) => { finishWrite = resolve; });
  const originalSetData = vaults.shared.setData;
  vaults.shared.setData = async (next) => {
    markStarted();
    await gate;
    return originalSetData(next);
  };
  const snapshot = core.getState();
  snapshot.samen.items.push({ id: 'queued-before-lock', u: 99 });
  const persist = core.persistState(snapshot);
  await started;
  let locked = false;
  const locking = core.lock().then(() => { locked = true; });
  await Promise.resolve();
  assert.equal(locked, false);
  assert.equal(vaults.shared.isUnlocked(), true);
  finishWrite();
  await Promise.all([persist, locking]);
  assert.deepEqual(vaults.shared.getData().items.map((item) => item.id), ['queued-before-lock']);
  assert.equal(vaults.shared.isUnlocked(), false);
  assert.ok(events.indexOf('shared:setData') < events.lastIndexOf('shared:lock'));
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
