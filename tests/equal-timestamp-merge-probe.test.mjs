import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// Probe the exact merge() implementation embedded in index.html. No browser,
// credentials, network, real vaults, or production data are involved.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/function merge\(a,b\)\s*\{[\s\S]*?\n\}/);
assert.ok(match, 'merge(a,b) moet in index.html aanwezig zijn');

const context = {
  EMPTY: () => ({ items: [], del: {}, paid: {}, meta: null }),
  MERGE: {},
  prune: (store) => store,
  PRUNE_DAYS: 180,
  BASE_CATS: [],
  cmpVer: () => 0,
};
const merge = vm.runInNewContext(`(${match[0]})`, context);

const clientA = {
  items: [{ id: 'same-record', u: 1700000000000, amount: 125, note: 'edit-from-A' }],
  del: {},
  paid: {},
  meta: null,
};
const clientB = {
  items: [{ id: 'same-record', u: 1700000000000, amount: 250, note: 'edit-from-B' }],
  del: {},
  paid: {},
  meta: null,
};

test('probe: equal-timestamp conflicting edits currently diverge by merge order', () => {
  const clientAAfterSync = merge(clientA, clientB);
  const clientBAfterSync = merge(clientB, clientA);

  // This is intentionally a characterization assertion, not the desired
  // acceptance criterion. It proves the current defect without changing app code.
  assert.notDeepEqual(
    JSON.parse(JSON.stringify(clientAAfterSync)),
    JSON.parse(JSON.stringify(clientBAfterSync)),
    'Expected the probe to expose the current order-dependent tie-break'
  );
});
