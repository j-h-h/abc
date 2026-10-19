'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const base=process.env.DEV_BASE_URL;if(base!=='https://eifo-batuach-dev.vercel.app')throw Error('Diagnostics are restricted to canonical DEV');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.SafeBusTrafficTiles);
  const before=await (await page.request.get(base+'/api/traffic?kind=status')).json(),reports=[];
  for(const provider of ['classic','orbis-v2'])for(const city of ['tel-aviv','jerusalem','haifa']){
   const r=await page.request.get(base+'/api/traffic?kind=probe&provider='+provider+'&city='+city,{timeout:20000}),headers=r.headers(),report={provider,city,status:r.status(),classification:'real provider diagnostic; not an active map layer'};
   if(!r.ok()){report.failure=await r.json().catch(()=>({error:'NON_JSON_FAILURE'}));reports.push(report);console.log('REAL TOMTOM PROBE',JSON.stringify(report));continue;}
   assert.equal(headers['x-traffic-diagnostic'],'true');assert.equal(headers['x-traffic-provider-api'],provider);
   const b64=(await r.body()).toString('base64');Object.assign(report,await page.evaluate(async({b64,headers})=>{
    const timing=SafeBusTrafficTiles.timing(new Headers(headers));if(!timing)return {fresh:false,coloredPixels:0};
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});if(img.naturalWidth>512||img.naturalHeight>512)throw Error('Oversize diagnostic image');
     const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let opaquePixels=0,coloredPixels=0,redPixels=0,orangePixels=0;
     for(let i=0;i<d.length;i+=4){const [r,g,b,a]=d.slice(i,i+4);if(a<30)continue;opaquePixels++;if(Math.max(r,g,b)-Math.min(r,g,b)>30)coloredPixels++;if(r>150&&r>g*1.5&&r>b*1.5)redPixels++;if(r>150&&g>75&&g<195&&b<100)orangePixels++;}
     return {fresh:true,width:c.width,height:c.height,opaquePixels,coloredPixels,redPixels,orangePixels,providerOriginatedAt:headers['x-traffic-originated-at'],sourceAge:headers['x-traffic-source-age']};
    }finally{URL.revokeObjectURL(url);}
   },{b64,headers}).catch(e=>({fresh:false,coloredPixels:0,decodeError:e.message})));reports.push(report);console.log('REAL TOMTOM PROBE',JSON.stringify(report));
  }
  const after=await (await page.request.get(base+'/api/traffic?kind=status')).json();assert.equal(after.available,before.available,'Diagnostics cannot independently enable coverage');
  console.log('REAL TOMTOM PROBE SUMMARY',JSON.stringify({activeMapTraffic:after.available,connected:after.connected,positiveSamples:reports.filter(r=>r.fresh&&r.coloredPixels>0).map(r=>({provider:r.provider,city:r.city,coloredPixels:r.coloredPixels})),clockType:'provider-response; road measurement time unavailable'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
