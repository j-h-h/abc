/* איפה בטוח? 9.0.0 | updateable official routes, each line downloaded only when needed */
(function(root){'use strict';
const state={index:null,version:null,initPromise:null,cache:new Map()};
const BASE='./api/dataset?file=';
const dataURL=path=>BASE+encodeURIComponent(decodeURIComponent(path.split('?')[0]))+(path.includes('?')?'&'+path.split('?')[1]:'');
async function getJson(path,{force=false}={}){
  const url=dataURL(path);
  const r=await fetch(url,{cache:force?'no-store':'default'});
  if(!r.ok)throw new Error('לא ניתן לטעון נתוני מסלול ('+r.status+')');
  if(!(r.headers.get('content-type')||'').includes('json'))throw new Error('השרת לא החזיר נתוני מסלול תקינים');
  return r.json();
}
function decodePolyline(s){let lat=0,lon=0,i=0,out=[];if(typeof s!=='string')throw Error('תוואי פגום');while(i<s.length){const d=[];for(let k=0;k<2;k++){let shift=0,v=0,b;do{if(i>=s.length)throw Error('תוואי פגום');b=s.charCodeAt(i++)-63;if(b<0||b>63)throw Error('קידוד תוואי פגום');v|=(b&31)<<shift;shift+=5;if(shift>30)throw Error('ערך תוואי חריג');}while(b>=32);d.push(v&1?-(v>>1)-1:(v>>1));}lat+=d[0];lon+=d[1];out.push([lon/1e6,lat/1e6]);}return out;}
async function init(){if(state.initPromise)return state.initPromise;state.initPromise=(async()=>{
let version;try{const f=await getJson('version.json',{force:true});if(!/^[a-f0-9]{16}$/.test(f.version))throw Error('גרסת נתונים לא תקינה');version=f.version;try{localStorage.setItem('eifo-national-data-version',version)}catch{}}catch{try{version=localStorage.getItem('eifo-national-data-version')}catch{}if(!/^[a-f0-9]{16}$/.test(version||'')){const r=await fetch('./data/version.json');if(!r.ok)throw Error('אין מאגר מסלולים זמין');version=(await r.json()).version;}}
let catalog;const catURL='catalog.json?v='+encodeURIComponent(version);
if('caches' in root){try{const cache=await caches.open('eifo-batuach-routes-v1');const hit=await cache.match(dataURL(catURL));if(hit)catalog=await hit.json();else{const r=await fetch(dataURL(catURL));if(!r.ok)throw Error('לא ניתן להוריד אינדקס');catalog=await r.clone().json();await cache.put(dataURL(catURL),r);}}catch(e){if(!catalog)catalog=await getJson(catURL);}}
else catalog=await getJson(catURL);
if(catalog?.schema!==2||!Array.isArray(catalog.lines)||!catalog.stops||!catalog.served)throw Error('אינדקס מסלולים פגום');state.version=version;state.index=catalog;return catalog;
})().catch(e=>{state.initPromise=null;throw e});return state.initPromise;}
async function routesFor(line,stop){await init();line=String(line).trim();stop=String(stop).trim();if(!state.index.lines.includes(line))return[];
let raw=state.cache.get(line);if(!raw){const path='line/'+encodeURIComponent(line)+'.json?v='+encodeURIComponent(state.version);if('caches' in root){try{const cache=await caches.open('eifo-batuach-routes-v1');const hit=await cache.match(dataURL(path));if(hit)raw=await hit.json();else{const r=await fetch(dataURL(path));if(!r.ok)throw Error('קו לא זמין');raw=await r.clone().json();await cache.put(dataURL(path),r)}}catch(e){if(!raw)raw=await getJson(path)}}else raw=await getJson(path);if(!Array.isArray(raw))throw Error('מבנה מסלול שגוי');state.cache.set(line,raw);if(state.cache.size>12)state.cache.delete(state.cache.keys().next().value);}
return raw.filter(r=>r.c?.includes(stop)).flatMap(r=>{try{const seq=r.c.map(c=>{const s=state.index.stops[c];return s?{code:c,name:s[2],lat:s[0],lon:s[1]}:null});if(seq.some(s=>!s))return [];const coords=decodePolyline(r.x);if(coords.length<3||coords.length>15000||coords.some(([lon,lat])=>!Number.isFinite(lat)||!Number.isFinite(lon)||lat<29||lat>34||lon<34||lon>36))return [];const a=seq[0],b=seq[seq.length-1],C=root.SafeBusCore;if(!C)return[];const delta=Math.max(C.hav([coords[0][1],coords[0][0]],[a.lat,a.lon]),C.hav([coords.at(-1)[1],coords.at(-1)[0]],[b.lat,b.lon]));return [{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{source:'GTFS משרד התחבורה',suspect:delta>350,endpointError:Math.round(delta),line,routeId:r.r,shapeId:r.s,directionId:r.d,headsign:r.h,origin:a.name,destination:b.name,stopSequence:seq,count:r.n,routeDesc:r.desc,agencyId:r.a}}]}catch{return[]}}).sort((a,b)=>b.properties.count-a.properties.count);
}
root.SafeBusDataset={init,routesFor,allLines:()=>state.index?.lines?.slice()||[],linesAt:code=>(state.index?.served?.[String(code)]||[]).slice(),catalog:()=>state.index,decodePolyline,version:()=>state.version};
})(window);
