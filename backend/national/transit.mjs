// DEV copy of the reviewed WORK normalization contract; WORK branch remains unchanged.
import {coordOK,projectPoint,indexLine} from './geometry.mjs';
export function iso(value){if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;const n=Date.parse(value.replace(' ','T'));return Number.isFinite(n)?new Date(n).toISOString():null}
export const ageSeconds=(at,now=Date.now())=>at?(now-Date.parse(at))/1000:null;
export const fresh=(at,now=Date.now(),maxAge=180)=>typeof at==='string'&&Number.isFinite(Date.parse(at))&&ageSeconds(at,now)>=-30&&ageSeconds(at,now)<=maxAge;
export const vehicleKey=(operator,ref)=>operator&&ref?'il-mot-siri:'+String(operator)+':'+String(ref):null;
export function matchVisit(item,routes,stopCode){
 return routes.find(r=>String(item.stop_code)===String(stopCode)&&String(item.line_id||item.route_id)===r.routeId&&String(item.line_name)===r.line&&String(item.operator_id)===r.operatorRef&&r.stops.some(s=>s.code===String(stopCode))&&String(item.destination_id)===r.stops.at(-1).code)||null;
}
export function normalizeCurlbus(raw,{stopCode,routes,now=Date.now(),retrievedAt=new Date(now).toISOString()}){
 if(!raw||typeof raw.visits!=='object'||!Array.isArray(raw.visits[stopCode]))throw Error('INVALID_CURLBUS_SCHEMA');
 if(raw.errors?.length)throw Error('SIRI_PROVIDER_ERROR');
 const responseAt=iso(raw.timestamp),items=raw.visits[stopCode],arrivals=[],unverified=[],vehicles=[];
 for(const item of items){
  const route=matchVisit(item,routes,stopCode);if(!route)continue;
  const sourceObservedAt=iso(item.timestamp),candidateArrivalAt=iso(item.eta),etaMs=candidateArrivalAt?Date.parse(candidateArrivalAt):NaN;
  const current=fresh(sourceObservedAt,now)&&fresh(responseAt,now),usable=current&&etaMs>=now-60000&&etaMs<=now+3*3600000&&!['cancelled','noReport'].includes(item.status);
  const ref=item.vehicle_ref==null?null:String(item.vehicle_ref),trip=item.trip_id==null?null:String(item.trip_id),operatorRef=String(item.operator_id);
  const base={source:'mot-siri-via-curlbus',routeId:route.routeId,line:route.line,stopCode:String(stopCode),operatorRef,siriDirectionRef:String(item.direction_id??''),gtfsDirectionId:route.gtfsDirectionId,directionVerified:true,directionEvidence:'exact-line-ref+operator+stop-sequence+destination',vehicleRef:ref,vehicleKey:vehicleKey(operatorRef,ref),tripId:trip,sourceObservedAt,sourceResponseAt:responseAt,retrievedAt,sourceAgeSeconds:ageSeconds(sourceObservedAt,now),reportedArrivalAt:usable?candidateArrivalAt:null,unverifiedArrivalAt:usable?null:candidateArrivalAt,scheduledArrivalAt:null,originAimedDepartureAt:iso(item.departed),realtime:usable,etaKind:usable?'reported-live':'unverified-source-value',confidence:usable?'source-fresh-route-verified':'unverified',trafficAlreadyIncluded:'unknown-assume-possible',computedArrivalAt:null,appliedTrafficDelaySeconds:0};
  if(usable)arrivals.push({...base,minutes:Math.max(0,(etaMs-now)/60000)});else unverified.push({...base,reason:current?'ETA_OUT_OF_RANGE_OR_CANCELLED':'STALE_OR_INVALID_SOURCE_TIME'});
  const loc=item.location,lat=loc?.lat==null?null:Number(loc.lat),lon=loc?.lon==null?null:Number(loc.lon);
  if(!current||!coordOK([lon,lat])||!ref||!trip)continue;
  const p=projectPoint([lon,lat],indexLine(route.coordinates));if(!p||p.distance>140||p.ambiguous)continue;
  vehicles.push({id:'mot-siri:'+operatorRef+':'+trip,vehicleRef:ref,vehicleKey:base.vehicleKey,operatorRef,tripId:trip,routeId:route.routeId,line:route.line,lat,lon,bearing:null,speedKmh:null,source:base.source,sourceObservedAt,sourceResponseAt:responseAt,positionReportedAt:sourceObservedAt,gpsMeasuredAt:null,gpsFreshnessVerified:false,clockType:'source-report',retrievedAt,directionVerified:true,directionEvidence:base.directionEvidence,positionRouteOffsetMeters:p.offset,positionDistanceFromRouteMeters:p.distance,reportedArrivalAt:base.reportedArrivalAt});
 }
 return {schemaVersion:1,stopCode:String(stopCode),source:'mot-siri-via-curlbus',sourceResponseAt:responseAt,retrievedAt,arrivals:arrivals.sort((a,b)=>Date.parse(a.reportedArrivalAt)-Date.parse(b.reportedArrivalAt)),unverified,vehicles,status:arrivals.length?'live':unverified.length?'unverified':'no-verified-departures',emptyMeans:'No usable report; this does not prove the bus did not depart',gpsTimeLimitation:'SIRI RecordedAtTime is a source report clock, not an independent GPS measurement clock'};
}
export function normalizeStride(rows,{vehicleRef,operatorRef,from,to,retrievedAt,now=Date.now()}){
 if(!Array.isArray(rows))throw Error('INVALID_STRIDE_SCHEMA');let rejected=0;const unique=new Map();
 for(const r of rows){const at=iso(r.recorded_at_time),ref=String(r.siri_ride__vehicle_ref??''),op=String(r.siri_route__operator_ref??'');
  if(ref!==String(vehicleRef)||op!==String(operatorRef)||!at||Date.parse(at)<Date.parse(from)||Date.parse(at)>Date.parse(to)||Date.parse(at)>now+30000||!coordOK([r.lon,r.lat])){rejected++;continue}
  const observation={observationId:String(r.id),source:'open-bus-stride-siri-archive',vehicleRef:ref,operatorRef:op,vehicleKey:vehicleKey(op,ref),tripId:r.siri_ride__journey_ref||null,rideId:r.siri_ride__id==null?null:String(r.siri_ride__id),routeId:String(r.siri_route__line_ref??''),sourceObservedAt:at,positionReportedAt:at,gpsMeasuredAt:null,clockType:'source-report',gpsFreshnessVerified:false,retrievedAt,lat:r.lat,lon:r.lon,bearing:r.bearing??null,reportedVelocity:r.velocity??null,velocityUnit:'unverified-do-not-use-for-ETA',snapshotId:r.siri_snapshot__snapshot_id||null,snapshotDatabaseId:r.siri_snapshot_id??null,distanceFromJourneyStartMeters:r.distance_from_journey_start??null};
  const key=observation.tripId+'|'+at+'|'+r.lat+'|'+r.lon;if(!unique.has(key))unique.set(key,observation);
 }
 return {observations:[...unique.values()].sort((a,b)=>Date.parse(a.sourceObservedAt)-Date.parse(b.sourceObservedAt)),rejected};
}

