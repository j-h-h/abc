// Metre-based geometry; GeoJSON always uses [longitude, latitude].
const R=6371000, RAD=Math.PI/180;
export const coordOK=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=34&&p[0]<=36&&p[1]>=29&&p[1]<=34;
export function distance(a,b){const lat=(a[1]+b[1])/2*RAD;return Math.hypot((b[0]-a[0])*RAD*R*Math.cos(lat),(b[1]-a[1])*RAD*R)}
export function decodePolyline(s){
 if(typeof s!=='string'||s.length>600000)throw Error('INVALID_SHAPE');
 let lat=0,lon=0,i=0;const out=[];
 while(i<s.length){const ds=[];for(let k=0;k<2;k++){let shift=0,v=0,b;do{if(i>=s.length)throw Error('INVALID_SHAPE');b=s.charCodeAt(i++)-63;if(b<0||b>63||shift>30)throw Error('INVALID_SHAPE');v+=(b&31)*2**shift;shift+=5}while(b>=32);ds.push(v%2?-(Math.floor(v/2)+1):v/2)}lat+=ds[0];lon+=ds[1];out.push([lon/1e6,lat/1e6]);if(out.length>15000)throw Error('SHAPE_TOO_LARGE')}
 if(out.length<2||!out.every(coordOK))throw Error('INVALID_SHAPE');return out;
}
export function indexLine(coords){
 if(!Array.isArray(coords)||coords.length<2||coords.length>15000||!coords.every(coordOK))throw Error('INVALID_SHAPE');
 const origin=coords[0],scaleX=RAD*R*Math.cos(origin[1]*RAD),scaleY=RAD*R;
 const xy=p=>[(p[0]-origin[0])*scaleX,(p[1]-origin[1])*scaleY];
 let total=0;const edges=[];
 for(let i=1;i<coords.length;i++){const a=xy(coords[i-1]),b=xy(coords[i]),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.01)continue;edges.push({a,b,ca:coords[i-1],cb:coords[i],dx,dy,length,start:total,end:total+length});total+=length}
 return {coords,edges,total,xy};
}
export const angleDifference=(a,b)=>Math.abs(((a-b+540)%360)-180);
export const edgeBearing=e=>(Math.atan2(e.dx,e.dy)/RAD+360)%360;
export function projectPoint(point,index,{minOffset=0,maxOffset=index.total,bearing=null}={}){
 if(!coordOK(point))return null;const p=index.xy(point),candidates=[];
 for(const e of index.edges){if(e.end<minOffset||e.start>maxOffset)continue;
  const lo=Math.max(0,(minOffset-e.start)/e.length),hi=Math.min(1,(maxOffset-e.start)/e.length);
  let t=((p[0]-e.a[0])*e.dx+(p[1]-e.a[1])*e.dy)/(e.length*e.length);t=Math.max(lo,Math.min(hi,t));
  const lateral=Math.hypot(p[0]-e.a[0]-t*e.dx,p[1]-e.a[1]-t*e.dy),headingError=Number.isFinite(bearing)?angleDifference(bearing,edgeBearing(e)):null;
  if(headingError!==null&&headingError>60)continue;
  candidates.push({offset:e.start+t*e.length,distance:lateral,bearing:edgeBearing(e),headingError,coordinate:[e.ca[0]+t*(e.cb[0]-e.ca[0]),e.ca[1]+t*(e.cb[1]-e.ca[1])]});
 }
 candidates.sort((a,b)=>a.distance-b.distance);if(!candidates.length)return null;
 const best=candidates[0];return {...best,ambiguous:candidates.some(c=>c.distance<=best.distance+3&&Math.abs(c.offset-best.offset)>60)};
}
export function pointAt(index,offset){
 const e=index.edges.find(e=>e.end>=offset)||index.edges.at(-1);if(!e)return null;
 const t=Math.max(0,Math.min(1,(offset-e.start)/e.length));return [e.ca[0]+(e.cb[0]-e.ca[0])*t,e.ca[1]+(e.cb[1]-e.ca[1])*t];
}
export function sliceLine(index,from,to){
 const out=[pointAt(index,from)];for(const e of index.edges)if(e.end>from&&e.end<to)out.push(e.cb);out.push(pointAt(index,to));return out.filter((p,i)=>p&&(i===0||distance(p,out[i-1])>.01));
}
export function anchorStops(route){
 const index=indexLine(route.coordinates);let cursor=0;const anchors=[];
 for(const stop of route.stops){const p=projectPoint([stop.lon,stop.lat],index,{minOffset:cursor});if(!p||p.distance>100||p.ambiguous)throw Error('AMBIGUOUS_STOP_SHAPE');cursor=p.offset;anchors.push({...stop,offset:p.offset})}
 if(distance(route.coordinates[0],[route.stops[0].lon,route.stops[0].lat])>350||distance(route.coordinates.at(-1),[route.stops.at(-1).lon,route.stops.at(-1).lat])>350)throw Error('SUSPECT_GTFS_ENDPOINTS');
 return {index,anchors};
}
export function remainingCorridor(route,vehicle,stopCode){
 const {index,anchors}=anchorStops(route);
 const p=projectPoint([vehicle.lon,vehicle.lat],index,{bearing:vehicle.bearing});
 if(!p||p.distance>80||p.ambiguous)throw Error('VEHICLE_OFF_ROUTE_OR_AMBIGUOUS');
 const target=anchors.filter(s=>String(s.code)===String(stopCode)&&s.offset>p.offset+1);
 if(target.length!==1)throw Error('STOP_PASSED_OR_AMBIGUOUS');
 const stop=target[0];return {coordinates:sliceLine(index,p.offset,stop.offset),remainingRouteMeters:stop.offset-p.offset,projection:p,target:stop};
}
