'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const core=fs.readFileSync(path.join(root,'core.js'),'utf8');
const now=Date.now(),stamp=new Date(now-12000).toISOString(),eta=new Date(now+180000).toISOString();
function createApp(behavior){
 const ctx={console,Date,URL,URLSearchParams,Intl,AbortController,Response,setTimeout,clearTimeout,
  document:{readyState:'loading',addEventListener(){}},
  fetch:async url=>{
   const u=String(url),r=behavior(u);
   if(r instanceof Error)throw r;
   return new Response(JSON.stringify(r),{status:200,headers:{'content-type':'application/json'}});
  },window:{SafeBusDataset:{}}};
 ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(source,ctx);
 const app=ctx.window.SafeBusApp;
 app.state.line='72';app.state.stop='2360';
 app.state.route={properties:{routeId:'34119',routeDesc:'המסלול ללא מספר בטקסט',directionId:'0',headsign:'גילה',destination:'גילה'},geometry:{coordinates:[[35.18,31.73],[35.19,31.74]]}};
 return app;
}
async function test(){
 const correct={visits:{'2360':[{line_name:'72',line_id:'34119',direction_id:'0',timestamp:stamp,eta}]}};
 const a=createApp(u=>u.includes('curlbus.app')?correct:new Error('Should not query fallback'));
 let result=await a.getArrivals();assert.equal(result.arrivals.length,1);
 assert.equal(result.arrivals[0].source,'SIRI דרך curlbus');
 const b=createApp(u=>u.includes('curlbus.app')?{visits:{'2360':[]}}:u.includes('RefreshStopTimesAtStop')?{success:true,data:{routesInStop:[]}}:u.includes('busnearby.co.il')?[{pattern:{route:{shortName:'72'},headsign:'גילה'},stoptimes:[{realtimeArrival:Math.floor((now+270000)/1000),realtime:true}]}]:new Error('unexpected '+u));
 result=await b.getArrivals();assert.equal(result.arrivals.length,1);assert.equal(result.arrivals[0].source,'BusNearby');
 const c=createApp(u=>u.includes('curlbus.app')?{visits:{'2360':[]}}:u.includes('RefreshStopTimesAtStop')?{success:true,data:{routesInStop:[]}}:u.includes('busnearby.co.il')?[]:new Error('unexpected '+u));
 result=await c.getArrivals();assert.equal(result.arrivals.length,0);assert.match(c.state.sourceUsed,/אין דיווח/);
 const d=createApp(()=>new TypeError('network blocked'));await assert.rejects(()=>d.getArrivals(),/נכשלה גישה למקור/);
 const e=createApp(u=>u.includes('curlbus.app')?{visits:{'2360':[{line_name:'72',line_id:'99999',direction_id:'0',timestamp:stamp,eta}]}}:u.includes('RefreshStopTimesAtStop')?{success:true,data:{routesInStop:[]}}:[]);result=await e.getArrivals();assert.equal(result.arrivals.length,0);
 console.log('LOGIC REGRESSIONS PASSED: exact SIRI route, empty-source fallback, no-data, CORS, wrong-route filtering');
}
module.exports=test();
