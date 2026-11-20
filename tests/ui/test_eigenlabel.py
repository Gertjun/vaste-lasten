"""Test 2.16.1: eigen lasten hebben een eigen label (Eigen), gezamenlijke het label Samen; regels blijven compact."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8774','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        for scheme in ['light','dark']:
            ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
            pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-29T10:00:00'); pg.goto('http://localhost:8774/')
            pg.click('#t-maand')
            n_e=pg.locator('#v-maand .row:has([data-edit^="vbe"])').count(); n_s=pg.locator('#v-maand .row:has([data-edit^="vbs"])').count()
            ok(n_e>0 and pg.locator('#v-maand .row:has([data-edit^="vbe"]) .chip.eigen').count()==n_e,f'{w} {scheme}: elke eigen last in Maand heeft het label Eigen ({n_e})')
            ok(pg.locator('#v-maand .row:has([data-edit^="vbs"]) .chip.eigen').count()==0 and pg.locator('#v-maand .row:has([data-edit^="vbs"]) .chip.samen').count()==n_s,f'{w} {scheme}: gezamenlijke lasten houden Samen, zonder Eigen')
            st=pg.evaluate("(()=>{const e=getComputedStyle(document.querySelector('#v-maand .chip.eigen')),s=getComputedStyle(document.querySelector('#v-maand .chip.samen'));return [e.color!==s.color, e.boxShadow!=='none', e.backgroundColor!==s.backgroundColor]})()")
            ok(all(st),f'{w} {scheme}: Eigen ziet er anders uit dan Samen {st}')
            hs=pg.evaluate("[...document.querySelectorAll('#v-maand .row')].map(r=>r.getBoundingClientRect().height)")
            ok(max(hs)<=(130 if w<500 else 100),f'{w} {scheme}: regels blijven compact ({max(hs):.0f} px)')
            pg.click('#t-lasten'); ok(pg.locator('#v-lasten [data-edit^="vbe"] .chip.eigen').count()>0,f'{w} {scheme}: label ook bij Lasten')
            pg.click('#t-overzicht'); ok(pg.locator('.ov-next .chip.eigen').count()>0 or pg.locator('.ov-next .row').count()==0,f'{w} {scheme}: label ook in het Overzicht')
            ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w} {scheme}: geen overflow of fouten {errs}')
            ctx.close()
    br.close()
srv.terminate()
