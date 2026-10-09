/* Read-only operator-scoped archive evidence; planned journeys are not measured movement. */
(function(root){'use strict';
 const V=/^[A-Za-z0-9_-]{1,64}$/,N=/^\d{1,12}$/;
 const stamp=x=>typeof x==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
 const text=x=>x==null?null:String(x).slice(0,120);
 function normalize(raw,selection,{now=Date.now(),offset=0}={}){
  const ref=String(selection.vehicleRef||''),op=String(selection.operatorRef||''),key='il-mot-siri:'+op+':'+ref;
  if(!V.test(ref)||!N.test(op)||raw?.schemaVersion!==1||raw.vehicleKey!==key||String(raw.vehicleRef)!==ref||String(raw.operatorRef)!==op||!Array.isArray(raw.rides)||!Array.isArray(raw.observations)||!stamp(raw.from)||!stamp(raw.to))throw Error('תשובת הארכיון אינה תואמת לרכב ולמפעיל שנבחרו');
  const from=Date.parse(raw.from),to=Date.parse(raw.to);
  if(from>=to||to-from>14*86400000||to>now+30000||from<now-366*86400000||selection.from&&Date.parse(selection.from)!==from||selection.to&&Date.parse(selection.to)!==to)throw Error('חלון הארכיון אינו תואם לבקשה');
  const exact=row=>row&&row.vehicleKey===key&&String(row.vehicleRef)===ref&&String(row.operatorRef)===op&&N.test(String(row.routeId));
  const rides=[],observations=[],rideIds=new Set(),observationIds=new Set();let filtered=0;
  for(const row of raw.rides){
   if(!exact(row)||row.evidenceKind!=='archive-vehicle-trip-association'||row.clockType!=='scheduled-trip-start'||row.gpsMeasuredAt!==null||row.sourceObservedAt!==null||!N.test(String(row.rideId))||!stamp(row.scheduledStartAt)||Date.parse(row.scheduledStartAt)<from-86400000||Date.parse(row.scheduledStartAt)>Math.min(to,now+30000)){filtered++;continue}
   if(rideIds.has(String(row.rideId)))continue;rideIds.add(String(row.rideId));
   rides.push({rideId:String(row.rideId),tripId:text(row.tripId),routeId:String(row.routeId),scheduledStartAt:row.scheduledStartAt,evidenceKind:row.evidenceKind});
  }
  for(const row of raw.observations){
   if(!exact(row)||row.clockType!=='source-report'||row.gpsMeasuredAt!==null||!stamp(row.sourceObservedAt)||Date.parse(row.sourceObservedAt)<from||Date.parse(row.sourceObservedAt)>Math.min(to,now+30000)||!root.SafeBusCore?.validCoord(row.lat,row.lon)){filtered++;continue}
   const id=text(row.observationId);if(!id){filtered++;continue}if(observationIds.has(id))continue;observationIds.add(id);
   observations.push({observationId:id,routeId:String(row.routeId),tripId:text(row.tripId),rideId:text(row.rideId),snapshotId:text(row.snapshotId),sourceObservedAt:row.sourceObservedAt,lat:row.lat,lon:row.lon,clockType:'source-report',gpsMeasuredAt:null});
  }
  const next=raw.nextOffset,hasNext=Number.isInteger(next)&&next>offset&&next<=2000;
  return {vehicleRef:ref,operatorRef:op,vehicleKey:key,from:raw.from,to:raw.to,rides,observations,
   partial:raw.partial===true||raw.rideSelectionTruncated===true||filtered>0||raw.truncated===true,
   rideSelectionTruncated:raw.rideSelectionTruncated===true,truncated:raw.truncated===true,nextOffset:hasNext?next:null,
   observationStatus:String(raw.observationStatus||'unknown'),observationError:text(raw.observationError?.code),filtered,
   retrievedAt:stamp(raw.retrievedAt)?raw.retrievedAt:null,mechanicalFaultConclusion:null};
 }
 function merge(previous,next){
  if(!previous)return next;
  if(previous.vehicleKey!==next.vehicleKey||previous.from!==next.from||previous.to!==next.to)throw Error('אין לצרף דפים מרכבים או מחלונות זמן שונים');
  return {...next,partial:previous.partial||next.partial,rides:[...new Map([...previous.rides,...next.rides].map(r=>[r.rideId,r])).values()],
   observations:[...new Map([...previous.observations,...next.observations].map(r=>[r.observationId,r])).values()],filtered:previous.filtered+next.filtered};
 }
 root.SafeBusArchive={normalize,merge,version:'DEV-9.1.9'};
})(typeof window!=='undefined'?window:globalThis);
