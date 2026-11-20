"""Regressie: kleuren uit back-ups mogen geen HTML-attributen kunnen injecteren."""
import os, subprocess, time
import _vl
from playwright.sync_api import sync_playwright

srv=subprocess.Popen(['python3','-m','http.server','8784','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
with sync_playwright() as p:
    browser=p.chromium.launch()
    context=browser.new_context(viewport={'width':1440,'height':900},service_workers='block')
    context.add_init_script("""
      localStorage.setItem('vastelasten.v2',JSON.stringify({
        samen:{items:[{id:'probe',name:'Kleurtest',amount:10,cat:'probe',freq:'m',day:1}],
          cats:{probe:{id:'probe',name:'Onveilige kleur',c:'c9\\\") onmouseover=\\\"alert(1)',u:1}},
          del:{},paid:{},meta:null},
        eigen:{items:[],del:{},paid:{},meta:null}
      }));
    """)
    page=context.new_page(); dialogs=[]
    page.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()))
    page.goto('http://localhost:8784/')
    page.wait_for_timeout(500)
    page.click('#t-lasten')
    page.wait_for_selector('#lastenList')
    injected=page.locator('[onmouseover]').count()
    page.locator('[data-catpick="probe"]').hover()
    print(('OK   ' if injected==0 and not dialogs else 'FOUT ')+f'category color is inert (injected attributes={injected}, dialogs={dialogs})')
    browser.close()
srv.terminate()
