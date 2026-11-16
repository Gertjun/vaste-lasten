import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../js/conflict-review.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context, { filename: 'conflict-review.js' });
const review = context.globalThis.VasteLastenConflictReview;

const conflict = (left, right, extra = {}) => review.createConflict({
  domain: 'shared', path: 'items:rent', kind: 'content', left, right, timestamp: 100, ...extra,
});

test('conflict identity and alternatives are independent of merge order and object key order', () => {
  const a = conflict({ id: 'rent', amount: 100, u: 100 }, { u: 100, amount: 200, id: 'rent' });
  const b = conflict({ id: 'rent', amount: 200, u: 100 }, { u: 100, amount: 100, id: 'rent' });
  assert.equal(a.id, b.id);
  assert.deepEqual(JSON.parse(JSON.stringify(a.alternatives)), JSON.parse(JSON.stringify(b.alternatives)));
});

test('identical alternatives do not create a review task', () => {
  assert.equal(conflict({ amount: 100 }, { amount: 100 }), null);
});

test('conflicts are isolated by encrypted vault domain and record path', () => {
  const shared = conflict({ amount: 100 }, { amount: 200 });
  const personal = conflict({ amount: 100 }, { amount: 200 }, { domain: 'personal-p1' });
  const otherPath = conflict({ amount: 100 }, { amount: 200 }, { path: 'items:insurance' });
  assert.notEqual(shared.id, personal.id);
  assert.notEqual(shared.id, otherPath.id);
});

test('pending conflicts survive repeated merges and remain visible in deterministic order', () => {
  const first = conflict({ amount: 100 }, { amount: 200 });
  const state = { version: 1, pending: { [first.id]: first }, decisions: {} };
  const merged = review.mergeConflictState(state, state);
  assert.deepEqual(JSON.parse(JSON.stringify(review.pendingConflicts(merged))), JSON.parse(JSON.stringify([first])));
});

test('one device decision suppresses a stale pending copy after later synchronization', () => {
  const item = conflict({ amount: 100 }, { amount: 200 });
  const pending = { version: 1, pending: { [item.id]: item }, decisions: {} };
  const resolved = review.resolveConflictState(pending, item.id, 1, { at: 200, deviceId: 'phone' });
  const merged = review.mergeConflictState(resolved, pending);
  assert.equal(review.pendingConflicts(merged).length, 0);
  assert.equal(merged.decisions[item.id].length, 1);
});

test('same choice on two devices converges without creating another conflict', () => {
  const item = conflict({ amount: 100 }, { amount: 200 });
  const pending = { version: 1, pending: { [item.id]: item }, decisions: {} };
  const phone = review.resolveConflictState(pending,  item.id, 0, { at: 200, deviceId: 'phone' });
  const tablet = review.resolveConflictState(pending, item.id, 0, { at: 210, deviceId: 'tablet' });
  const merged = review.mergeConflictState(phone, tablet);
  assert.equal(review.pendingConflicts(merged).length, 0);
  assert.equal(merged.decisions[item.id].length, 2);
});

test('different concurrent choices become a new review task instead of overwriting each other', () => {
  const item = conflict({ amount: 100 }, { amount: 200 });
  const pending = { version: 1, pending: { [item.id]: item }, decisions: {} };
  const phone = review.resolveConflictState(pending, item.id, 0, { at: 200, deviceId: 'phone' });
  const tablet = review.resolveConflictState(pending, item.id, 1, { at: 210, deviceId: 'tablet' });
  const merged = review.mergeConflictState(phone, tablet);
  const tasks = review.pendingConflicts(merged);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].kind, 'concurrent-review');
  assert.equal(tasks[0].parentConflictId, item.id);
  assert.deepEqual(JSON.parse(JSON.stringify(tasks[0].alternatives.map((x) => x.amount))), [100, 200]);
});

test('a concurrent-review task itself can be resolved and stays resolved on stale merges', () => {
  const item = conflict({ amount: 100 }, { amount: 200 });
  const pending = { version: 1, pending: { [item.id]: item }, decisions: {} };
  const phone = review.resolveConflictState(pending, item.id, 0, { at: 200, deviceId: 'phone' });
  const tablet = review.resolveConflictState(pending, item.id, 1, { at: 210, deviceId: 'tablet' });
  const concurrent = review.mergeConflictState(phone, tablet);
  const task = review.pendingConflicts(concurrent)[0];
  const final = review.resolveConflictState(concurrent, task.id, 1, { at: 300, deviceId: 'phone' });
  assert.equal(review.pendingConflicts(review.mergeConflictState(final, concurrent)).length, 0);
});

test('invalid domains and unknown selections fail closed', () => {
  assert.throws(() => conflict({ x: 1 }, { x: 2 }, { domain: 'other' }), /Onbekend kluisdomein/);
  const item = conflict({ x: 1 }, { x: 2 });
  assert.throws(() => review.resolveConflictState({ pending: { [item.id]: item }, decisions: {}, version: 1 }, item.id, 9), /Kies een van de getoonde versies/);
});
