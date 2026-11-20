"""Test 2.18.2 (bijgewerkt in 2.23.2): twee tabbladen tegelijk open overschrijven elkaars wijzigingen niet; de opslag wordt beschermd."""
import os,subprocess,time
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8778','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
paid=lambda pg,id: pg.locator(f'#v-maand .row.paid:has([data-toggle="{id}"])').count()==1
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={'width':1440,'height':900},service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
    errs=[]
    A=ctx.new_page(); A.on('pageerror',lambda e:errs.append(str(e))); A.clock.set_fixed_time('2026-10-29T10:00:00'); A.goto('http://localhost:8778/')
    B=ctx.new_page(); B.on('pageerror',lambda e:errs.append(str(e))); B.clock.set_fixed_time('2026-10-29T10:00:00'); B.goto('http://localhost:8778/')
    for pg in (A,B): pg.click('#t-maand')
    A.click('#v-maand [data-toggle="vbs0"]'); B.wait_for_timeout(300)
    ok(paid(B,'vbs0'),'afvinken in tabblad A verschijnt in B zonder herladen')
    B.click('#v-maand [data-toggle="vbe0"]'); A.wait_for_timeout(300)
    A.click('#v-maand [data-toggle="vbs1"]'); B.wait_for_timeout(300)
    for n,pg in (('A',A),('B',B)): ok(all(paid(pg,i) for i in ['vbs0','vbe0','vbs1']),f'{n}: alle drie de vinkjes staan er')
    # nieuwe last in A, bewerken in B
    A.click('#addBtn'); A.fill('#f-name','Kinderopvang'); A.fill('#f-amount','412,50'); A.fill('#f-day','3'); A.click('#form button[type=submit]'); B.wait_for_timeout(300)
    B.click('#t-lasten'); ok('Kinderopvang' in B.inner_text('#v-lasten'),'nieuwe last uit A staat in B')
    # B opent een last om te bewerken terwijl A iets afvinkt; B slaat daarna op
    B.click('#v-lasten [data-edit="vbe1"]'); A.click('#v-maand [data-toggle="vbe2"]'); B.wait_for_timeout(300)
    B.fill('#f-name','Telefoon sim-only'); B.click('#form button[type=submit]'); A.wait_for_timeout(300)
    A.click('#t-lasten'); ok('Telefoon sim-only' in A.inner_text('#v-lasten') and 'Kinderopvang' in A.inner_text('#v-lasten'),'bewerking uit B en nieuwe last uit A staan in A')
    # A verwijdert een voorbeeld; dat komt niet terug via B
    A.click('#v-lasten [data-edit="vbs6"]'); A.click('#delBtn'); A.click('#delBtn'); B.wait_for_timeout(300)
    B.click('#t-maand'); B.click('#v-maand [data-toggle="vbs2"]'); A.wait_for_timeout(300)
    for pg in (A,B): pg.reload()
    A.click('#t-lasten'); t=A.inner_text('#v-lasten')
    ok('Doorlopende reisverzekering' not in t,'verwijderd voorbeeld komt niet terug')
    ok('Kinderopvang' in t and 'Telefoon sim-only' in t,'na herladen staat alles er nog')
    A.click('#t-maand'); ok(all(paid(A,i) for i in ['vbs0','vbe0','vbs1','vbe2','vbs2']),'na herladen alle vijf de vinkjes')
    # opslag beschermd: melding bij Gegevens (alleen in de geïnstalleerde versie); laptop: Gegevens in de lijst met koppen (sinds 2.23.2)
    A.click('#t-instellingen'); A.click('#setNav [data-sg="data"]')
    ok(A.is_visible('#persistNote') and 'browser' in A.inner_text('#persistNote'),'melding over de opslag: '+A.inner_text('#persistNote'))
    ok(not errs,f'geen fouten {errs}')
    ctx.close(); br.close()
srv.terminate()
