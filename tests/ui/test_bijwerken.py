"""Test 2.20.0: gegevens onthouden welke appversie ze minstens nodig hebben. Komen ze van een nieuwere versie,
dan vraagt de app om bij te werken, synchroniseert hij niet en kun je niets wijzigen."""
import os,subprocess,time,json,base64,hashlib
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8783','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
FILES={}; PUTS=[]
def handler(route):
    req=route.request; url=req.url.split('api.github.com')[1]
    if url=='/repos/geert/vaste-lasten-data': return route.fulfill(status=200,json={'private':True})
    if '/contents/' in url:
        f=url.split('/contents/')[1].split('?')[0]
        if req.method=='GET':
            if f not in FILES: return route.fulfill(status=404,json={})
            c,sha=FILES[f]; return route.fulfill(status=200,json={'content':base64.b64encode(c).decode(),'sha':sha})
        b=json.loads(req.post_data); cur=FILES.get(f)
        if (cur and b.get('sha')!=cur[1]) or (not cur and b.get('sha')): return route.fulfill(status=409,json={})
        c=base64.b64decode(b['content']); sha=hashlib.sha1(c).hexdigest(); FILES[f]=(c,sha); PUTS.append(f)
        return route.fulfill(status=200,json={'content':{'sha':sha}})
    route.fulfill(status=404,json={})
SAMEN='fiets regen koffie lantaarn'
import re
NEEDS=re.search(r"DATA_NEEDS='([^']+)'",open(_vl.APP+'/index.html',encoding='utf-8').read()).group(1)   # was 2.20.0
CRYPT='''async([env,pass,patch])=>{const te=new TextEncoder(),td=new TextDecoder(),e=JSON.parse(env);
  const ub=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)), b64=a=>btoa(String.fromCharCode(...a));
  const base=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:ub(e.kdf.salt),iterations:e.kdf.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const obj=JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub(e.iv)},key,ub(e.ct))));
  if(!patch) return JSON.stringify(obj);
  Object.assign(obj,patch); const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify(obj))));
  return JSON.stringify({...e,iv:b64(iv),ct:b64(ct)});}'''
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True,service_workers='block')
    ctx.route('https://api.github.com/**',handler); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-30T10:00:00'); pg.goto('http://localhost:8783/')
    pg.click('#t-instellingen'); pg.fill('#s-owner','geert'); pg.fill('#s-token','tok'); pg.click('#s-next1'); pg.wait_for_selector('#n-me',timeout=10000)
    pg.fill('#n-me','Geert'); pg.fill('#n-partner','Anne')
    for i,v in [('#n-s1',SAMEN),('#n-s2',SAMEN),('#n-e1','eigen zin met vier woorden'),('#n-e2','eigen zin met vier woorden')]: pg.fill(i,v)
    pg.click('#s-linkNew'); pg.wait_for_selector('#s-now',timeout=20000)
    remote=lambda: json.loads(pg.evaluate(CRYPT,[FILES['samen.json'][0].decode(),SAMEN,None]))
    ok(remote().get('minApp')==NEEDS,f'GitHub onthoudt de minimale appversie {NEEDS}')
    ok(pg.is_hidden('#needUpd'),'geen melding zolang de gegevens bij deze versie passen')
    # een nieuwere versie zet minApp hoger
    env=pg.evaluate(CRYPT,[FILES['samen.json'][0].decode(),SAMEN,{'minApp':'9.0.0'}]); FILES['samen.json']=(env.encode(),'nieuw1')
    n0=len(PUTS)
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(2500)
    ok(pg.is_visible('#needUpd') and '9.0.0' in pg.inner_text('#needUpd'),'melding Werk de app bij met de versie')
    ok('Bijwerken nodig' in (pg.get_attribute('#syncPill','aria-label') or ''),'status Bijwerken nodig')
    pg.click('#t-maand'); pg.click('#v-maand [data-toggle="vbe0"]'); pg.wait_for_timeout(300)
    ok(pg.locator('#v-maand .row.paid').count()==0 and 'Werk de app eerst bij' in pg.inner_text('#toast'),'afvinken geblokkeerd met uitleg')
    pg.click('#t-lasten'); pg.click('#addBtn2'); ok(pg.is_hidden('#scrim'),'nieuwe last opent niet')
    pg.click('#t-instellingen'); v0=pg.input_value('#m-split'); pg.fill('#m-split','70'); pg.click('#m-save'); pg.wait_for_timeout(300)
    s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
    ok(s['samen']['meta']['split']!=70,'verdeling niet opgeslagen')
    pg.evaluate("dispatchEvent(new Event('pagehide'))"); pg.wait_for_timeout(1500)
    ok(len(PUTS)==n0 and remote()['minApp']=='9.0.0','niets naar GitHub geschreven')
    pg.click('#needBtn'); pg.wait_for_load_state(); pg.wait_for_timeout(1500)
    ok(pg.is_visible('#needUpd'),'na bijwerken naar dezelfde versie blijft de melding staan')
    # gegevens weer passend: melding verdwijnt en wijzigen kan weer
    env=pg.evaluate(CRYPT,[FILES['samen.json'][0].decode(),SAMEN,{'minApp':NEEDS}]); FILES['samen.json']=(env.encode(),'nieuw2')
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(2500)
    ok(pg.is_hidden('#needUpd'),'melding verdwijnt als de gegevens weer passen')
    pg.click('#t-maand'); pg.click('#v-maand [data-toggle="vbe0"]'); ok(pg.locator('#v-maand .row.paid').count()==1,'afvinken werkt weer')
    # koppelen op een nieuw apparaat met te nieuwe gegevens
    env=pg.evaluate(CRYPT,[FILES['samen.json'][0].decode(),SAMEN,{'minApp':'9.0.0'}]); FILES['samen.json']=(env.encode(),'nieuw3')
    c2=br.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True,service_workers='block'); c2.route('https://api.github.com/**',handler)
    B=c2.new_page(); B.goto('http://localhost:8783/'); B.click('#t-instellingen'); B.fill('#s-owner','geert'); B.fill('#s-token','tok'); B.click('#s-next1')
    B.wait_for_selector('#j-s',timeout=10000); B.fill('#j-s',SAMEN); B.click('#s-next2'); B.wait_for_selector('#w-e1',timeout=10000)
    B.check('input[value=p2]'); B.fill('#w-e1','anne haar eigen wachtzin'); B.fill('#w-e2','anne haar eigen wachtzin'); B.click('#s-linkJoin'); B.wait_for_timeout(2500)
    ok('Werk de app eerst bij' in B.inner_text('#s-err') and 'eigen-p2.json' not in FILES,'koppelen met nieuwere gegevens vraagt eerst om bij te werken')
    c2.close()
    ok(pg.evaluate('document.documentElement.scrollWidth')<=393 and not errs,f'geen overflow of fouten {errs}')
    ctx.close(); br.close()
srv.terminate()
