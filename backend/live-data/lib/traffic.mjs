import {coordOK,indexLine,edgeBearing,angleDifference,distance,sliceLine} from './geometry.mjs';
import {iso,fresh} from './transit.mjs';
export function congestion(speed,free){if(!Number.isFinite(speed)||!Number.isFinite(free)||free<=0)return null;const ratio=Math.min(1,Math.max(0,speed/free));return {ratio,color:ratio<.25?'red':ratio<.5?'orange':ratio<.75?'yellow':'green'}}
export function normalizeHereFlow(raw,{retrievedAt,shapeDirectionVerified=false,now=Date.now()}){
 if(!raw||!Array.isArray(raw.results))throw Error('INVALID_HERE_FLOW_SCHEMA');const observedAt=iso(raw.sourceUpdated),segments=[],rejected=[];
 for(const [ri,r] of raw.results.entries()){
  const cf=r.currentFlow;if(!cf)continue;
  const links=r.location?.shape?.links;if(!Array.isArray(links))continue;
  const full=links.flatMap((l,i)=>(l.points||[]).map(p=>[Number(p.lng),Number(p.lat)]).filter((p,j)=>!(i&&j===0)));
  if(full.length<2||!full.every(coordOK)||full.length>15000){rejected.push({index:ri,reason:'INVALID_GEOMETRY'});continue}
  const idx=indexLine(full),flows=Array.isArray(cf.subSegments)&&cf.subSegments.length?cf.subSegments:[{...cf,length:r.location.length}];
  const sum=flows.reduce((n,s)=>n+Number(s.length||0),0);if(!(sum>0)){rejected.push({index:ri,reason:'INVALID_LENGTH'});continue}
  let at=0;
  for(const [si,f] of flows.entries()){
   const end=at+idx.total*Number(f.length)/sum;
   const speed=typeof f.speed==='number'?f.speed*3.6:null,free=typeof f.freeFlow==='number'?f.freeFlow*3.6:null,confidence=typeof f.confidence==='number'?f.confidence:null,geo=sliceLine(idx,at,end);at=end;
   if(speed===null||speed<0||speed>130||free===null||free<=0||free>140||confidence===null||confidence<0||confidence>1||geo.length<2)continue;
   // Do not hide modeled/historical speeds behind a current retrieval timestamp.
   const live=confidence>.70&&fresh(observedAt,now,180);
   for(let start=0;start<geo.length-1;start+=399){
    const coordinates=geo.slice(start,start+400);if(coordinates.length<2)continue;
    const directed=indexLine(coordinates);
    segments.push({id:'here:'+ri+':'+si+':'+start,geometry:{type:'LineString',coordinates},currentSpeedKmh:speed,freeFlowSpeedKmh:free,confidence,observedAt,retrievedAt,source:'HERE Traffic API v7',direction:'geometry-order',directionVerified:shapeDirectionVerified,directionBearingDegrees:directed.edges.length?edgeBearing(directed.edges[0]):null,live,estimatedSpeed:true,speedBasis:confidence>.70?'real-time-probes':confidence>.50?'historical':'speed-limit',jamFactor:f.jamFactor??cf.jamFactor??null,traversability:f.traversability??cf.traversability??'open',...congestion(speed,free),roadName:r.location.description||null});
   }
  }
 }
 return {source:'HERE Traffic API v7',observedAt,retrievedAt,segments,rejected};
}
export function normalizeHereIncidents(raw,{retrievedAt}){
 if(!raw||!Array.isArray(raw.results))throw Error('INVALID_HERE_INCIDENT_SCHEMA');
 return {source:'HERE Traffic API v7',observedAt:iso(raw.sourceUpdated),retrievedAt,incidents:raw.results.map(r=>({id:r.incidentDetails?.id??null,location:r.location??null,type:r.incidentDetails?.type??null,criticality:r.incidentDetails?.criticality??null,description:r.incidentDetails?.description?.value??null,startTime:iso(r.incidentDetails?.startTime),endTime:iso(r.incidentDetails?.endTime),entryTime:iso(r.incidentDetails?.entryTime),roadClosed:r.incidentDetails?.roadClosed??null})).slice(0,500)};
}
export function calculateTraffic(corridor,flow,{routeId,stopCode,vehicle,now=Date.now()}){
 const index=indexLine(corridor.coordinates),remaining=index.total,intervals=[];
 const report={routeId:String(routeId),stopCode:String(stopCode),observedAt:flow.observedAt,source:flow.source,segments:flow.segments,matchMethod:'directed-route-corridor',validated:false,coveredMeters:0,remainingRouteMeters:remaining,delaySeconds:null,confidence:0,coverage:0,roadTravelSeconds:null,freeFlowRoadTravelSeconds:null,blockedRoute:false,reason:null,methodVersion:'directional-sampled-corridor-v1',distanceSamplingMeters:15,etaSemantics:'traffic delay over covered road distance only; excludes dwell and dispatch'};
 if(!remaining){report.reason='EMPTY_REMAINING_ROUTE';return report}
 if(!vehicle.gpsMeasuredAt||vehicle.clockType!=='gps-measurement'||!fresh(vehicle.gpsMeasuredAt,now,120)){report.reason='INDEPENDENT_FRESH_GPS_REQUIRED';return report}
 if(!vehicle.directionVerified){report.reason='VEHICLE_DIRECTION_UNVERIFIED';return report}
 // Match each remaining route interval once. Shared/overlapping provider segments cannot double-count distance.
 const grid=new Map(),cell=40,key=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
 for(const segment of flow.segments){
  if(!segment.live||!segment.directionVerified||!fresh(segment.observedAt,now,180)||segment.confidence<=.70||!Number.isFinite(segment.currentSpeedKmh)||!Number.isFinite(segment.freeFlowSpeedKmh))continue;
  const edges=indexLine(segment.geometry.coordinates).edges;
  for(const edge of edges){const a=index.xy(edge.ca),b=index.xy(edge.cb),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.01)continue;
   const id=JSON.stringify([edge.ca,edge.cb]),item={a,b,dx,dy,length,bearing:edgeBearing({dx,dy}),segment,id};
   for(let x=Math.floor((Math.min(a[0],b[0])-15)/cell);x<=Math.floor((Math.max(a[0],b[0])+15)/cell);x++)for(let y=Math.floor((Math.min(a[1],b[1])-15)/cell);y<=Math.floor((Math.max(a[1],b[1])+15)/cell);y++){const k=x+','+y;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(item)}
  }
 }
 let covered=0,delay=0,travel=0,freeTravel=0,quality=0,ambiguousMeters=0;
 for(const edge of index.edges){
  const count=Math.ceil(edge.length/15),length=edge.length/count,bearing=edgeBearing(edge);
  for(let i=0;i<count;i++){const t=(i+.5)/count,p=[edge.a[0]+edge.dx*t,edge.a[1]+edge.dy*t],candidates=[];
   for(const e of grid.get(key(...p))||[]){if(angleDifference(e.bearing,bearing)>35)continue;
    const t2=((p[0]-e.a[0])*e.dx+(p[1]-e.a[1])*e.dy)/(e.length*e.length);if(t2<0||t2>1)continue;
    const lateral=Math.hypot(p[0]-e.a[0]-t2*e.dx,p[1]-e.a[1]-t2*e.dy);if(lateral>15)continue;
    candidates.push({...e,lateral});
   }
   candidates.sort((a,b)=>a.lateral-b.lateral||b.segment.confidence-a.segment.confidence);if(!candidates.length)continue;
   const best=candidates[0];
   if(candidates.some(c=>c.id!==best.id&&c.lateral<=best.lateral+2&&Math.abs(c.segment.currentSpeedKmh-best.segment.currentSpeedKmh)>5)){ambiguousMeters+=length;continue}
   covered+=length;quality+=length*best.segment.confidence;
   const s=best.segment;if(s.currentSpeedKmh<=0||s.traversability!=='open'){report.blockedRoute=true;continue}
   const actual=length*3.6/s.currentSpeedKmh,baseline=length*3.6/s.freeFlowSpeedKmh;
   travel+=actual;freeTravel+=baseline;delay+=Math.max(0,actual-baseline);
   intervals.push({from:edge.start+i*length,to:edge.start+(i+1)*length,segmentId:s.id,length});
  }
 }
 const coverage=covered/remaining,confidence=covered?quality/covered*Math.sqrt(coverage):0;
 Object.assign(report,{coveredMeters:covered,coverage,confidence,ambiguousMeters,coveredRoadTravelSeconds:report.blockedRoute?null:travel,coveredFreeFlowSeconds:freeTravel,sampledIntervals:intervals.length});
 report.validated=!report.blockedRoute&&coverage>=.65&&confidence>=.65&&delay<=5400;
 report.delaySeconds=report.validated?Math.round(delay):null;
 if(report.validated&&coverage>=.98){report.roadTravelSeconds=Math.round(travel);report.freeFlowRoadTravelSeconds=Math.round(freeTravel)}
 report.reason=report.blockedRoute?'ROAD_BLOCKED_NO_FINITE_ETA':report.validated?'COVERED_DISTANCE_DELAY_ONLY':'INSUFFICIENT_DIRECTIONAL_COVERAGE';
 return report;
}
export function etaDecision(arrival,traffic,{now=Date.now()}={}){
 const reported=arrival?.reportedArrivalAt??null;
 // Unknown traffic inclusion is deliberately treated as possible inclusion.
 if(arrival?.realtime===true)return {reportedArrivalAt:reported,computedArrivalAt:null,appliedTrafficDelaySeconds:0,reason:'LIVE_PROVIDER_ETA_NOT_ADJUSTED'};
 const baseline=arrival?.trafficFreeBaselineSeconds;
 if(arrival?.baselineTrafficModel!=='explicit-free-flow'||!Number.isFinite(baseline)||baseline<0||traffic?.validated!==true||traffic.coverage<.98||!Number.isFinite(traffic.delaySeconds))return {reportedArrivalAt:reported,computedArrivalAt:null,appliedTrafficDelaySeconds:0,reason:'NO_VERIFIED_TRAFFIC_FREE_BASELINE'};
 return {reportedArrivalAt:reported,computedArrivalAt:new Date(now+(baseline+traffic.delaySeconds)*1000).toISOString(),appliedTrafficDelaySeconds:traffic.delaySeconds,reason:'EXPERIMENTAL_FREE_FLOW_BASELINE_PLUS_TRAFFIC',confidence:traffic.confidence};
}
