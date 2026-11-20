"""Test 2.21.1 en 2.22.0: blokken in Lasten in een lichte tint van hun categoriekleur, en de kleur kiezen vanaf het bolletje."""
import os,subprocess,time,re
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8785','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
def rgb(s):
    n=[float(x) for x in re.findall(r'[\d.]+',s)][:3]
    return [x*255 for x in n] if s.startswith('color(') else n
def lum(c):
    c=[x/255 for x in c]; c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]; return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
contrast=lambda a,b:(max(lum(a),lum(b))+0.05)/(min(lum(a),lum(b))+0.05)
PICK=os.path.exists(_vl.APP+'/index.html') and 'data-catpick' in open(_vl.APP+'/index.html',encoding='utf-8').read()
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(393,852),(1440,900)]:
        for scheme in ['light','dark']:
            ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
            pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-30T10:00:00'); pg.goto('http://localhost:8785/')
            tag=f'{w} {scheme}'
            pg.click('#t-lasten')
            info=pg.evaluate("""[...document.querySelectorAll('#lastenList .group')].filter(g=>g.querySelector('h3 .dot')).map(g=>({
              dot:getComputedStyle(g.querySelector('h3 .dot')).backgroundColor,
              rows:[...g.querySelectorAll('.row')].map(r=>({bg:getComputedStyle(r).backgroundColor,ink:getComputedStyle(r.querySelector('.name')).color,mut:getComputedStyle(r.querySelector('.meta')).color}))}))""")
            surf=pg.evaluate("getComputedStyle(document.querySelector('.panel, .card')||document.body).backgroundColor")
            surf=pg.evaluate("(()=>{const d=document.createElement('div');d.style.background='var(--surface)';document.body.appendChild(d);const c=getComputedStyle(d).backgroundColor;d.remove();return c})()")
            ok(len(info)>=4,f'{tag}: {len(info)} categorieën met lasten')
            ok(all(len({r['bg'] for r in g['rows']})==1 for g in info),f'{tag}: blokken binnen een categorie hebben dezelfde kleur')
            ok(len({g['rows'][0]['bg'] for g in info})==len(info),f'{tag}: elke categorie een eigen tint')
            ok(all(g['rows'][0]['bg']!=surf for g in info if 'grijs' not in g['dot']),f'{tag}: blokken zijn getint, niet het gewone vlak')
            # de tint ligt tussen het vlak en de categoriekleur, dicht bij het vlak
            d=lambda a,b:sum((x-y)**2 for x,y in zip(a,b))**.5
            ok(all(d(rgb(g['rows'][0]['bg']),rgb(surf))<d(rgb(g['rows'][0]['bg']),rgb(g['dot'])) for g in info),f'{tag}: tint is lichter dan het bolletje (dichter bij het vlak)')
            cmin=min(contrast(rgb(r['ink']),rgb(r['bg'])) for g in info for r in g['rows']); mmin=min(contrast(rgb(r['mut']),rgb(r['bg'])) for g in info for r in g['rows'])
            ok(cmin>=7 and mmin>=4.5,f'{tag}: tekst goed leesbaar (naam {cmin:.1f}:1, details {mmin:.1f}:1)')
            pg.screenshot(path=SP+f'kleur-{w}-{scheme}.png',full_page=True)
            # ook in een platte lijst (andere sortering) houdt elk blok zijn kleur
            pg.select_option('#l-sort','amount'); ok(pg.locator('#lastenList .row.tint').count()==pg.locator('#lastenList .row').count(),f'{tag}: ook gesorteerd op bedrag getint')
            pg.select_option('#l-sort','cat')
            if PICK:
                dot=pg.locator('#lastenList [data-catpick]').first; cid=dot.get_attribute('data-catpick'); bb=dot.bounding_box()
                ok(bb['width']>=44 and bb['height']>=44,f'{tag}: bolletje is een knop van minstens 44 px ({bb["width"]:.0f}x{bb["height"]:.0f})')
                dot.click(); pop=pg.locator('#catPick'); ok(pop.is_visible() and pop.locator('input[type=radio]').count()==9,f'{tag}: kiezer met negen kleuren opent')
                hs=pop.locator('label.swatch').evaluate_all('a=>a.map(x=>x.getBoundingClientRect().height)'); ok(min(hs)>=44,f'{tag}: kleurvakjes minstens 44 px')
                bg0=pg.locator(f'#lastenList .group:has([data-catpick="{cid}"]) .row').first.evaluate('r=>getComputedStyle(r).backgroundColor')
                cur=pop.locator('input:checked').get_attribute('value'); new='c5' if cur!='c5' else 'c2'
                pop.locator(f'label.swatch:has(input[value="{new}"])').click(); pg.wait_for_timeout(200)
                bg1=pg.locator(f'#lastenList .group:has([data-catpick="{cid}"]) .row').first.evaluate('r=>getComputedStyle(r).backgroundColor')
                ok(bg1!=bg0 and pg.locator('#catPick').count()==0,f'{tag}: kleur meteen toegepast, kiezer dicht')
                ok('opgeslagen' in pg.inner_text('#toast').lower(),f'{tag}: melding Kleur opgeslagen')
                pg.click('#t-instellingen'); ok(pg.locator(f'#catPanel .catrow[data-cat="{cid}"] input[value="{new}"]').is_checked(),f'{tag}: ook zo te zien in Instellingen')
                pg.click('#t-lasten'); pg.locator(f'[data-catpick="{cid}"]').click(); pg.keyboard.press('Escape'); ok(pg.locator('#catPick').count()==0,f'{tag}: Esc sluit de kiezer')
                pg.locator(f'[data-catpick="{cid}"]').click(); pg.locator('#lastenList .row').last.click(position={'x':5,'y':5}); ok(pg.locator('#catPick').count()==0,f'{tag}: ergens anders tikken sluit de kiezer')
                pg.reload(); pg.click('#t-lasten'); ok(pg.locator(f'#lastenList .group:has([data-catpick="{cid}"]) .row').first.evaluate('r=>getComputedStyle(r).backgroundColor')==bg1,f'{tag}: kleur onthouden na herladen')
            ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{tag}: geen overflow of fouten {errs}')
            ctx.close()
    br.close()
srv.terminate()
