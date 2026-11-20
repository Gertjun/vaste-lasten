"""Test 2.14.4: compacte afschrijvingsregels. Geen label Nog afvinken, labels onder naam en bedrag, regels laag genoeg op de iPhone."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8769','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.clock.set_fixed_time('2026-10-29T12:00:00')
        pg.goto('http://localhost:8769/'); pg.click('#t-maand')
        t=pg.inner_text('#v-maand')
        ok('Nog afvinken' not in t and 'Over -' not in t,f'{w}: geen label Nog afvinken of negatieve dagen')
        hs=pg.evaluate("[...document.querySelectorAll('#v-maand .row')].map(r=>r.getBoundingClientRect().height)")
        ok(len(hs)==11 and max(hs)<=(130 if w<500 else 100),f'{w}: regels hoogstens {max(hs):.0f} px, gemiddeld {sum(hs)/len(hs):.0f} px')
        hyp=pg.locator('#v-maand .row:has([data-edit="vbs0"])')
        ok('jij' in hyp.locator('.amts').inner_text() and 'Samen' in hyp.locator('.meta').inner_text(),f'{w}: jouw deel onder het bedrag, labels eronder')
        pg.click('#v-maand [data-amt="vbs0"]'); ok(not pg.is_hidden('#amtScrim'),f'{w}: tik op bedrag opent werkelijk bedrag'); pg.keyboard.press('Escape')
        pg.click('#t-overzicht'); ok(pg.locator('.ov-next .row').count()>0 and 'Nog afvinken' not in pg.inner_text('.ov-next'),f'{w}: ook in het Overzicht compact')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
