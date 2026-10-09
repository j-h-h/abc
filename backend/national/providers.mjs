/* DEV-owned national browsing. Source clocks are preserved, never replaced by fetch time. */
import {decodePolyline,coordOK} from './geometry.mjs';
import {normalizeCurlbus,fresh} from './transit.mjs';
const ROOT={catalog:'https://j-h-h.github.io/abc/data/',curlbus:'https://curlbus.app/',stride:'https://open-bus-stride-api.hasadna.org.il/'};
export class SourceError extends Error{constructor(code,status=502){super(code);this.status=status}}
export const validBBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=34&&b[2]<=36&&b[1]>=29&&b[3]<=34&&b[0]<b[2]&&b[1]<b[3]&&b[2]-b[0]<=.4&&b[3]-b[1]<=.4;
export function normalizeArea(rows,bbox,now=Date.now()){
 if(!Array.isArray(rows))throw new SourceError('INVALID_AREA_SOURCE');
 const unique=new Map();let rejected=0;
 for(const r of rows){
  const at=Date.parse(r.recorded_at_time),ref=String(r.siri_ride__vehicle_ref||''),op=String(r.siri_route__operator_ref||''),route=String(r.siri_route__line_ref||''),snap=r.siri_snapshot__snapshot_id;
  // The archive sometimes contains future report clocks attached to old snapshots.
  const match=typeof snap==='string'&&/^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})$/.exec(snap),snapshot=match?Date.parse(match[1]+'-'+match[2]+'-'+match[3]+'T'+match[4]+':'+match[5]+':00Z'):NaN;
  if(!coordOK([r.lon,r.lat])||r.lon<bbox[0]||r.lon>bbox[2]||r.lat<bbox[1]||r.lat>bbox[3]||!Number.isFinite(at)||now-at< -30000||now-at>180000||!Number.isFinite(snapshot)||now-snapshot< -30000||now-snapshot>240000||Math.abs(snapshot-at)>180000||!ref||!/^\d{1,12}$/.test(op)||!/^\d{1,12}$/.test(route)||!r.siri_ride__id){rejected++;continue;}
  const v={id:'area:'+op+':'+ref,vehicleRef:ref,operatorRef:op,vehicleKey:'il-mot-siri:'+op+':'+ref,tripId:String(r.siri_ride__id),routeId:route,line:null,lat:r.lat,lon:r.lon,bearing:typeof r.bearing==='number'&&r.bearing>=0&&r.bearing<360?r.bearing:null,sourceObservedAt:new Date(at).toISOString(),snapshotAt:new Date(snapshot).toISOString(),sourceResponseAt:null,source:'open-bus-stride-siri',clockType:'source-report',gpsMeasuredAt:null,directionVerified:false,reportedArrivalAt:null};
  const old=unique.get(v.vehicleKey);if(!old||Date.parse(old.sourceObservedAt)<at)unique.set(v.vehicleKey,v);
 }
 return {vehicles:[...unique.values()],rejected};
}
export function createNationalProviders({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();let active=0;const recent=[];
 async function json(url,{ttl=0,timeout=11000,maxBytes=6000000}={}){
  const hit=cache.get(url);if(hit&&hit.until>now())return hit.value;
  if(pending.has(url))return pending.get(url);
  const task=(async()=>{while(recent.length&&recent[0]<now()-60000)recent.shift();if(active>=8||recent.length>=100)throw new SourceError('SOURCE_BUSY',429);active++;recent.push(now());
   try{const r=await fetchImpl(url,{redirect:'error',headers:{Accept:'application/json','User-Agent':'EifoBatuach-DEV/9.1.8 (+https://github.com/j-h-h/abc)'},signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new SourceError('SOURCE_HTTP_'+r.status,r.status===429?429:502);if(!(r.headers.get('content-type')||'').includes('json'))throw new SourceError('SOURCE_NOT_JSON');
    const reader=r.body.getReader(),decoder=new TextDecoder();let size=0,text='';while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new SourceError('SOURCE_TOO_LARGE')}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();let value;try{value=JSON.parse(text)}catch{throw new SourceError('SOURCE_INVALID_JSON')}
    if(ttl){if(cache.size>=96)cache.delete(cache.keys().next().value);cache.set(url,{value,until:now()+ttl})}return value;
   }catch(e){if(e instanceof SourceError)throw e;throw new SourceError(e.name==='TimeoutError'||e.name==='AbortError'?'SOURCE_TIMEOUT':'SOURCE_UNAVAILABLE')}finally{active--}
  })();pending.set(url,task);try{return await task}finally{pending.delete(url)}
 }
 async function catalog(){const version=await json(ROOT.catalog+'version.json',{ttl:300000});if(!/^[a-f0-9]{16}$/.test(version.version))throw new SourceError('INVALID_CATALOG_VERSION');const data=await json(ROOT.catalog+'catalog.json?v='+version.version,{ttl:300000});if(data.schema!==2||!data.stops||!data.served)throw new SourceError('INVALID_CATALOG');return {data,version:version.version}}
 async function station(stopCode){
  const [{data,version},raw]=await Promise.all([catalog(),json(ROOT.curlbus+stopCode,{ttl:20000})]);if(!data.stops[stopCode])throw new SourceError('UNKNOWN_STOP',404);
  if(!Array.isArray(raw?.visits?.[stopCode]))throw new SourceError('INVALID_STATION_SOURCE');
  const allowed=new Set(data.served[stopCode]||[]),current=raw.visits[stopCode].filter(v=>fresh(raw.timestamp,now())&&fresh(v.timestamp,now())&&String(v.stop_code)===stopCode),lines=[...new Set(current.map(v=>String(v.line_name)).filter(l=>allowed.has(l)))];let cursor=0;const routes=[],errors=[];
  await Promise.all(Array.from({length:Math.min(2,lines.length)},async()=>{while(cursor<Math.min(lines.length,40)){const line=lines[cursor++];try{const rs=await json(ROOT.catalog+'line/'+encodeURIComponent(line)+'.json?v='+version,{ttl:300000});if(!Array.isArray(rs))throw new SourceError('INVALID_ROUTES');for(const r of rs){if(!r.c?.includes(stopCode))continue;try{const stops=r.c.map(code=>{const s=data.stops[code];if(!s)throw Error();return {code:String(code),lat:s[0],lon:s[1],name:s[2]}});const coordinates=decodePolyline(r.x);routes.push({routeId:String(r.r),line,operatorRef:String(r.a),gtfsDirectionId:String(r.d),headsign:r.h||stops.at(-1).name,coordinates,stops});}catch{}}}catch(e){errors.push({line,error:e.message})}}}));
  const normalized=normalizeCurlbus(raw,{stopCode,routes,now:now(),retrievedAt:new Date(now()).toISOString()});
  return {...normalized,catalogVersion:version,lines:data.served[stopCode]||[],routes:routes.map(r=>({routeId:r.routeId,line:r.line,operatorRef:r.operatorRef,headsign:r.headsign})),partial:errors.length>0||lines.length>40,errors};
 }
 async function area(bbox){
  const q=new URLSearchParams({limit:'500',order_by:'recorded_at_time desc,id desc',recorded_at_time_from:new Date(now()-180000).toISOString(),recorded_at_time_to:new Date(now()).toISOString(),lon__greater_or_equal:bbox[0],lat__greater_or_equal:bbox[1],lon__lower_or_equal:bbox[2],lat__lower_or_equal:bbox[3]});
  let primary=null,sourceError=null;try{const rows=await json(ROOT.stride+'siri_vehicle_locations/list?'+q,{ttl:15000,timeout:4500,maxBytes:1800000});primary={...normalizeArea(rows,bbox,now()),truncated:rows.length===500};}catch(e){sourceError=e.message}
  if(primary?.vehicles.length)return {schemaVersion:1,bbox,retrievedAt:new Date(now()).toISOString(),...primary,partial:primary.truncated,coverage:'source-reports-in-viewport',sampledStopCodes:[]};
  // A bounded fallback checks actual all-line reports at distributed nearby stops.
  const {data}=await catalog(),center=[(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2],candidates=Object.entries(data.stops).filter(([code,s])=>data.served[code]?.length&&s[1]>=bbox[0]&&s[1]<=bbox[2]&&s[0]>=bbox[1]&&s[0]<=bbox[3]).sort((a,b)=>Math.hypot(a[1][1]-center[0],a[1][0]-center[1])-Math.hypot(b[1][1]-center[0],b[1][0]-center[1]));
  const chosen=[];for(const c of candidates){if(chosen.every(x=>Math.hypot(x[1][1]-c[1][1],x[1][0]-c[1][0])>.003))chosen.push(c);if(chosen.length===3)break;}
  const results=await Promise.allSettled(chosen.map(([code])=>station(code))),vehicles=new Map(),errors=[];let succeeded=0;
  for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='rejected'){errors.push({stopCode:chosen[i][0],error:r.reason.message});continue;}succeeded++;for(const v of r.value.vehicles){if(v.lon<bbox[0]||v.lon>bbox[2]||v.lat<bbox[1]||v.lat>bbox[3])continue;const old=vehicles.get(v.vehicleKey);if(!old||Date.parse(old.sourceObservedAt)<Date.parse(v.sourceObservedAt))vehicles.set(v.vehicleKey,v)}}
  if(chosen.length&&!succeeded&&sourceError)throw new SourceError('AREA_SOURCES_UNAVAILABLE');
  return {schemaVersion:1,bbox,retrievedAt:new Date(now()).toISOString(),vehicles:[...vehicles.values()],rejected:primary?.rejected||0,truncated:false,partial:true,coverage:'nearby-stop-reports',sampledStopCodes:chosen.map(x=>x[0]),errors,primaryError:sourceError};
 }
 return {json,catalog,station,area};
}
