import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createVault } from '../js/core/vault-factory.js';
import { createSync } from '../js/core/sync-factory.js';
import { mergeDomainPayload, validateDomainPayload } from '../js/multi-vault-adapter.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/function merge\(a,b\)\s*\{[\s\S]*?\n\}/);
assert.ok(match, 'de app-mergefunctie moet aanwezig zijn');
const reviewSource = await readFile(new URL('../js/conflict-review.js', import.meta.url), 'utf8');
const reviewContext = { globalThis: {} };
vm.runInNewContext(reviewSource, reviewContext);
const review = reviewContext.globalThis.VasteLastenConflictReview;

const canon = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canon(value[k])).join(',') + '}';
  return JSON.stringify(value === undefined ? null : value);
};
function byId(a, b) {
  const out = {};
  for (const source of [a || {}, b || {}]) for (const id in source) {
    const value = source[id], current = out[id];
    if (value && (!current || (+value.u || 0) > (+current.u || 0)
      || ((+value.u || 0) === (+current.u || 0) && canon(value) < canon(current)))) out[id] = { ...value };
  }
  return out;
}
const newest = (a, b) => !a ? (b ? { ...b } : undefined) : !b ? { ...a }
  : ((+b.u || 0) > (+a.u || 0) ? { ...b } : (+b.u || 0) < (+a.u || 0) ? { ...a }
    : (canon(b) < canon(a) ? { ...b } : { ...a }));
const appContext = {
  globalThis: { VasteLastenConflictReview: review },
  VasteLastenConflictReview: review,
  EMPTY: () => ({ items: [], del: {}, paid: {}, meta: null }),
  MERGE: {
    cats: byId, inc: (a, b) => ({ p1: newest(a && a.p1, b && b.p1), p2: newest(a && a.p2, b && b.p2) }),
    prof: newest, settle: byId, scen: byId, minApp: (a, b) => a || b,
  },
  canon,
  prune: value => value,
};
const mergeStore = vm.runInNewContext('(' + match[0] + ')', appContext);
const base = () => ({ items: [], del: {}, paid: {}, meta: null, schema: 2, domain: 'shared' });
const pending = state => review.pendingConflicts(state.__conflicts);
const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
};

test('real encrypted vault sync preserves a later stale-client choice as a concurrent review', async () => {
  const previousFetch = globalThis.fetch;
  let remoteEnvelope;
  let remoteSha = 'seed-sha';
  let revision = 0;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') {
      if (!remoteEnvelope) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({
        sha: remoteSha,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(remoteEnvelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      remoteEnvelope = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      remoteSha = 'sha-' + (++revision);
      return new Response(JSON.stringify({ content: { sha: remoteSha } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 405 });
  };

  const vaults = [];
  try {
    const left = base(), right = base();
    left.items = [{ id: 'rent', name: 'PR9 TEST', amount: 125, u: 1500 }];
    right.items = [{ id: 'rent', name: 'PR9 TEST', amount: 140, u: 1500 }];
    const initial = mergeStore(left, right);
    initial.schema = 2;
    initial.domain = 'shared';
    const task = pending(initial)[0];
    assert.ok(task, 'de twee oorspronkelijke versies moeten een reviewtaak opleveren');

    const seed = createVault({ storagePrefix: 'pr9-review-seed', kdfIterations: 1000, storage: storage() });
    await seed.create('synthetic-password', initial);
    await seed.flush();
    remoteEnvelope = structuredClone(seed.getEnvelope());
    await seed.dispose();

    async function makeClient(prefix) {
      const vault = createVault({ storagePrefix: prefix, kdfIterations: 1000, storage: storage() });
      vaults.push(vault);
      await vault.importEnvelope(structuredClone(remoteEnvelope), 'synthetic-password');
      vault.setSyncMeta({ sha: remoteSha, dirty: false });
      return { vault, sync: createSync({ vault, appName: 'Vaste Lasten test' }) };
    }
    const a = await makeClient('pr9-review-client-a');
    const b = await makeClient('pr9-review-client-b');
    const options = {
      settings: { owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main', path: 'pwa-core-v1/samen.json', token: 'synthetic-token' },
      schemaVersion: 2,
      migrate: value => validateDomainPayload(value, 'shared'),
      merge: (local, remote) => mergeDomainPayload(local, remote, 'shared', mergeStore),
    };

    const choose = (snapshot, index, at) => {
      const next = structuredClone(snapshot);
      const selected = task.alternatives[index];
      next.__conflicts = review.resolveConflictState(next.__conflicts, task.id, index, { at, deviceId: 'p1' });
      if (selected.kind === 'record') {
        next.items = next.items.filter(item => item.id !== selected.value.id);
        next.items.push({ ...selected.value, u: at });
      }
      return next;
    };

    // Beide clients beginnen met dezelfde versleutelde kluis en dezelfde open reviewtaak.
    await a.vault.setData(choose(a.vault.getData(), 0, 1600));
    await b.vault.setData(choose(b.vault.getData(), 1, 1700));

    // A publiceert eerst; B synchroniseert daarna vanaf zijn verouderde lokale snapshot.
    await a.sync.syncNow(options);
    await b.sync.syncNow(options);

    const afterB = pending(b.vault.getData().__conflicts);
    assert.equal(afterB.length, 1);
    assert.equal(afterB[0].kind, 'concurrent-review');
    assert.deepEqual(
      JSON.parse(JSON.stringify(afterB[0].alternatives.map(value => value.value?.amount ?? value.amount).sort((x, y) => x - y))),
      [125, 140],
    );

    // A haalt de door B gemaakte vervolgtaak op; daarna moeten beide clients convergeren.
    await a.sync.syncNow(options);
    await b.sync.syncNow(options);
    for (const client of [a, b]) {
      const tasks = pending(client.vault.getData().__conflicts);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].kind, 'concurrent-review');
      assert.equal(tasks[0].id, afterB[0].id);
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const vault of vaults.reverse()) await vault.dispose();
  }
});
