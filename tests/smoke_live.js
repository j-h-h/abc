const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.SITE_URL||'https://j-h-h.github.io/abc/';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[],mapFailures=[],mapHttpErrors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',req=>{if(/tile.openstreetmap|cartocdn|arcgisonline|openstreetmap.fr/.test(req.url()))mapFailures.push([req.url().slice(0,120),req.failure()?.errorText]);});
 page.on('response',res=>{if(/tile.openstreetmap|cartocdn|arcgisonline|openstreetmap.fr/.test(res.url())&&res.status()>=400)mapHttpErrors.push([res.url().slice(0,120),res.status()]);});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.SafeBusDataset?.catalog()?.schema===2,{timeout:55000});
 await page.waitForFunction(()=>window.SafeBusApp?.state?.route?.properties?.line==='72',{timeout:45000});
 const one=await page.evaluate(()=>({
    line:window.SafeBusApp.state.line,
    stop:window.SafeBusApp.state.stop,
    routePoints:window.SafeBusApp.state.route.geometry.coordinates.length,
    routeStops:window.SafeBusApp.state.route.properties.stopSequence.length,
    map:!!window.SafeBusApp.state.map,
    svgPaths:document.querySelectorAll('.leaflet-overlay-pane path').length,
    tileLoaded:document.querySelectorAll('img.leaflet-tile-loaded').length,
    caption:document.querySelector('#mapCaption').textContent,
    banner:document.querySelector('#banner').textContent,
    routeError:window.SafeBusApp.state.routeError
 }));
 console.log('BROWSER 72',JSON.stringify(one));
 await page.waitForTimeout(19500);
 const tiles=await page.evaluate(()=>({loaded:document.querySelectorAll('img.leaflet-tile-loaded').length,source:window.SafeBusApp.state.tileSource,warningVisible:!document.querySelector('#tileNotice').hidden}));
 console.log('MAP TILE DIAGNOSTICS',JSON.stringify({tiles,failed:mapFailures.slice(0,12),httpErrors:mapHttpErrors.slice(0,12)}));
 assert.equal(one.line,'72');assert.equal(one.stop,'2360');
 assert.ok(one.routePoints>100 && one.routeStops>5 && one.map && one.svgPaths>0);
 await page.screenshot({path:'browser-72.png',fullPage:true});
 await page.locator('#line').fill('531');
 await page.locator('#apply').click();
 await page.waitForFunction(()=>window.SafeBusApp?.state?.route?.properties?.line==='531',{timeout:35000});
 const two=await page.evaluate(()=>({
    line:window.SafeBusApp.state.line,
    stops:window.SafeBusApp.state.route.properties.stopSequence.length,
    svgPaths:document.querySelectorAll('.leaflet-overlay-pane path').length,
    caption:document.querySelector('#mapCaption').textContent
 }));
 console.log('BROWSER 531',JSON.stringify(two));
 assert.equal(two.line,'531');assert.ok(two.stops>2 && two.svgPaths>0);
 await page.screenshot({path:'browser-531.png',fullPage:true});
 assert.deepEqual(errors,[],'Uncaught browser JavaScript errors');
 console.log('BROWSER MAP TESTS PASSED; tile count:',one.tileLoaded);
 }finally{await browser.close()}
})().catch(e=>{console.error('BROWSER TEST FAILED:',e.stack||String(e));process.exitCode=1});
