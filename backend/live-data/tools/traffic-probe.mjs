// One-off bounded read-only research against official municipal/open data endpoints.
// It neither activates a traffic provider nor infers free-flow speed from a Waze color/level.
const root='https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/';
const stride='https://open-bus-stride-api.hasadna.org.il/';
const queries={
 historyRecentRides:stride+'siri_rides/list?'+new URLSearchParams({vehicle_refs:'70138502',siri_route__operator_refs:'16',scheduled_start_time_from:new Date(Date.now()-14*86400000).toISOString(),scheduled_start_time_to:new Date().toISOString(),limit:'6',order_by:'id desc'}),
 historyCapturedRides:stride+'siri_rides/list?'+new URLSearchParams({vehicle_refs:'89094003',siri_route__operator_refs:'15',scheduled_start_time_from:'2026-03-18T00:00:00Z',scheduled_start_time_to:'2026-03-21T00:00:00Z',limit:'6',order_by:'id desc'}),
 historyCapturedLocations:stride+'siri_vehicle_locations/list?'+new URLSearchParams({siri_rides__ids:'131850215',recorded_at_time_from:'2026-03-19T17:00:00Z',recorded_at_time_to:'2026-03-19T18:00:00Z',limit:'6',order_by:'recorded_at_time desc'}),

 tlvWazeMetadata:root+'892?f=json',
 tlvWazeLatest:root+'892/query?'+new URLSearchParams({where:'1=1',outFields:'OBJECTID,level,speedKMH,length,delay,street,pubMillis,updateDate,endNode,uuid',orderByFields:'updateDate DESC',outSR:'4326',resultRecordCount:'3',returnGeometry:'true',f:'json'}),
 tlvWazeTerms:'https://opendatasource.tel-aviv.gov.il/he/Pages/faq.aspx',
 speedMonitorMetadata:'https://www.arcgis.com/sharing/rest/content/items/efb7c568082c4623a3568e5f765dcc03?f=json',
 motTimesWithDay:'https://api.bus.gov.il/prod/mot-scheduler-prod/api/he/Stops/RefreshStopTimesAtStop?'+new URLSearchParams({stopCode:'2360',day:new Date().toISOString().slice(0,10)+'T12:00:00'})
};
const results=await Promise.all(Object.entries(queries).map(async([source,url])=>{
 const begin=Date.now();
 try{const r=await fetch(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(25000)});
 const body=await r.text();let data;try{data=JSON.parse(body)}catch{data={text:body.slice(0,500)}}
 if(source==='tlvWazeMetadata')data={name:data.name,fields:data.fields?.map(f=>({name:f.name,type:f.type})),extent:data.extent,editingInfo:data.editingInfo,copyrightText:data.copyrightText};
 if(source==='motTimesWithDay')data={success:data.success,routeIds:data.data?.routesInStop?.map(r=>r.routeId),stopTimesCount:data.data?.stopTimes?.length,example:data.data?.stopTimes?.filter(r=>['72','531','92'].includes(r.routeName)).slice(-4)};
 if(source==='tlvWazeTerms')data={text:body.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,20000)};
 return {source,url,httpStatus:r.status,retrievedAt:new Date().toISOString(),elapsedMs:Date.now()-begin,data};
 }catch(e){return {source,url,retrievedAt:new Date().toISOString(),error:e.name,message:e.message}}
}));
for(const row of results)console.log('TRAFFIC_RESEARCH '+JSON.stringify(row));
