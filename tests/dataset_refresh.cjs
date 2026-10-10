'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const oldVersion='1111111111111111',newVersion='2222222222222222';let activeVersion=newVersion,clock=100000,calls=[],failed=false;
 const catalog={schema:2,lines:['5','18'],stops:{20000:[32.08,34.79,'מקור'],30000:[32.1,34.81,'יעד']},served:{20000:['5','18'],30000:['5','18']}};
 const raw={5:[{a:15,r:101,c:['20000','30000'],h:'יעד עדכני'}],18:[{a:3,r:202,c:['20000','30000'],h:'יעד חדש'}]};
 const cache=new Map(),store=new Map(),window={},ctx={window,Date:class extends Date{static now(){return clock}},URL,JSON,Number,String,Map,Set,Promise,Math,Array,Object,Response,AbortSignal,console,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},caches:{open:async()=>({match:async key=>cache.get(key)?.clone(),put:async(key,r)=>cache.set(key,r.clone())})},
 fetch:async url=>{calls.push(url);if(url==='./data/routes-index.json')return Response.json({catalogVersion:oldVersion,routes:{'15:101':{line:'5',headsign:'ישן'}}});
  const q=new URL(url,'https://dev.test').searchParams,file=q.get('file');
  if(file==='version.json')return Response.json({version:activeVersion});
  if(q.get('v')!==activeVersion)return Response.json({error:'DATASET_CHANGED'},{status:409});
  if(file==='catalog.json')return Response.json(catalog);
  const m=/^line\/(5|18)\.json$/.exec(file);if(m){if(failed&&m[1]==='5')return Response.json({error:'down'},{status:503});return Response.json(raw[m[1]]);}
  throw Error('unexpected '+url);
 }};
 window.caches=ctx.caches;vm.createContext(ctx);vm.runInContext(fs.readFileSync('gtfs-store.js','utf8'),ctx);const D=window.SafeBusDataset;
 await D.init();let result=await D.routeIndexFor([{operatorRef:'15',routeId:'101',lat:32.08,lon:34.79}]);
 assert.equal(result.catalogVersion,newVersion);assert.equal(result.routes['15:101'].line,'5');assert.equal(result.routes['15:101'].headsign,'יעד עדכני','A deployment hint cannot supply stale destination metadata');
 assert.ok(calls.some(u=>u.includes('line%2F5.json')&&u.includes(newVersion)),'Mismatch must resolve against current version');
 result=await D.routeIndexFor([{operatorRef:'3',routeId:'202',lat:32.08,lon:34.79},{operatorRef:'97',routeId:'101',lat:32.08,lon:34.79}]);
 assert.equal(result.routes['3:202'].line,'18','New route absent from old index is resolved through nearby served lines');
 assert.equal(result.routes['97:101'],undefined,'Same route id from a different operator cannot borrow a number or destination');
 const before=calls.length;await D.routeIndexFor([{operatorRef:'15',routeId:'101'}]);assert.equal(calls.length,before,'Verified metadata is reused within its version');
 activeVersion='3333333333333333';raw[5]=[{a:15,r:101,c:['20000','30000'],h:'יעד גרסה שלישית'}];clock+=61000;result=await D.routeIndexFor([{operatorRef:'15',routeId:'101',lat:32.08,lon:34.79}]);
 assert.equal(result.catalogVersion,activeVersion);assert.equal(result.routes['15:101'].headsign,'יעד גרסה שלישית','An open page also detects a later daily GTFS version');
 assert.ok([...cache.keys()].some(u=>u.includes(newVersion))&&[...cache.keys()].some(u=>u.includes(activeVersion)),'Route caches separate feed versions');
 activeVersion='4444444444444444';raw[5]=[{a:15,r:999,c:['20000','30000'],h:'another route'}];raw[18]=[{a:15,r:101,c:['20000','30000'],h:'new public line'}];clock+=61000;result=await D.routeIndexFor([{operatorRef:'15',routeId:'101',lat:32.08,lon:34.79}]);assert.equal(result.routes['15:101'].line,'18','A retained route id with a renamed public line must be independently resolved, not borrowed from the old hint');
 activeVersion='5555555555555555';raw[5]=[{a:15,r:101,c:['20000','30000'],h:'unavailable'}];raw[18]=[];failed=true;clock+=61000;result=await D.routeIndexFor([{operatorRef:'15',routeId:'101',lat:32.08,lon:34.79}]);assert.equal(result.routes['15:101'],undefined,'A failed current file must remain missing, never use old hint');
 console.log('PASS: daily GTFS mismatch recovery, exact operator-route identity, new routes, open-page refresh, cache versions and failure without guessing (synthetic)');
})().catch(e=>{console.error(e);process.exitCode=1});
