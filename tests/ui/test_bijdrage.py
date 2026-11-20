"""Test 2.25.0 (bijgewerkt in 2.26.0): vaste bijdrage aan de gezamenlijke rekening als percentage van je netto inkomen.
Is die ingevuld, dan zijn je vaste lasten in Inzicht die bijdrage plus je eigen lasten (en je deel van gezamenlijke lasten
die één van jullie zelf betaalt), in plaats van je deel van de gezamenlijke lasten. Wat als rekent hetzelfde.
Sinds 2.26.0 is het percentage gedeeld (Huishouden → Verdeling, meta.contrib); een privé-waarde van 2.25.0 wordt bij opslaan overgenomen."""
import os,subprocess,time,re,json
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8793','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
eur=lambda s: [float(x.replace('.','').replace(',','.')) for x in re.findall(r'−?€\s?([\d.]+,\d\d)',s)]
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-11-10T10:00:00'); pg.goto('http://localhost:8793/')
        def huis():
            pg.click('#t-instellingen')
            if pg.is_visible('#setNav'): pg.click('#setNav [data-sg="huis"]')
        def card():
            pg.click('#t-inzicht'); t=pg.inner_text('.ov-income'); tiles=[eur(x)[0] for x in pg.locator('.ov-income .tiles > div').all_inner_texts()]; return t,tiles
        huis(); ok(pg.is_visible('#m-ctr') and pg.input_value('#m-ctr')=='' and pg.locator('#i-ctr').count()==0,f'{w}: veld voor de bijdrage staat bij Verdeling, standaard leeg')
        pg.fill('#i-inc','4000'); pg.click('#i-save')
        t,(inc,mine0,free0)=card()
        ok(inc==4000 and 'Gezamenlijke lasten tellen voor jouw deel mee.' in t,f'{w}: zonder bijdrage telt jouw deel van de gezamenlijke lasten ({mine0})')
        # ongeldig percentage
        huis(); pg.fill('#m-ctr','120'); pg.click('#m-save'); ok('0 tot en met 100' in pg.inner_text('#m-err'),f'{w}: 120% geweigerd')
        pg.fill('#m-ctr','75'); pg.click('#m-save'); ok(pg.inner_text('#m-err')=='',f'{w}: 75% opgeslagen')
        t,(inc,mine,free)=card(); parts=eur(t.split('% van je inkomen gaat naar vaste lasten',1)[1])
        ok('75% van je inkomen' in t and parts[0]==3000,f'{w}: bijdrage € 3.000,00 (75% van € 4.000,00) {parts}')
        ok(abs(mine-sum(parts))<0.01,f'{w}: jouw vaste lasten = bijdrage + eigen lasten ({mine} = {" + ".join(map(str,parts))})')
        ok(abs(free-(inc-mine))<0.01 and abs(mine-mine0)>1,f'{w}: vrij te besteden {free}, anders dan zonder bijdrage ({free0})')
        pct=int(re.search(r'(\d+)% van je inkomen gaat',t).group(1)); ok(pct==round(mine/inc*100),f'{w}: percentage en balk kloppen ({pct}%)')
        # Wat als rekent hetzelfde
        pg.click('#v-inzicht [data-scen=""]'); row=[r for r in pg.locator('#sc-res tr').all_inner_texts() if r.startswith('Vrij te besteden')]
        ok(row and abs(eur(row[0])[0]-free)<0.01,f'{w}: Wat als: vrij te besteden nu {eur(row[0]) if row else None}')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        if not pg.is_hidden('#scenScrim'): pg.click('#scenScrim .btn:not(.primary)')
        # het percentage is gedeeld, het inkomen niet
        s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
        ok(s['samen']['meta'].get('contrib')==75 and s['samen']['inc']['p1']['a']==4000,f'{w}: percentage en inkomen gedeeld (sinds 2.28.0)')
        pg.screenshot(path=SP+f'bijdrage-{w}.png',full_page=True)
        # onthouden na herladen, ook met Enter en een komma
        pg.reload(); huis(); ok(pg.input_value('#m-ctr')=='75',f'{w}: 75 staat er na herladen')
        pg.fill('#m-ctr','62,5'); pg.press('#m-ctr','Enter'); t,(inc,mine,free)=card()
        ok('62,5% van je inkomen' in t and eur(t.split('gaat naar vaste lasten',1)[1])[0]==2500,f'{w}: Enter slaat op, 62,5% geeft € 2.500,00')
        # loondag opslaan laat de bijdrage staan
        huis(); pg.fill('#p-day','25'); pg.click('#p-save'); t,_=card(); ok('62,5%' in t,f'{w}: loondag opslaan bewaart de bijdrage')
        # leeg maken: terug naar jouw deel
        huis(); pg.fill('#m-ctr',''); pg.click('#m-save'); t,(inc,mine,free)=card()
        ok('Gezamenlijke lasten tellen voor jouw deel mee.' in t and abs(mine-mine0)<0.01,f'{w}: leeg = weer jouw deel van de gezamenlijke lasten')
        huis(); pg.screenshot(path=SP+f'bijdrage-instellingen-{w}.png')
        lb=pg.evaluate("['m-split','m-ctr'].map(i=>Math.round(document.getElementById(i).getBoundingClientRect().top))")
        ok(lb[0]==lb[1],f'{w}: beide velden op één hoogte {lb}')
        # een privé-waarde van 2.25.0 telt mee en gaat bij opslaan naar de gedeelde verdeling
        s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')")); s['samen']['meta'].pop('contrib',None); s['eigen']['prof']['contrib']=75
        pg.evaluate("v=>localStorage.setItem('vastelasten.v2',v)",json.dumps(s)); pg.reload()
        t,_=card(); ok('75% van je inkomen' in t,f'{w}: privé-waarde van 2.25.0 telt mee')
        huis(); ok(pg.input_value('#m-ctr')=='75',f'{w}: en staat ingevuld bij Verdeling'); pg.click('#m-save')
        s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
        ok(s['samen']['meta'].get('contrib')==75 and s['eigen']['prof'].get('contrib') is None,f'{w}: bij opslaan gedeeld en privé gewist')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
