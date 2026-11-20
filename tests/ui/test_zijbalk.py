"""Test 2.23.0 (bijgewerkt in 2.24.4): de zijbalk op laptop en iPad liggend is een eigen vlak over de volle hoogte en klapt in tot pictogrammen
(onthouden per apparaat). Sinds 2.24.4 staat Nieuwe last in de zijbalk onder de naam en boven Overzicht, en de synchronisatiestatus
onder het versienummer; de paginakop heeft alleen nog de titel."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8788','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
NAMES={'overzicht':'Overzicht','maand':'Maand','lasten':'Lasten','inzicht':'Inzicht','instellingen':'Instellingen'}
BOX="(()=>{const s=document.querySelector('.side'),m=document.querySelector('.main'),r=s.getBoundingClientRect(),cs=getComputedStyle(s);return {sl:r.left,st:r.top,sw:r.width,sh:r.height,mw:m.getBoundingClientRect().width,bg:cs.backgroundColor,body:getComputedStyle(document.body).backgroundColor,br:cs.borderRightWidth}})()"
COLS="(()=>{const xs=new Set();document.querySelectorAll('#v-overzicht .card').forEach(c=>{if(c.offsetParent)xs.add(Math.round(c.getBoundingClientRect().left))});return xs.size})()"
R="s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}}"
# een gekoppeld apparaat zonder sleutels: de status toont Wachtwoord nodig (GitHub wordt niet bereikt)
LINK="localStorage.setItem('vastelasten.v2.sync',JSON.stringify({owner:'geert',repo:'vaste-lasten-data',token:'tok',me:'p1',salt:{samen:'a',eigen:'b'}}))"
overflow=lambda pg,w: pg.evaluate('document.documentElement.scrollWidth')-w
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h,touch,scheme in [(1100,800,False,'light'),(1440,900,False,'dark'),(1860,950,False,'dark'),(1180,820,True,'light')]:
        tag=f'{w}'+(' aanraak' if touch else '')
        ctx=br.new_context(viewport={'width':w,'height':h},has_touch=touch,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-11-04T10:00:00'); pg.goto('http://localhost:8788/')
        b=pg.evaluate(BOX)
        ok(b['sl']==0 and b['st']==0 and abs(b['sh']-h)<=1,f'{tag}: zijbalk tegen de linkerkant over de volle hoogte ({b["sl"]:.0f},{b["st"]:.0f}, {b["sh"]:.0f} px hoog)')
        ok(b['bg']!=b['body'] and b['br']=='1px',f'{tag}: zijbalk is een eigen vlak met een rand ({b["bg"]} op {b["body"]})')
        ok(abs(b['sw']-236)<=1,f'{tag}: zijbalk {b["sw"]:.0f} px breed')   # sinds 3.8.5 (PR #30) 236 px, gelijk aan de andere apps
        pg.mouse.wheel(0,1500); pg.wait_for_timeout(150)
        ok(abs(pg.locator('.side').bounding_box()['y'])<1,f'{tag}: zijbalk blijft staan bij scrollen')
        pg.mouse.wheel(0,-3000)
        # paginakop: alleen de titel
        for t,n in NAMES.items():
            pg.click('#t-'+t); ok(pg.inner_text('#pTitle')==n,f'{tag}: titel {n}')
            ok(overflow(pg,w)<=0,f'{tag}: {t} geen overflow')
        pg.click('#t-overzicht')
        ok(pg.locator('.phead button').count()==0,f'{tag}: paginakop heeft alleen de titel')
        # Nieuwe last in de zijbalk: onder de naam, boven Overzicht, zo breed als de tabbladen (sinds 2.24.4)
        a=pg.evaluate(R,'#addBtn'); nm=pg.evaluate(R,'.brand-t'); ov=pg.evaluate(R,'#t-overzicht'); vb=pg.evaluate(R,'#verBtn')
        ok(pg.is_visible('.side #addBtn'),f'{tag}: Nieuwe last staat in de zijbalk')
        ok(a['y']>=vb['b'] and a['b']<=ov['y'],f'{tag}: Nieuwe last onder de naam en de versie, boven Overzicht ({a["y"]:.0f}-{a["b"]:.0f}, Overzicht vanaf {ov["y"]:.0f})')
        ok(abs(a['x']-ov['x'])<=1 and abs(a['r']-ov['r'])<=1 and a['h']>=40,f'{tag}: knop even breed als de tabbladen ({a["w"]:.0f} px, {a["h"]:.0f} px hoog)')
        ok(pg.inner_text('#addBtn').strip().endswith('Nieuwe last'),f'{tag}: knop zegt Nieuwe last')
        pg.click('#addBtn'); ok(not pg.is_hidden('#scrim'),f'{tag}: Nieuwe last opent het formulier'); pg.click('#cancelBtn')
        pg.keyboard.press('n'); ok(not pg.is_hidden('#scrim'),f'{tag}: sneltoets N werkt nog'); pg.click('#cancelBtn')
        ok(pg.evaluate("document.getElementById('syncPill').parentElement.id")=='brandMeta',f'{tag}: plek van de synchronisatiestatus is bij de versie')
        tb=pg.locator('#sideTog').bounding_box(); ok(tb['width']>=(44 if touch else 32),f'{tag}: knop inklappen groot genoeg ({tb["width"]:.0f} px)')
        ok(pg.get_attribute('#sideTog','aria-expanded')=='true' and pg.get_attribute('#sideTog','aria-label')=='Zijbalk inklappen',f'{tag}: knop zegt Zijbalk inklappen')
        ok(abs(nm['y']+nm['h']/2-(tb['y']+tb['height']/2))<6,f'{tag}: naam en knop inklappen op één regel')
        cols0=pg.evaluate(COLS)
        pg.screenshot(path=SP+f'zijbalk-{w}-uit.png')
        # inklappen
        pg.click('#sideTog'); pg.wait_for_timeout(150); b2=pg.evaluate(BOX)
        ok(abs(b2['sw']-68)<=1 and pg.evaluate("document.documentElement.classList.contains('side-mini')"),f'{tag}: ingeklapt tot {b2["sw"]:.0f} px')
        ok(b2['mw']>=b['mw'],f'{tag}: werkvlak niet smaller ({b2["mw"]-b["mw"]:.0f} px breder; sinds PR #30 maximaal 1100 px)')
        ok(pg.get_attribute('#sideTog','aria-expanded')=='false' and pg.get_attribute('#sideTog','aria-label')=='Zijbalk uitklappen',f'{tag}: knop zegt nu Zijbalk uitklappen')
        ok(not pg.is_visible('.brand-t') and pg.is_visible('.brand i'),f'{tag}: alleen het pictogram van de app')
        tabs=pg.evaluate("[...document.querySelectorAll('.tab')].map(t=>({w:t.getBoundingClientRect().width,txt:t.querySelector('span').getBoundingClientRect().width,title:t.title}))")
        ok(all(t['txt']<=1 and t['title'] for t in tabs),f'{tag}: alleen pictogrammen, naam als tooltip')
        ok(pg.get_by_role('tab',name='Maand').count()==1,f'{tag}: schermlezer kent de namen nog')
        a=pg.evaluate(R,'#addBtn'); sd=pg.evaluate(R,'.side'); ov=pg.evaluate(R,'#t-overzicht')
        ok(pg.is_visible('#addBtn') and 44<=a['w']<=48 and 44<=a['h']<=48 and a['b']<=ov['y'],f'{tag} ingeklapt: Nieuwe last als plusknop boven Overzicht ({a["w"]:.0f}x{a["h"]:.0f})')
        ok(abs((a['x']+a['r'])/2-(sd['x']+sd['r'])/2)<=2,f'{tag} ingeklapt: plusknop in het midden')
        ok(pg.get_by_role('button',name='Nieuwe last').count()==1 and pg.get_attribute('#addBtn','title')=='Nieuwe last (N)',f'{tag} ingeklapt: schermlezer en tooltip zeggen Nieuwe last')
        pg.click('#addBtn'); ok(not pg.is_hidden('#scrim'),f'{tag} ingeklapt: plusknop opent het formulier'); pg.click('#cancelBtn')
        pg.click('#t-lasten'); ok(pg.is_visible('#v-lasten') and pg.inner_text('#pTitle')=='Lasten',f'{tag}: ingeklapt een onderdeel kiezen werkt')
        for t in NAMES: pg.click('#t-'+t); ok(overflow(pg,w)<=0,f'{tag} ingeklapt: {t} geen overflow')
        pg.click('#t-overzicht'); mw=pg.evaluate("document.querySelector('.main').getBoundingClientRect().width")
        ok(pg.evaluate(COLS)==(3 if mw>=1280 else 2),f'{tag} ingeklapt: Overzicht in {pg.evaluate(COLS)} kolommen (werkvlak {mw:.0f} px, was {cols0})')
        pg.screenshot(path=SP+f'zijbalk-{w}-in.png')
        pg.reload(); pg.wait_for_timeout(200)
        ok(abs(pg.evaluate(BOX)['sw']-68)<=1,f'{tag}: ingeklapt onthouden na herladen')
        if not touch:
            pg.keyboard.press('['); pg.wait_for_timeout(100); ok(abs(pg.evaluate(BOX)['sw']-236)<=1,f'{tag}: sneltoets [ klapt weer uit')
            pg.click('#t-lasten'); pg.click('#l-q'); pg.keyboard.press('['); ok(pg.input_value('#l-q')=='[' and abs(pg.evaluate(BOX)['sw']-236)<=1,f'{tag}: [ in het zoekveld klapt niets in')
        else:
            pg.click('#sideTog'); pg.wait_for_timeout(100); ok(abs(pg.evaluate(BOX)['sw']-236)<=1,f'{tag}: weer uitgeklapt')
        ok(not errs,f'{tag}: geen fouten {errs}')
        ctx.close()
        # gekoppeld: de synchronisatiestatus staat direct onder het versienummer (sinds 2.24.4)
        ctx=br.new_context(viewport={'width':w,'height':h},has_touch=touch,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        ctx.route('https://api.github.com/**',lambda r:r.abort())
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.add_init_script(LINK); pg.goto('http://localhost:8788/'); pg.wait_for_timeout(300)
        s=pg.evaluate(R,'#syncPill'); v=pg.evaluate(R,'#verBtn'); sd=pg.evaluate(R,'.side'); a=pg.evaluate(R,'#addBtn')
        ok(pg.is_visible('#syncPill') and 'Wachtwoord nodig' in pg.inner_text('#syncPill'),f'{tag}: status zichtbaar in de zijbalk ({pg.inner_text("#syncPill")})')
        ok(0<=s['y']-v['b']<=4 and abs(s['x']-v['x'])<=1,f'{tag}: status direct onder het versienummer, links uitgelijnd ({s["x"]:.0f},{s["y"]:.0f} onder {v["x"]:.0f},{v["b"]:.0f})')
        ok(s['r']<=sd['r']-8 and s['b']<a['y'],f'{tag}: status past in de zijbalk, boven Nieuwe last')
        ok(not pg.is_visible('.phead #syncPill'),f'{tag}: status niet meer in de paginakop')
        pg.evaluate("document.getElementById('syncPill').click()"); pg.wait_for_timeout(300)
        ok(pg.is_visible('#syncPanel'),f'{tag}: status tikken opent Synchronisatie')
        pg.screenshot(path=SP+f'zijbalk-{w}-status.png',clip={'x':0,'y':0,'width':300,'height':260})
        # ingeklapt: alleen de stip, met de status als tooltip en voor de schermlezer
        pg.click('#sideTog'); pg.wait_for_timeout(150)
        s=pg.evaluate(R,'#syncPill'); sd=pg.evaluate(R,'.side'); a=pg.evaluate(R,'#addBtn')
        ok(pg.is_visible('#syncPill') and s['w']<=24 and abs((s['x']+s['r'])/2-(sd['x']+sd['r'])/2)<=2 and s['b']<a['y'],f'{tag} ingeklapt: status als stip in het midden ({s["w"]:.0f} px)')
        ok('Wachtwoord nodig' in (pg.get_attribute('#syncPill','aria-label') or '') and 'Wachtwoord nodig' in (pg.get_attribute('#syncPill','title') or 'Wachtwoord nodig'),f'{tag} ingeklapt: status voor de schermlezer')
        pg.screenshot(path=SP+f'zijbalk-{w}-status-in.png',clip={'x':0,'y':0,'width':120,'height':320})
        ok(overflow(pg,w)<=0 and not errs,f'{tag}: gekoppeld geen overflow of fouten {errs}')
        ctx.close()
    # telefoon en iPad staand: niets verandert, ook niet als de zijbalk op dit apparaat ingeklapt was
    for w,h in [(393,852),(820,1180)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=True,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        ctx.route('https://api.github.com/**',lambda r:r.abort())
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('vastelasten.ui',JSON.stringify({side:'mini'}));"+LINK); pg.goto('http://localhost:8788/'); pg.wait_for_timeout(300)
        ok(not pg.is_visible('.phead') and not pg.is_visible('#sideTog'),f'{w}: geen paginakop en geen knop inklappen')
        ok(not pg.is_visible('#addBtn'),f'{w}: geen Nieuwe last bovenin (die staat bij Lasten)')
        ok(pg.evaluate("document.getElementById('syncPill').parentElement.matches('header.top')") and pg.is_visible('#syncPill'),f'{w}: synchronisatiestatus bovenin')
        hb=pg.evaluate(R,'header.top'); s=pg.evaluate(R,'#syncPill')
        ok(s['r']>hb['r']-80 and pg.evaluate("getComputedStyle(document.getElementById('syncPill')).borderTopWidth")=='1px',f'{w}: status rechts bovenin als knop met rand, zoals voorheen')
        ok(pg.evaluate("[...document.querySelectorAll('.tab span')].every(s=>s.getBoundingClientRect().width>10)"),f'{w}: tabbladen met naam')
        ok(pg.is_visible('.brand-t') and pg.is_visible('#verBtn'),f'{w}: naam en versie bovenin')
        ok(overflow(pg,w)<=0 and not errs,f'{w}: geen overflow of fouten {errs}')
        pg.screenshot(path=SP+f'zijbalk-{w}-kop.png',clip={'x':0,'y':0,'width':w,'height':120})
        ctx.close()
    # van breed naar smal: de status en de knop verhuizen mee
    ctx=br.new_context(viewport={'width':1440,'height':900},service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
    pg=ctx.new_page(); pg.goto('http://localhost:8788/')
    pg.set_viewport_size({'width':900,'height':900}); pg.wait_for_timeout(150)
    ok(pg.evaluate("document.getElementById('syncPill').parentElement.matches('header.top')") and not pg.is_visible('#addBtn'),'venster smaller: status terug bovenin, geen Nieuwe last in de kop')
    pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(150)
    ok(pg.evaluate("document.getElementById('syncPill').parentElement.id")=='brandMeta' and pg.is_visible('.side #addBtn'),'venster breder: status weer bij de versie, Nieuwe last weer in de zijbalk')
    ctx.close()
    br.close()
srv.terminate()
