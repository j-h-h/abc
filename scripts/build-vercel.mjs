/* DEV-only static build. Reuse a verified published GTFS snapshot without writing to its branch. */
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='dist',base='https://j-h-h.github.io/abc/data/';
const shell=['index.html','traffic.html','traffic-view.js','traffic-view.css','experience.js','national.js','traffic-tiles.js','national-contract.js','national.css','styles.css','app.js','core.js','live-contract.js','archive-contract.js','vehicle-history.js','traffic-analysis.js','gtfs-store.js','icon.svg','manifest.webmanifest','sw.js'];
async function download(url){
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(30000),cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   return Buffer.from(await r.arrayBuffer());
  }catch(e){if(attempt===2)throw Error('Asset unavailable: '+url+' ('+e.message+')');await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
 }
}
async function json(url){return JSON.parse((await download(url)).toString('utf8'));}
await mkdir(output+'/data/line',{recursive:true});
await mkdir(output+'/vendor/images',{recursive:true});
for(const file of shell)await copyFile(file,output+'/'+file);
const before=await json(base+'version.json');
assert.match(before.version,/^[a-f0-9]{16}$/);
const catalog=await json(base+'catalog.json?v='+before.version);
assert.equal(catalog.schema,2);
assert.ok(catalog.lines.length>800&&catalog.stops&&catalog.served,'Incomplete national catalog');
let index=0,routeCount=0,hasDefaultStop=false;const routeIndex={};
await Promise.all(Array.from({length:8},async()=>{
 while(index<catalog.lines.length){
  const line=String(catalog.lines[index++]);
  assert.ok(line.length>0&&line.length<30&&!/[\\/]|^\\.{1,2}$/.test(line),'Unsafe line filename');
  const routes=await json(base+'line/'+encodeURIComponent(line)+'.json?v='+before.version);
  assert.ok(Array.isArray(routes)&&routes.length>0,'Missing routes for '+line);
  for(const route of routes){assert.ok(Array.isArray(route.c)&&route.c.length>=2&&typeof route.x==='string'&&route.x.length>20,'Invalid route '+line);}
  for(const r of routes){
   const key=String(r.a)+':'+String(r.r),headsign=r.h||catalog.stops[r.c.at(-1)]?.[2]||'',old=routeIndex[key];
   if(!old)routeIndex[key]={line,headsign,variants:1,ambiguousDestination:false};
   else {old.variants++;if(old.headsign!==headsign||old.ambiguousDestination){old.headsign=null;old.ambiguousDestination=true;}assert.equal(old.line,line,'One operator/route cannot identify two public lines');}
  }
  routeCount+=routes.length;
  if(line==='72')hasDefaultStop=routes.some(r=>r.c.includes('2360'));
  await writeFile(output+'/data/line/'+line+'.json',JSON.stringify(routes));
 }
}));
assert.ok(hasDefaultStop,'Missing default route 72 / stop 2360');
assert.equal(routeCount,before.routes,'Route count differs from published snapshot');
assert.equal((await json(base+'version.json')).version,before.version,'Feed changed during download; rebuild');
await writeFile(output+'/data/catalog.json',JSON.stringify(catalog));
await writeFile(output+'/data/version.json',JSON.stringify(before));
await writeFile(output+'/data/routes-index.json',JSON.stringify({catalogVersion:before.version,routes:routeIndex}));
const vendor=['leaflet.js','leaflet.css','images/layers.png','images/layers-2x.png','images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png'];
for(const file of vendor)await writeFile(output+'/vendor/'+file,await download('https://unpkg.com/leaflet@1.9.4/dist/'+file));
await writeFile(output+'/vendor/leaflet-LICENSE',await download('https://unpkg.com/leaflet@1.9.4/LICENSE'));
await writeFile(output+'/deployment.json',JSON.stringify({version:'DEV-9.3.4',branch:'dev/vehicle-history-map-20261009',gtfsVersion:before.version,gtfsGeneratedAt:before.generated_at,routeDataOrigin:base,lines:catalog.lines.length,routes:routeCount}));
console.log('VERIFIED DEV BUILD:',catalog.lines.length,'lines;',routeCount,'routes; GTFS',before.version);
