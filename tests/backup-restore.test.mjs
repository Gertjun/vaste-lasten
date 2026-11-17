import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBackupState, persistBackupState } from '../js/backup-restore.js';

const merge = (current, incoming) => {
  const byId = new Map([...(current.items || []), ...(incoming.items || [])].map(item => [item.id, item]));
  return {
    ...current,
    ...incoming,
    items: [...byId.values()],
    del: { ...(current.del || {}), ...(incoming.del || {}) },
    paid: { ...(current.paid || {}), ...(incoming.paid || {}) },
  };
};

test('back-up merge behoudt historie en metadata, markeert geïmporteerde lasten als actueel', () => {
  const currentState = {
    samen: { items: [], del: { old: 1, restored: 2 }, paid: { '2026-01': { a: { p: true } } }, meta: { p1: 'Geert' } },
    eigen: { items: [], del: {}, paid: {}, meta: { p1: 'Geert' } },
  };
  const backup = {
    samen: { items: [{ id: 'restored', name: 'Hypotheek', example: true }], del: {}, paid: { '2026-02': { restored: { p: true } } } },
    eigen: { items: [{ id: 'private', name: 'Telefoon' }], del: {}, paid: { '2026-03': { private: { p: true } } } },
  };
  const result = mergeBackupState({ backup, currentState, stores: ['samen', 'eigen'], merge, now: 1234 });
  assert.equal(result.count, 2);
  assert.equal(result.state.samen.items[0].u, 1234);
  assert.equal(result.state.samen.items[0].example, false);
  assert.equal(result.state.samen.del.restored, undefined);
  assert.equal(result.state.samen.del.old, 1);
  assert.deepEqual(result.state.samen.paid['2026-01'], { a: { p: true } });
  assert.deepEqual(result.state.samen.paid['2026-02'], { restored: { p: true } });
  assert.deepEqual(result.state.samen.meta, { p1: 'Geert' });
  assert.equal(currentState.samen.items.length, 0, 'de bronstate wordt niet gewijzigd');
});

test('Core-back-upherstel wacht op persistState én flushLocal voordat succes wordt teruggegeven', async () => {
  const events = [];
  let releasePersist;
  const persistGate = new Promise(resolve => { releasePersist = resolve; });
  const coreRuntime = {
    async persistState(state) { events.push(['persist-start', state.marker]); await persistGate; events.push(['persist-done']); },
    async flushLocal() { events.push(['flush']); },
  };
  let finished = false;
  const pending = persistBackupState({ state: { marker: 'backup' }, coreMode: true, coreReady: true, coreRuntime })
    .then(result => { finished = true; return result; });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.deepEqual(events, [['persist-start', 'backup']]);
  releasePersist();
  assert.equal(await pending, 'core');
  assert.equal(finished, true);
  assert.deepEqual(events, [['persist-start', 'backup'], ['persist-done'], ['flush']]);
});

test('Core-opslagfouten worden doorgegeven en leveren geen successtatus op', async () => {
  const coreRuntime = {
    async persistState() { throw new Error('synthetic write failure'); },
    async flushLocal() { assert.fail('flush mag niet na een mislukte persist plaatsvinden'); },
  };
  await assert.rejects(
    persistBackupState({ state: {}, coreMode: true, coreReady: true, coreRuntime }),
    /synthetic write failure/,
  );
});

test('Core-back-upherstel weigert een vergrendelde kluis', async () => {
  await assert.rejects(
    persistBackupState({ state: {}, coreMode: true, coreReady: false, coreRuntime: {} }),
    /Ontgrendel eerst/,
  );
});

test('legacy-back-upherstel gebruikt de bestaande opslagroute', async () => {
  let saved = null;
  const result = await persistBackupState({
    state: { marker: 'legacy' },
    saveLegacy: async state => { saved = state; },
  });
  assert.equal(result, 'legacy');
  assert.deepEqual(saved, { marker: 'legacy' });
});
