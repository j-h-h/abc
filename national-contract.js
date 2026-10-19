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

 // A partial station frame may omit vehicles after a route-provider failure.
 // Retain only separately validated original observations; never retain absent ETAs.
 function mergeStation(previous,raw,stopCode,{now=Date.now()}={}){
  const incoming=station(raw,stopCode,{now});
  if(raw.partial!==true||!fresh(raw.sourceResponseAt,now)||!previous||String(previous.stopCode)!==String(stopCode)||previous.catalogVersion!==raw.catalogVersion)return {...incoming,retainedVehicleCount:0};
  let prior;try{prior=station(previous,stopCode,{now});}catch{return {...incoming,retainedVehicleCount:0};}
  const merged=vehicles([...prior.vehicles,...incoming.vehicles],{now,stopCode}),incomingIds=new Set(incoming.vehicles.map(v=>v.id)),routes=new Map();
  for(const r of [...prior.routes,...incoming.routes])routes.set(JSON.stringify([String(r.operatorRef),String(r.routeId),String(r.line),r.headsign||null]),r);
  return {...incoming,routes:[...routes.values()],vehicles:merged,retainedVehicleCount:merged.filter(v=>!incomingIds.has(v.id)).length};
 }
 function routeGroups(routes,center=null){
  const groups=new Map();for(const route of routes||[]){const p=route.properties,key=String(p.agencyId)+':'+String(p.routeId);if(!groups.has(key))groups.set(key,{key,variants:[],distance:Infinity,order:groups.size});groups.get(key).variants.push(route);}
  const nearby=center&&validCoord(center.lat,center.lon);
  for(const g of groups.values()){const origins=new Set(),destinations=new Set(),words=[];for(const r of g.variants){const p=r.properties;origins.add(p.origin);destinations.add(p.destination);words.push(p.origin,p.destination,p.headsign,...p.stopSequence.flatMap(s=>[s.name,String(s.code)]));if(nearby)for(const s of p.stopSequence)if(validCoord(s.lat,s.lon))g.distance=Math.min(g.distance,Math.hypot((s.lon-center.lon)*Math.cos(center.lat*Math.PI/180),s.lat-center.lat));}g.origin=origins.size===1?[...origins][0]:'כמה נקודות מוצא';g.destination=destinations.size===1?[...destinations][0]:'כמה יעדים';g.search=fold(words.join(' '));}
  return [...groups.values()].sort((a,b)=>nearby?a.distance-b.distance||a.order-b.order:a.order-b.order);
 }
 function filterRouteGroups(groups,query){const words=fold(query).split(' ').filter(Boolean);return groups.filter(g=>words.every(w=>g.search.includes(w)));}

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
 function routeMeta(vehicle,routes=[],index={}){const matches=routes.filter(r=>String(r.routeId)===String(vehicle.routeId)&&String(r.operatorRef)===String(vehicle.operatorRef)&&(!vehicle.line||String(r.line)===String(vehicle.line)));if(matches.length){const lines=new Set(matches.map(r=>String(r.line||''))),destinations=new Set(matches.map(r=>typeof r.headsign==='string'&&r.headsign.trim()?r.headsign.trim():null));if(lines.size!==1)return null;return {...matches[0],headsign:destinations.size===1?[...destinations][0]:null,ambiguousDestination:destinations.size!==1};}const r=index[String(vehicle.operatorRef)+':'+String(vehicle.routeId)];return r&&(!vehicle.line||String(r.line)===String(vehicle.line))?r:null;}
 function lineSearch(lines,query,limit=6){const q=fold(query).replace(/^קו\s*/,'');if(!/^\d{1,4}[א-תa-z]?$/.test(q))return[];return (lines||[]).map(String).filter(line=>fold(line).startsWith(q)).sort((a,b)=>(fold(a)===q?-1:fold(b)===q?1:a.localeCompare(b,'he',{numeric:true}))).slice(0,limit);}
 function arrivalKey(a){return JSON.stringify([String(a.operatorRef||''),String(a.routeId||''),String(a.vehicleRef||''),String(a.tripId||''),a.vehicleRef||a.tripId?'':String(a.reportedArrivalAt||'')]);}

 function searchHistory(rows){const out=[],keys=new Set();for(const r of Array.isArray(rows)?rows:[]){if(!r||!['place','stop','query','route'].includes(r.kind)||typeof r.label!=='string'||!r.label.trim()||r.label.length>200)continue;
  const item={kind:r.kind,label:r.label.trim()};if(r.kind==='place'){if(!validCoord(r.lat,r.lon))continue;item.lat=r.lat;item.lon=r.lon;}if(r.kind==='stop'){if(!/^\d{1,7}$/.test(String(r.code)))continue;item.code=String(r.code);}
  if(r.kind==='route'){if(!/^\d{1,4}[א-תA-Za-z]?$/.test(String(r.line))||!/^\d{1,12}$/.test(String(r.routeId))||!/^\d{1,12}$/.test(String(r.operatorRef)))continue;item.line=String(r.line);item.routeId=String(r.routeId);item.operatorRef=String(r.operatorRef);}
  const key=r.kind+':'+(r.kind==='stop'?item.code:r.kind==='route'?item.operatorRef+':'+item.routeId:fold(item.label));if(keys.has(key))continue;keys.add(key);out.push(item);if(out.length===8)break;
 }return out;}
 function rememberSearch(history,item){return searchHistory([item,...(history||[])]);}

 root.SafeBusNationalContract={fresh,vehicles,station,mergeStation,area,mergeArea,routeGroups,filterRouteGroups,fold,stopSearch,routeMeta,lineSearch,arrivalKey,arrivalUpdate,searchHistory,rememberSearch};
})(typeof window!=='undefined'?window:globalThis);
