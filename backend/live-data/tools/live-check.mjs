// Real HTTPS requests. Empty/stale SIRI reports are legitimate results, never synthetic departures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.LIVE_BASE_URL||'https://eifo-batuach-live-relay.vercel.app';
const evidence=[];
async function request(path,{method='GET',origin='https://j-h-h.github.io',status=200}={}){
 const start=Date.now(),r=await fetch(base+path,{method,headers:{Accept:'application/json',Origin:origin},redirect:'error',signal:AbortSignal.timeout(30000)}),text=await r.text();
 let data;try{data=JSON.parse(text)}catch{throw Error('NON_JSON_RESPONSE '+path+' '+r.status+' '+text.slice(0,80))}
 assert.equal(r.status,status,path+': '+JSON.stringify(data));
 assert.equal(r.headers.get('access-control-allow-origin'),'https://j-h-h.github.io');
 evidence.push({path,method,httpStatus:r.status,fetchedAt:new Date().toISOString(),elapsedMs:Date.now()-start,data});
 return data;
}
const health=await request('/v1/health');assert.equal(health.version,'1.0.0');
for(const [line,routeId] of [['72','34120'],['531','33244'],['92','33252']]){
 const routes=await request('/v1/routes?line='+line+'&stopCode=2360&routeId='+routeId);assert.equal(routes.routes.length,1);const route=routes.routes[0];
 assert.equal(route.routeId,routeId);assert.equal(route.operatorRef,'16');assert.ok(route.stops.some(s=>s.code==='2360'));assert.ok(route.coordinates.length>10);
 evidence.at(-1).data={routes:routes.routes.map(r=>({...r,coordinates:undefined,stops:r.stops.filter(s=>s.code==='2360'),coordinateCount:r.coordinates.length,destinationStopCode:r.stops.at(-1).code}))};
 const result=await request('/v1/stops/2360/arrivals?line='+line+'&routeId='+routeId);
 assert.equal(result.stopCode,'2360');assert.ok(result.routes.every(r=>r.routeId===routeId));
 for(const a of result.arrivals){assert.equal(a.routeId,routeId);assert.equal(a.realtime,true);assert.ok(a.sourceAgeSeconds>=-30&&a.sourceAgeSeconds<=180);assert.ok(Date.parse(a.reportedArrivalAt)>=Date.parse(result.retrievedAt)-90000);assert.equal(a.computedArrivalAt,null);assert.equal(a.appliedTrafficDelaySeconds,0);assert.equal(a.scheduledArrivalAt,null)}
 for(const a of result.unverified){assert.equal(a.realtime,false);assert.equal(a.reportedArrivalAt,null)}
 for(const v of result.vehicles){assert.equal(v.gpsMeasuredAt,null);assert.equal(v.gpsFreshnessVerified,false);assert.equal(v.clockType,'source-report');assert.equal(v.directionVerified,true);assert.ok(v.positionDistanceFromRouteMeters<=140)}
}
// Discover a real non-Gilo route from the national published GTFS catalog.
const otherResponse=await fetch('https://j-h-h.github.io/abc/data/line/5.json',{signal:AbortSignal.timeout(30000)});
assert.equal(otherResponse.status,200);
const otherRoutes=await otherResponse.json(),other=otherRoutes.find(r=>String(r.a)==='5')||otherRoutes.find(r=>!r.c.includes('2360'));
assert.ok(other);
const national=await request('/v1/routes?'+new URLSearchParams({line:'5',stopCode:other.c[0],routeId:String(other.r)}));
assert.equal(national.routes.length,1);assert.ok(national.routes[0].coordinates.length>10);
evidence.at(-1).data={routes:national.routes.map(r=>({...r,coordinates:undefined,coordinateCount:r.coordinates.length,stops:r.stops.slice(0,1),destinationStopCode:r.stops.at(-1).code}))};
const raw=await request('/curlbus/2360');assert.ok(Array.isArray(raw.visits?.['2360']));
evidence.at(-1).data={timestamp:raw.timestamp,visits:raw.visits['2360'].filter(v=>['72','531','92'].includes(v.line_name)).map(({static_info,...v})=>v)};
await request('/v1/health',{origin:'https://evil.example',status:403});
await request('/v1/health',{method:'POST',status:405});
await request('/proxy?url=https://example.com',{status:404});
await request('/v1/health?url=https://example.com',{status:400});
await request('/v1/traffic/flow?bbox=34,29,36,34',{status:400});
if(!health.trafficEnabled)await request('/v1/traffic/flow?bbox=35.18,31.73,35.20,31.75&routeId=34120&stopCode=2360',{status:503});
const archive=await request('/v1/vehicles/70138502/history?operatorRef=16&days=14&limit=6');
assert.ok(Array.isArray(archive.observations));for(const o of archive.observations){assert.equal(o.vehicleRef,'70138502');assert.equal(o.operatorRef,'16');assert.ok(Date.parse(o.sourceObservedAt)<=Date.now()+30000);assert.equal(o.gpsMeasuredAt,null)}
const older=await request('/v1/vehicles/89094003/history?operatorRef=15&from=2026-03-18T00%3A00%3A00Z&to=2026-03-21T00%3A00%3A00Z&limit=12');
assert.ok(Array.isArray(older.observations));
for(const o of older.observations){assert.equal(o.vehicleRef,'89094003');assert.equal(o.operatorRef,'15');assert.ok(Date.parse(o.sourceObservedAt)>=Date.parse(older.from)&&Date.parse(o.sourceObservedAt)<=Date.parse(older.to));assert.equal(o.gpsMeasuredAt,null)}
const report={service:base,checkedAt:new Date().toISOString(),result:'passed',checks:evidence.length,evidence};
await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/live-data-report.json',JSON.stringify(report,null,2));
for(const e of evidence)console.log('LIVE_CHECK_RESULT '+JSON.stringify(e));console.log('LIVE_CHECK_PASSED '+JSON.stringify({checks:report.checks,checkedAt:report.checkedAt,service:base}));
