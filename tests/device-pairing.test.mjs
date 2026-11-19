import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createPairingQrPayload, openPairingQrPayload, markPairingNonceUsed, newPairingPin, PAIRING_QR_TTL_MS } from '../js/device-pairing.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const profile={workspaceId:'a20c1a05-36b8-4b60-849d-5fe0dc516c61',owner:'Gertjun',repo:'SyncData'};
const token='test-github-access-token-placeholder';
const pin='AB3D-7KMP-9Q2R-5TUV';
const now=1_800_000_000_000;
class MemoryStorage{#values=new Map();getItem(k){return this.#values.get(k)??null}setItem(k,v){this.#values.set(k,String(v))}}
test('Vaste Lasten gebruikt PWA-Core PAIR-2 en draagt alleen GitHub Sync-configuratie over',async()=>{const created=await createPairingQrPayload({profile,token,pin,now});assert.ok(created.payload.startsWith('PWA-CORE-PAIR-2:'));assert.equal(created.expiresAt,now+PAIRING_QR_TTL_MS);assert.ok(!created.payload.includes(token));const opened=await openPairingQrPayload(created.payload,pin,now+1000,new MemoryStorage());assert.deepEqual(opened.syncConfig,{owner:'Gertjun',repo:'SyncData',branch:'main',path:`workspaces/${profile.workspaceId}/pwa-core-v1`,token});assert.equal(opened.workspaceId,profile.workspaceId);assert.equal(opened.nonce,created.nonce);assert.deepEqual(Object.keys(opened.syncConfig).sort(),['branch','owner','path','repo','token'])});
test('een 16-tekens-PIN wordt door Core gegenereerd',()=>{assert.match(newPairingPin().replace(/-/g,''),/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$/)});
test('een verkeerde PIN wordt geweigerd',async()=>{const c=await createPairingQrPayload({profile,token,pin,now});await assert.rejects(openPairingQrPayload(c.payload,'ZZZZ-9999-AAAA-BBBB',now+1,new MemoryStorage()),/pincode klopt niet/)});
test('verlopen, beschadigde en oude codes worden geweigerd',async()=>{const c=await createPairingQrPayload({profile,token,pin,now});const s=new MemoryStorage();await assert.rejects(openPairingQrPayload(c.payload,pin,c.expiresAt,s),/verlopen/);await assert.rejects(openPairingQrPayload(c.payload+'x',pin,now,s),/beschadigd|ongeldige/);await assert.rejects(openPairingQrPayload('PWA-CORE-PAIR-1:legacy',pin,now,s),/oude koppelcode wordt niet meer geaccepteerd/)});
test('een gebruikte pairing-ID kan op hetzelfde apparaat niet opnieuw worden geopend',async()=>{const c=await createPairingQrPayload({profile,token,pin,now});const s=new MemoryStorage();const opened=await openPairingQrPayload(c.payload,pin,now+1,s);markPairingNonceUsed(s,opened.nonce,now+2);await assert.rejects(openPairingQrPayload(c.payload,pin,now+3,s),/al gebruikt/)});
test('de standaardadministratie gebruikt het bestaande standaardpad',async()=>{const c=await createPairingQrPayload({profile:{...profile,workspaceId:'default'},token,pin,now});const o=await openPairingQrPayload(c.payload,pin,now+1,new MemoryStorage());assert.equal(o.workspaceId,'default');assert.equal(o.syncConfig.path,'pwa-core-v1')});

import { readFile } from 'node:fs/promises';
const pairingUiSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
test('QR en PIN worden in aparte schermen getoond',()=>{
  const fn=pairingUiSource.slice(pairingUiSource.indexOf('async function createDevicePairingQr()'),pairingUiSource.indexOf('async function startDevicePairingScanner()'));
  assert.match(fn,/id="core-pair-qr-panel"/);
  assert.match(fn,/id="core-pair-pin-panel" hidden/);
  assert.match(fn,/core-pair-show-pin/);
  assert.match(fn,/core-pair-qr-panel'\)\.hidden=true/);
  assert.match(fn,/core-pair-pin-panel'\)\.hidden=false/);
  assert.match(fn,/core-pair-back-qr/);
});
test('PIN is apart kopieerbaar en QR-code wordt verborgen voordat de PIN verschijnt',()=>{
  const fn=pairingUiSource.slice(pairingUiSource.indexOf('async function createDevicePairingQr()'),pairingUiSource.indexOf('async function startDevicePairingScanner()'));
  assert.match(fn,/core-pair-copy-pin/);
  assert.match(fn,/navigator\.clipboard\.writeText\(pin\)/);
  assert.match(fn,/Pincode tonen \(QR verbergen\)/);
});
