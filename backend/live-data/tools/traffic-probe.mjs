// One-off bounded read-only research against official municipal/open data endpoints.
// It neither activates a traffic provider nor infers free-flow speed from a Waze color/level.
const root='https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/';
const queries={
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
 if(source==='tlvWazeTerms')data={text:body.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,20000)};
 return {source,url,httpStatus:r.status,retrievedAt:new Date().toISOString(),elapsedMs:Date.now()-begin,data};
 }catch(e){return {source,url,retrievedAt:new Date().toISOString(),error:e.name,message:e.message}}
}));
for(const row of results)console.log('TRAFFIC_RESEARCH '+JSON.stringify(row));
