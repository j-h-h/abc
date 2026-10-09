'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
(async()=>{
 const {GET}=await import(require('node:url').pathToFileURL(path.resolve(__dirname,'../api/live.mjs')).href);
 const folder=path.resolve(__dirname,'../dist');
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname==='/api/live'){
    const r=await GET(new Request(url,{method:req.method}));
    res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());return;
   }
   const file=path.resolve(folder,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(folder+path.sep)){res.writeHead(403);res.end();return}
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
   const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':type});res.end(data);
  }catch(e){res.writeHead(500);res.end('DEV browser test server error')}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],legacy=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/curlbus.app|api.bus.gov.il|api.busnearby.co.il/.test(r.url()))legacy.push(r.url());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  for(const line of ['72','531']){
   if(line==='531'){await page.locator('#line').fill(line);await page.locator('#apply').click();}
   await page.waitForFunction(expected=>window.SafeBusApp?.state.route?.properties.line===expected&&!window.SafeBusApp.state.polling&&window.SafeBusApp.state.arrivalAt>0,line,{timeout:45000});
   const state=await page.evaluate(()=>({version:SafeBusApp.version,line:SafeBusApp.state.line,source:SafeBusApp.state.sourceUsed,error:SafeBusApp.state.arrivalsError,arrivalCount:SafeBusApp.state.arrivals.length,vehicles:SafeBusApp.state.vehicles.size,mapHeight:document.querySelector('#map').getBoundingClientRect().height,routePaths:document.querySelectorAll('.leaflet-overlay-pane path').length}));
   assert.equal(state.version,'DEV-9.1.3');assert.equal(state.error,null);assert.match(state.source,/LIVE-WORK/);assert.ok(state.mapHeight>=200&&state.routePaths>0);
   console.log('REAL BROWSER + WORK SERVICE',JSON.stringify(state));
   await page.screenshot({path:'dev-live-'+line+'.png',fullPage:true});
  }
  await page.locator('#trafficToggle').click();
  assert.equal(await page.locator('#trafficToggle').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#trafficLegend').isVisible(),false,'Missing licensed provider must not display an active green/red legend');
  // Explicit synthetic source fixtures verify partial/failure UI without asserting external archive availability.
  let archiveMode='partial',historyRequests=[],fixtureWindows=[];
  await page.route('**/api/live?**',async route=>{
   const u=new URL(route.request().url());
   if(u.searchParams.get('kind')!=='history')return route.continue();
   historyRequests.push(u);
   if(archiveMode==='failure')return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'UPSTREAM_TIMEOUT'})});
   const ref=u.searchParams.get('vehicleRef'),op=u.searchParams.get('operatorRef'),now=Date.now();
   const from=u.searchParams.get('from')||new Date(now-86400000).toISOString(),to=u.searchParams.get('to')||new Date(now).toISOString(),identity={vehicleRef:ref,operatorRef:op,vehicleKey:'il-mot-siri:'+op+':'+ref};
   fixtureWindows.push({from,to});
   const ride=(id,routeId)=>({...identity,rideId:id,tripId:'synthetic-'+id,routeId,scheduledStartAt:new Date(Date.parse(to)-3600000).toISOString(),sourceObservedAt:null,gpsMeasuredAt:null,evidenceKind:'archive-vehicle-trip-association',clockType:'scheduled-trip-start'});
   const more=u.searchParams.get('offset')==='200';
   const body={schemaVersion:1,...identity,from,to,retrievedAt:new Date(now).toISOString(),rides:more?[ride('2','200'),ride('3','300')]:[ride('1','100'),ride('2','200')],observations:[],partial:true,observationStatus:'unavailable',observationError:{code:'UPSTREAM_TIMEOUT'},nextOffset:more?null:200};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.evaluate(()=>SafeBusApp.openVehicleArchive('89094003','15'));
  await page.waitForFunction(()=>SafeBusApp.archiveState.data?.rides.length===2);
  assert.match(await page.locator('#archiveStatus').innerText(),/UPSTREAM_TIMEOUT/);
  assert.match(await page.locator('#archiveResults').innerText(),/התחלה מתוכננת/);
  assert.match(await page.locator('#archiveResults').innerText(),/אין חותמת GPS עצמאית/);
  assert.equal(await page.locator('.archive-table tr').count(),3);
  await page.locator('#archiveMore').click();
  await page.waitForFunction(()=>SafeBusApp.archiveState.data?.rides.length===3);
  assert.equal(await page.locator('.archive-table tr').count(),4,'Pagination de-duplicates source associations');
  assert.equal(historyRequests[1].searchParams.get('from'),fixtureWindows[0].from);
  assert.equal(historyRequests[1].searchParams.get('to'),fixtureWindows[0].to);
  assert.equal(await page.locator('#archiveMore').isVisible(),false);
  await page.screenshot({path:'dev-live-history.png',fullPage:true});
  archiveMode='failure';
  await page.locator('#archiveLoad').click();
  await page.waitForFunction(()=>!document.querySelector('#archiveLoad').disabled&&document.querySelector('#archiveStatus').textContent.includes('אינו זמין'));
  assert.match(await page.locator('#archiveStatus').innerText(),/אין להסיק היעדר נסיעות/);
  assert.equal(await page.locator('.archive-table').count(),0,'A failed new query does not retain previous vehicle history');
  const violations=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(violations,false,'Mobile page must fit the viewport including archive controls');
  console.log('BROWSER SYNTHETIC FIXTURES: partial archive, pinned pagination, honest failures and unavailable traffic verified');
  assert.deepEqual(errors,[]);assert.deepEqual(legacy,[],'Built-in DEV connection must not call forecast services directly from browser');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
