'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),now=Date.now(),iso=t=>new Date(t).toISOString();
const window={},ctx={window,globalThis:window,Date,Math,console};vm.createContext(ctx);
for(const file of ['core.js','archive-contract.js','vehicle-history.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const A=window.SafeBusArchive,H=window.SafeBusHistory;
const selection={vehicleRef:'89094003',operatorRef:'15'},identity={...selection,vehicleKey:'il-mot-siri:15:89094003'};
const ride=(rideId,routeId)=>({...identity,rideId,routeId,tripId:'journey-'+rideId,scheduledStartAt:iso(now-7200000),evidenceKind:'archive-vehicle-trip-association',clockType:'scheduled-trip-start',gpsMeasuredAt:null,sourceObservedAt:null});
const observation={...identity,observationId:'obs-1',routeId:'100',rideId:'1',tripId:'journey-1',snapshotId:'snapshot-1',sourceObservedAt:iso(now-30000),clockType:'source-report',gpsMeasuredAt:null,lat:31.75,lon:35.2};
const raw={schemaVersion:1,...identity,from:iso(now-86400000),to:iso(now),retrievedAt:iso(now),rides:[ride('1','100'),ride('2','200')],observations:[observation],partial:false,truncated:false,nextOffset:null,observationStatus:'available'};
const good=A.normalize(raw,selection,{now});
assert.equal(good.rides.length,2);assert.equal(new Set(good.rides.map(x=>x.routeId)).size,2,'History must cross source routes without filtering to the displayed route');
assert.equal(good.observations[0].snapshotId,'snapshot-1');assert.equal(good.observations[0].tripId,'journey-1');
assert.equal(good.mechanicalFaultConclusion,null);assert.equal(good.observations[0].clockType,'source-report');
assert.equal(good.observations[0].gpsMeasuredAt,null);
assert.equal(H.ingest({...good.observations[0],vehicle_ref:identity.vehicleKey,observed_at:observation.sourceObservedAt},{now}).supported,false,'Archive positions cannot create GPS-only anomalies');
for(const change of [{operatorRef:'16'},{vehicleRef:'other'},{vehicleKey:'il-mot-siri:16:89094003'},{from:iso(now-15*86400000)},{to:iso(now+31000)},{from:iso(now-367*86400000),to:iso(now-365*86400000)}])assert.throws(()=>A.normalize({...raw,...change},selection,{now}));
for(const change of [{operatorRef:'16'},{clockType:'gps-measurement'},{gpsMeasuredAt:iso(now-30000)},{sourceObservedAt:iso(now-2*86400000)},{lat:null}]){
 const filtered=A.normalize({...raw,observations:[{...observation,...change}]},selection,{now});
 assert.equal(filtered.observations.length,0);assert.equal(filtered.partial,true);
}
for(const change of [{clockType:'source-report'},{sourceObservedAt:iso(now-1000)},{gpsMeasuredAt:iso(now-1000)},{scheduledStartAt:iso(now-3*86400000)}])assert.equal(A.normalize({...raw,rides:[{...raw.rides[0],...change}]},selection,{now}).rides.length,0);
const partial=A.normalize({...raw,observations:[],partial:true,observationStatus:'unavailable',observationError:{code:'UPSTREAM_TIMEOUT',status:502}},selection,{now});
assert.equal(partial.rides.length,2);assert.equal(partial.observations.length,0);assert.equal(partial.observationError,'UPSTREAM_TIMEOUT');
assert.equal(partial.mechanicalFaultConclusion,null,'Position timeout is not a faulty vehicle');
const first=A.normalize({...raw,nextOffset:200},selection,{now}),second=A.normalize({...raw,observations:[observation,{...observation,observationId:'obs-2'}],rides:[...raw.rides,ride('3','300')],nextOffset:400},{...selection,from:raw.from,to:raw.to},{now,offset:200});
const merged=A.merge(first,second);assert.equal(merged.rides.length,3);assert.equal(merged.observations.length,2);assert.equal(merged.nextOffset,400);
assert.throws(()=>A.merge(first,{...second,to:iso(now-1000)}),'Pages must keep the returned window fixed');
assert.throws(()=>A.normalize(raw,{...selection,from:iso(now-1000),to:raw.to},{now}));
assert.equal(A.normalize({...raw,nextOffset:2001},selection,{now}).nextOffset,null);
(async()=>{
 const {GET}=await import(require('node:url').pathToFileURL(path.join(root,'api/live.mjs')).href),original=global.fetch,calls=[];
 const request=q=>new Request('https://eifo-batuach-dev.vercel.app/api/live?'+q);
 try{
  global.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return Response.json({...raw,observations:[],partial:true,observationStatus:'unavailable',observationError:{code:'UPSTREAM_TIMEOUT'}});};
  const response=await GET(request('kind=history&vehicleRef=89094003&operatorRef=15'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.rides.length,2);assert.equal(body.partial,true);assert.equal(body.observationError.code,'UPSTREAM_TIMEOUT');
  assert.equal(calls[0].url.origin,'https://eifo-batuach-live-relay.vercel.app');assert.equal(calls[0].url.pathname,'/api/index');
  assert.equal(calls[0].url.searchParams.get('relayPath'),'/v1/vehicles/89094003/history');
  assert.equal(calls[0].url.searchParams.get('operatorRef'),'15');assert.equal(calls[0].url.searchParams.has('routeId'),false);
  assert.equal(calls[0].url.searchParams.get('limit'),'200');assert.equal(calls[0].options.headers.Origin,undefined);assert.equal(calls[0].options.redirect,'error');
  const prefix='kind=history&vehicleRef=89094003&operatorRef=15';
  for(const extra of ['&days=15','&limit=251','&offset=2001','&offset=1.5','&days=','&routeId=34120','&url=https://evil.example','&vehicleRef=89094003','&from='+encodeURIComponent(raw.from),'&from='+encodeURIComponent(iso(now-15*86400000))+'&to='+encodeURIComponent(raw.to)])assert.equal((await GET(request(prefix+extra))).status,400,extra);
  assert.equal((await GET(request('kind=history&vehicleRef=..%2Fevil&operatorRef=15'))).status,400);
  assert.equal(calls.length,1,'Invalid archive requests must not reach upstream');
  const pinned=new URLSearchParams({kind:'history',...selection,from:raw.from,to:raw.to,offset:'200'});
  assert.equal((await GET(request(pinned.toString()))).status,200);assert.equal(calls.at(-1).url.searchParams.get('from'),raw.from);
  global.fetch=async()=>Response.json({error:'UPSTREAM_TIMEOUT'},{status:502});
  const timeout=await GET(request(prefix));assert.equal(timeout.status,502);assert.equal((await timeout.json()).error,'UPSTREAM_TIMEOUT','Failed ride query must remain failure rather than an empty history');
 }finally{global.fetch=original}
 console.log('PASS: operator-scoped cross-route archive, planned vs report clocks, partial source failure, fixed pagination and bounded read-only gateway');
})().catch(e=>{console.error(e);process.exitCode=1});
