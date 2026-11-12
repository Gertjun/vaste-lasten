import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/async function syncStore\(st\)\s*\{[\s\S]*?\n\}\nasync function sync\(\)/);
assert.ok(match, 'syncStore moet in index.html aanwezig zijn');
const source = match[0].replace(/\nasync function sync\(\)$/, '');

function makeHarness({ env = null, remote = null, results = [] } = {}) {
  const state = { samen: { items: [{ id: 'local' }] } };
  let writes = 0;
  const context = {
    SyncError: class SyncError extends Error {},
    fileOf: () => 'samen.json',
    readRemote: async () => ({ env, sha: 'sha-1' }),
    EMPTY: () => ({ items: [] }),
    merge: local => local,
    canonStore: value => JSON.stringify(value),
    withoutExamples: value => value,
    state,
    saveLocal() {},
    render() {},
    openEnv: async () => remote,
    cfg: { salt: { samen: 'salt' } },
    keys: { samen: {} },
    cfgIter: () => 310000,
    APP_VERSION: '2.29.1',
    cmpVer: () => 0,
    needVer: null,
    showNeed() {},
    writeRemote: async () => results[writes++]
  };
  return {
    run: vm.runInNewContext('(' + source + ')', context),
    get writes() { return writes; }
  };
}

test('vier onbevestigde schrijfpogingen geven een foutmelding', async () => {
  const h = makeHarness({ results: [null, null, null, null] });
  await assert.rejects(h.run('samen'), /na vier pogingen niet bevestigd/);
  assert.equal(h.writes, 4);
});

test('na een conflict wordt opnieuw geprobeerd en bevestigde opslag slaagt', async () => {
  const h = makeHarness({ results: [null, 'commit-sha'] });
  await assert.doesNotReject(h.run('samen'));
  assert.equal(h.writes, 2);
});

test('als GitHub al dezelfde gegevens bevat, wordt niets geschreven', async () => {
  const same = { items: [{ id: 'local' }] };
  const h = makeHarness({
    env: { kdf: { salt: 'salt' } },
    remote: same
  });
  await assert.doesNotReject(h.run('samen'));
  assert.equal(h.writes, 0);
});
