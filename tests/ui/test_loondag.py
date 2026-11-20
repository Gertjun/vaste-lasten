"""Test 2.18.0 (bijgewerkt in 2.23.2): loondag met weekend en feestdagen, het blok Tot je loon in het Overzicht en Eerstvolgende tot je loon."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8776','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
with sync_playwright() as p:
    br=p.chromium.launch()
    def page(when,w=393,scheme='light'):
        ctx=br.new_context(viewport={'width':w,'height':852},is_mobile=w<500,has_touch=w<500,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time(when); pg.goto('http://localhost:8776/'); return ctx,pg,errs
    def huis(pg):
        pg.click('#t-instellingen')
        if pg.is_visible('#setNav'): pg.click('#setNav [data-sg="huis"]')   # laptop: lijst met koppen (sinds 2.23.2)
    def setday(pg,v):
        huis(pg); pg.fill('#p-day',v); pg.click('#p-save')
    for w in [393,1440]:
        # 29 oktober 2026: vorige loon vrijdag 23 oktober (25 oktober is zondag), volgende woensdag 25 november
        ctx,pg,errs=page('2026-10-29T10:00:00',w)
        ok(pg.locator('.ov-pay').count()==0,f'{w}: zonder loondag geen blok Tot je loon')
        ok('Energie' not in pg.inner_text('.ov-next'),f'{w}: zonder loondag Eerstvolgende twee weken vooruit')
        huis(pg); ok(pg.is_visible('#p-day'),f'{w}: loondag staat bij Huishouden')
        setday(pg,'40'); ok('1 tot en met 31' in pg.inner_text('#p-err'),f'{w}: ongeldige dag geweigerd')
        setday(pg,'25'); ok('woensdag 25 november' in pg.inner_text('#payPanel'),f'{w}: volgende loon woensdag 25 november')
        pg.click('#t-overzicht'); c=pg.inner_text('.ov-pay')
        ok('over 27 dagen' in c,f'{w}: over 27 dagen')
        ok('267,00' in c and '4 lasten' in c,f'{w}: eigen lasten 23 okt t/m 24 nov = € 267,00 (4 lasten)')
        ok('2 lasten hebben een datum die voorbij is' in c,f'{w}: 25 en 27 oktober staan nog open')
        ok('23 oktober' in c,f'{w}: vorige loon vrijdag 23 oktober')
        ok('Energie' in pg.inner_text('.ov-next'),f'{w}: Eerstvolgende loopt door tot je loon (15 november)')
        order=pg.evaluate("[...document.querySelectorAll('#v-overzicht .card')].filter(c=>c.offsetParent).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top||a.getBoundingClientRect().left-b.getBoundingClientRect().left).map(c=>c.classList[1])")
        ok(order.index('ov-pay')<order.index('ov-month') and order[0] in ('ov-alert','ov-pay'),f'{w}: Tot je loon staat bovenaan, na contracten ({order})')
        pg.click('.ov-next [data-toggle="vbe0"][data-key="2026-11"]'); c=pg.inner_text('.ov-pay')
        ok('114,65' in c and '152,35 afgeschreven' in c,f'{w}: afvinken telt als afgeschreven')
        pg.click('#filters [data-filter=samen]'); ok(pg.locator('.ov-pay').count()==0,f'{w}: niet bij Gezamenlijk')
        pg.click('#filters [data-filter=eigen]'); ok(pg.locator('.ov-pay').count()==1,f'{w}: wel bij Eigen')
        pg.click('#filters [data-filter=alle]')
        pg.screenshot(path=SP+f'loondag-{w}.png',full_page=True)
        pg.reload(); ok(pg.locator('.ov-pay').count()==1,f'{w}: loondag onthouden na herladen')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    # feestdagen en korte maanden
    for when,day,exp,why in [('2026-12-20T10:00:00','25','donderdag 24 december','Eerste Kerstdag'),
                             ('2028-05-10T10:00:00','25','woensdag 24 mei','Hemelvaartsdag'),
                             ('2026-11-10T10:00:00','31','maandag 30 november',None),
                             ('2027-03-20T10:00:00','26','donderdag 25 maart','Goede Vrijdag'),
                             ('2026-10-20T10:00:00','25','vrijdag 23 oktober','zondag')]:
        ctx,pg,errs=page(when); setday(pg,day); t=pg.inner_text('#payPanel')
        ok(exp in t and (why is None or why in t),f'{when[:10]} dag {day}: {exp}'+(f' ({why})' if why else ''))
        pg.click('#t-overzicht'); ok(exp in pg.inner_text('.ov-pay') and not errs,f'{when[:10]}: ook in het Overzicht {errs}')
        ctx.close()
    # loondag vandaag: telt als vorige, volgende is volgende maand
    ctx,pg,errs=page('2026-11-25T09:00:00'); setday(pg,'25')
    ok('vrijdag 25 december' not in pg.inner_text('#payPanel') and 'donderdag 24 december' in pg.inner_text('#payPanel'),'25 nov: volgende loon 24 december')
    pg.click('#t-overzicht'); ok('25 november' in pg.inner_text('.ov-pay'),'25 nov: afgeschreven sinds je loon op 25 november')
    ctx.close()
    # donker op de laptop
    ctx,pg,errs=page('2026-10-29T10:00:00',1440,'dark'); setday(pg,'25'); pg.click('#t-overzicht')
    pg.screenshot(path=SP+'loondag-1440-donker.png',full_page=True); ok(not errs,'donker: geen fouten'); ctx.close()
    br.close()
srv.terminate()
