'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 // Synthetic integration: real refreshArea; only providers and map are controlled.
 const source=fs.readFileSync('national.js','utf8'),start=source.indexOf(' async function refreshArea(){'),end=source.indexOf('\n function hideSearch()',start);assert.ok(start>=0&&end>start);
 const clock=new Date(Date.now()-15000).toISOString(),bbox=[35.27,32.68,35.33,32.72],vehicle={operatorRef:'6',vehicleRef:'identity-fixture',routeId:'1323',tripId:'one-trip',sourceObservedAt:clock,lat:32.7,lon:35.3};
 const frame={schemaVersion:1,bbox,vehicles:[vehicle],coverage:'source-reports-in-viewport'},state={station:null,showBuses:true,areaRevision:0,areaData:null,index:{},indexVersion:'current'},button={};let release;
 const pending=new Promise(r=>{release=r}),ctx={state,Date,Promise,AbortController,setTimeout,clearTimeout,currentBBox:()=>bbox,areaController:null,D:{routeIndexFor:()=>pending,version:()=>'current'},N:{mergeArea:(previous,raw)=>raw},json:async()=>frame,renderBuses:()=>{},renderStops:()=>{},catalogStops:()=>[],coverage:()=>{},$:()=>button};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nthis.refresh=refreshArea;',ctx);
 const begun=Date.now();await ctx.refresh();assert.ok(Date.now()-begun<2500,'Pending route metadata cannot block source frames or periodic refresh');
 assert.equal(state.busy,false);assert.equal(state.areaData.vehicles[0].sourceObservedAt,clock,'Metadata wait cannot renew a source clock');assert.equal(state.areaData.vehicles[0].vehicleRef,vehicle.vehicleRef);
 release({catalogVersion:'current',routes:{'6:1323':{line:'17',headsign:'verified current destination'}}});await new Promise(r=>setTimeout(r,0));assert.equal(state.index['6:1323'].line,'17','Late metadata upgrades the number without a new position frame');
 assert.equal(state.areaData.vehicles[0].sourceObservedAt,clock);
 assert.ok(source.includes('state.indexVersion===D.version()?state.index:{}'),'A superseded index cannot supply numbers while refreshing');

 const confirmedBBox=state.areaBBox;ctx.currentBBox=()=>[35.3,32.68,35.36,32.72];ctx.json=async()=>{throw Error('source unavailable')};await ctx.refresh();
 assert.equal(state.areaBBox,confirmedBBox,'A failed new viewport request cannot replace the confirmed source scope and erase cached reports');assert.equal(state.areaData.vehicles[0].sourceObservedAt,clock);
 vehicle.id=vehicle.operatorRef+':'+vehicle.vehicleRef;state.openVehicleId=vehicle.id;ctx.N.vehicles=rows=>rows;ctx.routeVisible=()=>true;ctx.currentBBox=()=>[34,29,36,34];let requested;
 ctx.json=async url=>{requested=new URL(url,'https://example.test').searchParams.get('bbox').split(',').map(Number);return {...frame,bbox:requested}};await ctx.refresh();
 assert.ok(requested[2]-requested[0]<=.121&&requested[3]-requested[1]<=.121,'A wide route view refreshes a bounded source area around the selected vehicle');assert.ok(requested[0]<vehicle.lon&&requested[2]>vehicle.lon&&requested[1]<vehicle.lat&&requested[3]>vehicle.lat);assert.equal(state.areaData.vehicles[0].sourceObservedAt,clock);
 console.log('PASS: synthetic delayed GTFS metadata cannot block locations; late labels preserve identity and observation clocks');
})().catch(e=>{console.error(e);process.exitCode=1});
