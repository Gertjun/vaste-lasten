"""Test 2.21.0: een vorige versie uit de geschiedenis in GitHub terugzetten."""
import os,subprocess,time,json,base64,hashlib,datetime
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8784','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
FILES={}; HIST={}; clock=[datetime.datetime(2026,10,28,9,0)]
def handler(route):
    req=route.request; url=req.url.split('api.github.com')[1]
    if url=='/repos/geert/vaste-lasten-data': return route.fulfill(status=200,json={'private':True})
    if url.startswith('/repos/geert/vaste-lasten-data/commits?'):
        f=url.split('path=')[1].split('&')[0]
        return route.fulfill(status=200,json=[{'sha':sha,'commit':{'committer':{'date':d}}} for sha,c,d in reversed(HIST.get(f,[]))])
    if '/contents/' in url:
        f,_,q=url.split('/contents/')[1].partition('?')
        if req.method=='GET':
            if q.startswith('ref='):
                for sha,c,d in HIST.get(f,[]):
                    if sha==q[4:]: return route.fulfill(status=200,json={'content':base64.b64encode(c).decode(),'sha':sha})
                return route.fulfill(status=404,json={})
            if f not in FILES: return route.fulfill(status=404,json={})
            c,sha=FILES[f]; return route.fulfill(status=200,json={'content':base64.b64encode(c).decode(),'sha':sha})
        b=json.loads(req.post_data); cur=FILES.get(f)
        if (cur and b.get('sha')!=cur[1]) or (not cur and b.get('sha')): return route.fulfill(status=409,json={})
        c=base64.b64decode(b['content']); sha=hashlib.sha1(c).hexdigest(); FILES[f]=(c,sha)
        clock[0]+=datetime.timedelta(hours=3); HIST.setdefault(f,[]).append((sha,c,clock[0].isoformat()+'Z'))
        return route.fulfill(status=200,json={'content':{'sha':sha}})
    route.fulfill(status=404,json={})
EIGEN='eigen zin met vier woorden'
DEC='''async([env,pass])=>{const te=new TextEncoder(),e=JSON.parse(env),ub=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const base=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:ub(e.kdf.salt),iterations:e.kdf.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub(e.iv)},key,ub(e.ct)));}'''
with sync_playwright() as p:
    br=p.chromium.launch()
    for w in [393,1440]:
        FILES.clear(); HIST.clear()
        ctx=br.new_context(viewport={'width':w,'height':900},is_mobile=w<500,has_touch=w<500,service_workers='block')
        ctx.route('https://api.github.com/**',handler); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8784/')
        pg.click('#t-instellingen'); pg.fill('#s-owner','geert'); pg.fill('#s-token','tok'); pg.click('#s-next1'); pg.wait_for_selector('#n-me',timeout=10000)
        pg.fill('#n-me','Geert'); pg.fill('#n-partner','Anne')
        for i,v in [('#n-s1','fiets regen koffie lantaarn'),('#n-s2','fiets regen koffie lantaarn'),('#n-e1',EIGEN),('#n-e2',EIGEN)]: pg.fill(i,v)
        pg.click('#s-linkNew'); pg.wait_for_selector('#s-now',timeout=20000)
        flush=lambda: (pg.evaluate("dispatchEvent(new Event('pagehide'))"), pg.wait_for_timeout(1500))
        def add(name):
            pg.click('#t-lasten'); pg.click('#addBtn2' if w<1100 else '#addBtn'); pg.wait_for_timeout(150); pg.fill('#f-name',name); pg.fill('#f-amount','100'); pg.fill('#f-day','4'); pg.click('#form button[type=submit]')
        add('Kinderopvang'); flush()
        add('Muziekles'); pg.click('#v-lasten [data-edit]:has-text("Kinderopvang")'); pg.click('#delBtn'); pg.click('#delBtn'); flush()
        remote=lambda: pg.evaluate(DEC,[FILES['eigen-p1.json'][0].decode(),EIGEN])
        ok('Muziekles' in remote() and 'Kinderopvang' not in json.dumps([i['name'] for i in json.loads(remote())['items']]),f'{w}: uitgangssituatie: Muziekles, geen Kinderopvang')
        pg.click('#t-instellingen'); pg.click('#h-open'); pg.wait_for_selector('.hist-list',timeout=10000)
        pg.click('label[for="h-st-eigen"]'); pg.wait_for_timeout(1200)
        lis=pg.locator('.hist-list li'); ok(lis.count()==3 and 'Huidige versie' in lis.nth(0).inner_text(),f'{w}: drie versies van je eigen lasten, de bovenste is de huidige ({lis.count()})')
        ok(' oktober om ' in lis.nth(1).inner_text() and 'dag ' in lis.nth(1).inner_text(),f'{w}: dag, datum en tijd bij elke versie')
        pg.locator('#syncPanel').screenshot(path=HERE+f'screens/herstellen-{w}.png')
        bb=lis.nth(1).locator('[data-restore]').bounding_box(); ok(bb['height']>=40,f'{w}: knop Herstel groot genoeg')
        n0=len(HIST['eigen-p1.json'])
        lis.nth(1).locator('[data-restore]').click(); ok('Zeker weten' in lis.nth(1).inner_text() and len(HIST['eigen-p1.json'])==n0,f'{w}: eerst bevestigen')
        lis.nth(1).locator('[data-restore]').click(); pg.wait_for_timeout(2500)
        names=[i['name'] for i in json.loads(remote())['items']]
        ok('Kinderopvang' in names and 'Muziekles' not in names,f'{w}: in GitHub teruggezet: {names}')
        ok(len(HIST['eigen-p1.json'])==n0+1,f'{w}: terugzetten is een nieuwe versie, de oude blijven staan')
        pg.click('#t-lasten'); t=pg.inner_text('#v-lasten'); ok('Kinderopvang' in t and 'Muziekles' not in t,f'{w}: ook in de app teruggezet')
        ok('Teruggezet naar' in pg.inner_text('#toast'),f'{w}: melding Teruggezet naar …')
        # ongedaan maken: de versie van vóór het terugzetten
        pg.click('#t-instellingen'); pg.click('#h-open'); pg.wait_for_selector('.hist-list',timeout=10000); pg.click('label[for="h-st-eigen"]'); pg.wait_for_timeout(1200)
        b=pg.locator('.hist-list li').nth(1).locator('[data-restore]'); b.click(); b.click(); pg.wait_for_timeout(2500)
        names=[i['name'] for i in json.loads(remote())['items']]; ok('Muziekles' in names and 'Kinderopvang' not in names,f'{w}: terugzetten is ongedaan te maken: {names}')
        pg.click('#h-open'); pg.wait_for_selector('.hist-list',timeout=10000); ok(pg.locator('.hist-list li').count()>=2,f'{w}: Gezamenlijke lasten hebben ook een geschiedenis')
        pg.click('#h-close'); ok(pg.locator('#histBox').count()==0,f'{w}: sluiten')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
