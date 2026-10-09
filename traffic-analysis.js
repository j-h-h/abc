/* Current road colors need live, licensed server data. Generic timetable delay addition is disabled. */
(function(root){'use strict';
 const MAX_AGE=180000,MAX_DELAY=5400;
 const number=x=>typeof x==='number'&&Number.isFinite(x)?x:NaN;
 const time=x=>typeof x==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(x)?Date.parse(x):NaN;
 const fresh=(at,now)=>Number.isFinite(at)&&at<=now+30000&&now-at<=MAX_AGE;
 const coord=p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=34&&p[0]<=36&&p[1]>=29&&p[1]<=34;
 function normalize(snapshot,{routeId,stopCode,now=Date.now()}={}){
  if(snapshot?.error==='TRAFFIC_PROVIDER_NOT_AUTHORIZED')return {available:false,reason:'אין מקור עומסים מורשה פעיל'};
  if(!snapshot||typeof snapshot!=='object')return {available:false,reason:'אין נתוני עומסים'};
  const observedAt=time(snapshot.observedAt);
  if(!fresh(observedAt,now))return {available:false,reason:'נתוני העומס אינם עדכניים'};
  if(!routeId||!stopCode||String(snapshot.routeId)!==String(routeId)||String(snapshot.stopCode)!==String(stopCode))return {available:false,reason:'נתוני עומס לקו או תחנה אחרים'};
  const features=[],times=[observedAt];
  for(const item of Array.isArray(snapshot.segments)?snapshot.segments:[]){
   const geometry=item?.geometry,at=time(item?.observedAt),speed=number(item?.currentSpeedKmh),free=number(item?.freeFlowSpeedKmh),confidence=number(item?.confidence);
   if(item?.live!==true||!fresh(at,now)||!Number.isFinite(confidence)||confidence<=.70||confidence>1||speed<0||speed>130||!Number.isFinite(speed)||free<=0||free>140||!Number.isFinite(free))continue;
   if(geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>400||!geometry.coordinates.every(coord))continue;
   times.push(at);features.push({type:'Feature',geometry,properties:{ratio:Math.min(1,speed/free),confidence,source:String(snapshot.source||''),currentSpeedKmh:speed,freeFlowSpeedKmh:free,observedAt:at}});
  }
  const metres=number(snapshot.coveredMeters),remaining=number(snapshot.remainingRouteMeters),delay=number(snapshot.delaySeconds),quality=number(snapshot.confidence),coverage=remaining>0?metres/remaining:0;
  const validated=snapshot.validated===true&&snapshot.matchMethod==='directed-route-corridor'&&snapshot.blockedRoute!==true&&features.length>0&&coverage>=.98&&coverage<=1.05&&Number.isFinite(delay)&&delay>=0&&delay<=MAX_DELAY&&quality>.70&&quality<=1;
  return {available:features.length>0,observedAt,expiresAt:Math.min(...times)+MAX_AGE,source:String(snapshot.source||''),features,routeId:String(routeId),stopCode:String(stopCode),validated,etaAdjustment:null,
   coverage:Math.max(0,Math.min(1,coverage)),coveredRoadDelaySeconds:validated?delay:null,etaDecision:snapshot.etaDecision||null,
   reason:validated?'עיכוב כביש שנמדד; אינו מתווסף אוטומטית לזמן הגעה':'אין התאמה מספקת לחישוב עיכוב מהימן'};
 }
 function expired(report,now=Date.now()){return !report?.available||!Number.isFinite(report.expiresAt)||now>report.expiresAt;}
 function layerStyle(feature){
  const ratio=feature?.properties?.ratio;
  if(!Number.isFinite(ratio)||ratio<0||ratio>1)return {color:'#7d8996',weight:0,opacity:0};
  return {color:ratio<.25?'#bb2444':ratio<.5?'#e56725':ratio<.75?'#dba82b':'#159d78',weight:6,opacity:.8};
 }
 function serverEta(arrival,report,now=Date.now()){
  if(arrival?.realtime!==false||arrival.baselineTrafficModel!=='explicit-free-flow'||expired(report,now)||!report.validated||String(arrival.routeId)!==report.routeId||String(arrival.stopCode)!==report.stopCode)return null;
  const decision=report.etaDecision,at=time(decision?.computedArrivalAt),delay=number(decision?.appliedTrafficDelaySeconds);
  if(decision?.reason!=='EXPERIMENTAL_FREE_FLOW_BASELINE_PLUS_TRAFFIC'||!Number.isFinite(at)||at<now||at>now+180*60000||!Number.isFinite(delay)||delay<0||delay>MAX_DELAY)return null;
  return {minutes:Math.ceil((at-now)/60000),extraMinutes:delay/60,computedArrivalAt:decision.computedArrivalAt,caution:'חישוב ניסיוני מהשרת לבסיס זרימה חופשית שאומת'};
 }
 function weightedEta(){return null;}
 root.SafeBusTraffic={normalize,layerStyle,expired,serverEta,weightedEta,version:'DEV-9.1.4'};
})(typeof window!=='undefined'?window:globalThis);
