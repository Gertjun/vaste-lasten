"""Screenshots op iPhone, iPad staand/liggend en laptop (licht en donker) in ./screens/,
plus controle dat geen pagina breder is dan het scherm (overflow moet 0 zijn).
Gebruik: python3 test_schermen.py"""
import os
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
SP=HERE+'screens/'; os.makedirs(SP,exist_ok=True)
import subprocess,time
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8766','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
sizes={'iphone':(393,852,True),'ipad-staand':(820,1180,True),'ipad-liggend':(1180,820,True),'laptop':(1440,900,False)}
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,(w,h,touch) in sizes.items():
        for scheme in (['light','dark'] if name=='laptop' else ['light']):
            ctx=br.new_context(viewport={'width':w,'height':h},has_touch=touch,is_mobile=touch and w<1000,color_scheme=scheme,service_workers='block')
            ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
            pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
            pg.goto('http://localhost:8766/')
            # wat afvinken voor een realistisch beeld
            pg.click('#t-maand')
            for id in ['vbs0','vbe0','vbs1']: pg.click('#v-maand [data-toggle="%s"]'%id)
            pg.click('#t-overzicht')
            pg.wait_for_timeout(300)
            ov=pg.evaluate('document.documentElement.scrollWidth')-w
            pg.screenshot(path=SP+f'{name}-{scheme}-start.png',full_page=True)
            if scheme=='light':
                pg.click('#t-maand'); pg.wait_for_timeout(200); pg.screenshot(path=SP+f'{name}-maand.png')
                ov2=pg.evaluate('document.documentElement.scrollWidth')-w
                pg.click('#t-instellingen'); pg.wait_for_timeout(200); pg.screenshot(path=SP+f'{name}-instellingen.png')
                ov3=pg.evaluate('document.documentElement.scrollWidth')-w
                pg.click('#t-inzicht'); pg.wait_for_timeout(200); pg.screenshot(path=SP+f'{name}-inzicht.png',full_page=True)
                ov3=max(ov3,pg.evaluate('document.documentElement.scrollWidth')-w)
            print(name,scheme,'overflow',ov,ov2,ov3,'errors',errs)
            ctx.close()
    br.close()
srv.terminate()
