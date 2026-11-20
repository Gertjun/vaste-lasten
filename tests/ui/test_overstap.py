"""Test 2.24.3: de overstapcode van versie 1 is weg. Oude opslag en een oude koppeling van versie 1 worden genegeerd,
maar een back-up van versie 1 (één lijst, afvinkjes als lijst) is nog terug te zetten, net als een back-up van nu."""
import os,subprocess,time,json
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8792','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
V1={'items':[{'id':'h1','name':'Hypotheek oud','amount':1200,'cat':'wonen','freq':'m','day':1,'month':1,'note':'','u':5},
             {'id':'z1','name':'Zorgverzekering oud','amount':150,'cat':'verzekering','freq':'m','day':1,'month':1,'note':'','u':5}],
    'del':{},'paid':{'2026-10':['h1']}}
with sync_playwright() as p:
    br=p.chromium.launch()
    for w in [393,1440]:
        ctx=br.new_context(viewport={'width':w,'height':900},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-20T10:00:00')
        pg.add_init_script("if(!sessionStorage.x){sessionStorage.x=1;localStorage.setItem('vastelasten.v1',%s);localStorage.setItem('vastelasten.v1.sync',JSON.stringify({owner:'geert',repo:'r',token:'tok',salt:'x'}));}"%json.dumps(json.dumps(V1)))
        pg.goto('http://localhost:8792/')
        pg.click('#t-lasten'); t=pg.inner_text('#v-lasten')
        ok('Hypotheek oud' not in t and 'Zorgverzekering' in t,f'{w}: oude opslag van versie 1 genegeerd, voorbeelden staan er')
        pg.click('#t-instellingen')
        if w>=1100: pg.click('#setNav [data-sg="sync"]')
        ok(pg.input_value('#s-owner')=='' and 'vernieuwd' not in pg.inner_text('#syncPanel'),f'{w}: oude koppeling van versie 1 genegeerd')
        # back-up van versie 1 terugzetten
        pg.click('#setNav [data-sg="data"]' if w>=1100 else 'details[data-g="data"] > summary')
        pg.fill('#bkText',json.dumps(V1)); pg.click('#restoreBk'); pg.wait_for_timeout(300)
        pg.click('#t-lasten'); t=pg.inner_text('#v-lasten')
        ok('Hypotheek oud' in t and 'Zorgverzekering oud' in t,f'{w}: back-up van versie 1 teruggezet')
        pg.click('#filters [data-filter=eigen]'); ok('Hypotheek oud' in pg.inner_text('#v-lasten'),f'{w}: lasten uit versie 1 staan onder Eigen')
        pg.click('#filters [data-filter=alle]')
        pg.click('#t-maand')
        ok(pg.locator('#v-maand .row.paid:has([data-toggle="h1"])').count()==1,f'{w}: afvinkje uit versie 1 is overgenomen')
        # back-up van nu terugzetten werkt ook
        cur=pg.evaluate("localStorage.getItem('vastelasten.v2')"); s=json.loads(cur)
        s['eigen']['items'].append({'id':'n1','name':'Sportschool nieuw','amount':30,'cat':'overig','freq':'m','day':3,'month':1,'u':1})
        pg.click('#t-instellingen')
        if w<1100 and not pg.is_visible('#bkText'): pg.click('details[data-g="data"] > summary')
        if w>=1100: pg.click('#setNav [data-sg="data"]')
        pg.fill('#bkText',json.dumps(s)); pg.click('#restoreBk'); pg.wait_for_timeout(300)
        pg.click('#t-lasten'); ok('Sportschool nieuw' in pg.inner_text('#v-lasten'),f'{w}: back-up van nu teruggezet')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
