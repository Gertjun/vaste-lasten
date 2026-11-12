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


test('PRF-hersteltest is syntactisch geldige JavaScript', async () => {
  const page = await readFile(new URL('../prf-test.html', import.meta.url), 'utf8');
  const start = page.indexOf('<script>');
  const end = page.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, 'PRF-testscript moet aanwezig zijn');
  assert.doesNotThrow(() => new vm.Script(page.slice(start + 8, end)));
});

test('PRF-hersteltest is geïsoleerd van productiegegevens en netwerk', async () => {
  const page = await readFile(new URL('../prf-test.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'none'/);
  for (const forbidden of ['api.github.com', 'localStorage', 'indexedDB', 'github_pat_', 'samen.json', 'eigen-p1.json', 'eigen-p2.json']) {
    assert.equal(page.includes(forbidden), false, forbidden + ' mag niet voorkomen');
  }
  assert.match(page, /extensions: \{ prf:/);
  assert.match(page, /crypto\.subtle\.decrypt/);
  assert.match(page, /output\.fill\(0\)/);
});

test('PRF-hersteltest gebruikt een vaste invoer van 32 bytes', async () => {
  const page = await readFile(new URL('../prf-test.html', import.meta.url), 'utf8');
  const match = page.match(/const PRF_INPUT = new Uint8Array\(\[([\s\S]*?)\]\)/);
  assert.ok(match, 'vaste PRF-invoer moet aanwezig zijn');
  assert.equal(match[1].split(',').filter(x => x.trim()).length, 32);
});

test('PRF-hersteltest schrijft duidelijk voor dat herstel dezelfde passkey vereist', async () => {
  const page = await readFile(new URL('../prf-test.html', import.meta.url), 'utf8');
  assert.match(page, /dezelfde “Vaste Lasten PRF-test”-passkey/);
  assert.match(page, /eigen testpasskey en herstelbestand/);
});
