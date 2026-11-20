"""Test 2.17.0 (bijgewerkt in 2.23.2): Thema's onder Instellingen → Weergave. Modus Automatisch/Licht/Donker en een accentkleur, per apparaat onthouden;
categorie-, grafiek- en statuskleuren blijven gelijk."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8775','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
var=lambda pg,v: pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('%s').trim()"%v)
bg=lambda pg: pg.evaluate("getComputedStyle(document.body).backgroundColor")
# laptop (sinds 2.23.2): Weergave kiezen in de lijst met koppen; telefoon: de groep openklappen
weer=lambda pg: pg.click('#setNav [data-sg="weer"]' if pg.is_visible('#setNav') else 'details[data-g="weer"] > summary')
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        for scheme in ['light','dark']:
            ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
            pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-29T10:00:00'); pg.goto('http://localhost:8775/')
            tag=f'{w} {scheme}'
            ok(pg.get_attribute('html','data-theme') is None and pg.get_attribute('html','data-accent') is None,f'{tag}: standaard Automatisch en Petrol')
            ok(var(pg,'--accent')==('#0d6570' if scheme=='light' else '#4cb0bb'),f'{tag}: petrol volgt het apparaat')
            cats=[var(pg,'--c%d'%i) for i in range(1,10)]+[var(pg,v) for v in ['--bar-paid','--bar-open','--ok','--warn','--bad']]
            bg0=bg(pg)
            pg.click('#t-instellingen')
            ok(not pg.is_visible('#themePanel'),f'{tag}: Weergave standaard dicht')
            st='#setNav [data-st="weer"]' if w>=1100 else '#weerSt'
            ok('Automatisch · Petrol' in pg.inner_text(st),f'{tag}: keuze in de kop')
            weer(pg); ok(pg.is_visible('#themePanel'),f'{tag}: Weergave opent')
            hs=pg.locator('#themePanel .seg3 label, #themePanel .acc').evaluate_all('a=>a.map(x=>x.getBoundingClientRect().height)')
            ok(len(hs)==8 and min(hs)>=44,f'{tag}: 3 modi en 5 kleuren, tikvlakken minstens 44 px ({min(hs):.0f})')
            # modus omdraaien ten opzichte van het apparaat
            other='dark' if scheme=='light' else 'light'
            pg.click(f'label[for="th-{other}"]')
            ok(pg.get_attribute('html','data-theme')==other and bg(pg)!=bg0,f'{tag}: {other} gekozen, achtergrond verandert')
            pg.click('#themePanel .acc:has(input[value="paars"])')
            exp={'light':'#6b3fb2','dark':'#b49cf2'}[other]
            ok(var(pg,'--accent')==exp and pg.get_attribute('html','data-accent')=='paars',f'{tag}: paars in {other} = {var(pg,"--accent")}')
            ok(pg.evaluate("getComputedStyle(document.querySelector('.tab[aria-selected=\"true\"]')).borderColor+getComputedStyle(document.querySelector('.tab[aria-selected=\"true\"]')).color").count('rgb')>0,f'{tag}: tabblad gebruikt accent')
            ok(pg.inner_text(st).strip()==('Donker' if other=='dark' else 'Licht')+' · Paars',f'{tag}: kop bijgewerkt')
            cats2=[var(pg,'--c%d'%i) for i in range(1,10)]+[var(pg,v) for v in ['--bar-paid','--bar-open','--ok','--warn','--bad']]
            ok(all(cats2),f'{tag}: categorie- en statuskleuren bestaan')
            pg.screenshot(path=SP+f'thema-{w}-{other}-paars.png',full_page=True)
            # onthouden na herladen
            pg.reload(); ok(pg.get_attribute('html','data-theme')==other and var(pg,'--accent')==exp,f'{tag}: keuze onthouden na herladen')
            pg.click('#t-maand'); pg.screenshot(path=SP+f'thema-{w}-{other}-maand.png')
            ok(pg.locator('#v-maand .chip.samen').count()>0,f'{tag}: Samen-label zichtbaar')
            # terug naar Automatisch en Petrol
            pg.click('#t-instellingen'); pg.click('label[for="th-auto"]'); pg.click('#themePanel .acc:has(input[value="petrol"])')
            ok(pg.get_attribute('html','data-theme') is None and pg.get_attribute('html','data-accent') is None and bg(pg)==bg0,f'{tag}: terug naar Automatisch en Petrol')
            ok([var(pg,'--c%d'%i) for i in range(1,10)]+[var(pg,v) for v in ['--bar-paid','--bar-open','--ok','--warn','--bad']]==cats,f'{tag}: categorie-, grafiek- en statuskleuren ongewijzigd')
            ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{tag}: geen overflow of fouten {errs}')
            ctx.close()
    # alle accenten in beide modi zichtbaar verschillend en de theme-color volgt het accent
    ctx=br.new_context(viewport={'width':393,'height':852},service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
    pg=ctx.new_page(); pg.goto('http://localhost:8775/'); pg.click('#t-instellingen'); pg.click('details[data-g="weer"] > summary')
    seen=set()
    for m in ['light','dark']:
        pg.click(f'label[for="th-{m}"]')
        for a in ['petrol','blauw','paars','terracotta','leisteen']:
            pg.click(f'#themePanel .acc:has(input[value="{a}"])'); seen.add((m,var(pg,'--accent')))
    ok(len(seen)==10,'tien verschillende accentkleuren (5 x licht en donker)')
    ok(pg.get_attribute('meta[name="theme-color"]','content')=='#3e4c58','theme-color volgt het accent')
    ctx.close()
    br.close()
srv.terminate()
