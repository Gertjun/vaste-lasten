"""Test 2.28.0: met een gedeeld percentage voor de gezamenlijke rekening rekent de app de standaardverdeling uit wat ieder overmaakt,
ook met een ingevuld bedrag voor de partner. Inkomens zijn sinds 2.28.0 gedeeld; een inkomen dat nog alleen in het eigen bestand stond, gaat bij het opstarten mee."""
import os,subprocess,time,re,json
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8795','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-11-10T10:00:00'); pg.goto('http://localhost:8795/')
        def huis():
            pg.click('#t-instellingen')
            if pg.is_visible('#setNav'): pg.click('#setNav [data-sg="huis"]')
        def jij():
            pg.click('#t-maand'); m=re.findall(r'jij (\d+)%',pg.inner_text('#v-maand')); return set(m)
        def store():
            return json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
        def setinc(p,a):
            s=store(); s['samen'].setdefault('inc',{})[p]={'a':a,'u':int(time.time()*1000)} if a else {'a':None,'u':int(time.time()*1000)}
            pg.evaluate("v=>localStorage.setItem('vastelasten.v2',v)",json.dumps(s)); pg.reload()
        ok(jij()=={'50'},f'{w}: standaard 50%')
        # 75% en een ingevuld bedrag voor je partner, maar nog geen eigen inkomen: dan nog het vaste percentage
        huis(); pg.fill('#m-ctr','75'); pg.fill('#m-est','1678'); pg.click('#m-save')
        ok(jij()=={'50'},f'{w}: zonder jouw inkomen blijft het vaste percentage ({jij()})')
        huis(); t=pg.inner_text('#splitPanel')
        ok('Nog niet naar bijdrage' in t and 'van Ik een bedrag bekend is' in t,f'{w}: uitleg dat jouw bedrag ontbreekt')
        # jouw inkomen invullen: aandeel volgt de bijdragen, 3.123,56 tegenover 1.678,00 = 65%
        pg.fill('#i-inc','4164,75'); pg.click('#i-save')
        ok(store()['samen']['inc']['p1']['a']==4164.75 and pg.locator('#i-share').count()==0,f'{w}: inkomen staat gedeeld, zonder vinkje')
        ok(jij()=={'65'},f'{w}: jouw aandeel 65% ({jij()})')
        huis(); t=pg.inner_text('#splitPanel')
        ok('Volgt jullie bijdragen: Ik 65%, Partner 35%' in t,f'{w}: Verdeling toont de berekende verdeling')
        pg.locator('#splitPanel').screenshot(path=SP+f'aandeel-{w}.png')
        # een gedeeld inkomen van je partner gaat voor het ingevulde bedrag: 75% van 2.237,33 = 1.678,00, dus ook 65%
        setinc('p2',2237.33); ok(jij()=={'65'},f'{w}: met gedeeld inkomen partner nog steeds 65%')
        huis(); pg.fill('#m-est','4000'); pg.click('#m-save'); ok(jij()=={'65'},f'{w}: ingevuld bedrag telt niet zolang het inkomen gedeeld is')
        # partner heeft geen inkomen meer ingevuld: dan het ingevulde bedrag, 3.123,56 tegenover 4.000,00 = 44%
        setinc('p2',None); ok(jij()=={'44'},f'{w}: met ingevuld bedrag van 4.000 jouw aandeel 44% ({jij()})')
        # een eigen verdeling bij een last blijft voorgaan
        s=store(); it=s['samen']['items'][0]; it['split']=80; it['u']=int(time.time()*1000)
        row=[x for x in s['samen']['items'] if x.get('split') is None and x.get('freq')=='m'][0]; row['payer']='p1'; row['u']=int(time.time()*1000); row=row['id']
        pg.evaluate("v=>localStorage.setItem('vastelasten.v2',v)",json.dumps(s)); pg.reload()
        ok(jij()=={'44','80'},f'{w}: een last met een eigen verdeling houdt die ({jij()})')
        # afvinken van een last die jij zelf betaalt legt het berekende aandeel vast voor het verrekenen
        pg.click('#t-maand'); pg.click(f'#v-maand [data-toggle="{row}"]'); s=store(); k=[k for k in s['samen']['paid'] if row in s['samen']['paid'][k]][0]
        ok(s['samen']['paid'][k][row].get('sh')==44,f'{w}: afvinken bewaart 44% voor het verrekenen')
        # percentage leeg: terug naar het vaste percentage
        huis(); pg.fill('#m-ctr',''); pg.click('#m-save'); ok(jij()=={'50','80'},f'{w}: zonder percentage weer het vaste percentage ({jij()})')
        # een inkomen dat nog alleen in het eigen bestand staat (van vóór 2.28.0), gaat bij het opstarten mee naar het gezamenlijke bestand
        s=store(); s['samen']['inc']['p1']={'a':None,'u':1}; s['eigen']['prof']['income']=3000
        pg.evaluate("v=>localStorage.setItem('vastelasten.v2',v)",json.dumps(s)); pg.reload(); pg.wait_for_timeout(200)
        ok(store()['samen']['inc']['p1']['a']==3000,f'{w}: oud privé-inkomen gaat bij opstarten mee naar het gezamenlijke bestand')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
