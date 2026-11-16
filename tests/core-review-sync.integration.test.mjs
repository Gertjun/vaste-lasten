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
const applyChoiceMatch = html.match(/function applyConflictChoice\(store,item,value\)\s*\{[\s\S]*?\n\}/);
const resolveChoiceMatch = html.match(/function resolveAppConflict\(store,id,choice\)\s*\{[\s\S]*?\n\}/);
assert.ok(applyChoiceMatch && resolveChoiceMatch, 'de echte app-functies voor conflictkeuze moeten aanwezig zijn');
const appChoiceSource = [applyChoiceMatch[0], resolveChoiceMatch[0]].join('\n');
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
const pending = conflicts => review.pendingConflicts(conflicts);
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
  let coreA;
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
    if (coreA) {
      try { await coreA.lock(); } catch { /* cleanup continues */ }
      for (const entry of Object.values(coreA.getRegistry())) {
        try { await entry.vault.dispose(); } catch { /* cleanup continues */ }
      }
    }
    for (const vault of seedVaults) {
      try { await vault.dispose(); } catch { /* cleanup continues */ }
    }
  };

  try {
    const left = base(), right = base();
    left.items = [{ id: 'rent', name: 'PR9 TEST', amount: 125, u: 1500 }];
    right.items = [{ id: 'rent', name: 'PR9 TEST', amount: 140, u: 1500 }];
    left.cats = { 'cr06-category': { id: 'cr06-category', name: 'CR06 categorie A', c: 'c1', u: 1500 } };
    right.cats = { 'cr06-category': { id: 'cr06-category', name: 'CR06 categorie B', c: 'c2', u: 1500 } };
    const initial = mergeStore(left, right);
    initial.schema = 2;
    initial.domain = 'shared';
    const tasks = pending(initial.__conflicts);
    const task = tasks.find(item => item.path === 'items:rent');
    const categoryTask = tasks.find(item => item.path === 'cats:cr06-category');
    assert.ok(task, 'de twee oorspronkelijke lastversies moeten een reviewtaak opleveren');
    assert.ok(categoryTask, 'de twee oorspronkelijke categorieversies moeten een reviewtaak opleveren');

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

    // A en B zijn twee afzonderlijke Core-instanties met eigen lokale opslag.
    coreA = createVasteLastenCore({
      storage: storage(),
      kdfIterations: 1000,
      mergeStore,
      factories: {
        createVault: options => createVault({
          ...options,
          storagePrefix: 'pr9-client-a-' + options.storagePrefix,
        }),
        createSessionLock: () => ({ acquireSessionLock: async () => ({ release: async () => {} }) }),
        createBiometric: () => ({
          isEnrolled: () => false,
          async unlock() { throw new Error('not used in this test'); },
          async enroll() {},
          async enrollExisting() {},
        }),
      },
    });
    await coreA.unlock({
      me: 'p1',
      passwords: { shared: 'synthetic-password', 'personal-p1': 'synthetic-password' },
      settings: connection,
    });
    const makeAppClient = (runtime, snapshot, at) => {
      const context = {
        state: structuredClone(snapshot),
        cfg: { me: 'p1' },
        VasteLastenConflictReview: review,
        Date: { now: () => at },
        saveLocal() {
          const saved = structuredClone(context.state);
          runtime.persistState(saved).catch(error => { context.persistError = error.message; });
        },
        render() {},
        scheduleSync() {},
      };
      vm.createContext(context);
      vm.runInContext(appChoiceSource, context);
      return {
        choose(store, id, index) { context.resolveAppConflict(store, id, index); },
        get state() { return context.state; },
      };
    };

    // A gebruikt exact de conflictkeuzefuncties uit index.html en slaat offline op.
    const appA = makeAppClient(coreA, coreA.getState(), 1600);
    for (const currentTask of [task, categoryTask]) appA.choose('samen', currentTask.id, 0);
    await coreA.flushLocal();
    await coreA.connect(connection);

    // B kiest vanuit zijn eerder geopende UI-snapshot, ook via de echte app-functies.
    const appB = makeAppClient(core, staleB, 1700);
    for (const currentTask of [task, categoryTask]) appB.choose('samen', currentTask.id, 1);

    // Net als in de browser wordt saveLocal() niet afgewacht. De eerste online
    // synchronisatie moet zelf alle nog lopende persistState-writes flushen.
    const resultB = await core.connect(connection);
    assert.equal(resultB.results.shared, 'merged', 'B moet de afwijkende remote revisie via de merge-route verwerken');
    const mergedDecisions = resultB.state.samen.__conflicts.decisions[task.id];
    assert.equal(mergedDecisions?.length, 2, 'B moet beide offline keuzes samenvoegen');
    assert.notEqual(canon(mergedDecisions[0].selected), canon(mergedDecisions[1].selected), 'de twee samengevoegde keuzes moeten verschillend zijn');
    assert.ok(resultB.state.samen.__conflicts.records[task.id], 'de oorspronkelijke conflictregistratie moet behouden blijven');
    const afterB = pending(resultB.state.samen.__conflicts);
    assert.equal(afterB.length, 2, 'de synchronisatie moet twee vervolg-reviewtaken opleveren');
    const recordReview = afterB.find(item => item.path === 'items:rent');
    const categoryReview = afterB.find(item => item.path === 'cats:cr06-category');
    assert.equal(recordReview?.kind, 'concurrent-review');
    assert.equal(categoryReview?.kind, 'concurrent-review');
    assert.deepEqual(
      JSON.parse(JSON.stringify(recordReview.alternatives.map(value => value.value?.amount ?? value.amount).sort((x, y) => x - y))),
      [125, 140],
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(categoryReview.alternatives.map(value => value.name).sort())),
      ['CR06 categorie A', 'CR06 categorie B'],
    );
    assert.equal(resultB.state.samen.cats['cr06-category']?.name, 'CR06 categorie B',
      'de voorlopige categorie mag B tonen, maar beide keuzes moeten als review bewaard blijven');
    
    // A en B halen elkaars vervolgtaak op en eindigen met dezelfde review-identiteit.
    await coreA.sync();
    const resultFinal = await core.sync();
    const tasksA = pending(coreA.getRegistry().shared.vault.getData().__conflicts);
    const tasksB = pending(resultFinal.state.samen.__conflicts);
    assert.equal(tasksA.length, 2);
    assert.equal(tasksB.length, 2);
    for (const path of ['items:rent', 'cats:cr06-category']) {
      const taskA = tasksA.find(item => item.path === path);
      const taskB = tasksB.find(item => item.path === path);
      assert.equal(taskA?.kind, 'concurrent-review', path + ': A moet een vervolgtaak hebben');
      assert.equal(taskB?.kind, 'concurrent-review', path + ': B moet een vervolgtaak hebben');
      assert.equal(taskA.id, taskB.id, path + ': beide clients moeten dezelfde review-identiteit hebben');
    }
  } finally {
    await disposeVaults();
    globalThis.fetch = previousFetch;
  }
});
