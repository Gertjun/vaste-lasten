"""Synthetic Core UI navigation; no GitHub or production data."""
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
            ctx = _vl.met_kluisscherm(browser, viewport={'width': width, 'height': height})
            page = ctx.new_page()
            page.route('https://api.github.com/**', lambda route: route.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
            assert page.evaluate("Array.from(document.styleSheets).some(s => s.href && s.href.endsWith('/css/base.css') && s.cssRules.length > 0)")
            gate = page.locator('#coreGate')
            gate.locator('.auth-card .auth-logo').wait_for()
            assert gate.locator('.auth-card').bounding_box()['width'] <= 401
            assert gate.locator('.auth-card').evaluate("(el) => getComputedStyle(el).display") == 'grid'
            assert gate.locator('.segmented').evaluate("(el) => getComputedStyle(el).display") == 'grid'
            assert gate.locator('.auth-logo').evaluate("(el) => getComputedStyle(el).justifySelf") == 'center'
            gate.get_by_role('tab', name='Bestaande koppelen').click()
            assert gate.locator('#core-pair-scan').is_visible()
            assert not gate.locator('#core-empty-name').is_visible()
            gate.get_by_role('tab', name='Nieuw beginnen').click()
            gate.locator('#core-empty-name').fill('UI test lokaal')
            gate.locator('#core-empty-storage').select_option('local')
            gate.locator('#core-empty-s').fill('synthetic shared password 123')
            gate.locator('#core-empty-e').fill('synthetic personal password 456')
            gate.locator('#core-empty-setup').click()
            gate.wait_for(state='detached', timeout=30000)
            page.locator('#t-instellingen').click()
            menu = page.locator('#vlCoreSettingsMenu')
            menu.wait_for()
            for mode in ['light', 'dark']:
                page.evaluate("(mode) => document.documentElement.dataset.theme = mode", mode)
                for group in menu.locator('.menu-group').all():
                    assert group.evaluate("(el) => getComputedStyle(el).listStyleType") == 'none'
                    assert group.evaluate("(el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)") >= 10
                    for row in group.locator('.menu-row').all():
                        styles = row.evaluate("""el => {
                            const s = getComputedStyle(el), r = el.getBoundingClientRect(), g = el.closest('.menu-group').getBoundingClientRect();
                            const a = el.querySelector('.menu-label').getBoundingClientRect(), b = el.querySelector('.menu-summary').getBoundingClientRect();
                            return {display:s.display, height:r.height, width:r.width, groupWidth:g.width, border:s.borderTopWidth, gap:b.left-a.right, arrow:getComputedStyle(el,'::after').content};
                        }""")
                        assert styles['display'] == 'flex', styles
                        assert styles['height'] >= 52 and styles['width'] >= styles['groupWidth'] - 4, styles
                        assert styles['border'] == '0px' and styles['gap'] >= 0 and '›' in styles['arrow'], styles
            page.evaluate("document.documentElement.dataset.theme = 'light'")
            print(f'OK {width}x{height}: Core CSS, grouped menu, row geometry and theme')
            for target, panel in [('sync','#syncPanel'),('security','#vlSecurityPanel'),('backup','#backupPanel'),('over','#aboutPanel'),('huis','#incomePanel'),('data','#exportPanel'),('weer','#themePanel')]:
                menu.locator(f'[data-vl-page="{target}"]').click()
                page.locator(panel).wait_for()
                assert not menu.is_visible()
                page.locator('#vlSettingsBack').click()
                menu.wait_for()
            page.locator('#coreGate').count()
            print(f'OK {width}x{height}: setup and seven settings pages')
            ctx.close()
        browser.close()
finally:
    server.shutdown()
