"""Real shared Core QR dialog with synthetic credentials; no remote requests."""
import _vl
from playwright.sync_api import sync_playwright
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from threading import Thread

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=_vl.APP))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in [(1280, 900), (390, 844)]:
            context = _vl.met_kluisscherm(browser, viewport={'width': width, 'height': height})
            page = context.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
            page.evaluate("window.confirm = () => true")
            for domain in ['shared', 'personal-p1']:
                page.evaluate("""async domain => {
                    const {openPairOutDialog} = await import('./js/core/pairing-ui.js');
                    const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
                    await openPairOutDialog({syncConfig:{owner:'fixture',repo:'fixture',branch:'main',path:'pwa-core-v1/'+domain+'.json',token:'synthetic-token'},dataKey:key,context:'vaste-lasten/'+domain,appName:'Vaste Lasten'});
                }""", domain)
                page.locator('#dlg-pair[open]').wait_for()
                page.wait_for_timeout(300)
                body = page.locator('#dlg-pair .sheet-body').bounding_box()
                qr = page.locator('#dlg-pair .pair-qr').bounding_box()
                assert body and body['width'] >= 250, body
                assert qr and qr['width'] >= 180 and qr['height'] >= 180, qr
                assert qr['width'] <= body['width'], (qr, body)
                page.locator('#dlg-pair').get_by_role('button', name='Klaar').click()
                page.locator('#dlg-pair').wait_for(state='detached')
                print(f'OK {width}x{height} {domain}: QR and dialog readable')
            context.close()
        browser.close()
finally:
    server.shutdown()
