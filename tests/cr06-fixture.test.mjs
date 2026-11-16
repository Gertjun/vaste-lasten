import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const reviewSource = await readFile(new URL('../js/conflict-review.js', import.meta.url), 'utf8');
const fixtureSource = await readFile(new URL('../js/cr06-fixture.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(reviewSource, context);
vm.runInNewContext(fixtureSource, context);
const review = context.globalThis.VasteLastenConflictReview;
const fixture = context.globalThis.VasteLastenCr06Fixture;

test('CR06 bevat precies de zeven gevraagde datatypen in de juiste kluisdomeinen', () => {
  for (const me of ['p1', 'p2']) {
    const result = fixture.createCr06Fixture({ me, timestamp: 1794852000000 });
    assert.equal(review.pendingConflicts(result.shared).length, 6);
    assert.equal(review.pendingConflicts(result.personal).length, 1);
    assert.deepEqual(
      Array.from(review.pendingConflicts(result.shared), item => item.path).sort(),
      ['cats:pr9-cr06-category', 'inc:p1', 'meta', 'paid:2026-11:pr9-cr06-paid',
        'scen:pr9-cr06-scenario', 'settle:pr9-cr06-settlement'].sort(),
    );
    assert.equal(review.pendingConflicts(result.personal)[0].path, 'prof');
    assert.equal(review.pendingConflicts(result.personal)[0].domain, 'personal-' + me);
  }
});

test('CR06-conflict-ID’s zijn stabiel tussen apparaten en bevatten geen echte last-ID’s', () => {
  const a = fixture.createCr06Fixture({ me: 'p1', timestamp: 1794852000000 });
  const b = fixture.createCr06Fixture({ me: 'p1', timestamp: 1794852000000 });
  assert.deepEqual(
    Array.from(review.pendingConflicts(a.shared), item => item.id).sort(),
    Array.from(review.pendingConflicts(b.shared), item => item.id).sort(),
  );
  for (const item of review.pendingConflicts(a.shared)) {
    assert.ok(item.path.includes('pr9-cr06-') || item.path === 'meta' || item.path === 'inc:p1');
  }
});

test('een keuze op één CR06-taak laat de zes andere gedeelde taken open', () => {
  const seeded = fixture.createCr06Fixture({ me: 'p1', timestamp: 1794852000000 });
  const tasks = review.pendingConflicts(seeded.shared);
  const resolved = review.resolveConflictState(seeded.shared, tasks[0].id, 0, {
    at: 1794852001000, deviceId: 'cr06-test-device',
  });
  assert.equal(review.pendingConflicts(resolved).length, 5);
  assert.equal(Object.keys(resolved.decisions).length, 1);
  assert.equal(review.pendingConflicts(seeded.personal).length, 1);
});

test('bestaande CR01-CR05-conflicten blijven behouden bij het toevoegen van CR06', () => {
  const old = review.createConflict({
    domain: 'shared', path: 'items:cr05-existing-test', kind: 'content',
    left: { kind: 'delete' }, right: { kind: 'record', value: { id: 'cr05-existing-test' } },
    timestamp: 1794851999000,
  });
  const existing = review.empty();
  existing.pending[old.id] = old;
  existing.records[old.id] = old;
  const seeded = fixture.createCr06Fixture({ me: 'p1', timestamp: 1794852000000 });
  const combined = review.mergeConflictState(existing, seeded.shared);
  assert.equal(review.pendingConflicts(combined).length, 7);
  assert.ok(review.pendingConflicts(combined).some(item => item.id === old.id));
});
