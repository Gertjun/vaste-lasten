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


import { domainPairingContext, openDomainPairing, combineDomainPairings } from '../js/device-pairing.js';
import { createFullPairingCode } from '../js/core/pair.js';
import { generateDataKey } from '../js/core/crypto.js';
async function domainCode(id, workspaceId=profile.workspaceId, at=now){
  const path=(workspaceId==='default'?'pwa-core-v1':'workspaces/'+workspaceId+'/pwa-core-v1')+'/'+({shared:'samen','personal-p1':'eigen-p1','personal-p2':'eigen-p2'}[id])+'.json';
  return (await createFullPairingCode({context:domainPairingContext(id),syncConfig:{owner:profile.owner,repo:profile.repo,branch:'main',path,token},dataKey:await generateDataKey(),now:at})).payload;
}
test('twee v3-codes koppelen uitsluitend shared en eigen, zonder PIN',async()=>{
  const storage=new MemoryStorage();
  const a=await openDomainPairing(await domainCode('shared'),{storage,now});
  const b=await openDomainPairing(await domainCode('personal-p1'),{storage,now});
  const combined=combineDomainPairings(b,a,now);
  assert.equal(combined.me,'p1');
  assert.deepEqual(Object.keys(combined.domains),['shared','personal-p1']);
  assert.equal(combined.workspaceId,profile.workspaceId);
  assert.throws(()=>combineDomainPairings(a,a,now));
  assert.throws(()=>combineDomainPairings(a,b,a.expiresAt),/verlopen/);
  const foreign=await openDomainPairing(await domainCode('personal-p2','default'),{storage,now});
  assert.throws(()=>combineDomainPairings(a,foreign,now),/zelfde administratie/);
});
test('verlopen v3-code wordt geweigerd',async()=>{
  const code=await domainCode('shared');
  await assert.rejects(openDomainPairing(code,{storage:new MemoryStorage(),now:now+PAIRING_QR_TTL_MS}));
});
