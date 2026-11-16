import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// Characterize the exact merge() implementation embedded in index.html.
// Synthetic records only: no browser, credentials, network, or real vaults.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/function merge\\(a,b\\)\\s*\\{[\\s\\S]*?\\n\\}/);
assert.ok(match, 'merge(a,b) moet in index.html aanwezig zijn');

const mergeById = (x, y) => {
  const out = {};
  for (const src of [x || {}, y || {}]) {
    for (const id in src) {
      const value = src[id];
      if (value && (!out[id] || (+value.u || 0) > (+out[id].u || 0))) out[id] = { ...value };
    }
  }
  return out;
};
const newest = (x, y) => !x ? (y ? { ...y } : undefined)
  : !y ? { ...x } : ((+y.u || 0) > (+x.u || 0) ? { ...y } : { ...x });

const context = {
  EMPTY: () => ({ items: [], del: {}, paid: {}, meta: null }),
  MERGE: {
    cats: mergeById,
    inc: (x, y) => ({ p1: newest(x && x.p1, y && y.p1), p2: newest(x && x.p2, y && y.p2) }),
    prof: newest,
    settle: mergeById,
    minApp: (x, y) => !x ? y : !y ? x : (String(x) >= String(y) ? x : y),
    scen: mergeById,
  },
  prune: (store) => store,
  PRUNE_DAYS: 180,
  BASE_CATS: [],
  cmpVer: () => 0,
};
const merge = vm.runInNewContext(`(${match[0]})`, context);
const timestamp = 1700000000000;
const base = () => ({ items: [], del: {}, paid: {}, meta: null });

function assertOrderDependent(label, left, right) {
  const lr = merge(left, right);
  const rl = merge(right, left);
  assert.notDeepEqual(
    JSON.parse(JSON.stringify(lr)),
    JSON.parse(JSON.stringify(rl)),
    label + ': de huidige merge-uitkomst hoort de volgorde te reproduceren'
  );
}

test('probe: conflicterende lasten met gelijke timestamp zijn volgordeafhankelijk', () => {
  const a = base(), b = base();
  a.items = [{ id: 'same-record', u: timestamp, amount: 125, note: 'edit-from-A' }];
  b.items = [{ id: 'same-record', u: timestamp, amount: 250, note: 'edit-from-B' }];
  assertOrderDependent('items', a, b);
});

test('probe: conflicterende betaalvinkjes met gelijke timestamp zijn volgordeafhankelijk', () => {
  const a = base(), b = base();
  a.paid = { '2026-11': { rent: { p: true, u: timestamp, a: 125 } } };
  b.paid = { '2026-11': { rent: { p: false, u: timestamp, a: 250 } } };
  assertOrderDependent('paid', a, b);
});

test('probe: conflicterende metadata met gelijke timestamp zijn volgordeafhankelijk', () => {
  const a = base(), b = base();
  a.meta = { p1: 'Persoon A', p2: 'Partner', split: 50, u: timestamp };
  b.meta = { p1: 'A', p2: 'Persoon B', split: 60, u: timestamp };
  assertOrderDependent('meta', a, b);
});

test('probe: categorieën, verrekeningen en scenario-items kiezen bij gelijke timestamp de eerste versie', () => {
  for (const key of ['cats', 'settle', 'scen']) {
    const a = base(), b = base();
    a[key] = { same: { id: 'same', name: 'Versie A', amount: 100, u: timestamp } };
    b[key] = { same: { id: 'same', name: 'Versie B', amount: 200, u: timestamp } };
    assertOrderDependent(key, a, b);
  }
});

test('probe: inkomens- en profielvelden gebruiken eveneens de eerste versie bij gelijke timestamp', () => {
  const a = base(), b = base();
  a.inc = { p1: { a: 3000, u: timestamp } };
  b.inc = { p1: { a: 3500, u: timestamp } };
  assertOrderDependent('inc', a, b);

  const c = base(), d = base();
  c.prof = { income: 3000, u: timestamp };
  d.prof = { income: 3500, u: timestamp };
  assertOrderDependent('prof', c, d);
});

test('probe: onbekende toekomstige velden nemen de rechter versie over', () => {
  const a = { ...base(), futureField: { value: 'A' } };
  const b = { ...base(), futureField: { value: 'B' } };
  assertOrderDependent('futureField', a, b);
});

test('probe: gelijktijdige verwijdering wint nu stilzwijgend van een bewerking', () => {
  const a = base(), b = base();
  a.items = [{ id: 'same-record', u: timestamp, amount: 125, note: 'edit' }];
  b.del = { 'same-record': timestamp };
  for (const [left, right] of [[a, b], [b, a]]) {
    const result = merge(left, right);
    assert.equal(result.items.some((item) => item.id === 'same-record'), false);
    assert.equal(result.del['same-record'], timestamp);
  }
});
