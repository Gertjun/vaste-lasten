"""Test 2.22.1: afschrijvingsregels in Maand en het Overzicht zijn even hoog, met en zonder jouw deel onder het bedrag."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8786','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
JS="sel=>[...document.querySelectorAll(sel)].map(r=>({h:Math.round(r.getBoundingClientRect().height),j:!!r.querySelector('.amts .sub:not(.spacer)'),m:Math.round(r.querySelector('.meta').getBoundingClientRect().height),n:Math.round(r.querySelector('.name').getBoundingClientRect().height)}))"
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(820,1180),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.clock.set_fixed_time('2026-10-29T12:00:00')
        pg.goto('http://localhost:8786/'); pg.click('#t-maand')
        for naam,sel in [('Maand','#v-maand .mrow'),('Overzicht','.ov-next .mrow')]:
            if naam=='Overzicht': pg.click('#t-overzicht')
            rs=pg.evaluate(JS,sel)
            # regels met even veel labelregels moeten even hoog zijn, met of zonder jouw deel
            groepen={0:[]}
            for r in rs: groepen[0].append(r)

            ok(len(rs)>3 and any(r['j'] for r in rs) and any(not r['j'] for r in rs),f'{w} {naam}: regels met en zonder jouw deel')
            ok(all(max(x['h'] for x in g)-min(x['h'] for x in g)<=1 for g in groepen.values()),f'{w} {naam}: even hoog ({sorted(set(r["h"] for r in rs))} px)')
        ok(pg.locator('.mrow .spacer').first.get_attribute('aria-hidden')=='true','lege regel is verborgen voor de schermlezer')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
