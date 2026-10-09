'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const parent=path.join(__dirname,'..');
const memory=new Map();
const window={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
const context={window,globalThis:window,Date,Math,console};
vm.createContext(context);
for(const name of ['core.js','vehicle-history.js','traffic-analysis.js']){
 vm.runInContext(fs.readFileSync(path.join(parent,name),'utf8'),context,{filename:name});
}
const H=window.SafeBusHistory,T=window.SafeBusTraffic;
const now=Date.now(),start=now-45*60000;
function item(t,trip,lat=31.75,lon=35.20,vehicle='900888'){
 return {vehicle_ref:vehicle,ride_id:trip,lat,lon,observed_at:new Date(t).toISOString(),clockType:'gps-measurement',source:'Open Bus'};
}
function tripAt(t,ride){for(const offset of [0,180000,360000,540000])H.ingest(item(t+offset,ride),{line:'72',now});}
tripAt(start,'ride-one');
let r=H.summary('900888',now);
assert.equal(r.recurrent,false,'One stationary trip is not recurrence');
assert.equal(r.stationaryTrips,1);
tripAt(start+12*60000,'ride-two');
r=H.summary('900888',now);
assert.equal(r.recurrent,true,'Two different trips with long independent stops should alert');
assert.equal(r.stationaryTrips,2);
assert.equal(r.stationaryEvents,2,'Repeated polls must not create duplicate events');
assert.equal(r.observations,8);
assert.ok(H.trail('900888','ride-two',start+21*60000).length>=2);
H.ingest({...item(now-9000,'ride-three'),clockType:'source-report'}, {line:'72',now});
assert.equal(H.summary('900888',now).observations,8,'SIRI reports cannot masquerade as independent GPS fixes');
H.ingest(item(now-30000,'x',31.7,35.22,'200003'),{line:'531',now});
H.ingest(item(now-20000,'x',31.74,35.24,'200003'),{line:'531',now});
const jump=H.summary('200003',now);
assert.equal(jump.recurrent,false,'GPS teleportation is not proof of mechanical fault');
assert.ok(jump.gpsJumps>=1,'GPS jump should be recorded as measurement anomaly');
const snapshot={routeId:'34119',stopCode:'2360',observedAt:new Date(now).toISOString(),source:'TomTom flow',
 segments:[{geometry:{type:'LineString',coordinates:[[35.19,31.74],[35.20,31.75]]},currentSpeedKmh:15,freeFlowSpeedKmh:55,confidence:.9}],
 matchMethod:'directed-route-corridor',validated:true,coveredMeters:800,remainingRouteMeters:1000,delaySeconds:240,confidence:.9};
const good=T.normalize(snapshot,{routeId:'34119',stopCode:'2360',now});
assert.equal(good.available,true);
assert.equal(good.etaAdjustment,4);
assert.equal(T.weightedEta({minutes:5,realtime:false},good).minutes,9);
assert.equal(T.weightedEta({minutes:5,realtime:true},good),null,'Must not double count congestion in live ETA');
const bad=T.normalize({...snapshot,validated:false},{routeId:'34119',stopCode:'2360',now});
assert.equal(bad.etaAdjustment,null,'Unvalidated traffic cannot be included in ETA');
const stale=T.normalize({...snapshot,observedAt:new Date(now-10*60000).toISOString()},{routeId:'34119',stopCode:'2360',now});
assert.equal(stale.available,false,'Stale traffic cannot be colored as live');
const wrongRoute=T.normalize(snapshot,{routeId:'44444',stopCode:'2360',now});
assert.equal(wrongRoute.available,false);
const missingGeometry=T.normalize({...snapshot,segments:[{...snapshot.segments[0],geometry:{type:'LineString',coordinates:[[0,0],[0,0]]}}]},{routeId:'34119',stopCode:'2360',now});
assert.equal(missingGeometry.available,false);
console.log('PASS: local cross-trip history, duplicate evidence, timestamp integrity, GPS jumps and 6 traffic safeguards');
