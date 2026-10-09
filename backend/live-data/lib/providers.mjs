import {decodePolyline,coordOK} from './geometry.mjs';
import {normalizeCurlbus,normalizeStride,normalizeStrideRides,iso} from './transit.mjs';
import {normalizeHereFlow,normalizeHereIncidents} from './traffic.mjs';
export class ServiceError extends Error{constructor(code,status=502,details={}){super(code);this.code=code;this.status=status;this.details=details}}
const ROOT={curlbus:'https://curlbus.app/',mot:'https://api.bus.gov.il/prod/mot-scheduler-prod/api/he/',stride:'https://open-bus-stride-api.hasadna.org.il/',catalog:'https://j-h-h.github.io/abc/data/',here:'https://data.traffic.hereapi.com/v7/'};
export function createProviders({fetchImpl=fetch,now=Date.now,config={}}={}){
 const cache=new Map(),pending=new Map();let active=0;const recent=[];
 async function json(url,{ttl=0,maxBytes=2000000}={}){
  const hit=cache.get(url),time=now();if(hit&&hit.until>time)return hit.result;
  if(ttl&&pending.has(url))return pending.get(url);
  const work=(async()=>{
   while(recent.length&&recent[0]<now()-60000)recent.shift();
   if(active>=8||recent.length>=120)throw new ServiceError('UPSTREAM_BUDGET_LIMIT',429);
   active++;recent.push(now());const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new ServiceError('UPSTREAM_HTTP_'+response.status,response.status===429?429:502,{upstreamStatus:response.status,retryAfter:response.status===429?60:undefined});
    if(!(response.headers.get('content-type')||'').toLowerCase().includes('json'))throw new ServiceError('UPSTREAM_NOT_JSON');
    if(Number(response.headers.get('content-length')||0)>maxBytes)throw new ServiceError('UPSTREAM_TOO_LARGE');
    const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new ServiceError('UPSTREAM_TOO_LARGE')}text+=decoder.decode(value,{stream:true})}
    text+=decoder.decode();let data;try{data=JSON.parse(text)}catch{throw new ServiceError('UPSTREAM_INVALID_JSON')}
    const result={data,retrievedAt:new Date(now()).toISOString(),upstreamDate:response.headers.get('date')};
    if(ttl){if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(url,{until:now()+ttl,result})}
    return result;
   }catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError(e.name==='AbortError'?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE')}
   finally{active--;clearTimeout(timer)}
  })();
  if(ttl)pending.set(url,work);
  try{return await work}finally{if(ttl)pending.delete(url)}
 }
 async function routes(line,stopCode,routeId=null){
  const version=await json(ROOT.catalog+'version.json',{ttl:300000});
  const v=String(version.data.version||'').slice(0,64);const suffix='?v='+encodeURIComponent(v);
  const [raw,catalog]=await Promise.all([json(ROOT.catalog+'line/'+encodeURIComponent(line)+'.json'+suffix,{ttl:300000,maxBytes:4000000}),json(ROOT.catalog+'catalog.json'+suffix,{ttl:300000,maxBytes:12000000})]);
  if(!Array.isArray(raw.data)||catalog.data?.schema!==2||!catalog.data.stops)throw new ServiceError('INVALID_GTFS_CATALOG');
  const out=[];
  for(const r of raw.data){
   if(!r.c?.includes(String(stopCode))||routeId&&String(r.r)!==String(routeId))continue;
   try{
    const stops=r.c.map(code=>{const s=catalog.data.stops[code];if(!s)throw Error('MISSING_STOP');return {code:String(code),lat:Number(s[0]),lon:Number(s[1]),name:s[2]||''}});
    if(stops.some(s=>!coordOK([s.lon,s.lat])))continue;
    out.push({routeId:String(r.r),line:String(line),operatorRef:String(r.a),gtfsDirectionId:String(r.d),routeDesc:String(r.desc),shapeId:String(r.s),headsign:r.h||null,coordinates:decodePolyline(r.x),stops,catalogVersion:v,catalogRetrievedAt:catalog.retrievedAt,catalogSource:'MOT GTFS via application daily catalog'});
   }catch{}
  }
  return out;
 }
 async function curlbus(stopCode){return json(ROOT.curlbus+encodeURIComponent(stopCode),{ttl:20000})}
 async function arrivals(line,stopCode,routeId){
  const [rs,raw]=await Promise.all([routes(line,stopCode,routeId),curlbus(stopCode)]);
  if(!rs.length)throw new ServiceError('NO_MATCHING_ROUTE_AT_STOP',404);
  return {...normalizeCurlbus(raw.data,{stopCode,routes:rs,now:now(),retrievedAt:raw.retrievedAt}),routes:rs.map(r=>({...r,coordinates:undefined,stops:undefined,destinationStopCode:r.stops.at(-1).code})),stopInfo:raw.data.stop_info||null};
 }
 async function history(vehicleRef,operatorRef,{days=7,limit=200,offset=0,from,to}={}){
  const end=to||new Date(now()).toISOString(),start=from||new Date(Date.parse(end)-days*86400000).toISOString();
  // Discover bounded vehicle-scoped ride IDs before joining the much larger location table.
  // Include preceding starts for journeys whose reports enter the requested observation window.
  const rideStart=new Date(Date.parse(start)-86400000).toISOString();
  const rideQuery=new URLSearchParams({vehicle_refs:vehicleRef,siri_route__operator_refs:operatorRef,scheduled_start_time_from:rideStart,scheduled_start_time_to:end,limit:'100',order_by:'id desc'});
  const rideRet=await json(ROOT.stride+'siri_rides/list?'+rideQuery,{ttl:60000});
  const selected=normalizeStrideRides(rideRet.data,{vehicleRef,operatorRef,from:rideStart,to:end,retrievedAt:rideRet.retrievedAt,now:now()});
  const base={schemaVersion:1,vehicleRef,operatorRef,vehicleKey:'il-mot-siri:'+operatorRef+':'+vehicleRef,source:'open-bus-stride-siri-archive',retrievedAt:rideRet.retrievedAt,from:start,to:end,rides:selected.rides,rideSelectionFrom:rideStart,rideSelectionTruncated:rideRet.data.length===100,rejectedRideRecords:selected.rejected,paginationWindowMustStayFixed:true,storage:'upstream-archive-on-demand',mechanicalFaultConclusion:null,limitations:['VehicleRef is provider-assigned; not guaranteed to be a licence plate or permanent for vehicle life','No independent GPS measurement clock in this source','Empty archive response does not prove no journeys','Ride association is not evidence of completed movement','At most 100 vehicle ride IDs per request; selection truncation is explicit','Duplicate source observations are deduplicated by trip/time/location']};
  if(!selected.rides.length)return {...base,observations:[],rejected:0,truncated:false,nextOffset:null,observationStatus:'no-usable-rides-in-archive',partial:base.rideSelectionTruncated};
  const q=new URLSearchParams({siri_rides__ids:selected.rides.map(r=>r.rideId).join(','),recorded_at_time_from:start,recorded_at_time_to:end,limit:String(limit),offset:String(offset),order_by:'recorded_at_time desc,id desc'});
  try{
   const ret=await json(ROOT.stride+'siri_vehicle_locations/list?'+q,{ttl:60000});
   const normalized=normalizeStride(ret.data,{vehicleRef,operatorRef,from:start,to:end,retrievedAt:ret.retrievedAt,now:now()});
   const truncated=ret.data.length===limit;
   return {...base,retrievedAt:ret.retrievedAt,...normalized,truncated,nextOffset:truncated?offset+limit:null,observationStatus:normalized.observations.length?'available':'no-usable-position-reports',partial:base.rideSelectionTruncated||normalized.rejected>0};
  }catch(error){
   if(!(error instanceof ServiceError))throw error;
   // Preserve verified ride identities; never manufacture positions from the journey start.
   return {...base,observations:[],rejected:0,truncated:false,nextOffset:null,observationStatus:'unavailable',observationError:{code:error.code,status:error.status},partial:true};
  }
 }
 const hereEnabled=()=>config.HERE_TRAFFIC_ENABLED==='true'&&config.HERE_LICENSE_CONFIRMED==='true'&&config.HERE_PROVIDER_ENFORCED_NONBILLING==='true'&&!!config.HERE_API_KEY;
 async function here(type,bbox){
  if(!hereEnabled())throw new ServiceError('TRAFFIC_PROVIDER_NOT_AUTHORIZED',503,{missing:'HERE credentials, usage licence and provider-enforced nonbilling entitlement'});
  const q=new URLSearchParams({in:'bbox:'+bbox.join(','),locationReferencing:'shape',apiKey:config.HERE_API_KEY});
  // No advancedFeatures, prefetch, shared cache, or fan-out across end users.
  const ret=await json(ROOT.here+type+'?'+q,{maxBytes:3000000});
  const args={retrievedAt:ret.retrievedAt,now:now(),shapeDirectionVerified:config.HERE_SHAPE_DIRECTION_VERIFIED==='true'};
  return type==='flow'?normalizeHereFlow(ret.data,args):normalizeHereIncidents(ret.data,args);
 }
 return {json,routes,curlbus,arrivals,history,here,hereEnabled,roots:ROOT};
}
