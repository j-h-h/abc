'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const {GET}=await import('../api/traffic.mjs');
 const base='https://dev.example/api/traffic',request=q=>new Request(base+'?'+q);
 delete process.env.TOMTOM_TRAFFIC_ENABLED;delete process.env.TOMTOM_NONBILLING_CONFIRMED;delete process.env.TOMTOM_TRAFFIC_KEY;
 assert.equal((await (await GET(request('kind=status'))).json()).available,false);
 assert.equal((await GET(request('z=15&x=19550&y=13290'))).status,503);
 process.env.TOMTOM_TRAFFIC_ENABLED='true';process.env.TOMTOM_TRAFFIC_KEY='synthetic-not-a-real-key';
 assert.equal((await (await GET(request('kind=status'))).json()).available,false,'Key alone cannot activate billing');
 process.env.TOMTOM_NONBILLING_CONFIRMED='true';
 let calls=0,current={status:200,headers:{'content-type':'image/png',date:new Date().toUTCString()}};
 const original=global.fetch,bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 global.fetch=async (url,options)=>{calls++;assert.equal(new URL(url).hostname,'api.tomtom.com');assert.equal(options.redirect,'error');return new Response(bytes,current)};
 try{
  for(const q of ['z=6&x=1&y=1','z=15&x=32768&y=1','z=15&x=19550&y=13290&url=https://evil.example','z=15&x=19550&x=19551&y=13290','z=15&x=0&y=0'])assert.equal((await GET(request(q))).status,400);
  assert.equal(calls,0);
  const z=15,x=Math.floor((34.8+180)/360*2**z),lat=32.08*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*2**z),q=i=>'z='+z+'&x='+(x+i)+'&y='+y;
  let r=await GET(request(q(0)));assert.equal(r.status,200);assert.equal(r.headers.get('X-Traffic-Clock'),'provider-response');assert.ok(r.headers.get('X-Traffic-Originated-At'));assert.equal(r.headers.get('X-Traffic-Source-Age'),'0');assert.ok(!JSON.stringify([...r.headers]).includes('synthetic-not-a-real-key'));
  const clock=r.headers.get('X-Traffic-Retrieved-At');r=await GET(request(q(0)));assert.equal(r.headers.get('X-Traffic-Retrieved-At'),clock);assert.equal(calls,1,'Short cache does not restamp source time');
  current={status:200,headers:{'content-type':'image/png'}};assert.equal((await (await GET(request(q(1)))).json()).error,'TRAFFIC_EXPIRED');
  for(const date of [new Date(Date.now()-190000).toUTCString(),new Date(Date.now()+60000).toUTCString()]){
   current={status:200,headers:{'content-type':'image/png',date}};assert.equal((await (await GET(request(q(2)))).json()).error,'TRAFFIC_EXPIRED');
  }
  current={status:200,headers:{'content-type':'image/png',date:new Date().toUTCString(),age:'190'}};assert.equal((await (await GET(request(q(3)))).json()).error,'TRAFFIC_EXPIRED');
  current={status:200,headers:{'content-type':'text/html',date:new Date().toUTCString()}};assert.equal((await GET(request(q(4)))).status,502);
  current={status:429,headers:{'retry-after':'60'}};r=await GET(request(q(5)));assert.equal(r.status,429);assert.equal((await r.json()).error,'TRAFFIC_QUOTA_EXHAUSTED');
  const before=calls;assert.equal((await GET(request(q(6)))).status,429);assert.equal(calls,before,'Quota failures open a circuit rather than repeat requests');
  assert.equal((await (await GET(request('kind=status'))).json()).state,'quota-exhausted');
 }finally{global.fetch=original;delete process.env.TOMTOM_TRAFFIC_KEY;}
 const window={},ctx={window,Date,Number,Headers};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../traffic-tiles.js'),'utf8'),ctx);
 const timing=window.SafeBusTrafficTiles.timing,now=Date.now(),headers=new Headers({'X-Traffic-Originated-At':new Date(now-10000).toISOString(),'X-Traffic-Retrieved-At':new Date(now-1000).toISOString(),'X-Traffic-Source-Age':'0','X-Traffic-Clock':'provider-response'});
 assert.ok(timing(headers,now));assert.equal(timing(headers,now+180000),null,'A later tile cannot refresh this image');
 for(const [key,value] of [['X-Traffic-Originated-At',new Date(now+60000).toISOString()],['X-Traffic-Clock','gps'],['X-Traffic-Source-Age','200'],['X-Traffic-Retrieved-At','missing']]){const h=new Headers(headers);h.set(key,value);assert.equal(timing(h,now),null,key);}
 console.log('PASS SYNTHETIC: DEV traffic server consent gates, input restrictions, source clock, cache, expiration, quota circuit and client clocks. No real TomTom calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
