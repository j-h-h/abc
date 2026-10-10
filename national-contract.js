/* Browser checks for nationwide reports, independent of the selected public line number. */
(function(root){'use strict';
 const fresh=(at,now)=>typeof at==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(at)&&Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=-30000&&now-Date.parse(at)<=180000;
 const validCoord=(lat,lon)=>typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=29&&lat<=34&&lon>=34&&lon<=36;
 function vehicles(rows,{now=Date.now(),bbox=null,stopCode=null}={}){const found=new Map();for(const r of rows||[]){if(!r||!validCoord(r.lat,r.lon)||!fresh(r.sourceObservedAt,now)||r.clockType!=='source-report'||r.gpsMeasuredAt!==null||!r.vehicleRef||!/^\d{1,12}$/.test(String(r.operatorRef))||!/^\d{1,12}$/.test(String(r.routeId))||!r.tripId)continue;
  if(bbox&&(r.lon<bbox[0]||r.lon>bbox[2]||r.lat<bbox[1]||r.lat>bbox[3]))continue;
  if(r.source==='mot-siri-via-curlbus'&&(!fresh(r.sourceResponseAt,now)||r.directionVerified!==true||r.directionEvidence!=='exact-line-ref+operator+stop-sequence+destination'))continue;
  if(r.source==='open-bus-stride-siri'&&(!fresh(r.snapshotAt,now)||Math.abs(Date.parse(r.snapshotAt)-Date.parse(r.sourceObservedAt))>180000))continue;
  if(!['mot-siri-via-curlbus','open-bus-stride-siri'].includes(r.source))continue;
  const speed=r.source==='open-bus-stride-siri'&&r.speedUnit==='km/h'&&r.speedEvidence==='mot-siri-profile-3.4.56'&&r.speedObservedAt===r.sourceObservedAt&&typeof r.reportedSpeedKmh==='number'&&Number.isFinite(r.reportedSpeedKmh)&&r.reportedSpeedKmh>=0&&r.reportedSpeedKmh<=160?r.reportedSpeedKmh:null;
  const bearing=r.source==='open-bus-stride-siri'&&typeof r.bearing==='number'&&Number.isFinite(r.bearing)&&r.bearing>=0&&r.bearing<=360?r.bearing%360:null;
  const key=String(r.operatorRef)+':'+String(r.vehicleRef),old=found.get(key);if(!old||Date.parse(old.sourceObservedAt)<=Date.parse(r.sourceObservedAt))found.set(key,{...r,id:key,vehicle_ref:String(r.vehicleRef),observed_at:r.sourceObservedAt,associationStopCode:stopCode,velocity:null,bearing,reportedSpeedKmh:speed,speedUnit:speed===null?null:'km/h',speedEvidence:speed===null?null:r.speedEvidence,speedObservedAt:speed===null?null:r.speedObservedAt});
 }return [...found.values()];}
 function station(raw,stopCode,{now=Date.now()}={}){if(raw?.schemaVersion!==1||String(raw.stopCode)!==String(stopCode)||!Array.isArray(raw.arrivals)||!Array.isArray(raw.vehicles)||!Array.isArray(raw.routes))throw Error('תשובת התחנה אינה תואמת לבחירה');
  const routeMatches=r=>raw.routes.some(x=>String(x.routeId)===String(r.routeId)&&String(x.line)===String(r.line)&&String(x.operatorRef)===String(r.operatorRef));
  const arrivals=raw.arrivals.filter(r=>String(r.stopCode)===String(stopCode)&&routeMatches(r)&&r.directionVerified===true&&r.directionEvidence==='exact-line-ref+operator+stop-sequence+destination'&&r.realtime===true&&r.etaKind==='reported-live'&&fresh(raw.sourceResponseAt,now)&&fresh(r.sourceResponseAt,now)&&fresh(r.sourceObservedAt,now)&&Number.isFinite(Date.parse(r.reportedArrivalAt))&&Date.parse(r.reportedArrivalAt)>=now-60000&&Date.parse(r.reportedArrivalAt)<=now+10800000);
  return {...raw,arrivals,vehicles:fresh(raw.sourceResponseAt,now)?vehicles(raw.vehicles.filter(routeMatches),{now,stopCode}):[]};
 }
 function area(raw,bbox,{now=Date.now()}={}){if(raw?.schemaVersion!==1||!Array.isArray(raw.vehicles)||!Array.isArray(raw.bbox)||raw.bbox.length!==4||raw.bbox.some((n,i)=>n!==bbox[i]))throw Error('תשובת האזור אינה תואמת למפה');return {...raw,vehicles:vehicles(raw.vehicles,{now,bbox})};}
 // Area responses may be partial. Preserve each valid observation without renewing its clocks.
 // Deduplicate before viewport clipping so a newer report outside the view removes the older in-view position.
 function mergeArea(previous,raw,bbox,{now=Date.now(),followedId=null}={}){
  const incoming=area(raw,bbox,{now});
  const all=vehicles([...(previous?.vehicles||[]),...raw.vehicles],{now});return {...incoming,vehicles:all.filter(v=>v.id===followedId||(v.lon>=bbox[0]&&v.lon<=bbox[2]&&v.lat>=bbox[1]&&v.lat<=bbox[3]))};
 }
 // This describes update freshness, not a probability that the supplier ETA is accurate.
 function arrivalUpdate(arrival,{now=Date.now(),sourceResponseAt=arrival?.sourceResponseAt}={}){
  const clocks=[arrival?.sourceObservedAt,arrival?.sourceResponseAt,sourceResponseAt];if(clocks.some(at=>!fresh(at,now)))return {level:'missing',label:'עדכון חסר'};
  const age=Math.max(0,...clocks.map(at=>(now-Date.parse(at))/1000));
  return age<=60?{level:'fresh',label:'עדכון טרי'}:age<=120?{level:'aging',label:'מתיישן'}:{level:'old',label:'עדכון ישן'};
 }
 const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').toLowerCase().replace(/["'׳״/.,-]/g,' ').replace(/\s+/g,' ').trim();
 function stopSearch(stops,query,center=null,limit=8){const q=fold(query),tokens=q.split(' ');if(!q)return[];return stops.filter(s=>s.code===q||tokens.every(t=>s.search.includes(t))).map(s=>({...s,rank:s.code===q?-1:0,distance:center?Math.hypot((s.lon-center.lon)*Math.cos(center.lat*Math.PI/180),s.lat-center.lat):0})).sort((a,b)=>a.rank-b.rank||a.distance-b.distance||a.code.localeCompare(b.code)).slice(0,limit);}
 function routeMeta(vehicle,routes=[],index={}){return routes.find(r=>String(r.routeId)===String(vehicle.routeId)&&String(r.operatorRef)===String(vehicle.operatorRef)&&(!vehicle.line||String(r.line)===String(vehicle.line)))||(()=>{const r=index[String(vehicle.operatorRef)+':'+String(vehicle.routeId)];return r&&(!vehicle.line||String(r.line)===String(vehicle.line))?r:null})()||null;}

 function searchHistory(rows){const out=[],keys=new Set();for(const r of Array.isArray(rows)?rows:[]){if(!r||!['place','stop','query'].includes(r.kind)||typeof r.label!=='string'||!r.label.trim()||r.label.length>200)continue;
  const item={kind:r.kind,label:r.label.trim()};if(r.kind==='place'){if(!validCoord(r.lat,r.lon))continue;item.lat=r.lat;item.lon=r.lon;}if(r.kind==='stop'){if(!/^\d{3,7}$/.test(String(r.code)))continue;item.code=String(r.code);}
  const key=r.kind+':'+(r.kind==='stop'?item.code:fold(item.label));if(keys.has(key))continue;keys.add(key);out.push(item);if(out.length===8)break;
 }return out;}
 function rememberSearch(history,item){return searchHistory([item,...(history||[])]);}

 root.SafeBusNationalContract={fresh,vehicles,station,area,mergeArea,fold,stopSearch,routeMeta,arrivalUpdate,searchHistory,rememberSearch};
})(typeof window!=='undefined'?window:globalThis);
