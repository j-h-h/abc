/* DEV traffic gateway. Free-only gates apply to ordinary tiles and bounded diagnostics. */
const MAX_AGE=180000,MAX_BYTES=400000,TTL=30000,PROBE_WINDOW=3600000;
const cache=new Map(),pending=new Map();let blockedUntil=0,probeWindow=0,probeCalls=0;
const configured=()=>process.env.TOMTOM_TRAFFIC_ENABLED==='true'&&process.env.TOMTOM_NONBILLING_CONFIRMED==='true'&&!!process.env.TOMTOM_TRAFFIC_KEY;
const coverageConfirmed=()=>process.env.TOMTOM_ISRAEL_COVERAGE_CONFIRMED==='true';
const activeAPI=()=>process.env.TOMTOM_TRAFFIC_API==='orbis-v2'?'orbis-v2':'classic';
const enabled=()=>configured()&&coverageConfirmed();
const result=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const failure=(code,status=502,upstreamStatus=null)=>result({error:code,...(upstreamStatus?{upstreamStatus}:{})},status);
const cities=Object.freeze({'tel-aviv':[32.075,34.79],jerusalem:[31.79,35.20],haifa:[32.805,35.00]});
function cityTile(name){const [lat,lon]=cities[name],z=14,n=2**z;return z+'/'+Math.floor((lon+180)/360*n)+'/'+Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);}
function tileResponse(tile,diagnostic=false){return new Response(tile.bytes,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=30','X-Traffic-Originated-At':tile.originatedAt,'X-Traffic-Source-Age':String(tile.sourceAge),'X-Traffic-Retrieved-At':tile.retrievedAt,'X-Traffic-Clock':'provider-response','X-Traffic-Provider-API':tile.providerAPI,...(diagnostic?{'X-Traffic-Diagnostic':'true'}:{}),'X-Content-Type-Options':'nosniff'}});}
function isFresh(tile,now){return now-Date.parse(tile.originatedAt)+tile.sourceAge*1000<=MAX_AGE;}
async function tileRequest(key,providerAPI,{diagnostic=false}={}){
 if(Date.now()<blockedUntil)return failure('TRAFFIC_QUOTA_EXHAUSTED',429);
 const cacheKey=providerAPI+'/'+key,hit=cache.get(cacheKey),now=Date.now();
 if(hit&&now-Date.parse(hit.retrievedAt)<TTL&&isFresh(hit,now))return tileResponse(hit,diagnostic);
 cache.delete(cacheKey);
 if(!pending.has(cacheKey)){
  if(diagnostic){if(now-probeWindow>=PROBE_WINDOW){probeWindow=now;probeCalls=0;}if(probeCalls>=6)return failure('TRAFFIC_PROBE_LIMIT',429);probeCalls++;}
  pending.set(cacheKey,(async()=>{
   try{
    const headers={Accept:'image/png'};let url;
    if(providerAPI==='orbis-v2'){
     url=new URL('https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/'+key);url.searchParams.set('apiVersion','2');url.searchParams.set('style','light');url.searchParams.set('tileSize','256');headers['TomTom-Api-Key']=process.env.TOMTOM_TRAFFIC_KEY;
    }else{
     url=new URL('https://api.tomtom.com/traffic/map/4/tile/flow/relative/'+key+'.png');url.searchParams.set('key',process.env.TOMTOM_TRAFFIC_KEY);url.searchParams.set('thickness','3');
    }
    const r=await fetch(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000)});
    if(r.status===429){const retry=Number(r.headers.get('retry-after'));blockedUntil=Date.now()+Math.min(3600,Math.max(60,Number.isFinite(retry)?retry:60))*1000;return {error:'TRAFFIC_QUOTA_EXHAUSTED',status:429,upstreamStatus:429};}
    if(!r.ok||!(r.headers.get('content-type')||'').toLowerCase().startsWith('image/png'))return {error:'TRAFFIC_UNAVAILABLE',upstreamStatus:r.status};
    const responseAt=Date.parse(r.headers.get('date')),ageText=r.headers.get('age'),sourceAge=ageText===null?0:Number(ageText),received=Date.now();
    if(!Number.isFinite(responseAt)||!Number.isFinite(sourceAge)||sourceAge<0||responseAt>received+30000||received-responseAt+sourceAge*1000>MAX_AGE)return {error:'TRAFFIC_EXPIRED'};
    const declared=Number(r.headers.get('content-length'));if(Number.isFinite(declared)&&declared>MAX_BYTES)return {error:'TRAFFIC_INVALID_TILE'};
    const reader=r.body.getReader(),parts=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return {error:'TRAFFIC_INVALID_TILE'};}parts.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    if(size<8||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))return {error:'TRAFFIC_INVALID_TILE'};
    const tile={bytes,originatedAt:new Date(responseAt).toISOString(),sourceAge,retrievedAt:new Date(received).toISOString(),providerAPI};
    if(!isFresh(tile,Date.now()))return {error:'TRAFFIC_EXPIRED'};
    cache.set(cacheKey,tile);if(cache.size>96)cache.delete(cache.keys().next().value);return tile;
   }catch{return {error:'TRAFFIC_UNAVAILABLE'};}
  })());
 }
 let tile;try{tile=await pending.get(cacheKey);}finally{pending.delete(cacheKey);}
 return tile.error?failure(tile.error,tile.status||502,tile.upstreamStatus):isFresh(tile,Date.now())?tileResponse(tile,diagnostic):failure('TRAFFIC_EXPIRED');
}
export async function GET(request){
 const q=new URL(request.url).searchParams;
 if(q.get('kind')==='status'&&q.size===1)return result({available:enabled(),connected:configured(),provider:configured()?'TomTom':null,providerAPI:activeAPI(),state:!configured()?'not-connected':!coverageConfirmed()?'coverage-unavailable':Date.now()<blockedUntil?'quota-exhausted':'configured',coverageCountry:'IL',clockType:'provider-response',maxAgeSeconds:MAX_AGE/1000});
 if(!configured())return failure('TRAFFIC_NOT_CONNECTED',503);
 if(q.get('kind')==='probe'){
  if(q.size!==3||[...q.keys()].some(k=>!['kind','provider','city'].includes(k)||q.getAll(k).length!==1)||!['classic','orbis-v2'].includes(q.get('provider'))||!Object.hasOwn(cities,q.get('city')))return failure('INVALID_PROBE',400);
  // Diagnostics return fixed-city source images only. They do not activate map coverage.
  return tileRequest(cityTile(q.get('city')),q.get('provider'),{diagnostic:true});
 }
 if(!coverageConfirmed())return failure('TRAFFIC_COVERAGE_UNAVAILABLE',503);
 if(q.size!==3||[...q.keys()].some(k=>!['z','x','y'].includes(k)||q.getAll(k).length!==1)||[...q.values()].some(v=>!/^\d{1,7}$/.test(v)))return failure('INVALID_TILE',400);
 const z=Number(q.get('z')),x=Number(q.get('x')),y=Number(q.get('y')),n=2**z;
 if(z<7||z>18||x>=n||y>=n)return failure('INVALID_TILE',400);
 const lon=t=>t/n*360-180,lat=t=>Math.atan(Math.sinh(Math.PI*(1-2*t/n)))*180/Math.PI;
 if(lon(x)>36||lon(x+1)<34||lat(y+1)>34||lat(y)<29)return failure('OUTSIDE_COVERAGE',400);
 return tileRequest(z+'/'+x+'/'+y,activeAPI());
}
