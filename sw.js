const CACHE='vaste-lasten-3.4.0-core-v1.1.0';
const PRECACHE=[
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./core-manifest.json",
  "./pwa-core.lock.json",
  "./css/base.css",
  "./js/core/biometric-factory.js",
  "./js/core/biometric.js",
  "./js/core/crypto.js",
  "./js/core/deletions.js",
  "./js/core/dom.js",
  "./js/core/github.js",
  "./js/core/nav.js",
  "./js/core/pair.js",
  "./js/core/records.js",
  "./js/core/session-lock-factory.js",
  "./js/core/session-lock.js",
  "./js/core/shell.js",
  "./js/core/sync-factory.js",
  "./js/core/sync.js",
  "./js/core/ui.js",
  "./js/core/vault-factory.js",
  "./js/core/vault.js",
  "./js/multi-vault-adapter.js",
  "./js/bundle-biometric.js",
  "./js/vastelasten-core.js",
  "./js/conflict-review.js",
  "./js/cr06-fixture.js"
];
const ASSETS=PRECACHE;
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.hostname==='api.github.com'||u.pathname.endsWith('/version.json'))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
    if(r.ok||r.type==='opaque'){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));}
    return r;
  }).catch(()=>hit)));
});
