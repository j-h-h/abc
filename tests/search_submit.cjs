'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../national.js'),'utf8'),start=source.indexOf(' async function search(event){'),end=source.indexOf(' async function searchLine(line){',start);
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../national-contract.js'),'utf8'),{window,Date,Number,String,Map,console});
const N=window.SafeBusNationalContract,lines=['5','72','720','10א'],state={stops:[{code:'72'},{code:'720'},{code:'23014'}]},field={value:''},selected=[];
const ctx={N,state,D:{allLines:()=>lines},$:()=>field,clearTimeout(){},searchTimer:null,toast(){throw Error('unexpected toast')},saveSearch(){},localSearch:()=>state.stops,
 searchLine:async line=>selected.push(['line',line]),selectStop:code=>selected.push(['stop',code])};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';this.search=search',ctx);
(async()=>{
 for(const [value,kind,id]of [['72','line','72'],['5','line','5'],['קו 10א','line','10א'],['720','line','720'],['תחנה 72','stop','72'],['23014','stop','23014']]){
  field.value=value;await ctx.search({preventDefault(){}});assert.deepEqual(selected.at(-1),[kind,id],value);
 }
 assert.equal(N.searchHistory([{kind:'stop',label:'צומת נחשון',code:'72'}])[0].code,'72');
 console.log('PASS: synthetic search submit disambiguates real short stop 72 from public line 72; explicit stop, one digit, Hebrew suffix and full stop code');
})().catch(e=>{console.error(e);process.exitCode=1});
