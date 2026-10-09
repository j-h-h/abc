/* Traffic road overlay + conservative delay presentation contract.
   A colored raster overlay is NOT numerical road-speed data. */
(function(root){'use strict';
 const MAX_AGE=5*60000,MAX_DELAY=90*60000;
 const validCoord=point=>Array.isArray(point)&&point.length===2&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&point[0]>=34&&point[0]<=36&&point[1]>=29&&point[1]<=34;
 const numeric=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')?Number(x):NaN;
 const parseTime=value=>typeof value==='number'?value:Date.parse(value);
 function normalize(snapshot,{routeId,stopCode,now=Date.now()}={}){
  if(!snapshot||typeof snapshot!=='object')return {available:false,reason:'אין נתוני עומסים'};
  const observedAt=parseTime(snapshot.observedAt);
  if(!Number.isFinite(observedAt)||observedAt>now+30000||now-observedAt>MAX_AGE)return {available:false,reason:'נתוני העומס אינם עדכניים'};
  if(String(snapshot.routeId??'')!==String(routeId??'')||String(snapshot.stopCode??'')!==String(stopCode??''))return {available:false,reason:'נתוני עומס לקו או תחנה אחרים'};
  const segments=[];
  for(const item of Array.isArray(snapshot.segments)?snapshot.segments:[]){
   const geometry=item?.geometry;
   if(geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>400||!geometry.coordinates.every(validCoord))continue;
   const speed=numeric(item.currentSpeedKmh),free=numeric(item.freeFlowSpeedKmh),confidence=numeric(item.confidence);
   if(!(speed>=0&&speed<=130&&free>0&&free<=140&&confidence>=0.4&&confidence<=1))continue;
   const ratio=Math.min(1,speed/free);
   segments.push({type:'Feature',geometry:{type:'LineString',coordinates:geometry.coordinates},
    properties:{ratio,confidence,source:String(snapshot.source||'תצפיות תנועה'),currentSpeedKmh:speed,freeFlowSpeedKmh:free}});
  }
  const metres=numeric(snapshot.coveredMeters),remaining=numeric(snapshot.remainingRouteMeters),
        delay=numeric(snapshot.delaySeconds),quality=numeric(snapshot.confidence);
  const coverage=remaining>0?metres/remaining:0;
  // Only provider-computed corridor matches, not generic road colors, are eligible for route ETA adjustment.
  const trusted= snapshot.matchMethod==='directed-route-corridor' &&
    snapshot.validated===true && routeId!=null && String(routeId).trim()!=='' && stopCode!=null && String(stopCode).trim()!=='' && segments.length>0 && Number.isFinite(delay) &&
    delay>=0&&delay<=MAX_DELAY/1000&&Number.isFinite(coverage)&&coverage>=0.65&&coverage<=1.05&&
    Number.isFinite(quality)&&quality>=0.65&&quality<=1;
  return {available:segments.length>0,observedAt,source:String(snapshot.source||''),features:segments,etaAdjustment:trusted?Math.round(delay/60):null,
    coverage:Math.max(0,Math.min(1,coverage)),reason:trusted?'עיכוב שנמדד בקטעי כביש תואמים':'אין התאמה מספקת לחישוב תוספת זמן מהימנה'};
 }
 function layerStyle(feature){
  const ratio=feature?.properties?.ratio;
  return {color:ratio<.25?'#bb2444':ratio<.5?'#e56725':ratio<.75?'#dba82b':'#159d78',
    weight:6,opacity:.8};
 }
 function weightedEta(arrival,trafficReport,now=Date.now()){
  if(!trafficReport?.available||!Number.isFinite(trafficReport.observedAt)||now-trafficReport.observedAt>MAX_AGE||trafficReport.observedAt>now+30000)return null;
  if(!trafficReport||!Number.isFinite(trafficReport.etaAdjustment))return null;
  if(arrival?.realtime===true)return null; // Realtime forecast may already include traffic; do not double-count.
  const m=numeric(arrival?.minutes);
  if(!Number.isFinite(m)||m<0||m>180||trafficReport.etaAdjustment<0)return null;
  return {minutes:Math.ceil(m+trafficReport.etaAdjustment),extraMinutes:trafficReport.etaAdjustment,
   caution:'חישוב ניסיוני לזמן לוח בלבד; אינו תחליף לתחזית חיה'};
 }
 root.SafeBusTraffic={normalize,layerStyle,weightedEta,version:'DEV-9.1.0'};
})(typeof window!=='undefined'?window:globalThis);
