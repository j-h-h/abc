'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const {GET}=await import('../api/traffic.mjs?bounded-probe'),req=q=>new Request('https://dev.example/api/traffic?'+q);
 const origFetch=global.fetch,origNow=Date.now,keys=['TOMTOM_TRAFFIC_KEY','TOMTOM_TRAFFIC_ENABLED','TOMTOM_NONBILLING_CONFIRMED','TOMTOM_ISRAEL_COVERAGE_CONFIRMED','TOMTOM_TRAFFIC_API'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let now=origNow(),calls=[];Date.now=()=>now;
 try{
  for(const k of keys)delete process.env[k];process.env.TOMTOM_TRAFFIC_ENABLED='true';process.env.TOMTOM_TRAFFIC_KEY='synthetic-probe-secret';
  global.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0]),{headers:{'Content-Type':'image/png',Date:new Date(now).toUTCString()}})};
  const probe='kind=probe&provider=orbis-v2&city=tel-aviv';
  assert.equal((await GET(req(probe))).status,503);assert.equal(calls.length,0,'Probe still requires nonbilling consent');
  process.env.TOMTOM_NONBILLING_CONFIRMED='true';
  for(const query of [probe+'&url=https://evil.example','kind=probe&provider=evil&city=tel-aviv','kind=probe&provider=orbis-v2&city=__proto__',probe+'&city=haifa'])assert.equal((await GET(req(query))).status,400);
  assert.equal(calls.length,0);
  for(const provider of ['classic','orbis-v2'])for(const city of ['tel-aviv','jerusalem','haifa']){
   const r=await GET(req('kind=probe&provider='+provider+'&city='+city));assert.equal(r.status,200);assert.equal(r.headers.get('X-Traffic-Diagnostic'),'true');assert.equal(r.headers.get('X-Traffic-Provider-API'),provider);assert.equal(r.headers.get('X-Traffic-Clock'),'provider-response');assert.ok(!JSON.stringify([...r.headers]).includes('synthetic-probe-secret'));
  }
  assert.equal(calls.length,6);
  for(const call of calls){assert.equal(call.url.hostname,'api.tomtom.com');assert.equal(call.options.redirect,'error');if(call.url.pathname.includes('/orbis/')){assert.equal(call.url.searchParams.get('key'),null);assert.equal(call.options.headers['TomTom-Api-Key'],'synthetic-probe-secret');assert.equal(call.url.searchParams.get('apiVersion'),'2');}}
  const again=await GET(req(probe));assert.equal(again.status,200);assert.equal(calls.length,6,'Short diagnostic cache does not consume another call');
  assert.equal((await (await GET(req('kind=status'))).json()).available,false,'Even synthetic nonempty diagnostic bytes cannot activate coverage');
  assert.equal((await GET(req('z=15&x=19550&y=13290'))).status,503);
  now+=31000;assert.equal((await GET(req(probe))).status,429);assert.equal(calls.length,6,'Only six diagnostic source calls per hour in an instance');
 }finally{Date.now=origNow;global.fetch=origFetch;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
 console.log('PASS SYNTHETIC: free-only fixed-city probes, source clocks, no secret response, no SSRF, bounded call budget and no automatic activation. No real provider calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
