"""Test 2.15.1 (bijgewerkt in 2.23.2): Instellingen in groepen die je in- en uitklapt. Synchronisatie bovenaan, Gegevens bevat exporteren en back-up, keuze wordt onthouden. Sinds 2.23.2 op de telefoon en de iPad staand; de laptop staat in test_instellijst.py."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8771','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(820,1180)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8771/')
        pg.click('#t-instellingen')
        gs=pg.evaluate("[...document.querySelectorAll('#v-instellingen details.set-group')].map(d=>d.dataset.g+':'+d.open)")
        ok(gs==['sync:true','huis:true','weer:false','data:false','over:false'],f'{w}: volgorde en standaard open {gs}')
        ok('Niet gekoppeld' in pg.inner_text('#syncSt'),f'{w}: status Niet gekoppeld in de kop')
        ok(pg.is_visible('#s-owner'),f'{w}: koppelen direct zichtbaar')
        ok(not pg.is_visible('#x-xlsx') and not pg.is_visible('#copyBk'),f'{w}: Gegevens dicht')
        pg.click('details[data-g="data"] > summary'); ok(pg.is_visible('#x-xlsx') and pg.is_visible('#copyBk'),f'{w}: Gegevens bevat exporteren en back-up')
        pg.click('details[data-g="huis"] > summary'); pg.wait_for_timeout(150); ok(not pg.is_visible('#m-split'),f'{w}: Huishouden inklappen')
        pg.reload(); pg.click('#t-instellingen')
        ok(pg.evaluate("document.querySelector('details[data-g=\"data\"]').open && !document.querySelector('details[data-g=\"huis\"]').open"),f'{w}: keuze onthouden na herladen')
        pg.click('#verBtn'); pg.wait_for_timeout(400); ok(pg.evaluate("document.querySelector('details[data-g=\"over\"]').open"),f'{w}: versie tikken opent Over de app')
        hs=pg.locator('#v-instellingen details.set-group > summary').evaluate_all('a=>a.map(s=>s.getBoundingClientRect().height)'); ok(min(hs)>=44,f'{w}: koppen minstens 44 px')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
