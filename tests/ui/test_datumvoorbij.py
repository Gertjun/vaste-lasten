"""Test 2.15.0: Datum voorbij apart in Maand en Overzicht, en aan het eind van de maand de eerste afschrijvingen van de volgende maand."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8770','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    def page(when,w=393):
        ctx=br.new_context(viewport={'width':w,'height':852},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time(when); pg.goto('http://localhost:8770/'); return ctx,pg,errs
    # 12 oktober: 1, 5, 8 en 10 oktober voorbij, plus 28 september
    ctx,pg,errs=page('2026-10-12T10:00:00')
    t=pg.inner_text('.ov-next')
    ok('Datum voorbij' in t and 'SEP' in t.upper(),'12 okt: Datum voorbij met eind september')
    late=pg.locator('.ov-next .subh.late + .list .row').count(); ok(late==5,f'12 okt: vijf getoond ({late})')
    ok('Nog 1 meer in Maand' in t,'12 okt: verwijzing naar de rest')
    pg.click('#t-maand'); m=pg.inner_text('#maandList')
    ok('Datum voorbij' in m and m.index('Datum voorbij')<m.index('Nog te betalen'),'12 okt: Maand toont Datum voorbij boven Nog te betalen')
    ok(pg.locator('#maandList .colh.late').count()==1,'12 okt: één kop Datum voorbij')
    pg.click('#v-maand [data-toggle="vbs0"]'); ok('Datum voorbij' in pg.inner_text('#maandList'),'12 okt: afvinken werkt')
    pg.click('#next'); ok('Datum voorbij' not in pg.inner_text('#maandList'),'12 okt: volgende maand heeft geen Datum voorbij')
    ok(not errs,'12 okt: geen fouten '+str(errs)); ctx.close()
    # 29 oktober: november erbij in Eerstvolgende
    ctx,pg,errs=page('2026-10-29T10:00:00')
    rows=pg.locator('.ov-next .subh:not(.late) + .list .row')
    t=rows.all_inner_texts(); ok(any('NOV' in r.upper() for r in t),'29 okt: november staat bij Eerstvolgende')
    nov=pg.locator('.ov-next .subh:not(.late) + .list [data-toggle][data-key="2026-11"]').first; ok(nov.count()==1,'29 okt: vinkje voor november')
    nid=nov.get_attribute('data-toggle'); nov.click()
    pg.click('#t-maand'); pg.click('#next'); ok(pg.locator(f'#v-maand .row.paid:has([data-toggle="{nid}"])').count()==1,'29 okt: afgevinkt in november')
    ok(pg.evaluate('document.documentElement.scrollWidth')<=393 and not errs,'29 okt: geen overflow of fouten '+str(errs)); ctx.close()
    # 3 oktober: geen statuslabel met een negatief aantal dagen, wel Vandaag/Over
    ctx,pg,errs=page('2026-10-03T10:00:00')
    pg.click('#t-maand'); m=pg.inner_text('#maandList'); ok('Over 2 dagen' in m and '-' not in ''.join(x for x in m.split() if x.startswith('Over')),'3 okt: Over 2 dagen klopt')
    ctx.close()
    br.close()
srv.terminate()
