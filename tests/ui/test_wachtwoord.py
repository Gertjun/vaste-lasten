"""Test 2.19.0: wachtwoorden van minstens 12 tekens die niet makkelijk te raden zijn, met een sterktemeter en een oogje."""
import os,subprocess,time,json,base64,hashlib
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8782','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
FILES={}
def handler(route):
    req=route.request; url=req.url.split('api.github.com')[1]
    if url=='/repos/geert/vaste-lasten-data': return route.fulfill(status=200,json={'private':True})
    if '/contents/' in url:
        f=url.split('/contents/')[1].split('?')[0]
        if req.method=='GET':
            if f not in FILES: return route.fulfill(status=404,json={})
            c,sha=FILES[f]; return route.fulfill(status=200,json={'content':base64.b64encode(c).decode(),'sha':sha})
        b=json.loads(req.post_data); c=base64.b64decode(b['content']); sha=hashlib.sha1(c).hexdigest(); FILES[f]=(c,sha)
        return route.fulfill(status=200,json={'content':{'sha':sha}})
    route.fulfill(status=404,json={})
with sync_playwright() as p:
    br=p.chromium.launch()
    for w in [393,1440]:
        FILES.clear()
        ctx=br.new_context(viewport={'width':w,'height':900},is_mobile=w<500,has_touch=w<500,service_workers='block')
        ctx.route('https://api.github.com/**',handler); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8782/')
        pg.click('#t-instellingen'); pg.fill('#s-owner','geert'); pg.fill('#s-token','tok'); pg.click('#s-next1'); pg.wait_for_selector('#n-me',timeout=10000)
        pg.fill('#n-me','Geert'); pg.fill('#n-partner','Anne')
        meter=lambda id: (pg.get_attribute('#pm-'+id,'data-s'),pg.inner_text('#pm-'+id))
        pg.fill('#n-s1','samen123'); ok(meter('n-s1')==('1','Zwak: nog 4 tekens te kort'),f'{w}: kort wachtwoord is zwak {meter("n-s1")}')
        pg.fill('#n-s1','Wachtwoord12'); ok(meter('n-s1')[0]=='1',f'{w}: Wachtwoord12 is zwak {meter("n-s1")}')
        pg.fill('#n-s1','k8#Lm2pQ9x!r'); ok(meter('n-s1')[0]=='2',f'{w}: 12 willekeurige tekens is redelijk {meter("n-s1")}')
        pg.fill('#n-s1','fiets regen koffie lantaarn'); ok(meter('n-s1')==('3','Sterk'),f'{w}: wachtzin is sterk {meter("n-s1")}')
        ok(pg.locator('#pm-n-s2').count()==0,f'{w}: geen meter bij herhalen')
        # oogje
        b=pg.locator('[data-eye="n-s1"]'); bb=b.bounding_box()
        ok(bb['height']>=44 and bb['width']>=44,f'{w}: oogje groot genoeg ({bb["width"]:.0f}x{bb["height"]:.0f})')
        b.click(); ok(pg.get_attribute('#n-s1','type')=='text' and b.get_attribute('aria-pressed')=='true' and 'Verberg' in b.get_attribute('aria-label'),f'{w}: oogje toont het wachtwoord')
        b.click(); ok(pg.get_attribute('#n-s1','type')=='password' and 'Toon' in b.get_attribute('aria-label'),f'{w}: nogmaals tikken verbergt het')
        ok(pg.locator('#syncPanel [data-eye]').count()==4,f'{w}: oogje bij alle vier de wachtwoordvelden')
        # koppelen weigert zwakke wachtwoorden
        for pw,msg in [('samen123','minstens 12 tekens'),('wachtwoord12','te makkelijk')]:
            pg.fill('#n-s1',pw); pg.fill('#n-s2',pw); pg.fill('#n-e1','eigen zin met vier woorden'); pg.fill('#n-e2','eigen zin met vier woorden')
            pg.click('#s-linkNew'); pg.wait_for_timeout(300); ok(msg in pg.inner_text('#s-err') and not FILES,f'{w}: {pw} geweigerd')
        pg.fill('#n-s1','fiets regen koffie lantaarn'); pg.fill('#n-s2','fiets regen koffie lantaarn')
        pg.click('#s-linkNew'); pg.wait_for_selector('#s-now',timeout=20000); ok('samen.json' in FILES,f'{w}: sterk wachtwoord koppelt')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        if w==393:
            # een bestaand eigen bestand met een oud, kort wachtwoord blijft bruikbaar bij deelnemen
            env=pg.evaluate('''async()=>{const te=new TextEncoder(), salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
              const b64=a=>btoa(String.fromCharCode(...a));
              const base=await crypto.subtle.importKey('raw',te.encode('anne1234'),'PBKDF2',false,['deriveKey']);
              const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt']);
              const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify({items:[],del:{},paid:{},meta:null}))));
              return JSON.stringify({app:'vaste-lasten',v:2,kdf:{name:'PBKDF2',hash:'SHA-256',iter:310000,salt:b64(salt)},alg:'AES-GCM',iv:b64(iv),ct:b64(ct)});}''')
            for anne_file in (False,True):
                FILES.pop('eigen-p2.json',None)
                if anne_file: FILES['eigen-p2.json']=(env.encode(),'x1')
                c2=br.new_context(viewport={'width':393,'height':900},is_mobile=True,has_touch=True,service_workers='block'); c2.route('https://api.github.com/**',handler)
                B=c2.new_page(); B.goto('http://localhost:8782/'); B.click('#t-instellingen'); B.fill('#s-owner','geert'); B.fill('#s-token','tok'); B.click('#s-next1')
                B.wait_for_selector('#j-s',timeout=10000); B.fill('#j-s','fiets regen koffie lantaarn'); B.click('#s-next2'); B.wait_for_selector('#w-e1',timeout=10000)
                B.check('input[value=p2]'); B.fill('#w-e1','anne1234'); B.fill('#w-e2','anne1234'); B.click('#s-linkJoin'); B.wait_for_timeout(2500)
                if anne_file: ok(B.locator('#s-now').count()==1,'deelnemen met een bestaand kort eigen wachtwoord lukt')
                else: ok('minstens 12' in B.inner_text('#s-err') and 'eigen-p2.json' not in FILES,'nieuw eigen wachtwoord van 8 tekens geweigerd bij deelnemen')
                c2.close()
        ctx.close()
    br.close()
srv.terminate()
