import json
from pathlib import Path
from playwright.sync_api import sync_playwright
D=Path('/mnt/data/eifo_batuach_9')
cat=json.loads((D/'data/catalog.json').read_text());assert len(cat['lines'])==911
routes={n:json.loads((D/f'data/line/{n}.json').read_text()) for n in ['72','531']}
MOCK="""(() => {class Thing{constructor(x){this.x=x;this.handlers={};this.children=[];}on(t,f){this.handlers[t]=f;return this}emit(t){this.handlers[t]?.();return this}addTo(){return this}bindPopup(){return this}getBounds(){return{isValid:()=>true,pad:()=>this}}getLatLng(){return{lat:31.733251,lng:35.187968}}setLatLng(x){this.x=x;return this}setIcon(x){this.icon=x;return this}setPopupContent(){return this}clearLayers(){return this}addLayer(x){this.children.push(x);return this}removeLayer(){return this}}window.__tiles=[];window.L={map:()=>({setView(){return this},invalidateSize(){return this},removeLayer(){return this},fitBounds(){return this}}),tileLayer:()=>{let t=new Thing();window.__tiles.push(t);return t},layerGroup:()=>new Thing(),geoJSON:x=>new Thing(x),marker:x=>new Thing(x),divIcon:x=>x,control:{zoom:()=>new Thing()}};window.caches=undefined;})();"""
html=(D/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="./styles.css"/>', '<style>'+(D/'styles.css').read_text()+'</style>')
for filename in ['gtfs-store.js','core.js','app.js']:
 html=html.replace(f'<script defer src="./{filename}"></script>','')
 html=html.replace(f'<script src="./{filename}"></script>','')
html=html.replace('<script defer src="./vendor/leaflet.js" crossorigin="anonymous"></script>',f'<script>{MOCK}</script>')
html=html.replace('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous"/>','')
html=html.replace('</body>', ''.join('<script>'+ (D/f).read_text() +'</script>' for f in ['core.js','gtfs-store.js','app.js'])+'</body>')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w in [320,390]:
  page=b.new_page(viewport={'width':w,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  # Mock local JSON and external services, does not test cross-origin access or live sources
  bootstrap=f'''(()=>{{const cat={json.dumps(cat,ensure_ascii=False)};const routes={json.dumps(routes,ensure_ascii=False)};window.fetch=async input=>{{const u=String(input);let data;if(u.includes('version.json'))data={{version:'test'}};else if(u.includes('catalog.json'))data=cat;else if(u.includes('data/line/')){{let m=u.match(/line\/(\d+)\.json/);data=routes[m?.[1]]||[];}}else data={{}};return new Response(JSON.stringify(data),{{status:200,headers:{{'content-type':'application/json'}}}});}};}})();''' 
  page_html=html.replace('<head>','<head><script>'+bootstrap+'</script>')
  page.set_content(page_html,wait_until='domcontentloaded')
  page.wait_for_timeout(700)
  print('DEBUG',errors,page.evaluate('({ds:!!window.SafeBusDataset,app:!!window.SafeBusApp,cat:!!window.SafeBusDataset?.catalog(),banner:document.querySelector("#banner")?.textContent})'))
  page.wait_for_function('window.SafeBusDataset?.catalog()?.lines?.length>900',timeout=20000)
  page.wait_for_function('window.SafeBusApp?.state?.route?.properties?.line==="72"',timeout=10000)
  state=page.evaluate('({lines:SafeBusDataset.allLines().length,route:SafeBusApp.state.route.properties.routeDesc,stops:SafeBusApp.state.route.properties.stopSequence.length})')
  assert state['stops']==58,state
  assert page.evaluate('!!window.SafeBusApp.state.map')
  assert page.evaluate('SafeBusApp.state.routeLayer.children.length')>0
  page.evaluate('''() => {for(let i=0;i<4;i++)window.__tiles[0].emit('tileerror');}''')
  assert page.evaluate('window.__tiles.length===2'), 'Fallback map server was not attempted'
  page.evaluate('''() => {for(let i=0;i<4;i++)window.__tiles[1].emit('tileerror');}''')
  assert page.locator('#tileNotice').is_visible(), 'No explanatory message after both map sources fail'
  page.evaluate('''() => window.__tiles[1].emit('tileload')''')
  assert not page.locator('#tileNotice').is_visible(), 'Failure message should disappear after tile succeeds'
  page.locator('#line').fill('531');page.locator('#apply').click();page.wait_for_function('SafeBusApp.state.route?.properties?.line==="531"',timeout=10000)
  assert not errors,errors
  print('PASS_BROWSER_WIDTH',w,'CATALOG',state['lines'],'72_STOPS',state['stops'],'SWITCH_531_OK')
  page.close()
 b.close()