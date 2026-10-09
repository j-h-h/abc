/* Adapter for the LIVE-WORK v1 contract. Recheck identity and source clocks in the browser. */
(function(root){'use strict';
 const iso=value=>typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
 const fresh=(value,now)=>iso(value)&&now-Date.parse(value)>=-30000&&now-Date.parse(value)<=180000;
 const numeric=value=>typeof value==='number'&&Number.isFinite(value);
 const identity=(row,selection)=>row&&String(row.routeId)===String(selection.routeId)&&String(row.line)===String(selection.line)&&String(row.stopCode)===String(selection.stopCode)&&String(row.operatorRef)===String(selection.operatorRef)&&row.directionVerified===true&&row.directionEvidence==='exact-line-ref+operator+stop-sequence+destination';
 function normalize(raw,selection,{now=Date.now()}={}){
  if(raw?.schemaVersion!==1||String(raw.stopCode)!==String(selection.stopCode)||!Array.isArray(raw.arrivals)||!Array.isArray(raw.vehicles))throw Error('מבנה תשובת LIVE-WORK אינו תואם');
  if(!selection.routeId||!selection.operatorRef)throw Error('אין זהות קו ומפעיל מאומתת');
  const responseFresh=fresh(raw.sourceResponseAt,now),arrivals=[],vehicles=[];
  for(const row of raw.arrivals){
   if(!identity(row,selection)||!responseFresh||!fresh(row.sourceResponseAt,now)||!fresh(row.sourceObservedAt,now)||row.realtime!==true||row.etaKind!=='reported-live'||!iso(row.reportedArrivalAt))continue;
   const minutes=(Date.parse(row.reportedArrivalAt)-now)/60000;
   if(minutes< -1||minutes>180)continue;
   arrivals.push({...row,minutes:Math.max(0,minutes),routeDesc:selection.routeDesc||String(selection.routeId),direction:selection.direction||'',source:'SIRI דרך LIVE-WORK',upstreamTimestamp:row.sourceObservedAt,vehicle_ref:row.vehicleRef||null});
  }
  for(const row of raw.vehicles){
   const matched={...row,stopCode:raw.stopCode};
   if(!identity(matched,selection)||!responseFresh||!fresh(row.sourceResponseAt,now)||!fresh(row.sourceObservedAt,now)||row.clockType!=='source-report'||!row.vehicleRef||!row.tripId||!numeric(row.lat)||!numeric(row.lon)||row.lat<29||row.lat>34||row.lon<34||row.lon>36)continue;
   vehicles.push({...row,id:String(row.id||'siri:'+row.operatorRef+':'+row.tripId),vehicle_ref:String(row.vehicleRef),tripId:String(row.tripId),observed_at:row.sourceObservedAt,eta:iso(row.reportedArrivalAt)?row.reportedArrivalAt:null,source:'SIRI דרך LIVE-WORK',velocity:null,clockType:'source-report',directionVerified:true,routeRef:String(row.routeId)});
  }
  return {arrivals:arrivals.sort((a,b)=>a.minutes-b.minutes).slice(0,12),vehicles,sourceResponseAt:raw.sourceResponseAt,unverifiedCount:Array.isArray(raw.unverified)?raw.unverified.length:0,status:arrivals.length?'live':responseFresh?'no-verified-departures':'stale-source'};
 }
 root.SafeBusLive={normalize,version:'DEV-9.1.2'};
})(typeof window!=='undefined'?window:globalThis);
