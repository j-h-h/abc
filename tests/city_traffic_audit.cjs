'use strict';
const fs=require('node:fs/promises');
(async()=>{
 const root='https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/892',report={classification:'real municipal source audit only; not an active traffic layer',checkedAt:new Date().toISOString(),endpoint:root,metadata:null,rows:[]};
 async function get(url){const r=await fetch(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP_'+r.status);const reader=r.body.getReader(),parts=[];let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1000000){await reader.cancel();throw Error('SOURCE_TOO_LARGE')}parts.push(value)}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 try{
  const meta=await get(root+'?f=pjson');if(meta.error)throw Error('METADATA_ERROR_'+meta.error.code);
  report.metadata={name:meta.name,description:meta.description,copyrightText:meta.copyrightText,dateFieldsTimeReference:meta.dateFieldsTimeReference??null,datesInUnknownTimezone:meta.datesInUnknownTimezone??null,timeInfo:meta.timeInfo??null,fields:(meta.fields||[]).map(f=>({name:f.name,alias:f.alias,type:f.type}))};
  const q=new URL(root+'/query');for(const [key,value]of Object.entries({where:'1=1',outFields:'*',outSR:'4326',returnGeometry:'true',orderByFields:'pubMillis DESC',resultRecordCount:'3',f:'json'}))q.searchParams.set(key,value);
  const data=await get(q);if(data.error)throw Error('QUERY_ERROR_'+data.error.code);
  const clock=value=>{const n=typeof value==='number'?value:typeof value==='string'&&/^\d{13}$/.test(value)?Number(value):NaN;return {raw:value,iso:Number.isFinite(n)&&n>0?new Date(n).toISOString():null,ageSeconds:Number.isFinite(n)?Math.round((Date.now()-n)/1000):null};};
  report.exceededTransferLimit=!!data.exceededTransferLimit;
  for(const f of (data.features||[]).slice(0,3)){const a=f.attributes||{},pts=(f.geometry?.paths||[]).flat();report.rows.push({attributes:a,published:clock(a.pubMillis),updated:clock(a.updateDate),geometry:{pointCount:pts.length,withinIsrael:pts.length>1&&pts.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=34&&p[0]<=36&&p[1]>=29&&p[1]<=34),sample:pts.slice(0,3)}});}
  report.conclusion='Timestamp values are unmodified. Publication is not assumed to be last update; unknown timezone is not corrected by subtracting hours. Reuse/license and clock semantics must be verified before activation.';
 }catch(e){report.error=e.message;}
 await fs.writeFile('city-traffic-audit.json',JSON.stringify(report,null,2));console.log('REAL MUNICIPAL TRAFFIC AUDIT',JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
