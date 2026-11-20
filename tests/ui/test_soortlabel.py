"""Test 2.23.1: de labels Samen en Eigen zijn in elke accentkleur en modus goed van elkaar te onderscheiden.
Samen is gevuld in de accentkleur, Eigen is omlijnd zonder vulling."""
import os,subprocess,time,re
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8789','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
def rgba(s):
    n=[float(x) for x in re.findall(r'[\d.]+',s)]
    if s.startswith('color('): n=[x*255 for x in n[:3]]+n[3:]
    return n+[1.0]*(4-len(n)) if len(n)<4 else n
def lum(c):
    c=[x/255 for x in c[:3]]; c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]; return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
contrast=lambda a,b:(max(lum(a),lum(b))+0.05)/(min(lum(a),lum(b))+0.05)
JS="""(()=>{const s=document.querySelector('.ov-next .chip.samen'),e=document.querySelector('.ov-next .chip.eigen');
 const row=x=>getComputedStyle(x.closest('.row')).backgroundColor;
 const cs=getComputedStyle(s),ce=getComputedStyle(e);
 return {sbg:cs.backgroundColor,sfg:cs.color,srow:row(s),ebg:ce.backgroundColor,efg:ce.color,eline:ce.boxShadow,erow:row(e)}})()"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for scheme in ['light','dark']:
        for acc in ['petrol','blauw','paars','terracotta','leisteen']:
            tag=f'{scheme} {acc}'
            ctx=br.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True,color_scheme=scheme,service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
            ctx.add_init_script("localStorage.setItem('vastelasten.ui',JSON.stringify({accent:'%s'}))"%acc)
            pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-11-05T10:00:00'); pg.goto('http://localhost:8789/')
            v=pg.evaluate(JS)
            sbg,sfg,srow=rgba(v['sbg']),rgba(v['sfg']),rgba(v['srow'])
            ebg=rgba(v['ebg'])
            ok(sbg[3]==1 and contrast(sbg,srow)>=3,f'{tag}: Samen is gevuld en valt op tegen de regel ({contrast(sbg,srow):.1f}:1)')
            ok(contrast(sfg,sbg)>=4.5,f'{tag}: tekst in Samen leesbaar ({contrast(sfg,sbg):.1f}:1)')
            ok(ebg[3]==0 and 'inset' in v['eline'],f'{tag}: Eigen is omlijnd zonder vulling')
            ok(contrast(rgba(v['efg']),rgba(v['erow']))>=4.5,f'{tag}: tekst in Eigen leesbaar ({contrast(rgba(v["efg"]),rgba(v["erow"])):.1f}:1)')
            if acc in ('petrol','leisteen'): pg.locator('.ov-next').screenshot(path=SP+f'soortlabel-{scheme}-{acc}.png')
            ok(pg.evaluate('document.documentElement.scrollWidth')<=393 and not errs,f'{tag}: geen overflow of fouten {errs}')
            ctx.close()
    br.close()
srv.terminate()
