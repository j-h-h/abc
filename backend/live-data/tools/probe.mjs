const sources = {
 curlbus:'https://curlbus.app/2360',
 strideSchema:'https://open-bus-stride-api.hasadna.org.il/openapi.json',
 stride:'https://open-bus-stride-api.hasadna.org.il/siri_vehicle_locations/list?limit=2&order_by=recorded_at_time%20desc',
 motStop:'https://api.bus.gov.il/prod/mot-scheduler-prod/api/he/Stops/GetStopByCode?stopCode=2360',
 motTimes:'https://api.bus.gov.il/prod/mot-scheduler-prod/api/he/Stops/RefreshStopTimesAtStop?stopCode=2360',
 busnearby:'https://api.busnearby.co.il/directions/index/stops/1:2360/stoptimes',
 relay:'https://eifo-batuach-live-relay.vercel.app/api/probe?source=curlbus',
 relayStride:'https://eifo-batuach-live-relay.vercel.app/api/probe?source=stride',
 strideCurrent:'https://open-bus-stride-api.hasadna.org.il/siri_vehicle_locations/list?limit=5&siri_routes__line_ref=34120&recorded_at_time_from='+encodeURIComponent(new Date(Date.now()-600000).toISOString())+'&recorded_at_time_to='+encodeURIComponent(new Date(Date.now()+30000).toISOString())+'&order_by=recorded_at_time%20desc',
 here:'https://data.traffic.hereapi.com/v7/flow?in=bbox:35.17,31.71,35.23,31.75&locationReferencing=shape',
 ...Object.fromEntries(['72','531','92'].map(line=>['line'+line,'https://j-h-h.github.io/abc/data/line/'+line+'.json']))
};
const results=await Promise.all(Object.entries(sources).map(async([source,url])=>{
 const start=Date.now();
 try{
  const r=await fetch(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={text:text.slice(0,300)}}
  if(source==='strideSchema'&&data.paths)data={paths:Object.fromEntries(['/siri_vehicle_locations/list','/siri_rides/list','/gtfs_routes/list','/siri_ride_stops/list','/siri_snapshots/list'].map(p=>[p,{parameters:data.paths[p]?.get?.parameters?.map(p=>p.name),response:data.paths[p]?.get?.responses?.['200']} ])),schemas:Object.fromEntries(Object.entries(data.components.schemas).filter(([k])=>/SiriVehicleLocation|SiriRideWith|SiriRidePydantic|SiriRoute|SiriSnapshot/.test(k)))};
  if(source.startsWith('line')&&Array.isArray(data))data=data.filter(v=>v.c?.includes('2360')).map(v=>({...v,x:undefined}));
  if(source.startsWith('line')&&data.features)data={keys:Object.keys(data),routes:data.features.map(f=>({properties:f.properties,points:f.geometry?.coordinates?.length})),...data.version&&{version:data.version}};
  return {source,url,httpStatus:r.status,fetchedAt:new Date().toISOString(),elapsedMs:Date.now()-start,date:r.headers.get('date'),contentType:r.headers.get('content-type'),data};
 }catch(e){return {source,url,fetchedAt:new Date().toISOString(),elapsedMs:Date.now()-start,error:e.name,message:e.message}}
}));
for(const r of results)console.log('LIVE_EVIDENCE '+JSON.stringify(r));
