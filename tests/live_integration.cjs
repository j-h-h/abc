'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),now=Date.now(),at=new Date(now-30000).toISOString(),responseAt=new Date(now-10000).toISOString(),eta=new Date(now+300000).toISOString();
const selection={line:'72',stopCode:'2360',routeId:'34120',operatorRef:'16',direction:'רמות'};
const row={...selection,directionVerified:true,directionEvidence:'exact-line-ref+operator+stop-sequence+destination',sourceObservedAt:at,sourceResponseAt:responseAt,reportedArrivalAt:eta,realtime:true,etaKind:'reported-live',vehicleRef:'44981502',tripId:'ride-1',siriDirectionRef:'2',gtfsDirectionId:'1'};
const raw={schemaVersion:1,stopCode:'2360',sourceResponseAt:responseAt,arrivals:[row],unverified:[],vehicles:[{...row,id:'siri:16:ride-1',lat:31.739694,lon:35.18098,clockType:'source-report'}]};
const window={},context={window,Date,console};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'live-contract.js'),'utf8'),context);
const L=window.SafeBusLive;
assert.equal(L.normalize(raw,selection,{now}).arrivals.length,1,'SIRI 2 and GTFS 1 are distinct namespaces and may match through destination evidence');
assert.equal(L.normalize(raw,selection,{now}).vehicles[0].clockType,'source-report');
assert.equal(L.normalize(raw,selection,{now}).vehicles[0].velocity,null);
for(const changed of [{routeId:'34119'},{operatorRef:'3'},{line:'531'},{directionVerified:false},{directionEvidence:'line-number-only'},{sourceObservedAt:new Date(now-181000).toISOString()},{sourceResponseAt:new Date(now+31000).toISOString()},{realtime:false}]){
 assert.equal(L.normalize({...raw,arrivals:[{...row,...changed}]},selection,{now}).arrivals.length,0,JSON.stringify(changed));
}
assert.equal(L.normalize({...raw,sourceResponseAt:new Date(now-181000).toISOString()},selection,{now}).arrivals.length,0);
assert.equal(L.normalize({...raw,vehicles:[{...raw.vehicles[0],clockType:'gps-measurement'}]},selection,{now}).vehicles.length,0);
assert.throws(()=>L.normalize({...raw,stopCode:'9999'},selection,{now}));
(async()=>{
 const {GET}=await import(require('node:url').pathToFileURL(path.join(root,'api/live.mjs')).href);
 const original=global.fetch,calls=[];
 try{
  global.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return Response.json(raw);};
  const response=await GET(new Request('https://eifo-batuach-dev.vercel.app/api/live?line=72&stopCode=2360&routeId=34120'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(calls[0].url.origin,'https://eifo-batuach-live-relay.vercel.app');
  assert.equal(calls[0].url.pathname,'/api/index');assert.equal(calls[0].url.searchParams.get('relayPath'),'/v1/stops/2360/arrivals');
  assert.equal(calls[0].url.searchParams.has('path'),false,'Do not forward Vercel rewrite parameters that break the WORK contract');
  assert.equal(calls[0].options.redirect,'error');
  for(const suffix of ['?line=72&stopCode=2360&routeId=34120&url=https://evil.example','?line=72&line=531&stopCode=2360&routeId=34120','?kind=health&stopCode=2360']){
   assert.equal((await GET(new Request('https://eifo-batuach-dev.vercel.app/api/live'+suffix))).status,400);
  }
  assert.equal(calls.length,1,'Invalid inputs never cause an upstream request');
  const health=await GET(new Request('https://eifo-batuach-dev.vercel.app/api/live?kind=health'));
  assert.equal(health.status,200);assert.equal(calls.at(-1).url.searchParams.get('relayPath'),'/v1/health');
  global.fetch=async()=>Response.json({error:'RATE_LIMITED'},{status:429});
  const limited=await GET(new Request('https://eifo-batuach-dev.vercel.app/api/live?kind=health'));
  assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
 }finally{global.fetch=original}
 const elements={map:{getBoundingClientRect:()=>({height:240})}};
 const appWindow={SafeBusLive:L,SafeBusDataset:{},location:{href:'https://eifo-batuach-dev.vercel.app/',protocol:'https:'}};
 const appContext={window:appWindow,globalThis:appWindow,Date,Math,URL,URLSearchParams,Intl,Response,AbortController,setTimeout,clearTimeout,console,document:{readyState:'loading',addEventListener(){},getElementById:id=>elements[id]},fetch:async u=>{assert.equal(new URL(u).pathname,'/api/live');return Response.json(raw);}};
 vm.createContext(appContext);vm.runInContext(fs.readFileSync(path.join(root,'core.js'),'utf8'),appContext);vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),appContext);
 const app=appWindow.SafeBusApp;app.state.route={properties:{routeId:'34120',agencyId:'16',headsign:'רמות'}};
 const payload=await app.getArrivals();assert.equal(payload.arrivals.length,1);assert.equal(app.state.sourceUsed,'SIRI דרך LIVE-WORK');
 assert.ok(fs.readFileSync(path.join(root,'sw.js'),'utf8').includes("u.pathname.includes('/api/')"),'Service worker excludes all live API responses from offline cache');
 console.log('PASS: source clock, route/operator/direction contract, fixed WORK gateway and automatic DEV integration');
})().catch(e=>{console.error(e);process.exitCode=1});
