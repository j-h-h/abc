import {createProviders,ServiceError} from './lib/providers.mjs';
import {remainingCorridor} from './lib/geometry.mjs';
import {calculateTraffic,etaDecision} from './lib/traffic.mjs';
const ORIGIN='https://j-h-h.github.io';
const NUM=/^\d{1,12}$/,LINE=/^\d{1,5}[A-Za-z]?$/,VEH=/^[A-Za-z0-9_-]{1,64}$/;
const ZONE_DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
function requireValue(value,re,code){if(typeof value!=='string'||!re.test(value))throw new ServiceError(code,400);return value}
function integer(value,def,min,max){const n=value===null?def:Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new ServiceError('INVALID_INTEGER',400);return n}
function paramsOK(q,names){for(const name of q.keys())if(!names.includes(name)||q.getAll(name).length!==1)throw new ServiceError('UNKNOWN_OR_DUPLICATE_PARAMETER',400,{parameters:[...q.keys()]})}
function bboxValue(s){const values=(s||'').split(',').map(Number);if(values.length!==4||values.some(x=>!Number.isFinite(x))||values[0]<34||values[2]>36||values[1]<29||values[3]>34||values[2]<=values[0]||values[3]<=values[1]||values[2]-values[0]>.1||values[3]-values[1]>.1)throw new ServiceError('INVALID_OR_TOO_LARGE_ISRAEL_BBOX',400);return values}
export function createService({fetchImpl=fetch,now=Date.now,config={}}={}){
 const providers=createProviders({fetchImpl,now,config}),rates=new Map();
 function budget(ip,heavy=false){
  const at=now(),key=ip+(heavy?':heavy':':normal');let r=rates.get(key);
  if(!r||at-r.at>60000){r={at,count:0};if(rates.size>=2048)rates.delete(rates.keys().next().value);rates.set(key,r)}
  if(++r.count>(heavy?6:90))throw new ServiceError('RATE_LIMITED',429);
 }
 async function fetchRequest(request,{ip='anonymous'}={}){
  const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json; charset=utf-8'};
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  try{
   const origin=request.headers.get('origin');if(origin&&origin!==ORIGIN)throw new ServiceError('ORIGIN_NOT_ALLOWED',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(request.method!=='GET')throw new ServiceError('GET_ONLY',405);
   const url=new URL(request.url);if(url.search.length>1500)throw new ServiceError('QUERY_TOO_LARGE',400);
   const q=url.searchParams,p=url.pathname;budget(ip,/history|traffic/.test(p));
   if(p==='/v1/health'){paramsOK(q,[]);return respond({service:'eifo-batuach-live-data',version:'1.0.0',now:new Date(now()).toISOString(),transit:'SIRI via curlbus; source freshness checked per response',trafficEnabled:providers.hereEnabled(),history:'Open Bus archive on demand',gpsMeasurementClock:'unavailable in presently connected transit sources',paidDataServiceEnabled:false})}
   if(p==='/v1/routes'){paramsOK(q,['line','stopCode','routeId']);const line=requireValue(q.get('line'),LINE,'INVALID_LINE'),stopCode=requireValue(q.get('stopCode'),NUM,'INVALID_STOP'),routeId=q.has('routeId')?requireValue(q.get('routeId'),NUM,'INVALID_ROUTE'):null;return respond({routes:await providers.routes(line,stopCode,routeId)})}
   const arrivals=/^\/v1\/stops\/(\d{1,12})\/arrivals$/.exec(p);
   if(arrivals){paramsOK(q,['line','routeId']);const line=requireValue(q.get('line'),LINE,'INVALID_LINE'),routeId=q.has('routeId')?requireValue(q.get('routeId'),NUM,'INVALID_ROUTE'):null;return respond(await providers.arrivals(line,arrivals[1],routeId))}
   const history=/^\/v1\/vehicles\/([A-Za-z0-9_-]{1,64})\/history$/.exec(p);
   if(history){
    paramsOK(q,['operatorRef','days','limit','offset','from','to']);
    const op=requireValue(q.get('operatorRef'),NUM,'INVALID_OPERATOR'),days=integer(q.get('days'),7,1,14),limit=integer(q.get('limit'),200,1,250),offset=integer(q.get('offset'),0,0,2000);
    let from=q.get('from'),to=q.get('to');
    if((from&&!to)||(!from&&to))throw new ServiceError('FROM_TO_REQUIRED_TOGETHER',400);
    if(from){requireValue(from,ZONE_DATE,'INVALID_FROM');requireValue(to,ZONE_DATE,'INVALID_TO');const a=Date.parse(from),b=Date.parse(to);if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||b-a>14*86400000||b>now()+30000||a<now()-366*86400000)throw new ServiceError('INVALID_HISTORY_WINDOW',400)}
    return respond(await providers.history(history[1],op,{days,limit,offset,from,to}));
   }
   if(p==='/v1/traffic/flow'||p==='/v1/traffic/incidents'){
    paramsOK(q,['bbox','routeId','stopCode']);const bbox=bboxValue(q.get('bbox')),routeId=q.has('routeId')?requireValue(q.get('routeId'),NUM,'INVALID_ROUTE'):null,stopCode=q.has('stopCode')?requireValue(q.get('stopCode'),NUM,'INVALID_STOP'):null;
    const ret=await providers.here(p.endsWith('flow')?'flow':'incidents',bbox);
    return respond({...ret,routeId,stopCode,validated:false,matchMethod:'viewport-only',delaySeconds:null,coveredMeters:0,remainingRouteMeters:null,confidence:0});
   }
   if(p==='/v1/traffic/corridor'){
    paramsOK(q,['line','stopCode','routeId','vehicleRef']);
    const line=requireValue(q.get('line'),LINE,'INVALID_LINE'),stopCode=requireValue(q.get('stopCode'),NUM,'INVALID_STOP'),routeId=requireValue(q.get('routeId'),NUM,'INVALID_ROUTE'),ref=requireValue(q.get('vehicleRef'),VEH,'INVALID_VEHICLE');
    const [data,rs]=await Promise.all([providers.arrivals(line,stopCode,routeId),providers.routes(line,stopCode,routeId)]);
    const vehicle=data.vehicles.find(v=>v.vehicleRef===ref);if(!vehicle)throw new ServiceError('NO_FRESH_MATCHED_VEHICLE',409);
    let corridor;try{corridor=remainingCorridor(rs[0],vehicle,stopCode)}catch(e){throw new ServiceError(e.message,409)}
    const lons=corridor.coordinates.map(p=>p[0]),lats=corridor.coordinates.map(p=>p[1]),bbox=bboxValue([Math.min(...lons)-.001,Math.min(...lats)-.001,Math.max(...lons)+.001,Math.max(...lats)+.001].join(','));
    const flow=await providers.here('flow',bbox),report=calculateTraffic(corridor,flow,{routeId,stopCode,vehicle,now:now()});
    const arrival=data.arrivals.find(a=>a.vehicleRef===ref&&a.tripId===vehicle.tripId);
    return respond({...report,vehicleRef:ref,vehicleKey:vehicle.vehicleKey,tripId:vehicle.tripId,etaDecision:etaDecision(arrival,report,{now:now()})});
   }
   // Compatibility for the current UI's routedUrl; no arbitrary upstream URL or headers are accepted.
   const curl=/^\/curlbus\/(\d{1,12})$/.exec(p);
   if(curl){paramsOK(q,[]);return respond((await providers.curlbus(curl[1])).data)}
   const mot=/^\/mot\/(Stops\/(?:GetStopByCode|RefreshStopTimesAtStop)|Calendar\/GetRouteCalendarAtStopsByStopCodes)$/.exec(p);
   if(mot){
    const names=mot[1].startsWith('Calendar')?['stopCodes','routeDesc']:mot[1].endsWith('RefreshStopTimesAtStop')?['stopCode','day']:['stopCode'];
    paramsOK(q,names);requireValue(q.get(names[0]),NUM,'INVALID_STOP');
    if(q.has('routeDesc'))requireValue(q.get('routeDesc'),/^\d{1,12}-\d{1,3}-[0-9A-Za-z#]{1,8}$/,'INVALID_ROUTE_DESC');
    if(q.has('day'))requireValue(q.get('day'),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,'INVALID_LOCAL_DAY');
    return respond((await providers.json(providers.roots.mot+mot[1]+'?'+q,{ttl:20000})).data);
   }
   throw new ServiceError('ENDPOINT_NOT_FOUND',404);
  }catch(e){const error=e instanceof ServiceError?e:new ServiceError('INTERNAL_ERROR',500);if(error.status===429)headers['Retry-After']='60';return respond({error:error.code,...error.details,at:new Date(now()).toISOString()},error.status)}
 }
 return {fetch:fetchRequest,providers};
}
