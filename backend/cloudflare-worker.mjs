/* Optional Cloudflare Worker gateway. Deploy separately; never set an arbitrary open proxy. */
const ALLOWED_ORIGIN='https://j-h-h.github.io';
const RULES={
 curlbus:{root:'https://curlbus.app/',path:/^\d{3,7}$/},
 mot:{root:'https://api.bus.gov.il/prod/mot-scheduler-prod/api/he/',path:/^(?:Stops\/(?:GetStopByCode|RefreshStopTimesAtStop)|Calendar\/GetRouteCalendarAtStopsByStopCodes)$/},
 busnearby:{root:'https://api.busnearby.co.il/directions/index/stops/',path:/^1:\d{3,7}\/stoptimes$/},
 stride:{root:'https://open-bus-stride-api.hasadna.org.il/',path:/^(?:siri_vehicle_locations\/list|siri_routes\/list)$/}
};
function cors(){return {'access-control-allow-origin':ALLOWED_ORIGIN,'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'Accept','vary':'Origin','cache-control':'no-store','x-content-type-options':'nosniff'};}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(),'content-type':'application/json; charset=utf-8'}});}
export default {async fetch(request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==ALLOWED_ORIGIN)return json({error:'Origin not allowed'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});
 if(request.method!=='GET')return json({error:'GET only'},405);
 const url=new URL(request.url);
 if(url.search.length>1400)return json({error:'Query too large'},400);
 const match=/^\/(curlbus|mot|busnearby|stride)\/(.+)$/.exec(url.pathname);
 if(!match)return json({error:'Unknown endpoint'},404);
 const rule=RULES[match[1]],path=match[2];
 if(!rule.path.test(path))return json({error:'Endpoint not allowed'},404);
 const params=url.searchParams;
 if(match[1]==='stride'){
   const limit=Number(params.get('limit')||100);
   if(!Number.isInteger(limit)||limit<1||limit>400)return json({error:'Too many records'},400);
 }
 if(match[1]==='mot'){
   if(params.get('stopCode')&&!/^\d{3,7}$/.test(params.get('stopCode')))return json({error:'Invalid stop'},400);
   if(params.get('stopCodes')&&!/^\d{3,7}$/.test(params.get('stopCodes')))return json({error:'Invalid stop'},400);
   if(params.get('stopcode')&&!/^\d{3,7}$/.test(params.get('stopcode')))return json({error:'Invalid stop'},400);
 }
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const resp=await fetch(rule.root+path+url.search,{method:'GET',redirect:'error',signal:ctl.signal,headers:{Accept:'application/json'}});
  if(!resp.ok)return json({error:'Upstream HTTP '+resp.status},resp.status===429?429:502);
  if(!(resp.headers.get('content-type')||'').toLowerCase().includes('json'))return json({error:'Upstream is not JSON'},502);
  const length=Number(resp.headers.get('content-length')||0);
  if(length>1500000)return json({error:'Upstream response too large'},502);
  const body=await resp.text();
  if(body.length>1500000)return json({error:'Upstream response too large'},502);
  JSON.parse(body);
  return new Response(body,{status:200,headers:{...cors(),'content-type':'application/json; charset=utf-8'}});
 }catch(e){return json({error:e.name==='AbortError'?'Upstream timeout':'Upstream unavailable'},502);}
 finally{clearTimeout(timer);}
}};