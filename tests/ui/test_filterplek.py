"""Test 2.14.2: het filter staat naast de maandkiezer bij Maand, bovenaan bij Overzicht en Lasten, en is weg bij Instellingen."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8767','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(1440,900),(393,852)]:
        ctx=br.new_context(viewport={'width':w,'height':h},service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8767/')
        par=lambda: pg.evaluate("document.getElementById('filters').parentElement.id||document.getElementById('filters').parentElement.className")
        ok(par()=='fslot-overzicht' and pg.is_visible('#filters'),f'{w}: filter bovenaan Overzicht')
        pg.click('#t-maand'); ok(par()=='mhead' and pg.evaluate("document.querySelector('#v-maand .month').nextElementSibling.id")=='filters','%d: filter naast maandkiezer'%w)
        if w>1000:
            m=pg.locator('#v-maand .month').bounding_box(); f=pg.locator('#filters').bounding_box()
            ok(abs((m['y']+m['height']/2)-(f['y']+f['height']/2))<3 and f['x']>m['x']+m['width'],'filter op dezelfde regel als de maand')
        pg.click('#filters [data-filter=samen]'); ok('gezamenlijk' in pg.inner_text('#dueLbl').lower(),f'{w}: filter werkt bij Maand')
        pg.click('#t-lasten'); ok(par()=='fslot-lasten' and pg.get_attribute('#filters [data-filter=samen]','aria-pressed')=='true',f'{w}: filter bovenaan Lasten, keuze behouden')
        pg.click('#filters [data-filter=alle]')
        pg.click('#t-instellingen'); ok(not pg.is_visible('#filters'),f'{w}: filter weg bij Instellingen')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
