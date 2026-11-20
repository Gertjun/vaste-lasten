"""Test 2.16.0: tabblad Inzicht met jaargrafiek, vergelijking, per categorie, Wat als en inkomen; Overzicht kort."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8773','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(820,1180),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<1000,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-29T10:00:00'); pg.goto('http://localhost:8773/')
        tabs=pg.locator('.tab').all_inner_texts(); ok([t.strip() for t in tabs]==['Overzicht','Maand','Lasten','Inzicht','Instellingen'],f'{w}: vijf tabbladen {tabs}')
        ov=pg.locator('#v-overzicht')
        for c in ['ov-month','ov-next','ov-inleg']: ok(ov.locator('.'+c).count()==1,f'{w}: {c} in Overzicht')
        for c in ['ov-cost','ov-yoy','ov-cats','ov-scen','ov-income']: ok(ov.locator('.'+c).count()==0,f'{w}: {c} niet meer in Overzicht')
        pg.click('#t-inzicht'); ins=pg.locator('#v-inzicht')
        ok(all(ins.locator('.'+c).count()==1 for c in ['ov-cost','ov-yoy','ov-cats','ov-scen']),f'{w}: grafiek, vergelijking, categorie en Wat als in Inzicht')
        ok(pg.is_visible('#filters') and pg.evaluate("document.getElementById('filters').parentElement.id")=='fslot-inzicht',f'{w}: filter bovenaan Inzicht')
        pg.click('#filters [data-filter=eigen]'); ok('Jouw kosten' in pg.inner_text('.ov-cost h3'),f'{w}: filter werkt in Inzicht')
        pg.click('#filters [data-filter=alle]')
        pg.click('#v-inzicht [data-scen=""]'); ok(not pg.is_hidden('#scenScrim'),f'{w}: Wat als opent'); pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        if not pg.is_hidden('#scenScrim'): pg.click('#scenScrim .btn:not(.primary)')
        pg.locator('#v-inzicht [data-month="2"]').first.click(); ok(pg.locator('#v-maand').is_visible() and 'maart' in pg.inner_text('#monthLabel').lower(),f'{w}: maand in de grafiek opent Maand')
        if w>1000:
            pg.keyboard.press('4'); ok(pg.locator('#v-inzicht').is_visible(),'sneltoets 4 opent Inzicht')
            pg.keyboard.press('5'); ok(pg.locator('#v-instellingen').is_visible(),'sneltoets 5 opent Instellingen')
        pg.click('#t-inzicht')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
