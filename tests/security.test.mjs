import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('GitHub-token wordt niet in de configuratie van localStorage opgenomen', () => {
  assert.match(html, /function saveCfg\(\)\{[^\n]*const \{token,\.\.\.safe\}=cfg; localStorage\.setItem\(CFGKEY,JSON\.stringify\(safe\)\)/);
});

test('GitHub-token wordt met AES-GCM versleuteld in IndexedDB opgeslagen', () => {
  assert.match(html, /generateKey\(\{name:'AES-GCM',length:256\},false,\['encrypt','decrypt'\]\)/);
  assert.match(html, /crypto\.subtle\.encrypt\(\{name:'AES-GCM',iv\},k,te\.encode\(token\)\)/);
  assert.match(html, /githubTokenKey/);
  assert.match(html, /githubToken/);
});

test('GitHub-token wordt ontsleuteld voordat een API-aanroep wordt gedaan', () => {
  assert.match(html, /crypto\.subtle\.decrypt\(\{name:'AES-GCM',iv:unb64\(stored\.iv\)\},key,unb64\(stored\.ct\)\)/);
  assert.match(html, /'Authorization':'Bearer '\+token/);
});

test('ontkoppelen wist ook de lokale tokensleutel en versleutelde token', () => {
  const unlink = html.match(/async function unlink\(\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(unlink, /keyClear\(\)/);
});

test('alle appversies zijn gelijk', async () => {
  const version = JSON.parse(await readFile(new URL('../version.json', import.meta.url), 'utf8')).version;
  assert.match(html, /const APP_VERSION='([^']+)'/);
  assert.equal(html.match(/const APP_VERSION='([^']+)'/)[1], version);
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes('vaste-lasten-' + version));
});


test('ingebouwde changelog is geldige JSON', () => {
  const match = html.match(/const CHANGELOG=\/\*CHANGELOG\*\/(\[[\s\S]*?\])\/\*END\*\/;/);
  assert.ok(match, 'ingebouwde changelog is aanwezig');
  assert.doesNotThrow(() => JSON.parse(match[1]));
});
