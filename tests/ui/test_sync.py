"""Test van synchroniseren met twee apparaten tegen een nagebootste GitHub (geen echt account nodig).
Gebruik: python3 test_sync.py  (verwacht 18 keer OK)."""
import os
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import json, base64, hashlib, subprocess, time, sys
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8765','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
FILES={}
def handler(route):
    req=route.request; url=req.url.split('api.github.com')[1]
    if url=='/repos/geert/vaste-lasten-data': return route.fulfill(status=200,json={'private':True})
    if '/contents/' in url:
        f=url.split('/contents/')[1]
        if req.method=='GET':
            if f not in FILES: return route.fulfill(status=404,json={})
            c,sha=FILES[f]; return route.fulfill(status=200,json={'content':base64.b64encode(c).decode(),'sha':sha})
        if req.method=='PUT':
            b=json.loads(req.post_data); cur=FILES.get(f)
            if (cur and b.get('sha')!=cur[1]) or (not cur and b.get('sha')): return route.fulfill(status=409,json={})
            c=base64.b64decode(b['content']); sha=hashlib.sha1(c).hexdigest(); FILES[f]=(c,sha)
            return route.fulfill(status=200,json={'content':{'sha':sha}})
    route.fulfill(status=404,json={})
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
flush=lambda pg: pg.evaluate("dispatchEvent(new Event('pagehide'))")   # app verlaten: wachtende wijzigingen gaan direct naar GitHub
old={'items':[{'id':'h1','name':'Hypotheek','amount':1200,'cat':'wonen','freq':'m','day':1,'month':1,'note':'','example':False,'u':5},
              {'id':'z1','name':'Zorgverzekering Geert','amount':150,'cat':'verzekering','freq':'m','day':1,'month':1,'note':'','example':False,'u':5}],'del':{},'paid':{}}
with sync_playwright() as p:
    br=p.chromium.launch()
    def dev(init=None):
        ctx=br.new_context(viewport={'width':400,'height':860},service_workers='block')
        ctx.route('https://api.github.com/**',handler)
        ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        if init: pg.add_init_script(init)
        pg.goto('http://localhost:8765/'); return pg,errs
    # --- apparaat A: eigen lasten op dit apparaat, plus een achtergebleven koppeling van versie 1 (sinds 2.24.3 genegeerd)
    A,ea=dev("if(!sessionStorage.x){sessionStorage.x=1;localStorage.setItem('vastelasten.v2',%s);localStorage.setItem('vastelasten.v1.sync',JSON.stringify({owner:'geert',repo:'vaste-lasten-data',token:'tok',salt:'x'}));}"%json.dumps(json.dumps({'samen':{'items':[],'del':{},'paid':{}},'eigen':old})))
    ok(A.locator('#v-maand .row').count()==2,'lasten op dit apparaat staan er (2 lasten)')
    A.click('[data-filter=samen]'); ok('Nog geen gezamenlijke' in A.inner_text('#v-maand'),'oude lasten staan niet onder gezamenlijk')
    A.click('[data-filter=alle]')
    A.click('#t-instellingen'); ok('vernieuwd' not in A.inner_text('#syncPanel'),'geen overstapmelding van versie 1 meer')
    ok(A.input_value('#s-owner')=='' and A.input_value('#s-repo')=='vaste-lasten-data','oude koppeling van versie 1 wordt genegeerd')
    A.fill('#s-owner','geert'); A.fill('#s-token','tok')
    A.click('#s-next1'); A.wait_for_selector('#n-me',timeout=10000)
    A.fill('#n-me','Geert'); A.fill('#n-partner','Anne')
    for i,v in [('#n-s1','samen-wachtzin-1'),('#n-s2','samen-wachtzin-1'),('#n-e1','geert-eigen-zin-7'),('#n-e2','geert-eigen-zin-7')]: A.fill(i,v)
    A.click('#s-linkNew'); A.wait_for_selector('#s-now',timeout=20000)
    ok(set(FILES)=={'samen.json','eigen-p1.json'},'bestanden aangemaakt: '+','.join(FILES))
    ok(not any(b'Hypotheek' in c for c,_ in FILES.values()),'geen leesbare tekst in GitHub')
    # Hypotheek omzetten naar gezamenlijk
    A.click('#t-lasten'); A.click('#v-lasten [data-edit="h1"]'); A.click('label[for=f-type-s]'); A.click('#form button[type=submit]')
    flush(A); A.wait_for_timeout(4000)
    A.click('[data-filter=samen]'); ok('Hypotheek' in A.inner_text('#v-lasten'),'hypotheek staat onder gezamenlijk')
    A.click('[data-filter=alle]')
    # --- apparaat B: partner
    B,eb=dev()
    B.click('#t-instellingen'); B.fill('#s-owner','geert'); B.fill('#s-token','tok'); B.click('#s-next1')
    B.wait_for_selector('#j-s',timeout=10000); B.fill('#j-s','fout-wachtwoord'); B.click('#s-next2'); B.wait_for_timeout(1500)
    ok('klopt niet' in B.inner_text('#s-err'),'verkeerd gezamenlijk wachtwoord geweigerd')
    B.fill('#j-s','samen-wachtzin-1'); B.click('#s-next2'); B.wait_for_selector('input[name=w-me]',timeout=10000)
    ok('Anne' in B.inner_text('#syncPanel') and 'Geert' in B.inner_text('#syncPanel'),'namen zichtbaar bij "wie ben jij"')
    B.check('input[value=p2]'); B.fill('#w-e1','anne-eigen-zin-9'); B.fill('#w-e2','anne-eigen-zin-9'); B.click('#s-linkJoin')
    B.wait_for_selector('#s-now',timeout=20000)
    B.click('#t-lasten'); t=B.inner_text('#v-lasten')
    ok('Hypotheek' in t,'partner ziet gezamenlijke hypotheek')
    ok('Zorgverzekering Geert' not in t,'partner ziet Geerts eigen lasten niet')
    ok('Internet & tv' not in t,'voorbeelden in gezamenlijk zijn weg bij partner')
    ok('eigen-p2.json' in FILES,'eigen bestand partner aangemaakt')
    # verdeling 60/40 door partner (Geert 60)
    B.click('#t-instellingen'); B.fill('#m-split','60'); B.click('#m-save'); flush(B); B.wait_for_timeout(3000); B.click('#t-overzicht')
    ok('480' in B.inner_text('.ov-inleg'),'inleg partner 40% van 1200 = 480: '+B.inner_text('.ov-inleg').replace('\n',' | '))
    # partner vinkt hypotheek af
    B.click('#t-maand'); B.click('#v-maand [data-toggle="h1"]'); flush(B); B.wait_for_timeout(3000)
    # A haalt op
    A.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); A.wait_for_timeout(3000)
    A.click('#t-maand')
    ok(A.locator('#v-maand .row.paid').count()==1,'afvinken van partner zichtbaar bij Geert')
    ok('Samen · jij 60%' in A.inner_text('#v-maand'),'Geert ziet zijn deel 60%')
    ok('870' in A.inner_text('#avgAmt'),'jouw deel Geert = 720 + 150: '+A.inner_text('#avgAmt'))
    A.screenshot(path=SP+'a-maand.png',full_page=True)
    A.click('#t-overzicht'); A.screenshot(path=SP+'a-overzicht.png',full_page=True)
    A.click('#t-lasten'); A.click('#addBtn2'); A.click('label[for=f-type-s]'); A.screenshot(path=SP+'a-form.png')
    ok(not ea and not eb,'geen scriptfouten '+str(ea+eb))
    br.close()
srv.terminate()