export function normalizeStrideRides(rows,{vehicleRef,operatorRef,from,to,retrievedAt,now=Date.now()}){
 if(!Array.isArray(rows))throw Error('INVALID_STRIDE_RIDES_SCHEMA');
 const rides=[],seen=new Set();let rejected=0;
 for(const r of rows){
  const at=iso(r.scheduled_start_time),id=Number(r.id),op=String(r.siri_route__operator_ref??'');
  if(String(r.vehicle_ref??'')!==String(vehicleRef)||op!==String(operatorRef)||!Number.isSafeInteger(id)||id<=0||!at||Date.parse(at)<Date.parse(from)||Date.parse(at)>Date.parse(to)||Date.parse(at)>now+30000){rejected++;continue}
  if(seen.has(id))continue;seen.add(id);
  rides.push({rideId:String(id),tripId:r.journey_ref||null,vehicleRef:String(vehicleRef),operatorRef:op,vehicleKey:vehicleKey(op,vehicleRef),routeId:String(r.siri_route__line_ref??''),scheduledStartAt:at,sourceObservedAt:null,gpsMeasuredAt:null,evidenceKind:'archive-vehicle-trip-association',clockType:'scheduled-trip-start',retrievedAt,source:'open-bus-stride-siri-archive'});
 }
 return {rides:rides.sort((a,b)=>Date.parse(b.scheduledStartAt)-Date.parse(a.scheduledStartAt)),rejected};
}
