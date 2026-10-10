'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const window={SafeBusCore:{gpsAge:(at,now)=>(now-Date.parse(at))/1000,ageText:x=>x+' שניות'}},document={addEventListener(){}},context={window,document,Date,Number,String,console};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../experience.js'),'utf8'),context);
const marker=window.SafeBusExperience.marker,now=Date.parse('2026-10-10T08:00:00Z'),fresh={observed_at:new Date(now-10000).toISOString()};
for(const [raw,angle] of [[0,0],[90,90],[180,180],[270,270],[360,0],[42.5,42.5]]){
 const html=marker({...fresh,bearing:raw},'332',null,now);
 assert.ok(html.includes('rotate('+angle+'deg)'), 'Source bearing uses clockwise degrees from north, including zero');
 assert.ok(html.includes('class="bus-heading"')&&html.includes('viewBox="0 0 52 52"'));
 assert.ok(!html.includes('class="bus-face"><svg'),'The map marker has no bus pictogram');
 assert.ok(html.includes('>332<small>'),'The public line remains an upright label');
}
for(const bearing of [null,undefined,'90',false,-1,361,NaN,Infinity,-Infinity]){
 assert.ok(!marker({...fresh,bearing},'332',null,now).includes('class="bus-heading"'),'Missing or invalid bearings have no invented arrow');
}
assert.ok(!marker({observed_at:new Date(now-181000).toISOString(),bearing:90},'332',null,now).includes('class="bus-heading"'),'An expired report has no current-heading arrow');
assert.ok(marker(fresh,'<img>',null,now).includes('&lt;img&gt;'),'Line label is escaped');
console.log('PASS: north/east/south/west and fractional source bearings, missing/invalid/expired heading rejection, upright line and escaped labels');
