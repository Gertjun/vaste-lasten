"""Test 2.18.1 (bijgewerkt in 2.23.0): op een breed scherm gebruikt de app de volle breedte; het Overzicht krijgt drie kolommen."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8777','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w in [1100,1440,1860,2560]:
        ctx=br.new_context(viewport={'width':w,'height':950},color_scheme='dark',service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-30T10:00:00'); pg.goto('http://localhost:8777/')
        r=pg.evaluate("(()=>{const m=document.querySelector('.main').getBoundingClientRect(),s=document.querySelector('.side').getBoundingClientRect();return {ml:m.left,mr:m.right,sl:s.left,sw:s.width}})()")
        ok(r['sl']<=32 and (w-r['mr']<=32 or r['mr']-r['ml']<=1101),f'{w}: zijbalk links, werkvlak tot de rand of maximaal 1100 px (sinds PR #30), rechts {w-r["mr"]:.0f} px marge')
        ok(abs(r['sw']-236)<=1,f'{w}: zijbalk {r["sw"]:.0f} px')   # sinds 3.8.5 (PR #30) vast 236 px
        cols=pg.evaluate("(()=>{const xs=new Set();document.querySelectorAll('#v-overzicht .card').forEach(c=>{if(c.offsetParent)xs.add(Math.round(c.getBoundingClientRect().left))});return xs.size})()")
        mw=r['mr']-r['ml']
        ok(cols==(3 if mw>=1280 else 2),f'{w}: Overzicht in {cols} kolommen (werkvlak {mw:.0f} px)')
        for t in ['maand','lasten','inzicht','instellingen','overzicht']:
            pg.click('#t-'+t); pg.wait_for_timeout(100)
            ok(pg.evaluate('document.documentElement.scrollWidth')<=w,f'{w}: {t} geen overflow')
        pg.screenshot(path=SP+f'breedte-{w}.png',full_page=True)
        ok(not errs,f'{w}: geen fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
