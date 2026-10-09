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
   assert.equal(state.version,'DEV-9.1.2');assert.equal(state.error,null);assert.match(state.source,/LIVE-WORK/);assert.ok(state.mapHeight>=200&&state.routePaths>0);
   console.log('REAL BROWSER + WORK SERVICE',JSON.stringify(state));
   await page.screenshot({path:'dev-live-'+line+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(legacy,[],'Built-in DEV connection must not call forecast services directly from browser');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
