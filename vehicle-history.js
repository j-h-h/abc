/* Observed vehicle history. Local and conservative; no inferred mechanical faults. */
(function(root){'use strict';
 const KEY='eifo-observed-vehicles-v2',DAY=86400000,RETENTION=30*DAY,MAX_VEHICLES=180,MAX_POINTS=100,MAX_EVENTS=40;
 const C=root.SafeBusCore||{};
 let registry=Object.create(null),storage=null;
 try{storage=root.localStorage||null;const value=storage&&JSON.parse(storage.getItem(KEY)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))registry=Object.assign(Object.create(null),value);}catch{}
 const validRef=ref=>typeof ref==='string'&&/^[\p{L}\p{N}_:.-]{3,96}$/u.test(ref);
 const number=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')?Number(x):NaN,dt=x=>Date.parse(x);
 const distance=(a,b)=>C.hav?C.hav([a.lat,a.lon],[b.lat,b.lon]):Infinity;
 function cutoff(now){return now-RETENTION}
 function compact(now=Date.now()){
  for(const [key,r] of Object.entries(registry)){
   if(!r||typeof r!=='object'||!Array.isArray(r.samples)||!Array.isArray(r.events)){delete registry[key];continue;}
   r.samples=r.samples.filter(x=>x&&Number.isFinite(x.t)&&x.t>=cutoff(now)&&x.t<=now+30000&&C.validCoord?.(x.lat,x.lon)&&x.independentClockVerified===true).slice(-MAX_POINTS);
   r.events=r.events.filter(x=>x&&Number.isFinite(x.t)&&x.t>=cutoff(now)&&x.t<=now+30000&&x.independentClockVerified===true&&['stationary','gps_jump'].includes(x.kind)&&typeof x.trip==='string').slice(-MAX_EVENTS);
   if(!r.samples.length&&!r.events.length)delete registry[key];
  }
  const keys=Object.keys(registry).sort((a,b)=>(registry[b].last||0)-(registry[a].last||0));
  for(const key of keys.slice(MAX_VEHICLES))delete registry[key];
 }
 function save(){try{compact();storage?.setItem(KEY,JSON.stringify(registry));}catch{/* quota or storage disabled: retain in-memory */}}
 compact();
 function stableRide(v){const r=v.ride_id??v.tripId??v.trip_id;return r===null||r===undefined||!String(r).trim()?null:String(r).slice(0,90)}
 function addEvent(r,kind,sample){
  // No repeated alerts every polling cycle for the same ride and issue.
  if(r.events.some(e=>e.kind===kind&&e.trip===sample.trip&&sample.t-e.t<20*60000))return;
  r.events.push({kind,trip:sample.trip,t:sample.t,line:sample.line,independentClockVerified:true});
 }
 function ingest(v,context={}){
  const ref=v?.vehicle_ref==null?'':String(v.vehicle_ref).trim();
  if(!validRef(ref))return {supported:false,reason:'אין מזהה רכב יציב'};
  const t=dt(v.observed_at),lat=number(v.lat),lon=number(v.lon),now=Number.isFinite(context.now)?context.now:Date.now();
  if(!Number.isFinite(t)||t>now+30000||t<cutoff(now)||!C.validCoord?.(lat,lon))return {supported:false,reason:'תצפית לא תקינה'};
  if(v.clockType!=='gps-measurement'||v.gpsFreshnessVerified!==true||Date.parse(v.gpsMeasuredAt)!==t)return {supported:false,reason:'אין חותמת זמן GPS עצמאית'};
  let r=registry[ref];if(!r)r=registry[ref]={samples:[],events:[],last:0};
  const trip=stableRide(v),sample={t,lat,lon,trip,line:String(context.line||''),source:String(v.source||''),independentClockVerified:true};
  const last=r.samples.at(-1);
  if(last&&t<=last.t){return summary(ref,now)}
  const route=context.route;
  let nearTerminal=false;
  if(Array.isArray(route)&&route.length>3){
   const first={lat:route[0][1],lon:route[0][0]},end={lat:route.at(-1)[1],lon:route.at(-1)[0]};
   nearTerminal=distance(sample,first)<450||distance(sample,end)<450;
  }
  // A jump may be a GPS artefact: classify as data quality, not a faulty bus.
  if(last&&last.trip&&trip===last.trip){
   const elapsed=(t-last.t)/1000,metres=distance(last,sample);
   if(elapsed>=10&&elapsed<=300&&metres>300&&metres/elapsed*3.6>115)addEvent(r,'gps_jump',sample);
  }
  r.samples.push(sample);r.samples=r.samples.slice(-MAX_POINTS);r.last=t;
  if(trip&&!nearTerminal){
   const window=r.samples.filter(p=>p.trip===trip&&p.t>=t-12*60000&&p.t<=t);
   const first=window[0];
   if(window.length>=4&&t-first.t>=8*60000&&window.every(p=>distance(first,p)<=35))addEvent(r,'stationary',sample);
  }
  save();return summary(ref,now);
 }
 function summary(ref,now=Date.now()){
  if(!validRef(String(ref||'')))return {supported:false,recurrent:false};
  compact(now);const r=registry[ref];if(!r)return {supported:false,recurrent:false};
  const events=r.events.filter(e=>e.t>=cutoff(now)),stalls=events.filter(e=>e.kind==='stationary');
  const uniqueTrips=new Set(stalls.map(e=>e.trip).filter(Boolean));
  const stationaryLines=[...new Set(stalls.map(e=>e.line).filter(Boolean))];
  const jumps=events.filter(e=>e.kind==='gps_jump').length;
  const recurrent=uniqueTrips.size>=2;
  return {supported:true,recurrent,stationaryLines,stationaryTrips:uniqueTrips.size,stationaryEvents:stalls.length,gpsJumps:jumps,
   last:r.last,observations:r.samples.length,
   text:recurrent?'עצירות ממושכות נצפו באותו רכב בנסיעות שונות. ייתכנו פקקים, המתנות או גורמים אחרים; אין הוכחה לתקלה מכנית.':
      stalls.length?'נרשמה עצירה ממושכת אחת לפחות; הסיבה אינה ידועה.':
      jumps?'זוהו קפיצות GPS חריגות; ייתכן שגיאת מדידה.':'לא זוהה דפוס חוזר בתצפיות המקומיות.'};
 }
 function trail(ref,trip,now=Date.now()){
  const r=registry[ref];if(!r||!trip)return[];
  return r.samples.filter(p=>p.trip===trip&&p.t>=now-12*60000&&p.t<=now).slice(-7).map(p=>({...p}));
 }
 function reset(){registry=Object.create(null);try{storage?.removeItem(KEY);}catch{}}
 root.SafeBusHistory={ingest,summary,trail,reset,version:'DEV-9.1.6',scope:'local-device',_inspect:()=>JSON.parse(JSON.stringify(registry))};
})(typeof window!=='undefined'?window:globalThis);
