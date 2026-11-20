"""Test 2.18.5 (bijgewerkt in 2.23.2): back-up en CSV gaan op iPhone en iPad via het deelmenu, op de laptop als download; deelmenu sluiten doet niets."""
import os,subprocess,time,json
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8781','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
MOCK="""window.__shared=[];window.__abort=false;
navigator.canShare=d=>!!(d&&d.files&&d.files.length);
navigator.share=async d=>{ if(window.__abort){const e=new Error('x');e.name='AbortError';throw e;}
  const f=d.files[0]; window.__shared.push({name:f.name,type:f.type,text:await f.text()}); };"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h,mob in [(393,852,True),(820,1180,True),(1440,900,False)]:
        ctx=br.new_context(viewport={'width':w,'height':h},is_mobile=mob and w<500,has_touch=mob,service_workers='block',accept_downloads=True); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.add_init_script(MOCK); pg.clock.set_fixed_time('2026-10-30T10:00:00'); pg.goto('http://localhost:8781/')
        downloads=[]; pg.on('download',lambda d:downloads.append(d.suggested_filename))
        pg.click('#t-instellingen'); pg.click('#setNav [data-sg="data"]' if w>=1100 else 'details[data-g="data"] > summary')   # laptop: lijst met koppen (sinds 2.23.2)
        pg.click('#dlBk'); pg.wait_for_timeout(400)
        sh=pg.evaluate('window.__shared')
        if mob:
            ok(pg.inner_text('#dlBk')=='Bewaar als bestand' and pg.is_visible('#bkShareNote'),f'{w}: knop Bewaar als bestand met uitleg')
            ok(len(sh)==1 and sh[0]['name']=='vaste-lasten-2026-10-30.json' and not downloads,f'{w}: back-up via het deelmenu {[s["name"] for s in sh]}')
            ok(json.loads(sh[0]['text'])['v']==2 and 'Zorgverzekering' in sh[0]['text'],f'{w}: back-up bevat de gegevens')
            pg.click('#x-csv'); pg.wait_for_timeout(400); sh=pg.evaluate('window.__shared')
            ok(len(sh)==2 and sh[1]['name'].endswith('.csv') and ';' in sh[1]['text'],f'{w}: CSV via het deelmenu')
            pg.evaluate('window.__abort=true'); pg.click('#dlBk'); pg.wait_for_timeout(400)
            ok(len(pg.evaluate('window.__shared'))==2 and not downloads,f'{w}: deelmenu sluiten geeft geen download')
        else:
            ok(not sh and downloads==['vaste-lasten-2026-10-30.json'],f'{w}: back-up als download {downloads}')
            ok(not pg.is_visible('#bkShareNote'),f'{w}: geen uitleg over het deelmenu')
            pg.click('#x-csv'); pg.wait_for_timeout(400); ok(downloads[-1]=='vaste-lasten-afschrijvingen-2026.csv',f'{w}: CSV als download')
        ok(pg.evaluate('document.documentElement.scrollWidth')<=w and not errs,f'{w}: geen overflow of fouten {errs}')
        ctx.close()
    br.close()
srv.terminate()
