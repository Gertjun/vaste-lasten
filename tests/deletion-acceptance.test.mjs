import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySyncState,
  registerDevice,
  acknowledgeDeletions,
  allDevicesAcknowledged,
  applyDeletionLedger,
  reconcileData,
} from '../js/core/deletions.js';

test('S07 a stale offline client cannot resurrect a record after the deletion is acknowledged', () => {
  const key = 'items:offline-record';
  let state = emptySyncState();
  state = registerDevice(state, 'synthetic-device-a', 100);
  state = registerDevice(state, 'synthetic-device-b', 100);
  state.deletions[key] = 200;
  state = acknowledgeDeletions(state, 'synthetic-device-a', 300);

  assert.equal(allDevicesAcknowledged(state, key), false,
    'de verwijdering mag nog niet worden opgeruimd zolang B offline is');

  // B komt terug met een oude lokale kopie. De remote verwijderledger moet winnen.
  const staleB = {
    items: [{ id: 'offline-record', name: 'Oude offline last' }],
    __pwaSync: emptySyncState(),
  };
  const remoteA = { items: [], __pwaSync: state };
  const mergedB = reconcileData(staleB, remoteA, (local, remote) => ({
    ...local,
    ...remote,
    items: [...(local.items || []), ...(remote.items || [])],
  }));
  assert.equal(mergedB.items.some(item => item.id === 'offline-record'), false,
    'de oude kopie mag na synchroniseren niet terugkomen');

  // B heeft de tombstone nu gezien en bevestigt die in zijn eigen apparaatstatus.
  const acknowledgedByBoth = acknowledgeDeletions(mergedB.__pwaSync, 'synthetic-device-b', 400);
  assert.equal(allDevicesAcknowledged(acknowledgedByBoth, key), true);

  const cleaned = applyDeletionLedger({
    items: [{ id: 'offline-record', deleted: true, updatedAt: 200 }],
    __pwaSync: acknowledgedByBoth,
  });
  assert.equal(cleaned.items.length, 0,
    'na bevestiging door alle actieve apparaten mag de tombstone worden opgeruimd');
});


test('S08 a newer recreated record supersedes an older deletion', () => {
  const key = 'items:recreated-record';
  const deletionState = emptySyncState();
  deletionState.deletions[key] = 200;

  const local = {
    items: [{ id: 'recreated-record', name: 'Opnieuw aangemaakte last', updatedAt: 300 }],
    __pwaSync: deletionState,
  };
  const remote = {
    items: [],
    __pwaSync: { ...emptySyncState(), deletions: { [key]: 200 } },
  };
  const merged = reconcileData(local, remote, (a, b) => ({
    ...a,
    ...b,
    items: [...(a.items || []), ...(b.items || [])],
  }));

  assert.equal(merged.items.some(item => item.id === 'recreated-record'), true,
    'een aantoonbaar nieuwere last moet behouden blijven');
  assert.equal(Object.hasOwn(merged.__pwaSync.deletions, key), false,
    'de achterhaalde tombstone moet uit de ledger verdwijnen');
});

test('S09 an equal-timestamp recreation remains blocked by the deletion', () => {
  const key = 'items:equal-record';
  const state = emptySyncState();
  state.deletions[key] = 200;
  const merged = reconcileData({
    items: [{ id: 'equal-record', name: 'Gelijke tijd', updatedAt: 200 }],
    __pwaSync: state,
  }, {
    items: [],
    __pwaSync: { ...emptySyncState(), deletions: { [key]: 200 } },
  }, (a, b) => ({ ...a, ...b, items: [...(a.items || []), ...(b.items || [])] }));

  assert.equal(merged.items.some(item => item.id === 'equal-record'), false,
    'gelijke tijdstempels mogen een verwijdering niet ongedaan maken');
});
