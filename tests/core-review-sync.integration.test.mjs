import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createVault } from '../js/core/vault-factory.js';
import { createSync } from '../js/core/sync-factory.js';
import { encryptJSON } from '../js/core/crypto.js';
import { createVasteLastenCore } from '../js/vastelasten-core.js';
import { mergeDomainPayload, validateDomainPayload } from '../js/multi-vault-adapter.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const html = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
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

    const seedShared = createVault({ storagePrefix: 'pr9-seed-shared', kdfIterations: 100000, storage: storage() });
    const seedPersonalA = createVault({ storagePrefix: 'pr9-seed-personal-a', kdfIterations: 100000, storage: storage() });
    const seedPersonalB = createVault({ storagePrefix: 'pr9-seed-personal-b', kdfIterations: 100000, storage: storage() });
    seedVaults.push(seedShared, seedPersonalA, seedPersonalB);
    await seedShared.create('synthetic-password', initial);
    await seedPersonalA.create('synthetic-password', {
      items: [], del: {}, paid: {}, schema: 2, domain: 'personal-p1',
    });
    await seedPersonalB.create('synthetic-password', {
      items: [], del: {}, paid: {}, schema: 2, domain: 'personal-p2',
    });
    await Promise.all(seedVaults.map(vault => vault.flush()));
    remoteFiles.set('pwa-core-v1/samen.json', { sha: 'seed-shared', envelope: structuredClone(seedShared.getEnvelope()) });
    remoteFiles.set('pwa-core-v1/eigen-p1.json', { sha: 'seed-personal-a', envelope: structuredClone(seedPersonalA.getEnvelope()) });
    remoteFiles.set('pwa-core-v1/eigen-p2.json', { sha: 'seed-personal-b', envelope: structuredClone(seedPersonalB.getEnvelope()) });
    await Promise.all(seedVaults.map(vault => vault.dispose()));
    seedVaults = [];

    const connection = { owner: 'synthetic-owner', repo: 'synthetic-repo', token: 'synthetic-token' };
    core = createVasteLastenCore({
      storage: storage(),
      kdfIterations: 100000,
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
      me: 'p2',
      passwords: { shared: 'synthetic-password', 'personal-p2': 'synthetic-password' },
      settings: connection,
    });
    const staleB = core.getState();

    // A en B zijn twee afzonderlijke Core-instanties met eigen lokale opslag.
    coreA = createVasteLastenCore({
      storage: storage(),
      kdfIterations: 100000,
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
    const makeAppClient = (runtime, snapshot, at, person) => {
      const context = {
        state: structuredClone(snapshot),
        cfg: { me: person },
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

    // A gebruikt exact de conflictkeuzefuncties uit js/app.js en slaat offline op.
    const appA = makeAppClient(coreA, coreA.getState(), 1600, 'p1');
    for (const currentTask of [task, categoryTask]) appA.choose('samen', currentTask.id, 0);
    await coreA.flushLocal();
    await coreA.connect(connection);

    // B kiest vanuit zijn eerder geopende UI-snapshot, ook via de echte app-functies.
    const appB = makeAppClient(core, staleB, 1700, 'p2');
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


test('S01/S02 two independent clients retry a real stale-SHA race and preserve records per vault domain', async () => {
  const previousFetch = globalThis.fetch;
  const remoteFiles = new Map();
  const readCounts = new Map();
  const barriers = new Map();
  const conflicts = new Map();
  let revision = 0;
  const clients = [];

  const barrierFor = path => {
    if (!barriers.has(path)) {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      barriers.set(path, { promise, release });
    }
    return barriers.get(path);
  };

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
      // Beide clients lezen bewust dezelfde oude SHA vóórdat één van hen schrijft.
      const snapshot = remoteFiles.get(path);
      const count = (readCounts.get(path) || 0) + 1;
      readCounts.set(path, count);
      if (count <= 2) {
        const barrier = barrierFor(path);
        if (count === 2) barrier.release();
        await barrier.promise;
      }
      if (!snapshot) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({
        sha: snapshot.sha,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(snapshot.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      const current = remoteFiles.get(path);
      if (current && body.sha !== current.sha) {
        conflicts.set(path, (conflicts.get(path) || 0) + 1);
        return new Response(JSON.stringify({ message: 'sha does not match' }), { status: 409 });
      }
      if (!current && body.sha) return new Response(null, { status: 409 });
      const file = {
        sha: 'sha-' + (++revision),
        envelope: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')),
      };
      remoteFiles.set(path, file);
      return new Response(JSON.stringify({ content: { sha: file.sha } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 405 });
  };

  try {
    for (const domain of ['shared', 'personal-p1', 'personal-p2']) {
      const path = domain === 'shared' ? 'pwa-core-v1/samen.json' : 'pwa-core-v1/eigen-' + domain.slice('personal-'.length) + '.json';
      const initial = domain === 'shared'
        ? { items: [], del: {}, paid: {}, meta: null, schema: 2, domain }
        : { items: [], del: {}, paid: {}, schema: 2, domain };
      const seed = createVault({
        storagePrefix: 's01-seed-' + domain,
        kdfIterations: 100000,
        storage: storage(),
      });
      clients.push(seed);
      await seed.create('synthetic-password', initial);
      await seed.flush();
      remoteFiles.set(path, { sha: 'initial-' + domain, envelope: structuredClone(seed.getEnvelope()) });

      const makeClient = async suffix => {
        const vault = createVault({
          storagePrefix: 's01-' + suffix + '-' + domain,
          kdfIterations: 100000,
          storage: storage(),
        });
        clients.push(vault);
        await vault.importEnvelope(structuredClone(remoteFiles.get(path).envelope), 'synthetic-password');
        vault.setSyncMeta({ sha: 'initial-' + domain, dirty: false });
        await vault.setData({
          ...structuredClone(vault.getData()),
          items: [{
            id: suffix + '-' + domain,
            name: 'Synthetisch ' + suffix,
            amount: suffix === 'client-a' ? 111 : 222,
            u: 1800000000000,
          }],
        });
        return vault;
      };

      const vaultA = await makeClient('client-a');
      const vaultB = await makeClient('client-b');
      const syncA = createSync({ vault: vaultA, appName: 'Vaste Lasten S01 A' });
      const syncB = createSync({ vault: vaultB, appName: 'Vaste Lasten S01 B' });
      const options = {
        settings: {
          owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main',
          path, token: 'synthetic-token',
        },
        merge: (local, remote) => mergeDomainPayload(local, remote, domain, mergeStore),
        migrate: remote => validateDomainPayload(remote, domain),
        schemaVersion: 2,
      };

      const results = await Promise.all([syncA.syncNow(options), syncB.syncNow(options)]);
      assert.ok(results.includes('uploaded'), domain + ': precies één eerste upload moet winnen');
      assert.ok(results.includes('merged'), domain + ': de verliezende client moet opnieuw lezen en samenvoegen');
      assert.equal(conflicts.get(path), 1, domain + ': de mock remote moet exact één echte SHA-conflictrespons geven');
      assert.ok(readCounts.get(path) >= 3, domain + ': de verliezende client moet na 409 opnieuw lezen');

      // Laat beide clients de definitieve remote envelope ophalen en bevestig convergentie.
      await syncA.syncNow(options);
      await syncB.syncNow(options);
      const finalData = await vaultA.decryptRemote(remoteFiles.get(path).envelope);
      assert.equal(finalData.domain, domain);
      assert.deepEqual(
        JSON.parse(JSON.stringify(finalData.items.map(item => item.id).sort())),
        ['client-a-' + domain, 'client-b-' + domain].sort(),
        domain + ': beide onafhankelijke wijzigingen moeten behouden blijven',
      );
    }

    assert.deepEqual(
      [...remoteFiles.keys()].sort(),
      ['pwa-core-v1/eigen-p1.json', 'pwa-core-v1/eigen-p2.json', 'pwa-core-v1/samen.json'],
      'gedeelde en persoonlijke clients mogen uitsluitend hun eigen remote bestand schrijven',
    );
    const shared = await clients.find(vault => vault.isUnlocked() && vault.getData().domain === 'shared')
      .decryptRemote(remoteFiles.get('pwa-core-v1/samen.json').envelope);
    const personalP1 = await clients.find(vault => vault.isUnlocked() && vault.getData().domain === 'personal-p1')
      .decryptRemote(remoteFiles.get('pwa-core-v1/eigen-p1.json').envelope);
    const personalP2 = await clients.find(vault => vault.isUnlocked() && vault.getData().domain === 'personal-p2')
      .decryptRemote(remoteFiles.get('pwa-core-v1/eigen-p2.json').envelope);
    assert.equal(shared.domain, 'shared');
    assert.equal(personalP1.domain, 'personal-p1');
    assert.equal(personalP2.domain, 'personal-p2');
    assert.ok(shared.items.every(item => item.id.endsWith('-shared')));
    assert.ok(personalP1.items.every(item => item.id.endsWith('-personal-p1')));
    assert.ok(personalP2.items.every(item => item.id.endsWith('-personal-p2')));
  } finally {
    for (const vault of clients) {
      try { if (vault.isUnlocked()) vault.lock(); } catch { /* cleanup continues */ }
      try { await vault.dispose(); } catch { /* cleanup continues */ }
    }
    globalThis.fetch = previousFetch;
  }
});


test('S05 an offline edit survives a full local restart and merges with another clients online edit', async () => {
  const previousFetch = globalThis.fetch;
  const remoteFiles = new Map();
  let revision = 0;
  const path = 'pwa-core-v1/samen.json';
  const localStorageA = storage();

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const marker = '/contents/';
    const index = url.pathname.indexOf(marker);
    if (index < 0) return new Response(null, { status: 404 });
    const filePath = decodeURIComponent(url.pathname.slice(index + marker.length));
    if ((init.method || 'GET') === 'GET') {
      const file = remoteFiles.get(filePath);
      if (!file) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({
        sha: file.sha,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(file.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      const current = remoteFiles.get(filePath);
      if (!current || body.sha !== current.sha) return new Response(null, { status: 409 });
      const file = {
        sha: 's05-sha-' + (++revision),
        envelope: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')),
      };
      remoteFiles.set(filePath, file);
      return new Response(JSON.stringify({ content: { sha: file.sha } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 405 });
  };

  const seed = createVault({ storagePrefix: 's05-seed', kdfIterations: 100000, storage: storage() });
  const vaultA = createVault({ storagePrefix: 's05-client-a', kdfIterations: 100000, storage: localStorageA });
  const vaultB = createVault({ storagePrefix: 's05-client-b', kdfIterations: 100000, storage: storage() });
  let restartedA;
  try {
    await seed.create('synthetic-password', {
      items: [], del: {}, paid: {}, meta: null, schema: 2, domain: 'shared',
    });
    await seed.flush();
    const initialEnvelope = structuredClone(seed.getEnvelope());
    const initialSha = 's05-initial-sha';
    remoteFiles.set(path, { sha: initialSha, envelope: initialEnvelope });

    await vaultA.importEnvelope(structuredClone(initialEnvelope), 'synthetic-password');
    vaultA.setSyncMeta({ sha: initialSha, dirty: false });
    await vaultB.importEnvelope(structuredClone(initialEnvelope), 'synthetic-password');
    vaultB.setSyncMeta({ sha: initialSha, dirty: false });

    await vaultA.setData({
      ...structuredClone(vaultA.getData()),
      items: [{ id: 'offline-A', name: 'Offline wijziging A', amount: 101, u: 1800000000300 }],
    });
    await vaultA.flush();
    await vaultA.lock();
    await vaultA.dispose();

    await vaultB.setData({
      ...structuredClone(vaultB.getData()),
      items: [{ id: 'online-B', name: 'Online wijziging B', amount: 202, u: 1800000000400 }],
    });
    const options = {
      settings: {
        owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main',
        path, token: 'synthetic-token',
      },
      merge: (local, remote) => mergeDomainPayload(local, remote, 'shared', mergeStore),
      migrate: remote => validateDomainPayload(remote, 'shared'),
      schemaVersion: 2,
    };
    const syncB = createSync({ vault: vaultB, appName: 'Vaste Lasten S05 B' });
    assert.equal(await syncB.syncNow(options), 'uploaded');

    // Een nieuwe vault-instantie met dezelfde lokale opslag simuleert sluiten en heropenen.
    restartedA = createVault({ storagePrefix: 's05-client-a', kdfIterations: 100000, storage: localStorageA });
    await restartedA.unlockWithPassword('synthetic-password');
    assert.deepEqual(restartedA.getData().items.map(item => item.id), ['offline-A'],
      'de offline wijziging moet na herstart lokaal aanwezig zijn');
    const syncA = createSync({ vault: restartedA, appName: 'Vaste Lasten S05 A' });
    assert.equal(await syncA.syncNow(options), 'merged');

    const finalData = await restartedA.decryptRemote(remoteFiles.get(path).envelope);
    assert.deepEqual(
      JSON.parse(JSON.stringify(finalData.items.map(item => item.id).sort())),
      ['offline-A', 'online-B'],
      'na herstart moeten de offline en online wijzigingen beide behouden blijven',
    );
    assert.equal(finalData.domain, 'shared');
  } finally {
    for (const vault of [seed, vaultA, vaultB, restartedA]) {
      if (!vault) continue;
      try { if (vault.isUnlocked()) vault.lock(); } catch { /* cleanup continues */ }
      try { await vault.dispose(); } catch { /* cleanup continues */ }
    }
    globalThis.fetch = previousFetch;
  }
});


test('V05 wrong-key import is rejected without replacing the current local vault', async () => {
  const seed = createVault({ storagePrefix: 'v05-wrong-key-seed', kdfIterations: 100000, storage: storage() });
  const local = createVault({ storagePrefix: 'v05-wrong-key-local', kdfIterations: 100000, storage: storage() });
  try {
    await seed.create('remote-synthetic-password', base());
    await seed.flush();
    const remoteEnvelope = structuredClone(seed.getEnvelope());

    await local.create('local-synthetic-password', {
      ...base(), items: [{ id: 'local-kept', name: 'Lokale kluis blijft behouden', amount: 77, u: 1800000000100 }],
    });
    await local.flush();
    const beforeEnvelope = structuredClone(local.getEnvelope());
    const beforeData = structuredClone(local.getData());
    const beforeRevision = local.getRevision();

    await assert.rejects(
      local.importEnvelope(remoteEnvelope, 'deliberately-wrong-password'),
      error => error?.name === 'WrongPasswordError',
    );

    assert.deepEqual(local.getData(), beforeData, 'verkeerde sleutel mag de ontsleutelde lokale data niet vervangen');
    assert.deepEqual(local.getEnvelope(), beforeEnvelope, 'verkeerde sleutel mag de lokale envelope niet vervangen');
    assert.equal(local.getRevision(), beforeRevision, 'verkeerde sleutel mag geen lokale revisie installeren');
    assert.equal(local.getSyncMeta().dirty, true, 'bestaande lokale wijzigingen blijven dirty');
  } finally {
    for (const vault of [seed, local]) {
      try { if (vault.isUnlocked()) vault.lock(); } catch {}
      try { await vault.dispose(); } catch {}
    }
  }
});

test('V05 a validly encrypted payload for the wrong domain is rejected before local adoption', async () => {
  const previousFetch = globalThis.fetch;
  const path = 'pwa-core-v1/samen.json';
  const remote = { sha: 'v05-domain-initial', envelope: null };
  const seed = createVault({ storagePrefix: 'v05-domain-seed', kdfIterations: 100000, storage: storage() });
  const local = createVault({ storagePrefix: 'v05-domain-local', kdfIterations: 100000, storage: storage() });
  try {
    await seed.create('synthetic-password', base());
    await seed.flush();
    const initialEnvelope = structuredClone(seed.getEnvelope());
    remote.envelope = initialEnvelope;

    await local.importEnvelope(structuredClone(initialEnvelope), 'synthetic-password');
    local.setSyncMeta({ sha: remote.sha, dirty: false });
    const localBefore = structuredClone(local.getData());

    const wrongDomainPayload = {
      items: [], del: {}, paid: {}, meta: null, schema: 2, domain: 'personal-p1',
    };
    remote.envelope = {
      ...initialEnvelope,
      payload: await encryptJSON(wrongDomainPayload, seed.getDataKey()),
    };
    remote.sha = 'v05-domain-replaced';

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (!url.pathname.endsWith('/contents/' + path)) return new Response(null, { status: 404 });
      if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify({
        sha: remote.sha, encoding: 'base64',
        content: Buffer.from(JSON.stringify(remote.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      throw new Error('PUT mag niet plaatsvinden voor een ongeldig domein');
    };

    const sync = createSync({ vault: local, appName: 'Vaste Lasten V05 domein' });
    await assert.rejects(sync.syncNow({
      settings: { owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main', path, token: 'synthetic-token' },
      migrate: payload => validateDomainPayload(payload, 'shared'),
      schemaVersion: 2,
    }), /hoort niet bij het domein/);

    assert.deepEqual(local.getData().items, localBefore.items, 'verkeerd domein mag lokale records niet vervangen');
    assert.equal(local.getData().domain, localBefore.domain, 'de actieve kluis blijft aan het oorspronkelijke domein gebonden');
    assert.equal(local.getSyncMeta().sha, 'v05-domain-initial', 'ongeldige remote inhoud mag de bekende SHA niet bevestigen');
    assert.equal(local.getSyncMeta().dirty, true, 'de lokale device-ledgerwijziging blijft pending; de afgewezen remote payload is niet bevestigd');
  } finally {
    try { if (seed.isUnlocked()) seed.lock(); } catch {}
    try { await seed.dispose(); } catch {}
    try { if (local.isUnlocked()) local.lock(); } catch {}
    try { await local.dispose(); } catch {}
    globalThis.fetch = previousFetch;
  }
});

test('V05 a corrupted remote ciphertext is rejected without adopting or uploading it', async () => {
  const previousFetch = globalThis.fetch;
  const path = 'pwa-core-v1/samen.json';
  const seed = createVault({ storagePrefix: 'v05-corrupt-seed', kdfIterations: 100000, storage: storage() });
  const local = createVault({ storagePrefix: 'v05-corrupt-local', kdfIterations: 100000, storage: storage() });
  let remote;
  let putCount = 0;
  try {
    await seed.create('synthetic-password', base());
    await seed.flush();
    const initialEnvelope = structuredClone(seed.getEnvelope());
    remote = { sha: 'v05-corrupt-initial', envelope: initialEnvelope };

    await local.importEnvelope(structuredClone(initialEnvelope), 'synthetic-password');
    local.setSyncMeta({ sha: remote.sha, dirty: false });
    const localBefore = structuredClone(local.getData());

    remote = {
      sha: 'v05-corrupt-replaced',
      envelope: { ...initialEnvelope, payload: { iv: 'not-base64!', data: 'also-invalid!' } },
    };
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (!url.pathname.endsWith('/contents/' + path)) return new Response(null, { status: 404 });
      if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify({
        sha: remote.sha, encoding: 'base64',
        content: Buffer.from(JSON.stringify(remote.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      putCount++;
      throw new Error('PUT mag niet plaatsvinden na decryptiefout');
    };

    const sync = createSync({ vault: local, appName: 'Vaste Lasten V05 corrupt' });
    await assert.rejects(sync.syncNow({
      settings: { owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main', path, token: 'synthetic-token' },
      migrate: payload => validateDomainPayload(payload, 'shared'),
      schemaVersion: 2,
    }), /andere sleutel versleuteld/);

    assert.deepEqual(local.getData().items, localBefore.items, 'corrupt remote ciphertext mag lokale records niet vervangen');
    assert.equal(local.getData().domain, localBefore.domain, 'de actieve kluis blijft aan het oorspronkelijke domein gebonden');
    assert.equal(local.getSyncMeta().sha, 'v05-corrupt-initial', 'corrupt remote bestand mag de bekende SHA niet bevestigen');
    assert.equal(putCount, 0, 'er mag geen lege of vervangende envelope naar remote worden geüpload');
  } finally {
    for (const vault of [seed, local]) {
      try { if (vault.isUnlocked()) vault.lock(); } catch {}
      try { await vault.dispose(); } catch {}
    }
    globalThis.fetch = previousFetch;
  }
});

test('S06 a failed remote upload keeps local data dirty and an explicit retry recovers', async () => {
  const previousFetch = globalThis.fetch;
  const path = 'pwa-core-v1/samen.json';
  const seed = createVault({ storagePrefix: 's06-seed', kdfIterations: 100000, storage: storage() });
  const local = createVault({ storagePrefix: 's06-local', kdfIterations: 100000, storage: storage() });
  let remote;
  let failNextPut = true;
  let putCount = 0;
  try {
    await seed.create('synthetic-password', base());
    await seed.flush();
    remote = { sha: 's06-initial-sha', envelope: structuredClone(seed.getEnvelope()) };

    await local.importEnvelope(structuredClone(remote.envelope), 'synthetic-password');
    local.setSyncMeta({ sha: remote.sha, dirty: false });
    await local.setData({
      ...structuredClone(local.getData()),
      items: [{ id: 's06-local-change', name: 'Lokale wijziging blijft behouden', amount: 321, u: 1800000000500 }],
    });
    await local.flush();
    const localEnvelopeBefore = structuredClone(local.getEnvelope());
    const localDataBefore = structuredClone(local.getData());

    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (!url.pathname.endsWith('/contents/' + path)) return new Response(null, { status: 404 });
      if ((init.method || 'GET') === 'GET') return new Response(JSON.stringify({
        sha: remote.sha, encoding: 'base64',
        content: Buffer.from(JSON.stringify(remote.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (init.method === 'PUT') {
        putCount++;
        if (failNextPut) {
          failNextPut = false;
          return new Response(JSON.stringify({ message: 'synthetic server failure' }), {
            status: 500, headers: { 'content-type': 'application/json' },
          });
        }
        const body = JSON.parse(init.body);
        assert.equal(body.sha, remote.sha, 'retry moet de nog actuele remote SHA gebruiken');
        remote = {
          sha: 's06-recovered-sha',
          envelope: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')),
        };
        return new Response(JSON.stringify({ content: { sha: remote.sha } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 405 });
    };

    const sync = createSync({ vault: local, appName: 'Vaste Lasten S06' });
    const options = {
      settings: { owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main', path, token: 'synthetic-token' },
      migrate: payload => validateDomainPayload(payload, 'shared'),
      schemaVersion: 2,
    };

    await assert.rejects(sync.syncNow(options), error => error?.status === 500);
    assert.equal(remote.sha, 's06-initial-sha', 'mislukte upload mag de remote SHA niet wijzigen');
    assert.deepEqual(remote.envelope, structuredClone(seed.getEnvelope()), 'remote envelope blijft intact na HTTP 500');
    assert.deepEqual(local.getData().items, localDataBefore.items, 'lokale wijzigingen blijven behouden na remote fout');
    assert.equal(local.getData().domain, localDataBefore.domain, 'de lokale kluis blijft in het oorspronkelijke domein');
    assert.deepEqual(await local.decryptRemote(local.getEnvelope()), local.getData(), 'de lokale envelope blijft overeenkomen met de bewaarde lokale snapshot');
    assert.equal(local.getSyncMeta().sha, 's06-initial-sha', 'lokale sync-SHA wordt niet vooruitgeschoven');
    assert.equal(local.getSyncMeta().dirty, true, 'lokale wijziging blijft pending voor expliciete retry');

    assert.equal(await sync.syncNow(options), 'uploaded', 'een expliciete nieuwe sync moet kunnen herstellen');
    assert.equal(putCount, 2, 'eerste fout en expliciete retry moeten twee uploads opleveren');
    assert.equal(remote.sha, 's06-recovered-sha');
    const finalData = await local.decryptRemote(remote.envelope);
    assert.deepEqual(finalData.items.map(item => item.id), ['s06-local-change']);
    assert.equal(local.getSyncMeta().sha, 's06-recovered-sha');
    assert.equal(local.getSyncMeta().dirty, false, 'na bevestigde retry is de kluis niet langer dirty');
  } finally {
    for (const vault of [seed, local]) {
      try { if (vault.isUnlocked()) vault.lock(); } catch {}
      try { await vault.dispose(); } catch {}
    }
    globalThis.fetch = previousFetch;
  }
});


async function createRemoteSyncHarness(label, initialData) {
  const path = 'pwa-core-v1/samen.json';
  const seed = createVault({ storagePrefix: label + '-seed', kdfIterations: 100000, storage: storage() });
  await seed.create('synthetic-password', structuredClone(initialData));
  await seed.flush();
  let revision = 0;
  let remote = { sha: 'seed-' + label, envelope: structuredClone(seed.getEnvelope()) };
  await seed.dispose();

  const storageA = storage(), storageB = storage();
  storageA.setItem(label + '-client-a:device-id', label + '-device-a');
  storageB.setItem(label + '-client-b:device-id', label + '-device-b');
  const vaultA = createVault({ storagePrefix: label + '-client-a', kdfIterations: 100000, storage: storageA });
  const vaultB = createVault({ storagePrefix: label + '-client-b', kdfIterations: 100000, storage: storageB });
  await vaultA.importEnvelope(structuredClone(remote.envelope), 'synthetic-password');
  await vaultB.importEnvelope(structuredClone(remote.envelope), 'synthetic-password');
  vaultA.setSyncMeta({ sha: remote.sha, dirty: false });
  vaultB.setSyncMeta({ sha: remote.sha, dirty: false });

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    const marker = '/contents/';
    const index = url.pathname.indexOf(marker);
    if (index < 0) return new Response(null, { status: 404 });
    const requestedPath = decodeURIComponent(url.pathname.slice(index + marker.length));
    if (requestedPath !== path) return new Response(null, { status: 404 });
    if (method === 'GET') {
      if (!remote) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({
        sha: remote.sha,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(remote.envelope)).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      if (remote && body.sha !== remote.sha) {
        return new Response(JSON.stringify({ message: 'sha does not match' }), { status: 409 });
      }
      if (!remote && body.sha) return new Response(null, { status: 409 });
      remote = {
        sha: 'sha-' + label + '-' + (++revision),
        envelope: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')),
      };
      return new Response(JSON.stringify({ content: { sha: remote.sha } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 405 });
  };

  const options = {
    settings: {
      owner: 'synthetic-owner', repo: 'synthetic-repo', branch: 'main',
      path, token: 'synthetic-token',
    },
    merge: (local, incoming) => mergeDomainPayload(local, incoming, 'shared', mergeStore),
    migrate: incoming => validateDomainPayload(incoming, 'shared'),
    schemaVersion: 2,
  };
  return {
    vaultA, vaultB, remote: () => remote, options,
    syncA: createSync({ vault: vaultA, appName: 'Vaste Lasten ' + label + ' A' }),
    syncB: createSync({ vault: vaultB, appName: 'Vaste Lasten ' + label + ' B' }),
    async dispose() {
      for (const vault of [vaultA, vaultB]) {
        try { if (vault.isUnlocked()) vault.lock(); } catch {}
        try { await vault.dispose(); } catch {}
      }
    },
  };
}

test('S03 equal-timestamp conflict converges through the remote sync route in either upload order', async () => {
  const previousFetch = globalThis.fetch;
  const outcomes = [];
  try {
    for (const first of ['A', 'B']) {
      const label = 's03-remote-' + first.toLowerCase();
      const harness = await createRemoteSyncHarness(label, {
        ...base(), items: [{ id: 'rent', name: 'Huur', amount: 100, u: 1000 }],
      });
      try {
        await harness.vaultA.setData({
          ...structuredClone(harness.vaultA.getData()),
          items: [{ id: 'rent', name: 'Huur', amount: 125, u: 1800000000700 }],
        });
        await harness.vaultB.setData({
          ...structuredClone(harness.vaultB.getData()),
          items: [{ id: 'rent', name: 'Huur', amount: 140, u: 1800000000700 }],
        });

        const firstSync = first === 'A' ? harness.syncA : harness.syncB;
        const secondSync = first === 'A' ? harness.syncB : harness.syncA;
        assert.equal(await firstSync.syncNow(harness.options), 'uploaded');
        assert.equal(await secondSync.syncNow(harness.options), 'merged');

        const remoteData = await harness.vaultA.decryptRemote(harness.remote().envelope);
        const task = pending(remoteData.__conflicts).find(item => item.path === 'items:rent');
        assert.ok(task, 'de echte remote merge-route moet bij gelijke timestamps een reviewtaak bewaren');
        assert.equal(task.kind, 'content');
        assert.deepEqual(
          JSON.parse(JSON.stringify(task.alternatives.map(value => value.value.amount).sort((a, b) => a - b))),
          [125, 140],
        );
        outcomes.push({ id: task.id, alternatives: canon(task.alternatives) });
      } finally {
        await harness.dispose();
      }
    }
    assert.equal(outcomes[0].id, outcomes[1].id,
      'de conflictidentiteit mag niet afhangen van welke client als eerste uploadt');
    assert.equal(outcomes[0].alternatives, outcomes[1].alternatives,
      'de alternatieven moeten onafhankelijk van de uploadvolgorde dezelfde canonieke volgorde hebben');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('S04 an older offline edit is rejected by a newer deletion through the remote sync route', async () => {
  const previousFetch = globalThis.fetch;
  const harness = await createRemoteSyncHarness('s04-remote', {
    ...base(), items: [{ id: 'offline-record', name: 'Oorspronkelijke last', amount: 100, u: 1000 }],
  });
  try {
    await harness.vaultA.setData({
      ...structuredClone(harness.vaultA.getData()),
      items: [],
      del: { 'offline-record': 1800000000800 },
    });
    await harness.vaultB.setData({
      ...structuredClone(harness.vaultB.getData()),
      items: [{ id: 'offline-record', name: 'Oudere offline bewerking', amount: 150, u: 1800000000700 }],
    });

    assert.equal(await harness.syncA.syncNow(harness.options), 'uploaded');
    assert.equal(await harness.syncB.syncNow(harness.options), 'merged');
    const finalData = await harness.vaultB.decryptRemote(harness.remote().envelope);
    assert.equal(finalData.items.some(item => item.id === 'offline-record'), false,
      'de oudere offline recordversie mag na remote merge niet terugkomen');
    assert.equal(finalData.del['offline-record'], 1800000000800,
      'de nieuwere verwijdermarkering moet in de gedeelde remote kluis behouden blijven');
    assert.equal(pending(finalData.__conflicts).some(item => item.path === 'items:offline-record'), false,
      'een oudere wijziging tegenover een nieuwere verwijdering mag geen gelijk-tijdreview openen');
  } finally {
    await harness.dispose();
    globalThis.fetch = previousFetch;
  }
});

test('S07 a stale offline client acknowledges the remote deletion before tombstone cleanup', async () => {
  const previousFetch = globalThis.fetch;
  const harness = await createRemoteSyncHarness('s07-remote', {
    ...base(), items: [{ id: 'offline-record', name: 'Oorspronkelijke last', amount: 100, u: 1000 }],
  });
  try {
    // Beide clients registreren zich eerst in dezelfde remote kluis.
    assert.equal(await harness.syncA.syncNow(harness.options), 'uploaded');
    assert.equal(await harness.syncB.syncNow(harness.options), 'merged');
    let remoteData = await harness.vaultA.decryptRemote(harness.remote().envelope);
    assert.ok(remoteData.__pwaSync.devices['s07-remote-device-a']);
    assert.ok(remoteData.__pwaSync.devices['s07-remote-device-b']);

    // A verwijdert; B houdt bewust een oudere, offline bewerkte kopie vast.
    await harness.vaultA.setData({
      ...structuredClone(harness.vaultA.getData()),
      items: [{
        id: 'offline-record', name: 'Verwijderde last', amount: 100,
        u: 1800000000900, updatedAt: 1800000000900, deleted: true,
      }],
    });
    await harness.vaultB.setData({
      ...structuredClone(harness.vaultB.getData()),
      items: [{ id: 'offline-record', name: 'Oudere offline wijziging', amount: 150, u: 1800000000800 }],
    });

    assert.equal(await harness.syncA.syncNow(harness.options), 'merged');
    assert.equal(await harness.syncB.syncNow(harness.options), 'merged');
    remoteData = await harness.vaultB.decryptRemote(harness.remote().envelope);
    const deletionKey = 'items:offline-record';
    assert.equal(remoteData.__pwaSync.deletions[deletionKey], 1800000000900,
      'de remote deletion ledger moet de nieuwere verwijdering bewaren');
    assert.equal(remoteData.items.some(item => item.id === 'offline-record' && !item.deleted), false,
      'de oude offline client mag de gewone record niet opnieuw publiceren');
    assert.ok(remoteData.__pwaSync.devices['s07-remote-device-a'].acknowledged[deletionKey] >= 1800000000900);
    assert.ok(remoteData.__pwaSync.devices['s07-remote-device-b'].acknowledged[deletionKey] >= 1800000000900,
      'de terugkerende offline client moet de tombstone hebben bevestigd');

    // A leest de acknowledgement van B; pas dan mag de soft-delete-marker worden opgeruimd.
    await harness.syncA.syncNow(harness.options);
    remoteData = await harness.vaultA.decryptRemote(harness.remote().envelope);
    assert.equal(remoteData.items.some(item => item.id === 'offline-record'), false,
      'na acknowledgement door alle actieve apparaten mag de tombstone verdwijnen');
    assert.equal(remoteData.__pwaSync.deletions[deletionKey], 1800000000900,
      'de compacte verwijderhistorie blijft beschikbaar om oude kopieën te blokkeren');
  } finally {
    await harness.dispose();
    globalThis.fetch = previousFetch;
  }
});


test('S08 a newer recreated Vaste Lasten record survives an older deletion through remote sync', async () => {
  const previousFetch = globalThis.fetch;
  const deletedAt = 1800000001000;
  const harness = await createRemoteSyncHarness('s08-recreated-record', {
    ...base(), items: [{ id: 'recreated-record', name: 'Oude last', amount: 100, u: 1000 }],
  });
  try {
    // Beide clients beginnen met dezelfde bestaande last.
    await harness.syncA.syncNow(harness.options);
    await harness.syncB.syncNow(harness.options);

    // A verwijdert de last; B maakt dezelfde ID aantoonbaar later opnieuw aan.
    await harness.vaultA.setData({
      ...structuredClone(harness.vaultA.getData()),
      items: [],
      del: { 'recreated-record': deletedAt },
    });
    await harness.vaultB.setData({
      ...structuredClone(harness.vaultB.getData()),
      items: [{ id: 'recreated-record', name: 'Opnieuw aangemaakte last', amount: 125, u: deletedAt + 1 }],
    });

    // Door de voorafgaande device-registratie kan A al een verouderde remote SHA hebben;
    // zowel een upload als een merge is daarom een geldige eerste stap.
    assert.ok(['uploaded', 'merged'].includes(await harness.syncA.syncNow(harness.options)));
    assert.equal(await harness.syncB.syncNow(harness.options), 'merged');

    const afterB = await harness.vaultB.decryptRemote(harness.remote().envelope);
    assert.equal(afterB.items.some(item => item.id === 'recreated-record' && item.u === deletedAt + 1), true,
      'de echte app-merge moet de aantoonbaar nieuwere hercreatie behouden');
    assert.equal(afterB.del['recreated-record'], deletedAt,
      'de verwijderhistorie blijft behouden tegen oudere offline kopieën');

    // De eerste client haalt de samengevoegde toestand op en convergeert.
    assert.equal(await harness.syncA.syncNow(harness.options), 'downloaded');
    const finalA = harness.vaultA.getData();
    const finalB = await harness.vaultB.decryptRemote(harness.remote().envelope);
    for (const data of [finalA, finalB]) {
      assert.equal(data.items.some(item => item.id === 'recreated-record' && item.u === deletedAt + 1), true);
      assert.equal(data.del['recreated-record'], deletedAt);
    }
  } finally {
    await harness.dispose();
    globalThis.fetch = previousFetch;
  }
});

test('S09 an equal-timestamp Vaste Lasten recreation remains blocked through remote sync', async () => {
  const previousFetch = globalThis.fetch;
  const deletedAt = 1800000002000;
  const harness = await createRemoteSyncHarness('s09-equal-recreation', {
    ...base(), items: [{ id: 'equal-record', name: 'Oude last', amount: 100, u: 1000 }],
  });
  try {
    await harness.syncA.syncNow(harness.options);
    await harness.syncB.syncNow(harness.options);

    await harness.vaultA.setData({
      ...structuredClone(harness.vaultA.getData()),
      items: [],
      del: { 'equal-record': deletedAt },
    });
    await harness.vaultB.setData({
      ...structuredClone(harness.vaultB.getData()),
      items: [{ id: 'equal-record', name: 'Gelijke timestamp', amount: 125, u: deletedAt }],
    });

    // Door de voorafgaande device-registratie kan A al een verouderde remote SHA hebben;
    // zowel een upload als een merge is daarom een geldige eerste stap.
    assert.ok(['uploaded', 'merged'].includes(await harness.syncA.syncNow(harness.options)));
    assert.equal(await harness.syncB.syncNow(harness.options), 'merged');
    const finalData = await harness.vaultB.decryptRemote(harness.remote().envelope);
    assert.equal(finalData.items.some(item => item.id === 'equal-record'), false,
      'een gelijke timestamp mag de verwijdering niet ongedaan maken');
    assert.equal(finalData.del['equal-record'], deletedAt);
  } finally {
    await harness.dispose();
    globalThis.fetch = previousFetch;
  }
});
