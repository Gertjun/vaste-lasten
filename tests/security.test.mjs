import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function makeSecurityHarness() {
  const values = new Map();
  const local = new Map();
  const source = [
    html.match(/function saveCfg\(\)\s*\{[\s\S]*?\n\}/)?.[0],
    html.match(/async function tokenFor\(c\)\s*\{[\s\S]*?\n\}\nasync function storeToken\(c\)\s*\{[\s\S]*?\n\}/)?.[0]
  ];
  assert.ok(source.every(Boolean), 'beveiligingsfuncties moeten in index.html aanwezig zijn');
  const context = {
    cfg: null,
    localStorage: {
      setItem: (k, v) => local.set(k, v),
      removeItem: k => local.delete(k)
    },
    keyGet: async k => values.get(k) ?? null,
    idb: async (_mode, fn) => fn({ put: (v, k) => { values.set(k, v); return { result: k }; } }),
    crypto: webcrypto,
    te: new TextEncoder(),
    td: new TextDecoder(),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    unb64: str => new Uint8Array(Buffer.from(str, 'base64')),
    b64: bytes => Buffer.from(bytes).toString('base64'),
    SyncError: class SyncError extends Error {},
    saveCfg: null
  };
  vm.createContext(context);
  vm.runInContext(source.join('\n'), context);
  return { context, values, local };
}

test('configuratie bewaart nooit de GitHub-token in localStorage', () => {
  const h = makeSecurityHarness();
  h.context.cfg = { owner: 'owner', repo: 'data', token: 'github_pat_secret', me: 'p1' };
  vm.runInContext('saveCfg()', h.context);
  const stored = JSON.parse(h.local.get('vaste-lasten.v2.sync'));
  assert.equal(stored.token, undefined);
  assert.equal(stored.owner, 'owner');
});

test('token wordt versleuteld opgeslagen en is alleen via de sleutel te gebruiken', async () => {
  const h = makeSecurityHarness();
  const cfg = { owner: 'owner', repo: 'data', token: 'github_pat_secret' };
  h.context.cfg = cfg;
  await vm.runInContext('storeToken(cfg)', h.context);
  assert.equal(cfg.token, undefined);
  const envelope = h.values.get('githubToken');
  assert.ok(envelope?.iv && envelope?.ct);
  assert.equal(envelope.ct.includes('github_pat_secret'), false);
  assert.equal(await vm.runInContext('tokenFor(cfg)', h.context), 'github_pat_secret');
});

test('bestaande koppeling migreert token uit oude configuratie', async () => {
  const h = makeSecurityHarness();
  const cfg = { owner: 'owner', repo: 'data', token: 'legacy_token_value' };
  h.context.cfg = cfg;
  await vm.runInContext('storeToken(cfg)', h.context);
  assert.equal(cfg.token, undefined);
  assert.equal(await vm.runInContext('tokenFor(cfg)', h.context), 'legacy_token_value');
  assert.ok(h.values.get('githubTokenKey'));
});
