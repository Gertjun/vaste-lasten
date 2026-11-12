import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

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

test('ingebedde changelog is geldige JSON', async () => {
  const start = html.indexOf('const CHANGELOG=/*CHANGELOG*/') + 'const CHANGELOG=/*CHANGELOG*/'.length;
  const end = html.indexOf('/*END*/', start);
  assert.ok(start > 0 && end > start, 'changelog-blok moet aanwezig zijn');
  const changelog = JSON.parse(html.slice(start, end));
  assert.equal(changelog[0].version, JSON.parse(await readFile(new URL('../version.json', import.meta.url), 'utf8')).version);
});

test('inline JavaScript is syntactisch geldig', () => {
  const start = html.indexOf('<script>');
  const end = html.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, 'inline script moet aanwezig zijn');
  assert.doesNotThrow(() => new vm.Script(html.slice(start + 8, end)));
});

test('PRF-hersteltest is syntactisch geldige JavaScript', async () => {
  const page = await readFile(new URL('../prf-test.html', import.meta.url), 'utf8');
  const start = page.indexOf('<script>');
  const end = page.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, 'PRF-testscript moet aanwezig zijn');
  assert.doesNotThrow(() => new vm.Script(page.slice(start + 8, end)));
});

test('PRF-hersteltest bevat geen koppeling met productiegegevens of netwerk', async () => {
  const page = await readFile(new URL('../prf-test.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'none'/);
  for (const forbidden of ['api.github.com', 'localStorage', 'indexedDB', 'github_pat_', 'samen.json', 'eigen-p1.json', 'eigen-p2.json']) assert.equal(page.includes(forbidden), false, forbidden + ' mag niet voorkomen');
  assert.match(page, /additionalData: AAD/);
  assert.ok(page.includes('crypto.subtle.decrypt'));
  assert.ok(page.includes('output.fill(0)'));
});
