/* DEV traffic gateway: free-only activation; provider response time is not road measurement time. */
const MAX_AGE=180000,MAX_BYTES=400000,TTL=30000;
const cache=new Map(),pending=new Map();let blockedUntil=0;
const enabled=()=>process.env.TOMTOM_TRAFFIC_ENABLED==='true'&&process.env.TOMTOM_NONBILLING_CONFIRMED==='true'&&!!process.env.TOMTOM_TRAFFIC_KEY;
const result=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const failure=(code,status=502)=>result({error:code},status);
function tileResponse(tile){return new Response(tile.bytes,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=30','X-Traffic-Originated-At':tile.originatedAt,'X-Traffic-Source-Age':String(tile.sourceAge),'X-Traffic-Retrieved-At':tile.retrievedAt,'X-Traffic-Clock':'provider-response','X-Content-Type-Options':'nosniff'}});}
function isFresh(tile,now){return now-Date.parse(tile.originatedAt)+tile.sourceAge*1000<=MAX_AGE;}
export async function GET(request){
 const q=new URL(request.url).searchParams;
 if(q.get('kind')==='status'&&q.size===1)return result({available:enabled(),provider:enabled()?'TomTom':null,state:!enabled()?'not-connected':Date.now()<blockedUntil?'quota-exhausted':'configured',clockType:'provider-response',maxAgeSeconds:MAX_AGE/1000});
 if(!enabled())return failure('TRAFFIC_NOT_CONNECTED',503);
 if(q.size!==3||[...q.keys()].some(k=>!['z','x','y'].includes(k)||q.getAll(k).length!==1)||[...q.values()].some(v=>!/^\d{1,7}$/.test(v)))return failure('INVALID_TILE',400);
 const z=Number(q.get('z')),x=Number(q.get('x')),y=Number(q.get('y')),n=2**z;
 if(z<7||z>18||x>=n||y>=n)return failure('INVALID_TILE',400);
 const lon=t=>t/n*360-180,lat=t=>Math.atan(Math.sinh(Math.PI*(1-2*t/n)))*180/Math.PI;
 if(lon(x)>36||lon(x+1)<34||lat(y+1)>34||lat(y)<29)return failure('OUTSIDE_COVERAGE',400);
 if(Date.now()<blockedUntil)return failure('TRAFFIC_QUOTA_EXHAUSTED',429);
 const key=z+'/'+x+'/'+y,hit=cache.get(key),now=Date.now();
 if(hit&&now-Date.parse(hit.retrievedAt)<TTL&&isFresh(hit,now))return tileResponse(hit);
 cache.delete(key);
 if(!pending.has(key))pending.set(key,(async()=>{
  try{
   const url=new URL('https://api.tomtom.com/traffic/map/4/tile/flow/relative/'+key+'.png');
   url.searchParams.set('key',process.env.TOMTOM_TRAFFIC_KEY);url.searchParams.set('thickness','3');
   const r=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000)});
   if(r.status===429){const retry=Number(r.headers.get('retry-after'));blockedUntil=Date.now()+Math.min(3600,Math.max(60,Number.isFinite(retry)?retry:60))*1000;return {error:'TRAFFIC_QUOTA_EXHAUSTED',status:429};}
   if(!r.ok||!(r.headers.get('content-type')||'').toLowerCase().startsWith('image/png'))return {error:'TRAFFIC_UNAVAILABLE'};
   const responseAt=Date.parse(r.headers.get('date')),ageText=r.headers.get('age'),sourceAge=ageText===null?0:Number(ageText),received=Date.now();
   if(!Number.isFinite(responseAt)||!Number.isFinite(sourceAge)||sourceAge<0||responseAt>received+30000||received-responseAt+sourceAge*1000>MAX_AGE)return {error:'TRAFFIC_EXPIRED'};
   const bytes=await r.arrayBuffer(),signature=new Uint8Array(bytes);
   if(bytes.byteLength<8||bytes.byteLength>MAX_BYTES||[137,80,78,71,13,10,26,10].some((v,i)=>signature[i]!==v))return {error:'TRAFFIC_INVALID_TILE'};
   const tile={bytes,originatedAt:new Date(responseAt).toISOString(),sourceAge,retrievedAt:new Date(received).toISOString()};
   if(!isFresh(tile,Date.now()))return {error:'TRAFFIC_EXPIRED'};
   cache.set(key,tile);if(cache.size>96)cache.delete(cache.keys().next().value);return tile;
  }catch{return {error:'TRAFFIC_UNAVAILABLE'};}
 })());
 let tile;try{tile=await pending.get(key);}finally{pending.delete(key);}
 return tile.error?failure(tile.error,tile.status||502):isFresh(tile,Date.now())?tileResponse(tile):failure('TRAFFIC_EXPIRED');
}
