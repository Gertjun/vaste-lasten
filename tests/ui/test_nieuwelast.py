"""Test 2.14.3: Nieuwe last bedekt geen afschrijving meer; op telefoon en iPad staat hij bij Lasten in de werkbalk."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8768','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(820,1180),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},has_touch=w<1000,is_mobile=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8768/')
        if w<1100:
            for t in ['overzicht','maand']:
                pg.click('#t-'+t); ok(not pg.is_visible('#addBtn') and not pg.is_visible('#addBtn2'),f'{w}: geen zwevende knop bij {t}')
            pg.click('#t-maand'); pg.click('#v-maand [data-toggle="vbs1"]'); ok(pg.locator('#v-maand .row.paid').count()==1,f'{w}: tweede last af te vinken')
            pg.click('#t-lasten'); ok(pg.is_visible('#addBtn2'),f'{w}: Nieuwe last bij Lasten')
            b=pg.locator('#addBtn2').bounding_box(); ok(b['height']>=40,f'{w}: knop groot genoeg ({b["height"]:.0f} px)')
            pg.click('#addBtn2')
        else:
            ok(pg.is_visible('.side #addBtn') and not pg.is_visible('#addBtn2'),f'{w}: knop in de zijbalk onder de naam')   # sinds 2.24.4; 2.23.0 tot 2.24.3 in de paginakop
            pg.click('#addBtn')
        ok(not pg.is_hidden('#scrim'),f'{w}: formulier opent')
        pg.click('#cancelBtn')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
