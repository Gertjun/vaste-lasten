// App-adapter voor Vaste Lasten. De Core-envelop draagt uitsluitend GitHub Sync-configuratie.
import { createPairingCode, openPairingCode, markPairingUsed, newPin, PAIRING_TTL_MS } from './core/pair.js';
const CONTEXT='vaste-lasten';
const USED_KEY='vastelasten.v3.pairing.used';
function pathForWorkspace(workspaceId){if(workspaceId==='default')return'pwa-core-v1';if(typeof workspaceId!=='string'||!/^[a-f0-9-]{8,64}$/i.test(workspaceId))throw new Error('De workspace-code is ongeldig.');return`workspaces/${workspaceId}/pwa-core-v1`;}
function workspaceFromPath(path){if(path==='pwa-core-v1')return'default';const m=/^workspaces\/([a-f0-9-]{8,64})\/pwa-core-v1$/i.exec(path||'');if(!m)throw new Error('Het GitHub-pad hoort niet bij een geldige Vaste Lasten-administratie.');return m[1];}
function validateSyncConfig(c){if(!c||typeof c!=='object'||typeof c.owner!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(c.owner)||typeof c.repo!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(c.repo)||c.branch!=='main'||typeof c.token!=='string'||!c.token.trim()||c.token.length>500)throw new Error('De GitHub Sync-configuratie is ongeldig.');const workspaceId=workspaceFromPath(c.path);return workspaceId;}
export function newPairingPin(){return newPin();}
export async function createPairingQrPayload({profile,token,pin,now=Date.now()}={}){if(!profile||typeof profile!=='object'||typeof profile.owner!=='string'||typeof profile.repo!=='string')throw new Error('De GitHub-koppeling ontbreekt.');const syncConfig={owner:profile.owner,repo:profile.repo,branch:'main',path:pathForWorkspace(profile.workspaceId||'default'),token};const c=await createPairingCode({syncConfig,pin,context:CONTEXT,now,transport:'qr'});return{payload:c.payload,expiresAt:c.expiresAt,nonce:c.pairingId};}
function assertNotUsed(storage,id,now){if(!storage||typeof storage.getItem!=='function')throw new Error('Lokale replaybescherming is niet beschikbaar.');let entries=[];const stored=storage.getItem(USED_KEY);if(stored!==null){try{entries=JSON.parse(stored)}catch{throw new Error('De lokale replayhistorie is beschadigd; koppelen wordt geweigerd.')}if(!Array.isArray(entries)||entries.some(e=>!e||typeof e.pairingId!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(e.pairingId)||!Number.isSafeInteger(e.usedAt)||e.usedAt<0))throw new Error('De lokale replayhistorie is ongeldig; koppelen wordt geweigerd.')}if(entries.some(e=>e.pairingId===id&&now-e.usedAt<=10*60*1000&&e.usedAt<=now+30000))throw new Error('Deze koppelcode is op dit apparaat al gebruikt. Maak een nieuwe code.');}
export async function openPairingQrPayload(payload,pin,now=Date.now(),storage=globalThis.localStorage){const o=await openPairingCode({payload,pin,context:CONTEXT,now,transport:'qr'});const workspaceId=validateSyncConfig(o.syncConfig);assertNotUsed(storage,o.pairingId,now);return{syncConfig:o.syncConfig,workspaceId,nonce:o.pairingId,expiresAt:o.expiresAt};}
export function markPairingNonceUsed(storage,nonce,now=Date.now()){markPairingUsed(storage,nonce,{storageKey:USED_KEY,now});}
export const PAIRING_QR_TTL_MS=PAIRING_TTL_MS;


// v3: each Core code carries precisely one authorized domain key.
import { createVaultDomains } from './multi-vault-adapter.js';
import { openPairing, isFullPairCode, extractPairCode } from './core/pairing-ui.js';
export function domainPairingContext(id) {
  if (!['shared','personal-p1','personal-p2'].includes(id)) throw new Error('Onbekende kluis.');
  return CONTEXT + '/' + id;
}
export async function openDomainPairing(input, {storage=globalThis.localStorage, now=Date.now()}={}) {
  if (!isFullPairCode(extractPairCode(input))) throw new Error('Gebruik een nieuwe koppelcode voor deze kluis.');
  let opened, id;
  for (const candidate of ['shared','personal-p1','personal-p2']) {
    try {
      opened=await openPairing({input,context:domainPairingContext(candidate),storage,storageKey:USED_KEY,now});
      id=candidate; break;
    } catch (error) { if(candidate==='personal-p2') throw new Error('Ongeldige, verlopen of eerder gebruikte kluiskoppelcode.'); }
  }
  const config=opened.syncConfig;
  const match=/^(pwa-core-v1|workspaces\/([a-f0-9-]{8,64})\/pwa-core-v1)\/(samen|eigen-p1|eigen-p2)\.json$/i.exec(config.path);
  if(!match) throw new Error('Ongeldig kluispad.');
  const workspaceId=validateSyncConfig({...config,path:match[1]});
  if(config.path!==createVaultDomains({workspaceId})[id].path) throw new Error('Koppelcode hoort bij een andere kluis.');
  return {...opened,id,workspaceId};
}
export function combineDomainPairings(first, second, now=Date.now()) {
  const pair=[first,second];
  const shared=pair.find(x=>x?.id==='shared');
  const personal=pair.find(x=>['personal-p1','personal-p2'].includes(x?.id));
  if(!shared||!personal||shared.pairingId===personal.pairingId) throw new Error('Scan één gezamenlijke en één persoonlijke kluis.');
  if(pair.some(x=>!Number.isFinite(x.expiresAt)||now>=x.expiresAt)) throw new Error('Een koppelcode is verlopen.');
  if(shared.workspaceId!==personal.workspaceId||['owner','repo','branch','token'].some(k=>shared.syncConfig[k]!==personal.syncConfig[k])) throw new Error('De codes horen niet bij dezelfde administratie.');
  return {workspaceId:shared.workspaceId,me:personal.id.slice(-2),settings:{owner:shared.syncConfig.owner,repo:shared.syncConfig.repo,branch:shared.syncConfig.branch,token:shared.syncConfig.token},domains:{shared,[personal.id]:personal},expiresAt:Math.min(shared.expiresAt,personal.expiresAt)};
}
