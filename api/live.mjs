/* DEV-owned same-origin gateway to the existing LIVE-WORK contract.
   Fixed service and endpoints; no client-supplied upstream URL or credentials. */
const UPSTREAM='https://eifo-batuach-live-relay.vercel.app/api/index';
const MAX_BYTES=1000000;
const result=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request){
 const url=new URL(request.url),q=url.searchParams;
 const kind=q.get('kind')||'arrivals',allowed=kind==='health'?['kind']:kind==='history'?['kind','vehicleRef','operatorRef','days','limit','offset','from','to']:['kind','line','stopCode','routeId'];
 if(!['health','arrivals','history'].includes(kind)||url.search.length>600||[...q.keys()].some(k=>!allowed.includes(k)||q.getAll(k).length!==1))return result({error:'INVALID_REQUEST'},400);
 const target=new URL(UPSTREAM);
 if(kind==='health')target.searchParams.set('relayPath','/v1/health');
 else if(kind==='history'){
  const ref=q.get('vehicleRef')||'',op=q.get('operatorRef')||'';
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(ref)||!/^\d{1,12}$/.test(op))return result({error:'INVALID_VEHICLE_OR_OPERATOR'},400);
  for(const [name,def,min,max] of [['days',14,1,14],['limit',200,1,250],['offset',0,0,2000]]){
   const value=q.has(name)?Number(q.get(name)):def;
   if(q.has(name)&&!/^\d+$/.test(q.get(name))||!Number.isInteger(value)||value<min||value>max)return result({error:'INVALID_HISTORY_BOUNDS'},400);
   target.searchParams.set(name,String(value));
  }
  if(q.has('from')!==q.has('to'))return result({error:'FROM_TO_REQUIRED_TOGETHER'},400);
  if(q.has('from')){
   const from=q.get('from'),to=q.get('to'),a=Date.parse(from),b=Date.parse(to),iso=/(?:Z|[+-]\d{2}:\d{2})$/;
   if(!iso.test(from)||!iso.test(to)||!Number.isFinite(a)||!Number.isFinite(b)||a>=b||b-a>14*86400000||a<Date.now()-366*86400000||b>Date.now()+30000)return result({error:'INVALID_HISTORY_WINDOW'},400);
   target.searchParams.set('from',from);target.searchParams.set('to',to);
  }
  target.searchParams.set('relayPath','/v1/vehicles/'+ref+'/history');target.searchParams.set('operatorRef',op);
 }
 else{
  if(!/^\d{1,5}[A-Za-z]?$/.test(q.get('line')||'')||!/^\d{3,7}$/.test(q.get('stopCode')||'')||!/^\d{1,12}$/.test(q.get('routeId')||''))return result({error:'INVALID_ROUTE_OR_STOP'},400);
  target.searchParams.set('relayPath','/v1/stops/'+q.get('stopCode')+'/arrivals');
  target.searchParams.set('line',q.get('line'));target.searchParams.set('routeId',q.get('routeId'));
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),kind==='history'?28000:18000);
 try{
  const upstream=await fetch(target,{headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:controller.signal});
  if(!(upstream.headers.get('content-type')||'').toLowerCase().includes('json'))return result({error:'LIVE_RELAY_NOT_JSON'},502);
  const reader=upstream.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return result({error:'LIVE_RELAY_TOO_LARGE'},502)}text+=decoder.decode(value,{stream:true})}
  text+=decoder.decode();const body=JSON.parse(text);
  const status=upstream.ok?200:[400,404,409,429,503].includes(upstream.status)?upstream.status:502;
  const response=result(body,status);if(status===429)response.headers.set('Retry-After','60');
  return response;
 }catch(e){console.error('DEV live gateway failure',e.name);return result({error:e.name==='AbortError'?'LIVE_RELAY_TIMEOUT':'LIVE_RELAY_UNAVAILABLE'},502);}
 finally{clearTimeout(timer);}
}
