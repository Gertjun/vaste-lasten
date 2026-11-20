"""Test 2.22.2 (bijgewerkt in 2.23.2): Instellingen met inklapbare groepen in vaste kolommen. In- en uitklappen verschuift geen groep naar een andere kolom, en groepen in andere kolommen blijven staan. Sinds 2.23.2 geldt dit voor de telefoon en de iPad staand; vanaf 1000 px (sinds PR #30, eerder 1100 px) is er een lijst met koppen (test_instellijst.py)."""
import itertools,os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8787','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
GS=['sync','huis','weer','data','over']
POS="Object.fromEntries([...document.querySelectorAll('#v-instellingen details.set-group')].map(d=>{const r=d.querySelector('summary').getBoundingClientRect();return [d.dataset.g,[Math.round(r.left),Math.round(r.top+scrollY)]]}))"
# verwachte kolom per groep: 2 kolommen = sync+huis | weer+data+over
COLS={2:{'sync':0,'huis':0,'weer':1,'data':1,'over':1},1:{g:0 for g in GS}}
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h,n in [(393,852,1),(820,1180,2),(999,800,2)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<1000,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto('http://localhost:8787/')
        pg.click('#t-instellingen'); pg.wait_for_timeout(200)
        ok(not pg.is_visible('#setNav'),f'{w}: geen lijst met koppen')
        xs=sorted({v[0] for v in pg.evaluate(POS).values()})
        ok(len(xs)==n,f'{w}: {n} kolom(men) ({xs})')
        cols=COLS[n]; base=None; moved=[]; wrongcol=[]
        for combo in itertools.product([False,True],repeat=5):
            pg.evaluate("o=>document.querySelectorAll('#v-instellingen details.set-group').forEach((d,i)=>d.open=o[i])",list(combo)); pg.wait_for_timeout(30)
            pos=pg.evaluate(POS)
            if base is None: base=pos
            for g in GS:
                if pos[g][0] not in xs or xs.index(pos[g][0])!=cols[g]: wrongcol.append((combo,g))
            for c in set(cols.values()):
                top=[g for g in GS if cols[g]==c][0]
                if pos[top][1]!=base[top][1]: moved.append((combo,top))
        ok(not wrongcol,f'{w}: elke groep blijft in zijn eigen kolom bij alle 32 combinaties {wrongcol[:3]}')
        ok(not moved,f'{w}: bovenste groep van elke kolom verschuift niet {moved[:3]}')
        if n>1:
            pg.evaluate("document.querySelectorAll('#v-instellingen details.set-group').forEach(d=>d.open=false)"); before=pg.evaluate(POS); bad=[]
            for g in GS:
                pg.click(f'details[data-g="{g}"] > summary'); pg.wait_for_timeout(60); after=pg.evaluate(POS)
                bad+=[(g,o) for o in GS if cols[o]!=cols[g] and after[o]!=before[o]]
                pg.click(f'details[data-g="{g}"] > summary'); pg.wait_for_timeout(60)
            ok(not bad,f'{w}: openklappen raakt andere kolommen niet {bad[:3]}')
            hs=[before[g][1] for g in GS if [x for x in GS if cols[x]==cols[g]][0]==g]
            ok(len(set(hs))==1,f'{w}: koppen bovenaan de kolommen op één lijn {hs}')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
