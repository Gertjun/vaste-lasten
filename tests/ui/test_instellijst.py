"""Test 2.23.2 (bijgewerkt in 2.23.3): Instellingen op de laptop (vanaf 1100 px) als lijst met koppen links (kolom 1) en de gekozen groep rechts (kolom 2 en 3).
De keuze wordt per apparaat onthouden; op de telefoon en de iPad staand blijven de inklapbare groepen (test_kolommen.py, test_instellingen.py)."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8790','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
GS=['sync','huis','weer','data','over']
VIS="[...document.querySelectorAll('#v-instellingen details.set-group')].filter(d=>d.getClientRects().length).map(d=>d.dataset.g)"
CUR="[...document.querySelectorAll('#setNav [data-sg]')].filter(b=>b.getAttribute('aria-current')==='true').map(b=>b.dataset.sg)"
box=lambda pg,s: pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.width)]}",s)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h,touch in [(1100,800,False),(1180,820,True),(1440,900,False),(1860,1000,False)]:
        ctx=br.new_context(viewport={'width':w,'height':h},has_touch=touch,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8790/')
        pg.click('#t-instellingen'); pg.wait_for_timeout(200)
        ok(pg.is_visible('#setNav'),f'{w}: lijst met koppen zichtbaar')
        names=pg.locator('#setNav [data-sg] .sn-t').all_inner_texts()
        ok(names==['Synchronisatie','Huishouden','Weergave','Gegevens','Over de app'],f'{w}: vijf koppen in volgorde {names}')
        ok(pg.evaluate(VIS)==['sync'] and pg.evaluate(CUR)==['sync'],f'{w}: standaard Synchronisatie gekozen {pg.evaluate(VIS)}')
        ok(pg.is_visible('#s-owner') and not pg.is_visible('details[data-g="sync"] > summary'),f'{w}: inhoud zichtbaar, kop van de groep verborgen')
        ok('Niet gekoppeld' in pg.inner_text('#setNav [data-st="sync"]'),f'{w}: status Niet gekoppeld in de lijst')
        ok(pg.inner_text('#setNav [data-st="weer"]').strip()==pg.inner_text('#weerSt').strip()!='',f'{w}: thema staat in de lijst')
        nav=box(pg,'#setNav'); body=box(pg,'details[data-g="sync"]'); main=box(pg,'#v-instellingen')
        ok(nav[0]==main[0] and body[0]>nav[2] and abs(nav[1]-body[1])<=2,f'{w}: lijst links, inhoud rechts op dezelfde hoogte {nav} {body}')
        ok(abs(body[3]-2*nav[3]-20)<=2,f'{w}: lijst één kolom, inhoud twee kolommen breed ({nav[3]} : {body[3]})')
        hs=pg.locator('#setNav [data-sg]').evaluate_all('a=>a.map(b=>b.getBoundingClientRect().height)'); ok(min(hs)>=44,f'{w}: koppen in de lijst minstens 44 px')
        groups0=pg.evaluate("JSON.parse(localStorage['vastelasten.ui']||'{}').groups||null")
        pg.click('#setNav [data-sg="huis"]'); pg.wait_for_timeout(100)
        ok(pg.evaluate(VIS)==['huis'] and pg.evaluate(CUR)==['huis'],f'{w}: Huishouden kiezen toont alleen Huishouden')
        ok(pg.is_visible('#m-split') and pg.is_visible('#p-day') and not pg.is_visible('#s-owner'),f'{w}: inhoud van Huishouden zichtbaar')
        if w>=1860 and body[3]>=780:   # sinds PR #30 is het werkvlak maximaal 1100 px; dan staan de blokken onder elkaar
            a=box(pg,'#incomePanel'); b=box(pg,'#payPanel')
            ok(a[1]==b[1] and b[0]>a[2],f'{w}: blokken naast elkaar in kolom 2 en 3 {a} {b}')
            # sinds 2.23.3: blokken in een rij even hoog en de knoppen onderaan op één lijn
            ROW="ids=>ids.map(i=>{const p=document.getElementById(i),r=p.getBoundingClientRect(),b=p.querySelector(':scope>.btns');return [Math.round(r.top),Math.round(r.bottom),b?Math.round(b.getBoundingClientRect().bottom):null]})"
            for ids in (['incomePanel','payPanel'],['splitPanel','catPanel']):
                r=pg.evaluate(ROW,ids)
                ok(r[0][:2]==r[1][:2],f'{w}: {ids[0]} en {ids[1]} even hoog {r}')
            r=pg.evaluate(ROW,['incomePanel','payPanel'])
            ok(abs(r[0][2]-r[1][2])<=1,f'{w}: knoppen Inkomen opslaan en Loondag opslaan op één lijn {r}')
        pg.click('#setNav [data-sg="data"]'); pg.wait_for_timeout(100)
        ok(pg.is_visible('#x-xlsx') and pg.is_visible('#copyBk') and pg.evaluate(VIS)==['data'],f'{w}: Gegevens toont exporteren en back-up')
        ok(pg.evaluate("JSON.parse(localStorage['vastelasten.ui']||'{}').groups||null")==groups0,f'{w}: kiezen verandert de open groepen van de telefoon niet')
        pg.reload(); pg.click('#t-instellingen'); pg.wait_for_timeout(200)
        ok(pg.evaluate(VIS)==['data'] and pg.evaluate(CUR)==['data'],f'{w}: keuze onthouden na herladen')
        pg.click('#verBtn'); pg.wait_for_timeout(400)
        if w>=1860 and body[3]>=780:
            pg.evaluate("window.dispatchEvent(new Event('beforeinstallprompt'))"); pg.wait_for_timeout(200)
            t=pg.evaluate("['aboutPanel','installPanel'].map(i=>{const e=document.getElementById(i);return e?[Math.round(e.getBoundingClientRect().top),Math.round(e.getBoundingClientRect().bottom)]:null})")
            ok(t[1] is not None and t[0][0]==t[1][0] and t[1][1]-t[1][0]<400,f'{w}: Over de app: Op je startscherm op één lijn met Versie en niet uitgerekt naast de wijzigingen {t}')
        ok(pg.evaluate(VIS)==['over'] and pg.is_visible('#aboutPanel'),f'{w}: versie tikken opent Over de app')
        pg.evaluate("document.getElementById('syncPill').click()"); pg.wait_for_timeout(400)
        ok(pg.evaluate(VIS)==['sync'] and pg.is_visible('#syncPanel'),f'{w}: status bovenin opent Synchronisatie')
        pg.focus('#setNav [data-sg="sync"]'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
        ok(pg.evaluate(VIS)==['weer'],f'{w}: met pijltjes en Enter naar Weergave')
        pg.keyboard.press('ArrowUp'); pg.keyboard.press('ArrowUp'); pg.keyboard.press('ArrowUp')
        ok(pg.evaluate("document.activeElement.dataset.sg")=='over',f'{w}: pijltje omhoog gaat rond naar onderen')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w,f'{w}: geen overflow')
        if w==1440:
            # smaller venster: terug naar inklapbare groepen zoals op de iPad, daarna weer de lijst
            pg.set_viewport_size({'width':820,'height':1000}); pg.wait_for_timeout(200)
            gs=pg.evaluate("[...document.querySelectorAll('#v-instellingen details.set-group')].map(d=>d.dataset.g+':'+d.open)")
            ok(not pg.is_visible('#setNav') and len(pg.evaluate(VIS))==5 and gs[:2]==['sync:true','huis:true'],f'820 na 1440: weer inklapbare groepen {gs}')
            ok(pg.is_visible('details[data-g="data"] > summary'),'820 na 1440: koppen van de groepen zichtbaar')
            pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(200)
            ok(pg.evaluate(VIS)==['weer'],'1440 terug: de gekozen groep blijft gekozen')
        ok(not errs,f'{w}: geen fouten {errs}')
        ctx.close()
    # telefoon: geen lijst, ook niet als er een keuze is opgeslagen
    ctx=br.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True,service_workers='block')
    ctx.add_init_script("localStorage['vastelasten.ui']=JSON.stringify({setSel:'data'})")
    pg=ctx.new_page(); pg.goto('http://localhost:8790/'); pg.click('#t-instellingen'); pg.wait_for_timeout(200)
    ok(not pg.is_visible('#setNav') and len(pg.evaluate(VIS))==5,'393: geen lijst, alle groepen onder elkaar, ook met opgeslagen keuze')
    ctx.close()
    br.close()
srv.terminate()
