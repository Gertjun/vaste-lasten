"""Test 2.26.0 (bijgewerkt in 2.27.0 en 2.28.0): Gezamenlijke rekening in het Overzicht met een gedeeld vast percentage van het netto inkomen.
Ieder ziet de eigen bijdrage, en die van de ander zodra die het inkomen heeft ingevuld (sinds 2.28.0 altijd gedeeld). Met beide bedragen: wat er overblijft of te weinig is.
Sinds 2.27.0 kun je bij Verdeling zelf een bedrag voor je partner invullen; dat geldt tot je partner het inkomen invult."""
import os,subprocess,time,re,json
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8794','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
eur=lambda s: [float(x.replace('.','').replace(',','.')) for x in re.findall(r'€\s?([\d.]+,\d\d)',s)]
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-11-10T10:00:00'); pg.goto('http://localhost:8794/')
        def huis():
            pg.click('#t-instellingen')
            if pg.is_visible('#setNav'): pg.click('#setNav [data-sg="huis"]')
        def kaart():
            pg.click('#t-overzicht'); return pg.inner_text('.ov-inleg'),pg.locator('.ov-inleg .inleg > div').all_inner_texts()
        t,cells=kaart(); a,b=eur(cells[0])[0],eur(cells[1])[0]; tot=eur(t)[0]
        ok('Dit maakt ieder maandelijks over' in t and abs(a+b-tot)<0.01,f'{w}: zonder percentage de verdeling van de lasten ({a} + {b} = {tot})')
        huis(); pg.fill('#i-inc','4000'); pg.click('#i-save'); pg.fill('#m-ctr','75'); pg.click('#m-save')
        t,cells=kaart()
        ok('ieder 75% van het inkomen' in t,f'{w}: kop noemt het percentage')
        ok('(jij)' in cells[0].lower() and eur(cells[0])==[3000.0],f'{w}: jouw bijdrage € 3.000,00 ({cells[0]!r})')
        ok('onbekend' in cells[1] and 'het inkomen invult' in t and 'zelf een bedrag invullen' in t,f'{w}: bedrag van je partner onbekend zolang die geen inkomen heeft ingevuld, met verwijzing naar invullen')
        # zelf een bedrag voor je partner invullen (sinds 2.27.0)
        huis(); ok(pg.is_visible('#m-est') and 'Partner' in pg.inner_text('label[for="m-est"]'),f'{w}: veld voor het bedrag van je partner bij Verdeling')
        pg.fill('#m-est','abc'); pg.click('#m-save'); ok('bijvoorbeeld 2.100,00' in pg.inner_text('#m-err'),f'{w}: ongeldig bedrag geweigerd')
        pg.fill('#m-est','1.800'); pg.press('#m-est','Enter'); t,cells=kaart(); n=eur(t)
        ok(eur(cells[1])==[1800.0] and 'ingevuld' in cells[1].lower(),f'{w}: ingevuld bedrag € 1.800,00 met label ingevuld ({cells[1]!r})')
        ok(4800.0 in n and 'blijft' in t and 'is ingevuld onder Verdeling' in t,f'{w}: samen € 4.800,00 met uitleg')
        s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
        ok(s['samen']['meta'].get('est',{}).get('p2')==1800,f'{w}: bedrag staat gedeeld in de verdeling')
        pg.locator('.ov-inleg').screenshot(path=SP+f'inleg-{w}-ingevuld.png')
        pg.reload(); huis(); ok(pg.input_value('#m-est')=='1800,00',f'{w}: bedrag onthouden na herladen')
        # je partner vult het inkomen in (zoals het via synchroniseren binnenkomt)
        s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')")); s['samen'].setdefault('inc',{})['p2']={'a':2000,'u':int(time.time()*1000)}
        pg.evaluate("v=>localStorage.setItem('vastelasten.v2',v)",json.dumps(s)); pg.reload()
        t,cells=kaart(); n=eur(t)
        ok(eur(cells[1])==[1500.0] and 'ingevuld' not in cells[1].lower(),f'{w}: gedeeld inkomen gaat voor het ingevulde bedrag: € 1.500,00 (75% van € 2.000,00)')
        ok('Samen' in t and 4500.0 in n and abs(4500-tot-n[n.index(4500.0)+2])<0.01 and 'blijft' in t,f'{w}: samen € 4.500,00, er blijft {4500-tot:.2f} over')
        ok('je inkomen deelt' not in t and pg.locator('#i-share').count()==0,f'{w}: geen vinkje en geen uitleg over delen meer (sinds 2.28.0)')
        pg.screenshot(path=SP+f'inleg-{w}-genoeg.png',full_page=True)
        # te weinig
        huis(); pg.fill('#m-ctr','10'); pg.click('#m-save'); t,cells=kaart()
        ok('te weinig' in t and abs(eur(pg.inner_text('.ov-inleg .inleg-tekort'))[0]-(tot-600))<0.01,f'{w}: 10% is {tot-600:.2f} te weinig')
        bad=pg.evaluate("(()=>{const d=document.createElement('i');d.style.color='var(--bad)';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c})()")
        ok(pg.evaluate("getComputedStyle(document.querySelector('.ov-inleg .inleg-tekort')).color")==bad,f'{w}: tekort in de statuskleur')
        pg.locator('.ov-inleg').screenshot(path=SP+f'inleg-{w}-tekort.png')
        pg.click('#filters [data-filter=eigen]'); ok(pg.locator('.ov-inleg').count()==0,f'{w}: niet bij filter Eigen'); pg.click('#filters [data-filter=alle]')
        # leeg: terug naar de verdeling van de lasten
        huis(); pg.fill('#m-ctr',''); pg.click('#m-save'); t,cells=kaart()
        ok('ieder' not in t.split('\n')[0] and abs(eur(cells[0])[0]-a)<0.01,f'{w}: leeg = weer de verdeling van de lasten')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
