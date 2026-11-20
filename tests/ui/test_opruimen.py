"""Test 2.18.4: verwijdermarkeringen ouder dan 180 dagen worden opgeruimd, recente blijven; verwijderde standaardcategorieën blijven verwijderd."""
import os,subprocess,time,json
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
import _vl
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8780','-d',_vl.APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=lambda c,m: print(('OK   ' if c else 'FOUT ')+m)
NOW=int(time.mktime((2026,10,30,10,0,0,0,0,-1))*1000); D=864e5
old,new=int(NOW-200*D),int(NOW-10*D)
it=lambda id,name,u: {'id':id,'name':name,'amount':10,'cat':'overig','freq':'m','day':5,'month':1,'note':'','example':False,'u':u}
data={'samen':{'items':[it('s1','Huur',new)],'del':{'oud1':old,'nieuw1':new},'paid':{},'meta':{'p1':'Geert','p2':'Anne','split':50,'u':1},
               'cats':{'vervoer':{'id':'vervoer','del':True,'u':old},'kinder':{'id':'kinder','name':'Kinderopvang','c':'c2','del':True,'u':old},
                       'huisdier':{'id':'huisdier','name':'Huisdieren','c':'c5','del':True,'u':new}},
               'settle':{'a':{'id':'a','from':'p2','to':'p1','a':10,'u':old,'del':True},'b':{'id':'b','from':'p2','to':'p1','a':20,'u':old}}},
      'eigen':{'items':[it('e1','Sport',new)],'del':{'oud2':old},'paid':{},'scen':{'x':{'id':'x','name':'Oud','mods':{},'add':[],'u':old,'del':True}}}}
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={'width':1440,'height':900},service_workers='block'); ctx.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,body=''))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.clock.set_fixed_time('2026-10-30T10:00:00')
    pg.add_init_script("if(!sessionStorage.x){sessionStorage.x=1;localStorage.setItem('vastelasten.v2',%s)}"%json.dumps(json.dumps(data)))
    pg.goto('http://localhost:8780/')
    s=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
    ok(s['samen']['del']=={'nieuw1':new} and s['eigen']['del']=={},f"markeringen ouder dan 180 dagen weg, recente blijven: {s['samen']['del']} {s['eigen']['del']}")
    ok('vervoer' in s['samen']['cats'],'verwijderde standaardcategorie blijft gemarkeerd')
    ok('kinder' not in s['samen']['cats'] and 'huisdier' in s['samen']['cats'],'oude verwijderde eigen categorie weg, recente blijft')
    ok(list(s['samen']['settle'])==['b'] and s['eigen']['scen']=={},'ongedane verrekening en verwijderd scenario opgeruimd, gewone verrekening blijft')
    ok(len(s['samen']['items'])==1 and len(s['eigen']['items'])==1,'lasten zelf blijven staan')
    pg.click('#t-instellingen'); ok('Vervoer' not in pg.inner_text('#catPanel'),'Vervoer blijft verwijderd')
    # ook bij samenvoegen (synchroniseren, andere tabbladen) wordt opgeruimd
    s2=json.loads(json.dumps(s)); s2['samen']['del']['oud3']=old; s2['samen']['del']['nieuw2']=new
    B=ctx.new_page(); B.clock.set_fixed_time('2026-10-30T10:00:00'); B.goto('http://localhost:8780/')
    B.evaluate("v=>localStorage.setItem('vastelasten.v2',v)",json.dumps(s2)); pg.wait_for_timeout(400)
    s3=json.loads(pg.evaluate("localStorage.getItem('vastelasten.v2')"))
    ok(set(s3['samen']['del'])=={'nieuw1','nieuw2'},f"bij samenvoegen opgeruimd: {sorted(s3['samen']['del'])}")
    ok(not errs,f'geen fouten {errs}')
    ctx.close(); br.close()
srv.terminate()
