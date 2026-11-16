import test from 'node:test';
import assert from 'node:assert/strict';
import { VAULT_DOMAINS, initializeEmptyDomain } from '../js/multi-vault-adapter.js';

const clone = (value) => structuredClone(value);
const emptyPayload = (id) => ({
  items: [], del: {}, paid: {},
  ...(id === 'shared' ? { meta: null } : {}),
  schema: 2, domain: VAULT_DOMAINS[id].domain,
});

function setup({ id = 'shared', remoteData = null, localData = null, password = 'new-password', syncFails = false, raceRemoteData = null } = {}) {
  let remote = remoteData ? { sha: 'remote-sha', envelope: { key: 'key-1', payload: clone(remoteData) } } : null;
  let local = localData ? { key: 'key-1', payload: clone(localData) } : null;
  let localPassword = local ? password : null;
  let createCalls = 0, importCalls = 0, syncCalls = 0;
  const vault = {
    validateEnvelope(envelope) { if (!envelope?.key || !envelope?.payload) throw new Error('invalid envelope'); },
    hasVault: () => !!local,
    async unlockWithPassword(value) {
      if (!local || value !== localPassword) throw new Error('wrong local password');
    },
    getData: () => clone(local.payload),
    async decryptRemote(envelope) {
      if (!local || envelope.key !== local.key) throw new Error('different encryption key');
      return clone(envelope.payload);
    },
    async importEnvelope(envelope, value) {
      if (value !== password) throw new Error('wrong password');
      importCalls++;
      local = clone(envelope);
      localPassword = value;
    },
    async create(value, initial) {
      if (local) throw new Error('already exists');
      createCalls++;
      localPassword = value;
      local = { key: 'key-1', payload: clone(initial) };
    },
    getSyncMeta: () => ({ sha: null, dirty: true }),
    setSyncMeta() {},
    async flush() {},
  };
  const entry = {
    vault,
    sync: {
      async syncNow(options) {
        syncCalls++;
        if (raceRemoteData) {
          remote = { sha: 'raced-sha', envelope: { key: 'key-1', payload: clone(raceRemoteData) } };
          options.migrate(clone(raceRemoteData));
        }
        if (syncFails) throw new Error('synthetic upload failure');
        if (!remote) remote = { sha: 'created-sha', envelope: clone(local) };
        return remote.sha === 'created-sha' ? 'uploaded' : 'up-to-date';
      },
    },
  };
  const registry = { [id]: entry };
  const createClient = (settings) => ({
    async getFile() {
      assert.equal(settings.path, VAULT_DOMAINS[id].path);
      return remote && clone(remote);
    },
  });
  return {
    registry, createClient,
    state: () => ({ remote: clone(remote), local: clone(local), createCalls, importCalls, syncCalls }),
    expectedPassword: password,
    setSyncFailure(value) { syncFails = value; },
  };
}

const run = (h, id = 'shared', password = 'new-password') => initializeEmptyDomain({
  id, password, registry: h.registry,
  settings: { owner: 'synthetic', repo: 'private-test', branch: 'main', token: 'not-a-real-token' },
  createClient: h.createClient,
  openEnvelope: async (_vault, envelope, value) => {
    if (value !== h.expectedPassword) throw new Error('wrong password');
    return clone(envelope.payload);
  },
  mergeStore: (a, b) => ({ ...a, ...b }),
});

test('zwakke nieuwe wachtwoorden worden geweigerd voordat lokale of remote opslag wijzigt', async () => {
  const h = setup();
  await assert.rejects(run(h, 'shared', 'te-kort'), /minstens 12 tekens/);
  assert.equal(h.state().local, null);
  assert.equal(h.state().remote, null);
  assert.equal(h.state().createCalls, 0);
});

test('eerste apparaat maakt één lege shared-kluis en bevestigt het remote bestand', async () => {
  const h = setup();
  const result = await run(h);
  const state = h.state();
  assert.equal(result.confirmed, true);
  assert.equal(state.createCalls, 1);
  assert.equal(state.syncCalls, 1);
  assert.deepEqual(state.remote.envelope.payload, emptyPayload('shared'));
});

test('tweede apparaat sluit aan op bestaande lege shared-kluis zonder een nieuwe sleutel te maken', async () => {
  const h = setup({ remoteData: emptyPayload('shared') });
  const result = await run(h);
  const state = h.state();
  assert.equal(result.confirmed, true);
  assert.equal(state.importCalls, 1);
  assert.equal(state.createCalls, 0);
  assert.equal(state.remote.sha, 'remote-sha');
});

test('tweede profiel maakt alleen zijn eigen lege persoonlijke kluis aan', async () => {
  const h = setup({ id: 'personal-p2' });
  const result = await run(h, 'personal-p2');
  assert.equal(result.path, 'pwa-core-v1/eigen-p2.json');
  assert.deepEqual(h.state().remote.envelope.payload, emptyPayload('personal-p2'));
});

test('niet-lege remote Core-kluis wordt geweigerd en nooit overschreven', async () => {
  const existing = { ...emptyPayload('shared'), items: [{ id: 'existing' }] };
  const h = setup({ remoteData: existing });
  await assert.rejects(run(h), /niet leeg|bestaande of onbekende gegevens/);
  assert.deepEqual(h.state().remote.envelope.payload, existing);
  assert.equal(h.state().importCalls, 0);
  assert.equal(h.state().syncCalls, 0);
});

test('niet-lege remote wijziging die na de preflight verschijnt wordt ook door sync geweigerd', async () => {
  const raced = { ...emptyPayload('shared'), items: [{ id: 'raced-record' }] };
  const h = setup({ raceRemoteData: raced });
  await assert.rejects(run(h), /niet leeg|bestaande of onbekende gegevens/);
  assert.deepEqual(h.state().remote.envelope.payload, raced);
  assert.deepEqual(h.state().local.payload, emptyPayload('shared'));
});

test('niet-lege lokale Core-kluis wordt geweigerd vóór synchronisatie', async () => {
  const existing = { ...emptyPayload('shared'), items: [{ id: 'local-existing' }] };
  const h = setup({ localData: existing });
  await assert.rejects(run(h), /niet leeg|bestaande of onbekende gegevens/);
  assert.equal(h.state().syncCalls, 0);
});

test('verkeerd wachtwoord laat een bestaande remote kluis onaangeroerd', async () => {
  const h = setup({ remoteData: emptyPayload('shared') });
  await assert.rejects(run(h, 'shared', 'wrong-password'), /wrong password/);
  assert.equal(h.state().syncCalls, 0);
  assert.deepEqual(h.state().remote.envelope.payload, emptyPayload('shared'));
});

test('uploadfout verwijdert of reset de lokaal aangemaakte lege kluis niet', async () => {
  const h = setup({ syncFails: true });
  await assert.rejects(run(h), /synthetic upload failure/);
  assert.ok(h.state().local);
  assert.equal(h.state().remote, null);
  assert.equal(h.state().createCalls, 1);
});
