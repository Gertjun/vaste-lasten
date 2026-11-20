"""Test 2.18.3: wijzigingen worden gebundeld (één commit per bestand in plaats van één per wijziging)
en gaan direct naar GitHub als je de app verlaat."""
import os,subprocess,time,json,base64,hashlib
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8779','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
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
        if req.method=='PUT':
            b=json.loads(req.post_data); cur=FILES.get(f)
            if (cur and b.get('sha')!=cur[1]) or (not cur and b.get('sha')): return route.fulfill(status=409,json={})
            c=base64.b64decode(b['content']); sha=hashlib.sha1(c).hexdigest(); FILES[f]=(c,sha); PUTS.append(f)
            return route.fulfill(status=200,json={'content':{'sha':sha}})
    route.fulfill(status=404,json={})
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True,service_workers='block')
    ctx.route('https://api.github.com/**',handler); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8779/')
    pg.click('#t-instellingen'); pg.fill('#s-owner','geert'); pg.fill('#s-token','tok'); pg.click('#s-next1'); pg.wait_for_selector('#n-me',timeout=10000)
    pg.fill('#n-me','Geert'); pg.fill('#n-partner','Anne')
    for i,v in [('#n-s1','samen-wachtzin-1'),('#n-s2','samen-wachtzin-1'),('#n-e1','eigen-wachtzin-2'),('#n-e2','eigen-wachtzin-2')]: pg.fill(i,v)
    pg.click('#s-linkNew'); pg.wait_for_selector('#s-now',timeout=20000)
    n0=len(PUTS)
    # vijf wijzigingen snel achter elkaar
    pg.click('#t-maand')
    for id in ['vbs0','vbs1','vbe0','vbe1','vbs2']: pg.click(f'#v-maand [data-toggle="{id}"]')
    pg.wait_for_timeout(2500)
    ok(len(PUTS)==n0,f'na 2,5 seconde nog niets naar GitHub ({len(PUTS)-n0} commits)')
    ok('Wacht' in (pg.get_attribute('#syncPill','aria-label') or ''),'status: wacht op synchroniseren')
    pg.wait_for_timeout(9500)
    ok(len(PUTS)-n0==2 and set(PUTS[n0:])=={'samen.json','eigen-p1.json'},f'na tien seconden één commit per bestand ({PUTS[n0:]})')
    ok('Gesynchroniseerd' in (pg.get_attribute('#syncPill','aria-label') or ''),'status: gesynchroniseerd')
    # app verlaten: direct synchroniseren
    n1=len(PUTS)
    pg.click('#v-maand [data-toggle="vbe2"]'); pg.wait_for_timeout(500); ok(len(PUTS)==n1,'wijziging wacht')
    pg.evaluate("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(2500)
    ok(PUTS[n1:]==['eigen-p1.json'],f'app naar de achtergrond: direct gesynchroniseerd ({PUTS[n1:]})')
    pg.wait_for_timeout(9000); ok(len(PUTS)==n1+1,'geen dubbele commit daarna')
    ok(not errs,f'geen fouten {errs}')
    ctx.close(); br.close()
srv.terminate()
