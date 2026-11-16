import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createVault } from '../js/core/vault-factory.js';
import { createSync } from '../js/core/sync-factory.js';
import { createVasteLastenCore } from '../js/vastelasten-core.js';
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

test('Core persistState plus encrypted sync preserves a later stale-client choice', async () => {
  const previousFetch = globalThis.fetch;
  const remoteFiles = new Map();
  let remoteRevision = 0;
  let core;
  let clientAVault;
  let seedVaults = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    if (method === 'GET' && url.pathname === '/repos/synthetic-owner/synthetic-repo') {
      return new Response(JSON.stringify({ private: true, default_branch: 'main' }), { status: 200 });
    }
    const marker = '/contents/';
    const index = url.pathname.indexOf(marker);
    if (index < 0) return new Response(null, { status: 404 });
    const path = decodeURIComponent(url.pathname.slice(index + marker.length));
    if (method === 'GET') {
      const file = remoteFiles.get(path);
      if (!file) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({
        sha: file.sha,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(file.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      const file = {
        sha: 'sha-' + (++remoteRevision),
        envelope: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')),
      };
      remoteFiles.set(path, file);
      return new Response(JSON.stringify({ content: { sha: file.sha } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 405 });
  };

  const disposeVaults = async () => {
    if (core) {
      try { await core.lock(); } catch { /* cleanup continues */ }
      for (const entry of Object.values(core.getRegistry())) {
        try { await entry.vault.dispose(); } catch { /* cleanup continues */ }
      }
    }
    if (clientAVault) {
      try { await clientAVault.dispose(); } catch { /* cleanup continues */ }
    }
    for (const vault of seedVaults) {
      try { await vault.dispose(); } catch { /* cleanup continues */ }
    }
  };

  try {
    const left = base(), right = base();
    left.items = [{ id: 'rent', name: 'PR9 TEST', amount: 125, u: 1500 }];
    right.items = [{ id: 'rent', name: 'PR9 TEST', amount: 140, u: 1500 }];
    const initial = mergeStore(left, right);
    initial.schema = 2;
    initial.domain = 'shared';
    const task = pending(initial)[0];
    assert.ok(task, 'de twee oorspronkelijke versies moeten een reviewtaak opleveren');

    const seedShared = createVault({ storagePrefix: 'pr9-seed-shared', kdfIterations: 1000, storage: storage() });
    const seedPersonal = createVault({ storagePrefix: 'pr9-seed-personal', kdfIterations: 1000, storage: storage() });
    seedVaults.push(seedShared, seedPersonal);
    await seedShared.create('synthetic-password', initial);
    await seedPersonal.create('synthetic-password', {
      items: [], del: {}, paid: {}, schema: 2, domain: 'personal-p1',
    });
    await seedShared.flush();
    await seedPersonal.flush();
    remoteFiles.set('pwa-core-v1/samen.json', { sha: 'seed-shared', envelope: structuredClone(seedShared.getEnvelope()) });
    remoteFiles.set('pwa-core-v1/eigen-p1.json', { sha: 'seed-personal', envelope: structuredClone(seedPersonal.getEnvelope()) });
    await Promise.all(seedVaults.map(vault => vault.dispose()));
    seedVaults = [];

    const connection = { owner: 'synthetic-owner', repo: 'synthetic-repo', token: 'synthetic-token' };
    core = createVasteLastenCore({
      storage: storage(),
      kdfIterations: 1000,
      mergeStore,
      factories: {
        createSessionLock: () => ({ acquireSessionLock: async () => ({ release: async () => {} }) }),
        createBiometric: () => ({
          isEnrolled: () => false,
          async unlock() { throw new Error('not used in this test'); },
          async enroll() {},
          async enrollExisting() {},
        }),
      },
    });

    // B opent eerst de oorspronkelijke taak en houdt die lokaal open.
    await core.unlock({
      me: 'p1',
      passwords: { shared: 'synthetic-password', 'personal-p1': 'synthetic-password' },
      settings: connection,
    });
    const staleB = core.getState();

    // A opent dezelfde gepubliceerde kluis, kiest alternatief 1 en publiceert dat eerst.
    const currentRemote = remoteFiles.get('pwa-core-v1/samen.json');
    clientAVault = createVault({ storagePrefix: 'pr9-client-a-shared', kdfIterations: 1000, storage: storage() });
    await clientAVault.importEnvelope(structuredClone(currentRemote.envelope), 'synthetic-password');
    clientAVault.setSyncMeta({ sha: currentRemote.sha, dirty: false });
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
    await clientAVault.setData(choose(clientAVault.getData(), 0, 1600));
    const syncA = createSync({ vault: clientAVault, appName: 'Vaste Lasten test A' });
    const optionsA = {
      settings: { ...connection, branch: 'main', path: 'pwa-core-v1/samen.json' },
      schemaVersion: 2,
      migrate: value => validateDomainPayload(value, 'shared'),
      merge: (local, remote) => mergeDomainPayload(local, remote, 'shared', mergeStore),
    };
    await syncA.syncNow(optionsA);

    // B maakt daarna zijn afwijkende keuze vanuit de verouderde UI-snapshot.
    const selectedB = task.alternatives[1];
    staleB.samen.__conflicts = review.resolveConflictState(staleB.samen.__conflicts, task.id, 1, { at: 1700, deviceId: 'p1' });
    if (selectedB.kind === 'record') {
      staleB.samen.items = staleB.samen.items.filter(item => item.id !== selectedB.value.id);
      staleB.samen.items.push({ ...selectedB.value, u: 1700 });
    }
    await core.persistState(staleB);
    const localB = core.getRegistry().shared.vault.getData();
    assert.equal(localB.__conflicts.decisions[task.id]?.length, 1, 'persistState moet B\'s beslissing duurzaam bewaren');
    assert.equal(canon(localB.__conflicts.decisions[task.id][0].selected), canon(task.alternatives[1]), 'B moet werkelijk alternatief 2 hebben vastgelegd');
    assert.equal(core.getRegistry().shared.vault.getSyncMeta().dirty, true, 'B\'s beslissing moet de kluis dirty maken');
    const publishedA = await clientAVault.decryptRemote(remoteFiles.get('pwa-core-v1/samen.json').envelope);
    assert.equal(publishedA.__conflicts.decisions[task.id]?.length, 1, 'A\'s keuze moet remote gepubliceerd zijn');
    assert.notEqual(localB.__conflicts.decisions[task.id][0].id, publishedA.__conflicts.decisions[task.id][0].id, 'de twee keuze-ID’s moeten uniek zijn');
    assert.ok(localB.__conflicts.records[task.id], 'B moet de oorspronkelijke conflictregistratie behouden');
    assert.ok(publishedA.__conflicts.records[task.id], 'A moet de oorspronkelijke conflictregistratie behouden');
    const directConflictState = review.mergeConflictState(localB.__conflicts, publishedA.__conflicts);
    assert.equal(pending(directConflictState).length, 1, JSON.stringify({
      record: directConflictState.records[task.id],
      decisions: directConflictState.decisions[task.id],
      pendingKeys: Object.keys(directConflictState.pending || {}),
    }));
    assert.equal(canon(publishedA.__conflicts.decisions[task.id][0].selected), canon(task.alternatives[0]), 'A moet werkelijk alternatief 1 hebben gepubliceerd');
    assert.notEqual(localB.__conflicts.decisions[task.id][0].id, publishedA.__conflicts.decisions[task.id][0].id, 'de twee keuze-ID’s moeten uniek zijn');
    const directMerge = mergeDomainPayload(localB, publishedA, 'shared', mergeStore);
    assert.equal(directMerge.__conflicts.decisions[task.id]?.length, 2, 'de directe app-merge moet beide keuzes verenigen');
    assert.equal(pending(directMerge.__conflicts).length, 1, 'de directe app-merge moet een vervolgtaak opleveren');
    const resultB = await core.sync();
    assert.equal(resultB.results.shared, 'merged', 'B moet de afwijkende remote revisie via de merge-route verwerken');
    assert.equal(resultB.state.samen.__conflicts.decisions[task.id]?.length, 2, JSON.stringify({ decisionKeys: Object.keys(resultB.state.samen.__conflicts.decisions || {}), decisions: resultB.state.samen.__conflicts.decisions[task.id], pendingKeys: Object.keys(resultB.state.samen.__conflicts.pending || {}), recordPresent: !!resultB.state.samen.__conflicts.records?.[task.id] }));
    const mergedDecisions = resultB.state.samen.__conflicts.decisions[task.id];
    assert.notEqual(canon(mergedDecisions[0].selected), canon(mergedDecisions[1].selected), 'de twee samengevoegde keuzes moeten verschillend zijn');
    assert.ok(resultB.state.samen.__conflicts.records[task.id], 'de oorspronkelijke conflictregistratie moet behouden blijven');
    const afterB = pending(resultB.state.samen.__conflicts);
    assert.equal(afterB.length, 1);
    assert.equal(afterB[0].kind, 'concurrent-review');
    assert.deepEqual(
      JSON.parse(JSON.stringify(afterB[0].alternatives.map(value => value.value?.amount ?? value.amount).sort((x, y) => x - y))),
      [125, 140],
    );

    // A en B halen elkaars vervolgtaak op en eindigen met dezelfde review-identiteit.
    await syncA.syncNow(optionsA);
    const resultFinal = await core.sync();
    const tasksA = pending(clientAVault.getData().__conflicts);
    const tasksB = pending(resultFinal.state.samen.__conflicts);
    assert.equal(tasksA.length, 1);
    assert.equal(tasksB.length, 1);
    assert.equal(tasksA[0].kind, 'concurrent-review');
    assert.equal(tasksB[0].kind, 'concurrent-review');
    assert.equal(tasksA[0].id, tasksB[0].id);
  } finally {
    await disposeVaults();
    globalThis.fetch = previousFetch;
  }
});
