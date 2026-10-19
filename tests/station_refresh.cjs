'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../national.js'),'utf8');
const body=source.slice(source.indexOf('async function refreshStation(){'),source.indexOf(' function currentBBox(){'));
const pending=[],elements={},state={station:{code:'23014'},revision:1,stationRequest:0},context={state,AbortController,Date,encodeURIComponent,
 json:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),N:{station:(r,code)=>({...r,code}),fresh:()=>true},D:{linesAt:()=>['1']},
 $:id=>elements[id]||(elements[id]={}),renderArrivals(){},renderBuses(){},renderLineChoices(){},stationController:null};
vm.createContext(context);vm.runInContext(body+';this.refresh=refreshStation',context);
(async()=>{
 const a=context.refresh(),b=context.refresh();
 pending[0].reject(Object.assign(new Error('aborted'),{name:'AbortError'}));await a;
 assert.equal(state.busy,true,'Aborted old request cannot clear the new request busy state');
 assert.equal(elements.stationRefresh.disabled,true);
 pending[1].resolve({sourceResponseAt:new Date().toISOString(),tag:'new'});await b;
 assert.equal(state.stationData.tag,'new');assert.equal(state.busy,false);
 const c=context.refresh(),d=context.refresh();pending[3].resolve({sourceResponseAt:new Date().toISOString(),tag:'latest'});await d;
 pending[2].resolve({sourceResponseAt:new Date().toISOString(),tag:'late-old'});await c;
 assert.equal(state.stationData.tag,'latest','Ignored abort cannot overwrite the newer source frame');
 const e=context.refresh();state.revision++;state.station={code:'3441'};state.stationData=null;
 pending[4].resolve({sourceResponseAt:new Date().toISOString(),tag:'other-stop'});await e;
 assert.equal(state.stationData,null,'A former station response cannot enter the current station');
 console.log('PASS: synthetic station refresh race, ignored abort and changed station isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
