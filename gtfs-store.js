/* איפה בטוח? 9.0.0 | updateable official routes, each line downloaded only when needed */
(function(root){'use strict';
const state={index:null,version:null,initPromise:null,cache:new Map(),routeIndex:{},hintPromise:null,metaLines:new Set(),metaPending:new Map(),metaFailures:new Map(),nextVersionCheck:0,versionCheck:null};
const BASE='./api/dataset?file=';
const dataURL=path=>BASE+encodeURIComponent(decodeURIComponent(path.split('?')[0]))+(path.includes('?')?'&'+path.split('?')[1]:'');
async function getJson(path,{force=false}={}){
  const url=dataURL(path);
  const r=await fetch(url,{cache:force?'no-store':'default',signal:AbortSignal.timeout(16000)});
  if(!r.ok){const e=new Error('לא ניתן לטעון נתוני מסלול ('+r.status+')');e.status=r.status;throw e;}
  if(!(r.headers.get('content-type')||'').includes('json'))throw new Error('השרת לא החזיר נתוני מסלול תקינים');
  return r.json();
}
function decodePolyline(s){let lat=0,lon=0,i=0,out=[];if(typeof s!=='string')throw Error('תוואי פגום');while(i<s.length){const d=[];for(let k=0;k<2;k++){let shift=0,v=0,b;do{if(i>=s.length)throw Error('תוואי פגום');b=s.charCodeAt(i++)-63;if(b<0||b>63)throw Error('קידוד תוואי פגום');v|=(b&31)<<shift;shift+=5;if(shift>30)throw Error('ערך תוואי חריג');}while(b>=32);d.push(v&1?-(v>>1)-1:(v>>1));}lat+=d[0];lon+=d[1];out.push([lon/1e6,lat/1e6]);}return out;}
async function init(){if(state.initPromise)return state.initPromise;state.initPromise=(async()=>{
let version;try{const f=await getJson('version.json',{force:true});if(!/^[a-f0-9]{16}$/.test(f.version))throw Error('גרסת נתונים לא תקינה');version=f.version;try{localStorage.setItem('eifo-national-data-version',version)}catch{}}catch{try{version=localStorage.getItem('eifo-national-data-version')}catch{}if(!/^[a-f0-9]{16}$/.test(version||'')){const r=await fetch('./data/version.json');if(!r.ok)throw Error('אין מאגר מסלולים זמין');version=(await r.json()).version;}}
let catalog;const catURL='catalog.json?v='+encodeURIComponent(version);
if('caches' in root){try{const cache=await caches.open('eifo-batuach-routes-v1');const hit=await cache.match(dataURL(catURL));if(hit)catalog=await hit.json();else{const r=await fetch(dataURL(catURL));if(!r.ok)throw Error('לא ניתן להוריד אינדקס');catalog=await r.clone().json();await cache.put(dataURL(catURL),r);}}catch(e){if(!catalog)catalog=await getJson(catURL);}}
else catalog=await getJson(catURL);
if(catalog?.schema!==2||!Array.isArray(catalog.lines)||!catalog.stops||!catalog.served)throw Error('אינדקס מסלולים פגום');state.version=version;state.index=catalog;state.nextVersionCheck=Date.now()+60000;return catalog;
})().catch(e=>{state.initPromise=null;throw e});return state.initPromise;}
async function rawLine(line){await init();line=String(line).trim();if(!state.index.lines.includes(line))return [];
 let raw=state.cache.get(line);if(raw)return raw;
 const path='line/'+encodeURIComponent(line)+'.json?v='+encodeURIComponent(state.version);
 if('caches' in root){try{const cache=await caches.open('eifo-batuach-routes-v1'),hit=await cache.match(dataURL(path));if(hit)raw=await hit.json();else{raw=await getJson(path);await cache.put(dataURL(path),new Response(JSON.stringify(raw),{headers:{'Content-Type':'application/json'}}));}}catch(e){if(e.status===409)throw e;if(!raw)raw=await getJson(path);}}
 else raw=await getJson(path);
 if(!Array.isArray(raw))throw Error('מבנה מסלול שגוי');state.cache.set(line,raw);if(state.cache.size>64)state.cache.delete(state.cache.keys().next().value);return raw;
}
async function refreshVersion(){
 if(Date.now()<state.nextVersionCheck)return;
 if(state.versionCheck)return state.versionCheck;
 state.versionCheck=(async()=>{state.nextVersionCheck=Date.now()+60000;const latest=await getJson('version.json',{force:true});if(latest.version===state.version)return;
  if(!/^[a-f0-9]{16}$/.test(latest.version))throw Error('גרסת נתונים לא תקינה');
  state.initPromise=null;state.cache.clear();state.routeIndex={};state.metaLines.clear();state.metaFailures.clear();await init();
 })().finally(()=>{state.versionCheck=null});return state.versionCheck;
}
async function routeIndexFor(vehicles){
 await init();await refreshVersion().catch(()=>{});
 const version=state.version;
 if(!state.hintPromise)state.hintPromise=fetch('./data/routes-index.json',{signal:AbortSignal.timeout(16000)}).then(r=>r.ok?r.json():null).catch(()=>null);
 const hint=await state.hintPromise;
 if(hint?.catalogVersion===version&&hint.routes){state.routeIndex=hint.routes;return {catalogVersion:version,routes:state.routeIndex};}
 const missing=(vehicles||[]).filter(v=>!state.routeIndex[String(v.operatorRef)+':'+String(v.routeId)]);
 const candidates=new Set(),addCandidate=line=>{if(state.index.lines.includes(line)&&!state.metaLines.has(line)&&(state.metaFailures.get(line)||0)<Date.now())candidates.add(line);};for(const v of missing){const h=hint?.routes?.[String(v.operatorRef)+':'+String(v.routeId)];if(h)addCandidate(h.line);}
 // Old metadata is a download hint only. The current official file must confirm operator + route.
 // Nearby served lines also cover routes newly added since the deployment.
 for(const [code,s]of Object.entries(state.index.stops)){if(!missing.some(v=>validNearby(v,s)))continue;for(const line of state.index.served[code]||[])addCandidate(line);if(candidates.size>=64)break;}
 const lines=[...candidates].slice(0,64).filter(line=>!state.metaLines.has(line)&&(state.metaFailures.get(line)||0)<Date.now());let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,lines.length)},async()=>{while(cursor<lines.length){const line=lines[cursor++];
  let task=state.metaPending.get(version+':'+line);if(!task){task=(async()=>{try{const rows=await rawLine(line);if(version!==state.version)return;
    const byKey={};for(const r of rows){if(!/^\d{1,12}$/.test(String(r.a))||!/^\d{1,12}$/.test(String(r.r))||!Array.isArray(r.c))continue;const key=String(r.a)+':'+String(r.r),headsign=r.h||state.index.stops[r.c.at(-1)]?.[2]||'',old=byKey[key];
     if(!old)byKey[key]={line,headsign,variants:1,ambiguousDestination:false};else{old.variants++;if(old.headsign!==headsign||old.ambiguousDestination){old.headsign=null;old.ambiguousDestination=true;}}
    }for(const [key,meta]of Object.entries(byKey)){const prior=state.routeIndex[key];state.routeIndex[key]=prior&&prior.line!==meta.line?{line:null,headsign:null,ambiguousDestination:true}:meta;}state.metaLines.add(line);state.metaFailures.delete(line);
   }catch(e){if(e.status===409)state.nextVersionCheck=0;state.metaFailures.set(line,Date.now()+15000);}
  })().finally(()=>state.metaPending.delete(version+':'+line));state.metaPending.set(version+':'+line,task);}await task;
 }}));
 return {catalogVersion:state.version,routes:state.routeIndex};
}
function validNearby(v,s){return typeof v.lat==='number'&&typeof v.lon==='number'&&Math.hypot((v.lon-s[1])*Math.cos(v.lat*Math.PI/180),v.lat-s[0])<.013;}
async function routesFor(line,stop){await init();line=String(line).trim();stop=stop==null?null:String(stop).trim();const raw=await rawLine(line);
return raw.filter(r=>Array.isArray(r.c)&&(!stop||r.c.includes(stop))).flatMap(r=>{try{const seq=r.c.map(c=>{const s=state.index.stops[c];return s?{code:c,name:s[2],lat:s[0],lon:s[1]}:null});if(seq.some(s=>!s))return [];const coords=decodePolyline(r.x);if(coords.length<3||coords.length>15000||coords.some(([lon,lat])=>!Number.isFinite(lat)||!Number.isFinite(lon)||lat<29||lat>34||lon<34||lon>36))return [];const a=seq[0],b=seq[seq.length-1],C=root.SafeBusCore;if(!C)return[];const delta=Math.max(C.hav([coords[0][1],coords[0][0]],[a.lat,a.lon]),C.hav([coords.at(-1)[1],coords.at(-1)[0]],[b.lat,b.lon]));return [{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{source:'GTFS משרד התחבורה',suspect:delta>350,endpointError:Math.round(delta),line,routeId:r.r,shapeId:r.s,directionId:r.d,headsign:r.h,origin:a.name,destination:b.name,stopSequence:seq,count:r.n,routeDesc:r.desc,agencyId:r.a}}]}catch{return[]}}).sort((a,b)=>b.properties.count-a.properties.count);
}
root.SafeBusDataset={init,routesFor,routeIndexFor,allLines:()=>state.index?.lines?.slice()||[],linesAt:code=>(state.index?.served?.[String(code)]||[]).slice(),catalog:()=>state.index,decodePolyline,version:()=>state.version};
})(window);
