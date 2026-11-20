"""Test 2.24.0: het gezamenlijke en het eigen wachtwoord wijzigen. Andere apparaten vragen daarna alleen om het gewijzigde wachtwoord,
houden hun eigen wijzigingen, en oude versies van vóór de wijziging zijn terug te zetten op apparaten die toen al gekoppeld waren."""
import os,subprocess,time,json,base64,hashlib,datetime
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
os.makedirs(HERE+'screens',exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8791','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
FILES={}; HIST={}; clock=[datetime.datetime(2026,11,1,9,0)]
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
        clock[0]+=datetime.timedelta(hours=2); HIST.setdefault(f,[]).append((sha,c,clock[0].isoformat()+'Z'))
        return route.fulfill(status=200,json={'content':{'sha':sha}})
    route.fulfill(status=404,json={})
SAMEN='fiets regen koffie lantaarn'; NIEUW='zeilboot molen tulp hagelslag'
EIGEN_A='eigen zin met vier woorden'; EIGEN_A2='lantaarnpaal kaasschaaf wolk'; EIGEN_B='anne haar eigen wachtzin'
DEC='''async([env,pass])=>{try{const te=new TextEncoder(),e=JSON.parse(env),ub=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const base=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:ub(e.kdf.salt),iterations:e.kdf.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub(e.iv)},key,ub(e.ct)));}catch(x){return null;}}'''
with sync_playwright() as p:
    br=p.chromium.launch()
    def dev(w):
        ctx=br.new_context(viewport={'width':w,'height':900},is_mobile=w<500,has_touch=w<500,service_workers='block')
        ctx.route('https://api.github.com/**',handler); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8791/'); return ctx,pg,errs
    def sync_group(pg,w):
        pg.click('#t-instellingen')
        if w>=1100: pg.click('#setNav [data-sg="sync"]')
        elif not pg.evaluate("document.querySelector('#v-instellingen details[data-g=\"sync\"]').open"): pg.click('#v-instellingen details[data-g="sync"] > summary')
    def join(pg,eigen):
        pg.click('#t-instellingen'); pg.fill('#s-owner','geert'); pg.fill('#s-token','tok'); pg.click('#s-next1')
        pg.wait_for_selector('#j-s',timeout=10000); pg.fill('#j-s',SAMEN if 'samen' not in NOW else NOW['samen']); pg.click('#s-next2'); pg.wait_for_selector('#w-e1',timeout=10000)
        pg.check('input[value=p2]'); pg.fill('#w-e1',eigen); pg.fill('#w-e2',eigen); pg.click('#s-linkJoin'); pg.wait_for_selector('#s-now',timeout=20000)
    remote=lambda pg,f,pw: pg.evaluate(DEC,[FILES[f][0].decode(),pw])
    salt=lambda f: json.loads(FILES[f][0])['kdf']['salt']
    vis=lambda pg: (pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"), pg.wait_for_timeout(2500))
    for w in [393,1440]:
        FILES.clear(); HIST.clear(); NOW={}
        ca,A,ea=dev(w)
        A.click('#t-instellingen'); A.fill('#s-owner','geert'); A.fill('#s-token','tok'); A.click('#s-next1'); A.wait_for_selector('#n-me',timeout=10000)
        A.fill('#n-me','Geert'); A.fill('#n-partner','Anne')
        for i,v in [('#n-s1',SAMEN),('#n-s2',SAMEN),('#n-e1',EIGEN_A),('#n-e2',EIGEN_A)]: A.fill(i,v)
        A.click('#s-linkNew'); A.wait_for_selector('#s-now',timeout=20000)
        cb,B,eb=dev(393); join(B,EIGEN_B)
        # --- het venster
        sync_group(A,w); ok(A.is_visible('#pw-open'),f'{w}: knop Wachtwoord wijzigen bij Synchronisatie')
        A.click('#pw-open'); ok(A.is_visible('#pwBox') and A.is_hidden('#pw-open') and A.is_checked('#pw-st-samen'),f'{w}: venster open, standaard het gezamenlijke wachtwoord')
        ok(A.locator('#pwBox [data-eye]').count()==3 and A.locator('#pm-c-n1').count()==1,f'{w}: drie velden met een oogje, meter bij het nieuwe wachtwoord')
        ok('Anne' in A.inner_text('#pwBox'),f'{w}: uitleg noemt de partner')
        A.fill('#c-n1',NIEUW); ok(A.get_attribute('#pm-c-n1','data-s')=='3',f'{w}: meter: nieuwe wachtzin is sterk')
        for b in A.locator('#pwBox [data-eye]').all()+A.locator('#pwBox .seg label').all():
            bb=b.bounding_box()
            if bb['height']<44: ok(False,f'{w}: tikvlak te klein {bb}')
        A.locator('#syncPanel').screenshot(path=HERE+f'screens/wachtwoord-{w}.png')
        # --- getypte velden blijven staan als de synchronisatie het paneel opnieuw tekent
        A.fill('#c-old','iets'); vis(A); ok(A.is_visible('#pwBox') and A.input_value('#c-old')=='iets' and A.input_value('#c-n1')==NIEUW,f'{w}: velden blijven staan na synchroniseren')
        s0=salt('samen.json')
        def tryit(old,n1,n2,msg,label):
            A.fill('#c-old',old); A.fill('#c-n1',n1); A.fill('#c-n2',n2); A.click('#pw-save'); A.wait_for_timeout(2500)
            ok(msg in A.inner_text('#c-err') and salt('samen.json')==s0,f'{w}: {label}: {A.inner_text("#c-err")}')
        tryit('verkeerd wachtwoord',NIEUW,NIEUW,'klopt niet','verkeerd huidig wachtwoord geweigerd')
        tryit(SAMEN,'kort wachtw','kort wachtw','minstens 12','te kort nieuw wachtwoord geweigerd')
        tryit(SAMEN,NIEUW,NIEUW+'x','niet gelijk','twee verschillende nieuwe wachtwoorden geweigerd')
        tryit(SAMEN,SAMEN,SAMEN,'gelijk aan het huidige','zelfde wachtwoord geweigerd')
        tryit(SAMEN,EIGEN_A,EIGEN_A,'je eigen wachtwoord','eigen wachtwoord als gezamenlijk geweigerd')
        A.fill('#c-old',SAMEN); A.fill('#c-n1',NIEUW); A.fill('#c-n2',NIEUW); A.press('#c-n2','Enter'); A.wait_for_timeout(3000)
        ok(salt('samen.json')!=s0 and remote(A,'samen.json',NIEUW) and not remote(A,'samen.json',SAMEN),f'{w}: samen.json is opnieuw versleuteld met het nieuwe wachtwoord')
        ok('Anne' in json.loads(remote(A,'samen.json',NIEUW))['meta']['p2'],f'{w}: de gegevens zijn er nog')
        ok(A.locator('#pwBox').count()==0 and 'gewijzigd' in A.inner_text('#toast'),f'{w}: venster dicht, melding Gezamenlijk wachtwoord gewijzigd')
        ok('Gesynchroniseerd' in (A.get_attribute('#syncPill','aria-label') or '') or A.is_hidden('#syncPill'),f'{w}: dit apparaat synchroniseert gewoon verder')
        NOW['samen']=NIEUW
        # --- apparaat van de partner: een wijziging die nog niet weg is, dan het nieuwe wachtwoord
        B.click('#t-instellingen'); B.fill('#m-split','60'); B.click('#m-save'); vis(B)
        ok('Wachtwoord nodig' in (B.get_attribute('#syncPill','aria-label') or ''),'partner: status Wachtwoord nodig')
        ok(B.locator('#u-s').count()==1 and B.locator('#u-e').count()==0,'partner: alleen het gezamenlijke wachtwoord gevraagd')
        ok('gewijzigd' in B.inner_text('#syncPanel'),'partner: uitleg dat het wachtwoord is gewijzigd')
        B.fill('#u-s',SAMEN); B.click('#s-unlock'); B.wait_for_timeout(2500); ok('klopt niet' in B.inner_text('#s-err'),'partner: het oude wachtwoord werkt niet meer')
        B.fill('#u-s',NIEUW); B.click('#s-unlock'); B.wait_for_timeout(4000)
        ok(B.locator('#s-now').count()==1,'partner: ontgrendeld met het nieuwe wachtwoord')
        ok(json.loads(remote(B,'samen.json',NIEUW))['meta']['split']==60,'partner: haar wijziging van daarvoor staat in GitHub')
        ok(remote(B,'eigen-p2.json',EIGEN_B),'partner: haar eigen wachtwoord is niet veranderd')
        ok(not eb,f'partner: geen fouten {eb}')
        # --- eigen wachtwoord
        A.click('#pw-open'); A.click('label[for="pw-st-eigen"]'); A.wait_for_timeout(200)
        ok(A.is_checked('#pw-st-eigen') and A.input_value('#c-old')=='' and 'Huidig eigen wachtwoord' in A.inner_text('#pwBox'),f'{w}: eigen wachtwoord gekozen, velden leeg')
        s1=salt('samen.json')
        A.fill('#c-old',EIGEN_A); A.fill('#c-n1',NIEUW); A.fill('#c-n2',NIEUW); A.click('#pw-save'); A.wait_for_timeout(2500)
        ok('gezamenlijke wachtwoord' in A.inner_text('#c-err'),f'{w}: gezamenlijk wachtwoord als eigen geweigerd')
        A.fill('#c-n1',EIGEN_A2); A.fill('#c-n2',EIGEN_A2); A.click('#pw-save'); A.wait_for_timeout(3000)
        ok(remote(A,'eigen-p1.json',EIGEN_A2) and not remote(A,'eigen-p1.json',EIGEN_A) and salt('samen.json')==s1,f'{w}: eigen-p1.json opnieuw versleuteld, samen.json niet aangeraakt')
        # na herladen werkt alles met de bewaarde sleutels
        A.reload(); A.wait_for_timeout(2500); sync_group(A,w)
        ok(A.locator('#s-now').count()==1 and A.locator('#u-s').count()==0,f'{w}: na herladen geen wachtwoord nodig')
        if w==393:
            # --- een versie van vóór de wijziging terugzetten
            A.click('#t-lasten'); A.click('#addBtn2'); A.wait_for_timeout(150); A.fill('#f-name','Kinderopvang'); A.fill('#f-amount','100'); A.fill('#f-day','4'); A.click('label[for=f-type-s]'); A.click('#form button[type=submit]')
            A.evaluate("dispatchEvent(new Event('pagehide'))"); A.wait_for_timeout(2000)
            ok('Kinderopvang' in remote(A,'samen.json',NIEUW),'nieuwe gezamenlijke last staat in GitHub')
            sync_group(A,w); A.click('#h-open'); A.wait_for_selector('.hist-list',timeout=10000)
            lis=A.locator('.hist-list li'); n=lis.count(); ok(n>=3,f'geschiedenis van samen.json ({n} versies)')
            last=lis.nth(n-1).locator('[data-restore]'); last.click(); last.click(); A.wait_for_timeout(3000)
            t=remote(A,'samen.json',NIEUW); names=[i['name'] for i in json.loads(t)['items']] if t else None
            ok(names is not None and 'Kinderopvang' not in names,f'oudste versie (oud wachtwoord) teruggezet en met het nieuwe versleuteld: {names}')
            ok('Teruggezet naar' in A.inner_text('#toast'),'melding Teruggezet naar …')
            # een apparaat dat pas na de wijziging is gekoppeld kan die versie niet ontsleutelen
            cc,C,ec=dev(393); join(C,EIGEN_B)
            sync_group(C,393); C.click('#h-open'); C.wait_for_selector('.hist-list',timeout=10000)
            lis=C.locator('.hist-list li'); b=lis.nth(lis.count()-1).locator('[data-restore]'); b.click(); b.click(); C.wait_for_timeout(2500)
            ok('pas daarna gekoppeld' in C.inner_text('#histBox'),'nieuw apparaat: duidelijke melding bij een versie van vóór de wijziging')
            ok(not ec,f'nieuw apparaat: geen fouten {ec}'); cc.close()
            # --- ontkoppelen ruimt ook de oude sleutels op
            sync_group(A,w); A.click('#s-unlink'); A.click('#s-unlink'); A.wait_for_timeout(800)
            n=A.evaluate("new Promise(r=>{const q=indexedDB.open('vaste-lasten',1);q.onsuccess=()=>{const c=q.result.transaction('kv').objectStore('kv').count();c.onsuccess=()=>r(c.result);};})")
            ok(n==0,f'ontkoppelen haalt alle sleutels van dit apparaat ({n} over)')
        ok(A.evaluate('document.documentElement.scrollWidth')<=w and not ea,f'{w}: geen overflow of fouten {ea}')
        ca.close(); cb.close()
    br.close()
srv.terminate()
