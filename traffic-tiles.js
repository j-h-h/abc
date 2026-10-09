/* Each traffic image expires independently. No tile conveys a road measurement timestamp or ETA. */
(function(root){'use strict';
 const MAX_AGE=180000;
 function timing(headers,now=Date.now()){
  const origin=Date.parse(headers.get('X-Traffic-Originated-At')),retrieved=Date.parse(headers.get('X-Traffic-Retrieved-At')),rawAge=headers.get('X-Traffic-Source-Age'),age=rawAge===null?NaN:Number(rawAge);
  if(headers.get('X-Traffic-Clock')!=='provider-response'||!Number.isFinite(origin)||!Number.isFinite(retrieved)||!Number.isFinite(age)||age<0||origin>now+30000||retrieved>now+30000||now-retrieved>MAX_AGE||now-origin+age*1000>MAX_AGE)return null;
  return {originatedAt:new Date(origin).toISOString(),retrievedAt:new Date(retrieved).toISOString(),expiresAt:Math.min(origin-age*1000,retrieved)+MAX_AGE};
 }
 function create(options={}){
  const live=new Map();
  const Layer=root.L.GridLayer.extend({
   createTile(coords,done){
    const img=document.createElement('img');img.alt='';img.setAttribute('role','presentation');
    const entry={controller:new AbortController(),url:null,timer:null};live.set(img,entry);
    const fail=code=>{if(!live.has(img))return;done(Error(code),img);options.onFailure?.(code)};
    fetch('./api/traffic?z='+coords.z+'&x='+coords.x+'&y='+coords.y,{cache:'no-store',signal:entry.controller.signal}).then(async r=>{
     if(!r.ok)throw Error(r.status===429?'TRAFFIC_QUOTA_EXHAUSTED':'TRAFFIC_UNAVAILABLE');
     const clock=timing(r.headers);if(!clock)throw Error('TRAFFIC_EXPIRED');
     const blob=await r.blob();if(blob.type!=='image/png'||blob.size<8||blob.size>400000)throw Error('TRAFFIC_INVALID_TILE');
     if(!live.has(img))return;if(clock.expiresAt<=Date.now())throw Error('TRAFFIC_EXPIRED');
     entry.url=URL.createObjectURL(blob);
     img.onload=()=>{if(!live.has(img))return;if(clock.expiresAt<=Date.now())return fail('TRAFFIC_EXPIRED');entry.clock=clock;done(null,img);const clocks=[...live.values()].map(e=>e.clock).filter(Boolean);options.onClock?.(clocks.sort((a,b)=>a.expiresAt-b.expiresAt)[0]||clock);};
     img.onerror=()=>fail('TRAFFIC_INVALID_TILE');
     entry.timer=setTimeout(()=>fail('TRAFFIC_EXPIRED'),Math.max(0,clock.expiresAt-Date.now()));img.src=entry.url;
    }).catch(e=>{if(e.name!=='AbortError')fail(e.message)});
    return img;
   }
  });
  const layer=new Layer({maxNativeZoom:18,minZoom:7,maxZoom:19,bounds:[[29,34],[34,36]],attribution:'Traffic © TomTom',pane:'trafficPane',opacity:.85,keepBuffer:0,updateWhenIdle:true});
  function release(img){const entry=live.get(img);if(!entry)return;live.delete(img);entry.controller.abort();clearTimeout(entry.timer);img.onload=img.onerror=null;if(entry.url)URL.revokeObjectURL(entry.url);}
  layer.on('tileunload',e=>release(e.tile));layer.on('remove',()=>{for(const img of live.keys())release(img)});
  return layer;
 }
 root.SafeBusTrafficTiles={create,timing,maxAge:MAX_AGE};
})(window);
