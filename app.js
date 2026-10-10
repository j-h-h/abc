/* Eifo Batuach DEV-9.3.7 — no local computer/server required. */
(function(root){'use strict';
 const C=root.SafeBusCore,D=root.SafeBusDataset,H=root.SafeBusHistory,T=root.SafeBusTraffic,$=id=>document.getElementById(id);
 const SOURCES={mot:'https://api.bus.gov.il/prod/mot-scheduler-prod/api/he/',stride:'https://open-bus-stride-api.hasadna.org.il',curlbus:'https://curlbus.app/',busnearby:'https://api.busnearby.co.il/directions/index/stops/'};
 const state={line:'72',stop:'2360',siriRef:'',map:null,route:null,allRoutes:[],routeLayer:null,vehicleLayer:null,stopMarker:null,trafficLayer:null,trafficVector:null,trafficReport:null,trafficVisible:false,trafficStatusText:'אין מקור עומסים מורשה פעיל',motionLayer:null,vehicles:new Map(),arrivals:[],arrivalAt:0,arrivalsError:null,gpsError:null,routeError:null,request:0,polling:false,backoffUntil:0,sourceBackoff:{},lastJump:null,offline:false,relayUrl:'',sourceUsed:'',curlbusError:null,motError:null,sourceAge:null};
 const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const setBanner=(msg,bad=false)=>{const e=$('banner');e.textContent=msg;e.classList.toggle('bad',!!bad);queueMicrotask(updateHealth);};
 const showWarn=(msg)=>{const e=$('warning');e.hidden=!msg;e.textContent=msg||'';};
 function savePrefs(){try{localStorage.setItem('eifo-batuach-v8-prefs',JSON.stringify({line:state.line,stop:state.stop,siriRef:state.siriRef,showOld:$('showOld').checked,relayUrl:state.relayUrl}));}catch{}}
 function initPrefs(){try{const p=JSON.parse(localStorage.getItem('eifo-batuach-v8-prefs')||'{}');if(typeof p.line==='string'&&p.line.length<=8)state.line=p.line;if(/^\d{3,7}$/.test(p.stop))state.stop=p.stop;if(/^\d{4,12}$/.test(p.siriRef||''))state.siriRef=p.siriRef;$('showOld').checked=!!p.showOld;if(typeof p.relayUrl==='string')state.relayUrl=isTrustedRelay(p.relayUrl)?p.relayUrl:'';}catch{}$('line').value=state.line;$('stop').value=state.stop;$('siriRef').value=state.siriRef;$('relayUrl').value=state.relayUrl;}
 function setupMap(){if(!root.L){$('mapError').hidden=false;setBanner('מפת הרקע לא נטענה. נסה שוב בחיבור לאינטרנט.',true);return;}
  state.map=L.map('map',{zoomControl:false,maxZoom:19}).setView([31.5,34.9],7);
  // If a tile server is blocked, never display a blank map without explanation.
  // Try multiple genuine basemaps. Slow/hanging tiles must not strand the user on grey.
  const tileStatus=$('tileNotice');
  let tileAttempt=0,settledLayer=null;
  const pendingLayers=[];
  const basemaps=[
    {name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors'},
    {name:'CARTO',url:'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors · © CARTO'},
    {name:'Esri',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles © Esri · OpenStreetMap contributors'},
    {name:'OSM France',url:'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors · OSM France'}
  ];
  function tryBasemap(){
    if(settledLayer||tileAttempt>=basemaps.length){
      if(!settledLayer){tileStatus.hidden=false;updateHealth();}
      return;
    }
    const i=tileAttempt++,spec=basemaps[i];
    const layer=L.tileLayer(spec.url,{maxZoom:19,attribution:spec.attribution});
    pendingLayers.push(layer);
    let failures=0;
    layer.on('tileload',()=>{
      if(settledLayer)return;
      settledLayer=layer;
      state.tileSource=spec.name;
      state.tileProblem=false;
      tileStatus.hidden=true;updateHealth();
      for(const old of pendingLayers)if(old!==layer)state.map.removeLayer(old);
    });
    layer.on('tileerror',()=>{
      failures++;
      if(!settledLayer&&failures>=4&&i===tileAttempt-1)tryBasemap();
    });
    layer.addTo(state.map);
    setTimeout(()=>{
      if(!settledLayer&&i===tileAttempt-1)tryBasemap();
    },4800);
  }
  state.tileSource=null;state.tileProblem=true;
  tryBasemap();
  setTimeout(()=>{if(!settledLayer){tileStatus.hidden=false;updateHealth();}},9000);
  state.routeLayer=L.layerGroup().addTo(state.map);state.motionLayer=L.layerGroup().addTo(state.map);state.vehicleLayer=L.layerGroup().addTo(state.map);
  L.control.zoom({position:'bottomleft'}).addTo(state.map);
  $('goStop').onclick=()=>{if(state.stopMarker)state.map.setView(state.stopMarker.getLatLng(),15);else setBanner('למיקום תחנה מדויק צריך לטעון קודם את המסלול הרשמי.',true)};
  $('fitRoute').onclick=()=>{if(state.route){const b=L.geoJSON(state.route).getBounds();if(b.isValid())state.map.fitBounds(b.pad(.08));}else setBanner('לא נטען תוואי מאומת לקו ולתחנה.',true)};
  setTimeout(()=>state.map.invalidateSize(),300);
 }
 function clearRoute(){if(state.routeLayer)state.routeLayer.clearLayers();if(state.stopMarker){state.map.removeLayer(state.stopMarker);state.stopMarker=null;}state.route=null;}
 function chooseRoute(i,focus=false){clearRoute();if(state.trafficVector){state.map?.removeLayer(state.trafficVector);state.trafficVector=null;}state.trafficReport=null;state.trafficVisible=false;updateTrafficStatus();const f=state.allRoutes[i];if(!f)return;state.route=f;if(!state.map)return;
  if(state.routeLayer)state.routeLayer.addLayer(L.geoJSON(f,{style:{color:f.properties.suspect?'#bd721b':'#1765d7',weight:5,opacity:.85,dashArray:f.properties.suspect?'8,6':undefined}}));
  const s=f.properties.stopSequence.find(x=>String(x.code)===state.stop);
  if(s){state.stopMarker=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'stop-dot',iconSize:[15,15],iconAnchor:[8,8]})}).addTo(state.map).bindPopup('תחנה '+esc(state.stop)+' · '+esc(s.name));if(focus)state.map.setView([s.lat,s.lon],root.SafeBusNational?.state.ready?Math.max(16,state.map.getZoom()):14,{animate:false});}
  $('mapCaption').textContent='קו '+state.line+' · לכיוון '+(f.properties.headsign||f.properties.destination)+' · תחנה '+state.stop+(f.properties.suspect?' · נדרשת זהירות בתוואי':'');
  drawVehicles();updateHealth();
 }
 async function loadLocalRoute(revision,focus=false){
  clearRoute();state.allRoutes=[];$('direction').replaceChildren();$('directionWrap').hidden=true;
  try{
    const routes=await D.routesFor(state.line,state.stop);
    if(revision!==state.request)return;state.allRoutes=routes;
    if(!state.allRoutes.length){
      state.routeError=`לא נמצא תוואי רשמי לקו ${state.line} בתחנה ${state.stop}`;
      $('direction').add(new Option('אין מסלול מתאים',''));
      $('mapCaption').textContent='אין תוואי מאומת לקו ולתחנה הזאת';
      $('importStatus').textContent='כל קווי האוטובוס בארץ מוטמעים. נסה מספר תחנה או קו אחר.';
      setBanner(state.routeError+'. הקווים בתחנה מוצעים בבחירת קו.',true);
      return;
    }
    for(const [i,f] of state.allRoutes.entries())$('direction').add(new Option(`${f.properties.origin} ← ${f.properties.destination} (${f.properties.stopSequence.length} תחנות)`,String(i)));
    $('directionWrap').hidden=state.allRoutes.length<=1;
    state.routeError=null;chooseRoute(0,focus);
    $('importStatus').textContent=`${D.allLines().length} מספרי קווי אוטובוס זמינים בארץ · ${state.allRoutes.length} חלופות מתאימות לקו ולתחנה שבחרת. אין צורך בייבוא.`;
    setBanner(state.route?.properties.suspect?'הנתונים הרשמיים מכילים חריגה בין קצה התוואי לתחנה. המפה מסומנת בקו מקווקו; יש לבדוק בשטח.':'תוואי רשמי מהארכיון שהעלית · מיקומים ותחזיות בהתאם לזמינות המקורות.',!!state.route?.properties.suspect);
  }catch(e){if(revision!==state.request)return;state.routeError=e.message;setBanner('שגיאת נתוני מסלול: '+e.message,true);}
 }
 function updateSuggestions(){
   const local=D.linesAt($('stop').value.trim()),all=D.allLines(),hint=document.getElementById('nearbyLines');
   if(hint){
     hint.replaceChildren();const label=document.createElement('span');label.textContent=local.length?'בתחנה:':'לא נמצאו קווים בתחנה';hint.appendChild(label);
     for(const line of local.slice(0,14)){
       const chip=document.createElement('button');chip.type='button';chip.className='quick-line';chip.textContent=line;
       chip.title='הצג קו '+line;chip.addEventListener('click',()=>{$('line').value=line;applySelection();});hint.appendChild(chip);
     }
     if(local.length>14){const more=document.createElement('span');more.textContent=`ועוד ${local.length-14} · ניתן להקליד כל קו`;hint.appendChild(more);}
   }
   const list=$('allLines');list.replaceChildren();
   const localSet=new Set(local);
   for(const line of [...local,...all.filter(line=>!localSet.has(line))]){const op=document.createElement('option');op.value=line;if(localSet.has(line))op.label='עובר בתחנה';list.appendChild(op);}
 }
 function routedUrl(url){
  const origin=state.relayUrl.trim().replace(/\/+$/,'');if(!origin)return url;
  let r;try{r=new URL(url);}catch{return url;}
  const hosts={'curlbus.app':'curlbus','api.bus.gov.il':'mot','api.busnearby.co.il':'busnearby','open-bus-stride-api.hasadna.org.il':'stride'};
  const label=hosts[r.hostname];if(!label)return url;
  const base=label==='mot'?'/prod/mot-scheduler-prod/api/he/':label==='busnearby'?'/directions/index/stops/':'/';
  if(!r.pathname.startsWith(base))throw Error('כתובת מקור לא צפויה');
  return origin+'/'+label+'/'+r.pathname.slice(base.length).replace(/^\/+/, '')+r.search;
 }
 // Three independent systems: geometry, map base tiles, and arrival predictions.
 function healthSnapshot(){
   const height=$('map')?.getBoundingClientRect().height||0;
   const route=state.route?'✓ מסלול':state.routeError?'✕ מסלול':'… מסלול';
   const map=height<100?'✕ גובה מפה':state.tileSource?'✓ מפה':'! מפת רקע';
   const arrivals=state.arrivalsError?'✕ תחזיות':state.arrivalAt&&Date.now()-state.arrivalAt<110000?(state.arrivals.length?'✓ תחזיות':'? אין דיווח'):state.arrivalAt?'! תחזיות ישנות':'… תחזיות';
   const issues=[];
   if(height<100)issues.push('רכיב המפה לא קיבל גובה. זו תקלה בתצוגה, לא בקו.');
   else if(state.tileProblem&&!state.tileSource)issues.push('מפת הכבישים אינה נטענת, אף שהמסלול הרשמי עשוי להיות תקין. ייתכן חסימת תמונות ברשת.');
   if(state.routeError)issues.push('מסלולים: '+state.routeError);
   if(state.arrivalsError)issues.push('תחזיות: '+state.arrivalsError);
   if(state.gpsError)issues.push('GPS: '+state.gpsError+' — מקור Open Bus הוא ארכיון, לא GPS חי מאומת.');
   return {route,map,arrivals,issues,height,routePoints:state.route?.geometry?.coordinates?.length||0,tileSource:state.tileSource||'אין',forecastSource:state.sourceUsed||'אין'};
 }
 function updateHealth(){
   const el=$('healthStrip');if(!el)return;
   const h=healthSnapshot();
   el.classList.toggle('bad',!!h.issues.length);
   el.textContent=state.arrivalsError?'חיבור הנתונים אינו זמין · פרטים':state.arrivalAt?(state.arrivals.length?'התקבלו תחזיות הגעה · פרטים':'החיבור פעיל; אין תחזית עדכנית · פרטים'):'בודק את חיבור הנתונים…';
   root.SafeBusExperience?.update(state);
 }
 function diagnosticText(){
   if(root.SafeBusNational?.state.ready)return root.SafeBusNational.diagnosticText();
   const h=healthSnapshot();
   return ['איפה בטוח? DEV-9.3.7 — מצב המערכת',
     'קו '+state.line+' · תחנה '+state.stop,
     'מסלול: '+h.route+' · '+h.routePoints+' נקודות תוואי',
     'מפה: '+h.map+' · מקור: '+h.tileSource+' · גובה: '+Math.round(h.height)+' פיקסלים',
     'תחזיות: '+h.arrivals+' · מקור: '+h.forecastSource,
     'חיבור: '+(builtInLive()?'LIVE-WORK דרך שרת DEV באותה כתובת':state.relayUrl?'מתווך שהוגדר בהגדרות':'מקורות ישירים'),
     ...(builtInLive()?['חותמת תגובת המקור: '+(state.liveResponseAt||'טרם התקבלה')+' · דיווחים שלא אומתו: '+(state.liveUnverified||0)]:[]),
     'GPS: '+(state.gpsError||'אין שגיאה מדווחת; אין בכך אישור שמיקום הרכבים חי'),
     '',...(h.issues.length?h.issues:['לא נמצאה תקלה מדווחת ברכיבים הראשיים.']),
     'כתובת: '+location.origin+location.pathname].join('\n');
 }
 function isTrustedRelay(value){try{const u=new URL(value);return u.protocol==='https:' && !u.username&&!u.password&&!u.search&&!u.hash&&!(/\s/.test(value));}catch{return false;}}
 async function fetchJson(url,timeout=11000){const host=new URL(url).hostname;if((state.sourceBackoff[host]||0)>Date.now())throw Error('המקור הגביל בקשות; ממשיכים למקור חלופי');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const r=await fetch(routedUrl(url),{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});if(r.status===429){const retry=Math.min(600,Math.max(30,Number(r.headers.get('Retry-After'))||120));state.sourceBackoff[host]=Date.now()+retry*1000;throw Error('המקור הגביל בקשות; השהיה של '+retry+' שניות למקור זה בלבד');}if(!r.ok){const detail=await r.json().catch(()=>null);throw Error('שגיאת שרת '+r.status+(typeof detail?.error==='string'?' · '+detail.error.slice(0,100):''));}const type=r.headers.get('content-type')||'';if(!type.toLowerCase().includes('json'))throw Error('המקור אינו מחזיר JSON');return await r.json();}catch(e){if(e.name==='TypeError')throw Error('נכשלה גישה למקור (רשת או חסימת CORS בדפדפן)');if(e.name==='AbortError')throw Error('השרת לא השיב בזמן');throw e;}finally{clearTimeout(timer)}}
 function unwrap(v){if(!v||typeof v!=='object'||v.success===false)throw Error(v?.message||'מבנה תשובה לא תקין');if(!('data' in v))throw Error('לא התקבל שדה data');return v.data;}
 function serviceDay(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=k=>parts.find(p=>p.type===k).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
 }
 async function getMotArrivals(){
  const q=new URLSearchParams({stopCode:state.stop,day:serviceDay()});
  const list=unwrap(await fetchJson(SOURCES.mot+'Stops/RefreshStopTimesAtStop?'+q));
  const rows=Array.isArray(list?.routesInStop)?list.routesInStop:[];
  const desc=String(state.route?.properties?.routeDesc||'');
  const matched=rows.filter(r=>String(r.routeName)===state.line && String(r.routeDesc)===desc);
  if(!matched.length){
    if(rows.some(r=>String(r.routeName)===state.line))throw Error('מקור התחזיות אינו מזהה את החלופה שבחרת. לא אציג תחזית לכיוון אחר.');
    return [];
  }
  const arrivals=[];const failures=[];
  for(const r of matched.slice(0,3)){
    try{
      const params=new URLSearchParams({stopCodes:state.stop,routeDesc:String(r.routeDesc)});
      const payload=unwrap(await fetchJson(SOURCES.mot+'Calendar/GetRouteCalendarAtStopsByStopCodes?'+params));
      const head=r.headsign;const direction=typeof head==='string'?head:(head?.he||head?.en||state.route.properties.destination);
      for(const a of C.normalizeArrivals(payload,String(r.routeDesc))){arrivals.push({...a,direction,operator:r.agencyName||'',source:'משרד התחבורה',upstreamTimestamp:null,vehicle_ref:null});}
    }catch(e){failures.push(e.message);}
  }
  if(matched.length&&failures.length===Math.min(matched.length,3))throw Error('תחזיות משרד התחבורה נכשלו: '+failures[0]);
  return arrivals.sort((a,b)=>a.minutes-b.minutes).slice(0,12);
 }
 async function getCurlbus(){
  const raw=await fetchJson(SOURCES.curlbus+encodeURIComponent(state.stop),11000);
  if(!raw||!raw.visits||typeof raw.visits!=='object')throw Error('תשובת curlbus אינה מכילה תחזיות');
  const rawItems=raw.visits[state.stop]||[];
  if(!Array.isArray(rawItems))throw Error('מבנה תחזיות curlbus שגוי');
  const expectedRef=deriveSiriRef(),expectedDir=String(state.route?.properties?.directionId??'');
  const arrivals=[],vehicles=[];let stale=0;
  for(const item of rawItems){
    if(String(item.line_name||'').trim()!==state.line)continue;
    // Require the exact MOT line-ref; line 72 alone is not an unambiguous route identifier.
    if(!expectedRef||String(item.line_id||item.route_id)!==expectedRef)continue;
    const age=C.gpsAge(item.timestamp);
    if(!Number.isFinite(age)||age< -30||age>180){stale++;continue;}
    const eta=Date.parse(item.eta);
    if(!Number.isFinite(eta)||eta<Date.now()-60000||eta>Date.now()+3*3600000)continue;
    // Direction ids can be inconsistent across providers; accept only a verified id match.
    const dirKnown=item.direction_id!==null && item.direction_id!==undefined && String(item.direction_id)!=='';
    const sameDirection=dirKnown && String(item.direction_id)===expectedDir;
    if(dirKnown&&!sameDirection)continue;
    const direction=sameDirection?state.route.properties.destination:'כיוון לא אומת במקור';
    arrivals.push({minutes:Math.max(0,(eta-Date.now())/60000),realtime:true,routeDesc:state.route.properties.routeDesc,direction,source:'SIRI דרך curlbus',vehicle_ref:item.vehicle_ref||null,tripId:item.trip_id||null,upstreamTimestamp:item.timestamp,directionVerified:sameDirection});
    const loc=item.location;
    if(!loc||!sameDirection||!C.validCoord(Number(loc.lat),Number(loc.lon)))continue;
    if(C.nearRoute([Number(loc.lat),Number(loc.lon)],state.route.geometry.coordinates).distance>140)continue;
    const trip=item.trip_id ? 'trip:'+String(item.trip_id) : null;
    const car=item.vehicle_ref ? 'vehicle:'+String(item.vehicle_ref)+':'+new Date(item.timestamp).toISOString().slice(0,10):null;
    if(!trip&&!car)continue;
    vehicles.push({id:'siri:'+(trip||car),lat:Number(loc.lat),lon:Number(loc.lon),observed_at:item.timestamp,velocity:null,vehicle_ref:item.vehicle_ref||null,eta:item.eta,source:'SIRI דרך curlbus',clockType:'source-report',tripId:item.trip_id||null,directionVerified:true,routeRef:expectedRef});
  }
  if(!arrivals.length&&stale)throw Error('המקור השיב דיווחי SIRI ישנים; לא אציג אותם כמידע חי');
  return {arrivals:arrivals.sort((a,b)=>a.minutes-b.minutes),vehicles};
 }
 async function getBusNearby(){
  const now=Math.floor(Date.now()/1000),url=SOURCES.busnearby+'1:'+encodeURIComponent(state.stop)+'/stoptimes?'+new URLSearchParams({numberOfDepartures:'8',timeRange:'5400',currentTime:String(now)});
  const raw=await fetchJson(url,10500);
  const groups=Array.isArray(raw)?raw:Array.isArray(raw?.times)?raw.times:[];
  const arrivals=[];const expected=String(state.route?.properties.routeDesc||'');
  for(const group of groups){
    const pattern=group.pattern||{};const route=pattern.route||{};
    if(String(route.shortName||group.routeShortName||'').trim()!==state.line)continue;
    const stopTimes=group.stoptimes||group.times||(group.realtimeArrival?[group]:[]);
    for(const t of stopTimes){
      // BusNearby arrival lacks a guaranteed shared MOT routeDesc; direction only when explicit.
      const head=String(t.headsign||t.tripHeadsign||pattern.headsign||'');
      const target=String(state.route?.properties.headsign||'');
      if(!head||!target||(!head.includes(target)&&!target.includes(head)))continue;
      const abs=Number(t.realtimeArrival||t.scheduledArrival);
      const arrival=abs>1e12?abs:abs>1e9?abs*1000:NaN;
      if(!Number.isFinite(arrival)||arrival<Date.now()-60000||arrival>Date.now()+3*3600000)continue;
      arrivals.push({minutes:Math.max(0,(arrival-Date.now())/60000),realtime:t.realtime===true,routeDesc:expected,direction:head,source:'BusNearby',vehicle_ref:null,upstreamTimestamp:null});
    }
  }
  return {arrivals:arrivals.sort((a,b)=>a.minutes-b.minutes),vehicles:[]};
 }

 function builtInLive(){return !!root.SafeBusLive&&!state.relayUrl&&['https:','http:'].includes(root.location?.protocol);}
 function liveUrl(kind='arrivals'){
  const url=new URL('./api/live',root.location.href);
  url.searchParams.set('kind',kind);
  if(kind==='arrivals'){url.searchParams.set('line',state.line);url.searchParams.set('stopCode',state.stop);url.searchParams.set('routeId',String(state.route?.properties?.routeId||''));}
  return url.href;
 }
 async function getLiveArrivals(){
  const properties=state.route.properties;
  try{
   const raw=await fetchJson(liveUrl(),22000);
   const payload=root.SafeBusLive.normalize(raw,{routeId:properties.routeId,operatorRef:properties.agencyId,line:state.line,stopCode:state.stop,routeDesc:properties.routeDesc,direction:properties.headsign||properties.destination});
   state.sourceUsed=payload.arrivals.length?'SIRI דרך LIVE-WORK':payload.status==='stale-source'?'LIVE-WORK נגיש · הדיווחים ישנים':'LIVE-WORK נגיש · אין דיווח הגעה מאומת';
   state.liveStatus=payload.status;state.liveResponseAt=payload.sourceResponseAt;state.liveUnverified=payload.unverifiedCount;
   return payload;
  }catch(e){state.liveStatus='unavailable';throw Error('חיבור LIVE-WORK דרך שרת האתר נכשל: '+e.message);}
 }

 async function getArrivals(){
  if(!state.route)throw Error('אין מסלול וכיוון מאומתים — תחזית לא תוצג');
  if(builtInLive())return getLiveArrivals();
  const faults=[];let accessible=0;
  try{
    const ret=await getCurlbus();accessible++;state.curlbusError=null;
    if(ret.arrivals.length){state.sourceUsed='SIRI דרך curlbus';return ret;}
  }catch(e){state.curlbusError=e.message;faults.push('curlbus: '+e.message);}
  try{
    const arrivals=await getMotArrivals();accessible++;state.motError=null;
    if(arrivals.length){state.sourceUsed='משרד התחבורה';return {arrivals,vehicles:[]};}
  }catch(e){state.motError=e.message;faults.push('משרד התחבורה: '+e.message);}
  try{
    const ret=await getBusNearby();accessible++;
    if(ret.arrivals.length){state.sourceUsed='BusNearby';return ret;}
  }catch(e){faults.push('BusNearby: '+e.message);}
  // "Successful request but no matching visit" is NOT evidence that a bus did not depart.
  if(accessible){state.sourceUsed='אין דיווח הגעה לכיוון שנבחר';return {arrivals:[],vehicles:[]};}
  state.sourceUsed='אין מקור נגיש';
  throw Error(faults.join(' | ')||'כל מקורות התחזיות אינם זמינים');
 }
 function drawArrivals(){const root=$('arrivals'),age=(Date.now()-state.arrivalAt)/1000;root.replaceChildren();$('arrivalAge').textContent=state.arrivalAt?'נבדק לפני '+C.ageText(age):'אין עדכון';
  if(!state.arrivals.length){const e=document.createElement('div');e.className='empty';e.textContent=state.arrivalsError?'תחזיות אינן זמינות: '+state.arrivalsError:'לא התקבל דיווח הגעה מאומת לכיוון הזה. אין להסיק שהאוטובוס לא יצא.';root.appendChild(e);return;}
  for(const a of state.arrivals.slice(0,6)){const card=document.createElement('div');card.className='arrival';const n=document.createElement('strong');n.textContent=C.arrivalLabel(a,age);const dir=document.createElement('small');dir.textContent=a.direction;const tag=document.createElement('span');tag.className=a.realtime?'rt':'schedule';tag.textContent=age>110?'התחזית התיישנה':a.realtime?'תחזית מדווחת':'לוח זמנים בלבד · יציאה לא אומתה';card.append(n,dir,tag);
   const adjusted=T?.serverEta(a,state.trafficReport);
   if(adjusted){const extra=document.createElement('small');extra.className='traffic-eta';
     extra.textContent='🚦 חישוב ניסיוני שאושר בשרת: '+adjusted.minutes+' דק׳ (תוספת '+adjusted.extraMinutes+' דק׳)';
     extra.title=adjusted.caution;card.append(extra);}
   if(a.vehicle_ref&&a.operatorRef){const history=document.createElement('button');history.type='button';history.className='archive-link';history.textContent='היסטוריית הרכב';history.onclick=()=>openVehicleArchive(a.vehicle_ref,a.operatorRef);card.append(history);}root.appendChild(card);}
 }
 async function loadArrivals(revision){try{const payload=await getArrivals();if(revision!==state.request)return;const fresh=payload.arrivals;for(const v of payload.vehicles){const old=state.vehicles.get(v.id);if(!old||Date.parse(v.observed_at)>=Date.parse(old.observed_at))state.vehicles.set(v.id,v);storeObservation(v);}drawVehicles();const jump=C.forecastJump(state.arrivals,fresh,(Date.now()-state.arrivalAt)/1000);state.arrivals=fresh;state.arrivalAt=Date.now();state.arrivalsError=null;state.lastJump=jump;drawArrivals();if(jump!==null)showWarn(`⚠ תחזית הקו קפצה ב־${Math.abs(jump)} דקות. לא הוכח שמדובר באותה נסיעה — כדאי לצאת מוקדם.`);else if(fresh.length&&fresh[0].minutes<=9)showWarn('ליד מוצא המסלול תחזיות יכולות להשתנות במהירות. אל תסתמך על מספר הדקות בלבד.');else showWarn('');}
  catch(e){if(revision!==state.request)return;state.arrivalsError=e.message;state.arrivals=[];state.arrivalAt=0;state.sourceUsed='אין מקור נגיש';drawArrivals();showWarn('⚠ מקור התחזיות אינו זמין. לא מוצגים זמני הגעה ישנים כאילו עודכנו.');}}
 function displayVehicle(v){const age=C.gpsAge(v.observed_at),status=C.gpsStatus(v.observed_at),showOld=$('showOld').checked;if(status==='invalid'||status==='expired'||(status==='archive'&&!showOld))return false;
  if(!state.route)return false;
  return C.nearRoute([v.lat,v.lon],state.route.geometry.coordinates).distance<=180;
 }
 function historyVehicleKey(v){const op=String(v.operatorRef||state.route?.properties?.agencyId||''),ref=String(v.vehicle_ref||'');return /^\d{1,12}$/.test(op)&&ref?'il-mot-siri:'+op+':'+ref:null;}
 function historySummary(v){return H?.summary(historyVehicleKey(v))||{supported:false,recurrent:false};}
 function markerHtml(v){
  if(root.SafeBusExperience)return root.SafeBusExperience.marker(v,state.line,historySummary(v));
  const age=C.gpsAge(v.observed_at),status=C.gpsStatus(v.observed_at),hist=historySummary(v),
    speed=v.velocity===null||v.velocity===undefined||v.velocity===''?NaN:Number(v.velocity);
  const speedText=Number.isFinite(speed)&&speed>=0&&speed<=120?Math.round(speed)+' קמ״ש':'מהירות —';
  const label=v.clockType==='source-report'?(status==='fresh'?'דיווח SIRI חדש':'דיווח SIRI ישן'):(status==='fresh'?'מדידת GPS טרייה':status==='old'?'מדידת GPS ישנה':'ארכיון');
  const remaining=v.eta?(Date.parse(v.eta)-Date.now())/60000:null;
  const eta=v.directionVerified&&Number.isFinite(remaining)&&remaining>=0&&remaining<=120&&age<=90?` · ${Math.ceil(remaining)} דק׳`:'';
  const warning=hist.recurrent?'⚠ ':''; 
  return `<div class="bus-tag ${status==='fresh'?'':status==='old'?'old':'archive'} ${hist.recurrent?'recurrent':''}"><strong>${warning}🚌 ${esc(state.line)}${v.directionVerified?'':'?'}</strong>${esc(eta)} · ${esc(C.ageText(age))}<small>${esc(v.directionVerified?'כיוון אומת':'כיוון לא אומת')} · ${esc(label)} · ${esc(speedText)}</small></div>`;
 }
 function storeObservation(v){
  const key=historyVehicleKey(v);if(key&&v.clockType==='gps-measurement')H?.ingest({...v,vehicle_ref:key},{line:state.line,route:state.route?.geometry?.coordinates});
 }
 function drawMotionTrails(vehicles){
  state.motionLayer?.clearLayers();
  if(!state.motionLayer||!root.L?.circleMarker||!H)return;
  for(const v of vehicles){
    if(!displayVehicle(v)||!v.vehicle_ref)continue;
    const trip=v.ride_id??v.tripId??v.trip_id;
    const points=H.trail(historyVehicleKey(v),trip);
    for(const p of points.slice(0,-1)){
      L.circleMarker([p.lat,p.lon],{radius:3,color:'#246ac7',weight:1,fillColor:'#5a94ed',fillOpacity:.55,opacity:.7})
       .addTo(state.motionLayer).bindPopup('תצפית GPS מדווחת · '+esc(new Date(p.t).toLocaleTimeString('he-IL'))+' · החיבור בין נקודות לא מתאר בהכרח את הכביש שבו נסע הרכב');
    }
  }
 }

 const activeMarkers=new Map();
 function drawVehicles(){if(!state.map||!state.vehicleLayer)return;const visible=new Set(),seenVehicleRefs=new Set();
  const vehicles=[...state.vehicles.values()].sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
  drawMotionTrails(vehicles);
  for(const v of vehicles){if(visible.size>=16)break;if(!displayVehicle(v))continue;if(v.vehicle_ref&&seenVehicleRefs.has(String(v.vehicle_ref)))continue;if(v.vehicle_ref)seenVehicleRefs.add(String(v.vehicle_ref));const id=String(v.id),age=C.gpsAge(v.observed_at);visible.add(id);const icon=L.divIcon({className:'bus-pin',html:markerHtml(v),iconSize:[44,44],iconAnchor:[22,22]});const hist=historySummary(v);
  const historyText=hist.supported?
  `<div class="vehicle-history-detail">${hist.recurrent?'⚠ דפוס חוזר: ':''}${esc(hist.text)}<br>במכשיר זה נאספו ${hist.observations} תצפיות; עצירות ממושכות ב-${hist.stationaryTrips} נסיעות; קפיצות GPS: ${hist.gpsJumps}. הסימון אינו אבחנה של תקלה.</div>`:
  '<div>אין היסטוריה מזוהה של הרכב במכשיר זה.</div>';
  const details=`<b>קו ${esc(state.line)} — ${v.directionVerified?'כיוון אומת':'כיוון לא אומת'}</b><div>${v.clockType==='source-report'?'זמן דיווח SIRI':'זמן מדידת GPS'}: ${esc(new Date(v.observed_at).toLocaleString('he-IL'))}</div><div>גיל דיווח: ${esc(C.ageText(age))}</div>${v.clockType==='source-report'?'<div>זמן GPS עצמאי אינו מסופק; ייתכן שהמיקום ישן מהדיווח.</div>':''}<div>רכב: ${esc(v.vehicle_ref||'לא ידוע')}</div><div>זמן הגעה של הרכב: ${v.eta&&v.directionVerified&&age<=90?esc(new Date(v.eta).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}))+' (דיווח SIRI)':'לא ניתן לשייך בביטחון'}</div><div>מקור: ${esc(v.source||'Open Bus (ארכיון מתעדכן)')}</div>${historyText}${v.vehicle_ref?'<button type="button" class="archive-link" data-vehicle-history="'+esc(v.vehicle_ref)+'" data-operator-ref="'+esc(v.operatorRef||state.route?.properties?.agencyId||'')+'">הצג שיוכי רכב בארכיון</button>':''}`;
  if(activeMarkers.has(id)){const m=activeMarkers.get(id);m.setLatLng([v.lat,v.lon]);m.setIcon(icon);m.setPopupContent(details);}else activeMarkers.set(id,L.marker([v.lat,v.lon],{icon}).addTo(state.vehicleLayer).bindPopup(details));}
  for(const [id,m] of activeMarkers)if(!visible.has(id)){state.vehicleLayer.removeLayer(m);activeMarkers.delete(id);}
  root.SafeBusExperience?.update(state,visible);
 }
 function deriveSiriRef(){
  // In Israeli GTFS the route_id is the SIRI LineRef. Never infer it from route_desc.
  const id=String(state.route?.properties?.routeId??'').trim();
  if(/^\d{1,12}$/.test(id))return id;
  return null;
 }
 async function getPositions(){
  // Built-in LIVE-WORK positions arrive with the normalized arrival response; archive history is on demand.
  if(builtInLive())return [];
  const ref=deriveSiriRef();if(!ref||!state.route)throw Error('לא זוהה מזהה נסיעה מתאים לדיווחי GPS');
  const coords=state.route.geometry.coordinates;let minLat=90,maxLat=-90,minLon=180,maxLon=-180;
  for(const [lon,lat] of coords){minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);}
  const now=Date.now(),q=new URLSearchParams({limit:'400',order_by:'recorded_at_time desc',recorded_at_time_from:new Date(now-70*60000).toISOString(),recorded_at_time_to:new Date(now+15000).toISOString(),siri_routes__line_ref:ref,lat__greater_or_equal:String(Math.max(29,minLat-.01)),lat__lower_or_equal:String(Math.min(34,maxLat+.01)),lon__greater_or_equal:String(Math.max(34,minLon-.01)),lon__lower_or_equal:String(Math.min(36,maxLon+.01))});
  const raw=await fetchJson(SOURCES.stride+'/siri_vehicle_locations/list?'+q,16000);const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:[];
  if(!Array.isArray(rows))throw Error('מבנה נתוני GPS לא מוכר');return C.uniqueVehicle(rows);
 }
 async function loadVehicles(revision){try{const fresh=await getPositions();if(revision!==state.request)return;for(const v of fresh){const old=state.vehicles.get(v.id);if(!old||Date.parse(v.observed_at)>=Date.parse(old.observed_at))state.vehicles.set(v.id,v);storeObservation(v);}state.gpsError=null;drawVehicles();}catch(e){if(revision!==state.request)return;state.gpsError=e.message;drawVehicles();}}
 async function refreshAll(){if(root.SafeBusNational?.state.ready)return;if(state.polling){state.refreshPending=true;return;}if(!state.route){updateHealth();return;}state.polling=true;$('refresh').disabled=true;const rev=state.request;try{await Promise.allSettled([loadArrivals(rev),loadVehicles(rev)]);if(rev!==state.request)return;
  if(state.routeError)setBanner(state.routeError,true);
  else if(state.arrivalsError&&state.gpsError)setBanner('שני מקורות הרשת אינם נגישים. בדוק אבחון בהגדרות.',true);
  else if(state.arrivalsError)setBanner('אין תחזיות נגישות כרגע. המיקום האחרון, אם קיים, מוצג לפי גילו.',true);
  else if(state.gpsError)setBanner([...state.vehicles.values()].some(v=>v.clockType==='source-report')?'דיווחי מיקום SIRI קיימים · אין אימות עצמאי לזמן ה־GPS · ארכיון Open Bus אינו זמין':'תחזיות התקבלו, אך GPS מארכיון Open Bus לא זמין: '+state.gpsError,true);
  else setBanner(state.route?'תוואי רשמי · תחזיות: '+state.sourceUsed+' · מיקום לפי זמן דיווח המקור; חותמת GPS עצמאית אינה זמינה':'אין תוואי מאומת לתחנה ולכיוון הנבחר.');
 }finally{updateHealth();state.polling=false;$('refresh').disabled=false;if(state.refreshPending){state.refreshPending=false;queueMicrotask(refreshAll);}}}
 async function applySelection(){const s=$('stop').value.trim(),l=$('line').value.trim();if(!/^\d{3,7}$/.test(s)||!D.allLines().includes(l)){state.request++;clearRoute();state.vehicleLayer?.clearLayers();activeMarkers.clear();state.arrivals=[];state.arrivalAt=0;state.allRoutes=[];drawArrivals();$('mapCaption').textContent='לא נבחר קו ותחנה תקינים';setBanner(!/^\d{3,7}$/.test(s)?'מספר תחנה לא תקין':'מספר הקו אינו מופיע בארכיון',true);return;}state.request++;state.stop=s;state.line=l;state.vehicles.clear();state.arrivals=[];state.arrivalAt=0;state.arrivalsError=null;state.gpsError=null;state.lastJump=null;state.vehicleLayer?.clearLayers();activeMarkers.clear();savePrefs();updateSuggestions();drawArrivals();showWarn('');const rev=state.request;await loadLocalRoute(rev,true);await refreshAll();}
 function setPanel(open){document.querySelector('.national-app').inert=open;$('panel').hidden=!open;$('shade').hidden=!open;$('settingsOpen').setAttribute('aria-expanded',String(open));root.SafeBusExperience?.panel(open);}
 async function diagnose(){
   if(root.SafeBusNational?.state.ready)return root.SafeBusNational.diagnose();
   updateHealth();
   const out=$('diagnostic');
   out.textContent=diagnosticText()+'\n\nבודק שרתי מידע…';
   const cases=builtInLive()?[['מתווך LIVE-WORK דרך שרת DEV',liveUrl('health')],['Open Bus (ארכיון)',SOURCES.stride+'/siri_routes/list?limit=1']]:[['משרד התחבורה',SOURCES.mot+'Stops/GetStopByCode?stopcode='+state.stop],
     ['curlbus',SOURCES.curlbus+state.stop],
     ['BusNearby',SOURCES.busnearby+'1:'+state.stop+'/stoptimes?numberOfDepartures=1&timeRange=1800&currentTime='+Math.floor(Date.now()/1000)],
     ['Open Bus (ארכיון)',SOURCES.stride+'/siri_routes/list?limit=1']];
   const results=await Promise.all(cases.map(async ([name,url])=>{
     try{const t=Date.now();await fetchJson(url,6500);return '✓ '+name+': נגיש ('+(Date.now()-t)+' אלפיות השנייה)';}
     catch(e){return '✕ '+name+': '+e.message;}
   }));
   out.textContent=diagnosticText()+'\n\nבדיקות רשת:\n'+results.join('\n')+
     (builtInLive()?'\n\nבדיקת המתווך מאשרת נגישות בלבד; תחזית מוצגת רק לאחר בדיקת קו, מפעיל, כיוון וחותמות המקור. זמן דיווח SIRI אינו זמן מדידת GPS עצמאי.':'\n\nאם כל שירותי התחזיות חסומים בדפדפן, יש צורך במתווך שרת. GitHub Pages אינו מתווך ואינו פותר חסימת CORS.');
 }
 function updateTrafficStatus(){
  const e=$('trafficStatus'),legend=$('trafficLegend'),button=$('trafficToggle');
  if(!e)return;
  let text=state.trafficStatusText||'אין מקור עומסים מורשה פעיל';
  if(state.trafficReport?.available){
    const r=state.trafficReport;
    text='עומסים: '+r.source+' · '+(r.etaAdjustment!==null?'תוספת נסיעה מדודה משוערת '+r.etaAdjustment+' דק׳':'אין די נתונים לשקלול זמן מדויק');
  }
  e.textContent=text;
  if(legend&&!root.SafeBusNational?.state.ready)legend.hidden=!state.trafficVisible||!state.trafficReport?.available;
  button?.setAttribute('aria-pressed',String(state.trafficVisible));
  if(button)button.textContent=state.trafficVisible?'🚦 הסתר עומסים':'🚦 הצג עומסים';
 }
 function applyTrafficSnapshot(snapshot){
  if(state.trafficVector){state.map?.removeLayer(state.trafficVector);state.trafficVector=null;}
  state.trafficReport=T?.normalize(snapshot,{routeId:state.route?.properties?.routeId,stopCode:state.stop})||null;
  if(state.trafficReport?.available&&state.map&&root.L?.geoJSON){
    state.trafficVector=L.geoJSON({type:'FeatureCollection',features:state.trafficReport.features},{style:T.layerStyle});
    if(state.trafficVisible)state.trafficVector.addTo(state.map);
  }
  if(!state.trafficReport?.available){state.trafficVisible=false;state.trafficStatusText=state.trafficReport?.reason||'אין מקור עומסים מורשה פעיל';}
  updateTrafficStatus();drawArrivals();
  return state.trafficReport;
 }
 function applyTraffic(){
  for(const layer of [state.trafficLayer,state.trafficVector])if(layer)state.map?.removeLayer(layer);
  state.trafficLayer=null;state.trafficVector=null;state.trafficReport=null;state.trafficVisible=false;
  state.trafficStatusText='אין מקור עומסים מורשה פעיל · זמני ההגעה אינם מוגדלים בגלל תנועה';
  updateTrafficStatus();
 }
 function expireTraffic(now=Date.now()){
  if(state.trafficReport?.available&&T?.expired(state.trafficReport,now)){
   if(state.trafficVector)state.map?.removeLayer(state.trafficVector);state.trafficVector=null;state.trafficReport=null;state.trafficVisible=false;
   state.trafficStatusText='נתוני העומס התיישנו; שכבת הכבישים הוסרה';updateTrafficStatus();
  }
 }
 function toggleTraffic(){
  expireTraffic();if(!state.trafficLayer&&!state.trafficVector){state.trafficVisible=false;state.trafficStatusText='אין מקור עומסים מורשה פעיל · אין תוספת תנועה לתחזית';updateTrafficStatus();return;}
  state.trafficVisible=!state.trafficVisible;
  for(const layer of [state.trafficLayer,state.trafficVector]){
    if(!layer)continue;
    if(state.trafficVisible)layer.addTo(state.map);else state.map.removeLayer(layer);
  }
  updateTrafficStatus();
 }

 const archiveState={revision:0,selection:null,data:null};
 function archiveDate(value){return new Date(value).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'});}
 function renderArchive(data){
  const output=$('archiveResults');output.replaceChildren();
  const routes=new Set([...data.rides,...data.observations].map(r=>r.routeId));
  const summary=document.createElement('p');
  summary.textContent=data.rides.length+' שיוכי נסיעות · '+routes.size+' מסלולים · '+data.observations.length+' דיווחי מיקום';
  output.append(summary);
  const clocks=document.createElement('small');clocks.textContent='חלון התצפיות: '+archiveDate(data.from)+' – '+archiveDate(data.to)+'';output.append(clocks);
  if(data.rides.length){
   const wrap=document.createElement('div');wrap.className='archive-table-wrap';
   const table=document.createElement('table');table.className='archive-table';
   const caption=document.createElement('caption');caption.textContent='שיוכי הרכב לנסיעות — לפי זמן התחלה מתוכנן';table.append(caption);
   const header=document.createElement('tr');
   for(const title of ['מזהה מסלול במקור','התחלה מתוכננת','מזהה רשומת נסיעה']){const th=document.createElement('th');th.scope='col';th.textContent=title;header.append(th);}table.append(header);
   for(const row of data.rides.slice(0,100)){
    const tr=document.createElement('tr');for(const value of [row.routeId,archiveDate(row.scheduledStartAt),row.rideId]){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
   }
   wrap.append(table);output.append(wrap);
  }
  if(data.observations.length){
   const note=document.createElement('p');note.textContent='דיווחי SIRI · GPS חסר';output.append(note);
  }
  const messages=[];
  if(data.observationStatus==='unavailable')messages.push('בקשת המיקומים לא הושלמה ('+(data.observationError||'המקור אינו זמין')+'). שיוכי הנסיעות מוצגים בנפרד.');
  if(data.partial)messages.push('תוצאה חלקית.');
  if(data.rideSelectionTruncated)messages.push('המקור הגביל את מספר שיוכי הנסיעות שנבחרו.');
  if(!data.rides.length&&!data.observations.length)messages.push('אין רשומות בחלון הזה.');
  $('archiveStatus').textContent=messages.join(' ')||'רשומות המקור נטענו.';
  $('archiveMore').hidden=data.nextOffset===null;
 }
 async function loadArchive(more=false){
  const vehicleRef=$('archiveVehicleRef').value.trim(),operatorRef=$('archiveOperatorRef').value.trim(),first=$('archiveFrom').value,last=$('archiveTo').value;
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(vehicleRef)||!/^\d{1,12}$/.test(operatorRef)){ $('archiveStatus').textContent='נדרש מזהה רכב ומזהה מפעיל תקינים.';return;}
  let selection={vehicleRef,operatorRef},offset=0;
  if(more&&archiveState.data&&archiveState.selection?.vehicleRef===vehicleRef&&archiveState.selection?.operatorRef===operatorRef){
   selection={...selection,from:archiveState.data.from,to:archiveState.data.to};offset=archiveState.data.nextOffset;
   if(offset===null)return;
  }else{
   more=false;
   if(!!first!==!!last){$('archiveStatus').textContent='בחר את שני תאריכי החלון, או השאר את שניהם ריקים.';return;}
   if(first&&last){
    const from=new Date(first+'T00:00:00'),to=new Date(last+'T00:00:00');
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||to-from>14*86400000||to>Date.now()){ $('archiveStatus').textContent='החלון צריך להיות בעבר, עד 14 ימים, עם סיום מאוחר מהתחלה.';return;}
    selection.from=from.toISOString();selection.to=to.toISOString();
   }
   archiveState.data=null;$('archiveResults').replaceChildren();
  }
  const revision=++archiveState.revision;archiveState.selection=selection;
  $('archiveLoad').disabled=true;$('archiveMore').disabled=true;$('archiveStatus').textContent='טוען ארכיון חיצוני לפי רכב ומפעיל…';
  try{
   const url=new URL('./api/live',root.location.href),q=url.searchParams;
   for(const [name,value] of Object.entries({kind:'history',...selection,days:14,limit:200,offset}))q.set(name,String(value));
   const raw=await fetchJson(url.href,33000);
   if(revision!==archiveState.revision)return;
   const page=root.SafeBusArchive.normalize(raw,selection,{offset});
   archiveState.data=root.SafeBusArchive.merge(more?archiveState.data:null,page);renderArchive(archiveState.data);
  }catch(e){
   if(revision!==archiveState.revision)return;
   $('archiveStatus').textContent='הארכיון אינו זמין כעת: '+e.message+'. אין להסיק היעדר נסיעות או תקלה ברכב.';
   if(!more)$('archiveMore').hidden=true;
  }finally{if(revision===archiveState.revision){$('archiveLoad').disabled=false;$('archiveMore').disabled=false;}}
 }
 function openVehicleArchive(ref,operator){
  $('archiveVehicleRef').value=String(ref);$('archiveOperatorRef').value=String(operator);
  $('archiveFrom').value='';$('archiveTo').value='';if($('archiveAdvanced'))$('archiveAdvanced').open=true;setPanel(true);$('vehicleArchiveSection').scrollIntoView({block:'start'});loadArchive();
 }

 function init(){initPrefs();setupMap();$('archiveLoad').onclick=()=>loadArchive();$('archiveMore').onclick=()=>loadArchive(true);for(const id of ['archiveVehicleRef','archiveOperatorRef','archiveFrom','archiveTo'])$(id).addEventListener('input',()=>{archiveState.revision++;archiveState.data=null;$('archiveMore').hidden=true;$('archiveLoad').disabled=false;$('archiveMore').disabled=false;});$('map').addEventListener('click',event=>{const button=event.target?.closest?.('[data-vehicle-history]');if(button)openVehicleArchive(button.dataset.vehicleHistory,button.dataset.operatorRef);});$('settingsOpen').onclick=()=>setPanel(true);$('settingsClose').onclick=()=>setPanel(false);$('shade').onclick=()=>setPanel(false);$('apply').onclick=applySelection;for(const id of ['line','stop'])$(id).addEventListener('keydown',event=>{if(event.key==='Enter')applySelection();});$('refresh').onclick=refreshAll;$('stop').addEventListener('input',()=>{clearTimeout(state.suggestTimer);state.suggestTimer=setTimeout(updateSuggestions,160);});$('diagnose').onclick=diagnose;$('healthStrip').onclick=()=>{setPanel(true);diagnose();};$('copyDiagnostic').onclick=async()=>{try{await navigator.clipboard.writeText($('diagnostic').textContent||diagnosticText());$('copyDiagnostic').textContent='✓ הועתק';}catch{$('diagnostic').textContent=diagnosticText()+'\nהדפדפן חסם העתקה אוטומטית';}};$('trafficApply').onclick=applyTraffic;$('trafficToggle').onclick=toggleTraffic;updateTrafficStatus();$('direction').onchange=()=>{const raw=$('direction').value;if(!/^\d+$/.test(raw))return;const k=Number(raw);if(Number.isInteger(k)&&state.allRoutes[k]){state.request++;state.vehicles.clear();state.arrivals=[];state.arrivalAt=0;state.arrivalsError=null;state.gpsError=null;state.vehicleLayer?.clearLayers();activeMarkers.clear();chooseRoute(k,true);drawArrivals();refreshAll();}};$('relayApply').onclick=()=>{const v=$('relayUrl').value.trim();if(v&&!isTrustedRelay(v)){setBanner('כתובת המתווך חייבת להיות HTTPS תקינה',true);return;}state.relayUrl=v;savePrefs();setBanner(v?'חיבור דרך המתווך הוגדר; בודק נתונים…':'המתווך האישי הוסר; בודק את חיבור ברירת המחדל.');refreshAll();};$('siriRef').onchange=()=>{state.siriRef=$('siriRef').value.trim();savePrefs();};$('showOld').onchange=()=>{savePrefs();drawVehicles();};
  const rev=++state.request;D.init().then(()=>{updateSuggestions();root.SafeBusNational?.init();}).catch(e=>{setBanner('לא ניתן לפתוח את מאגר המסלולים: '+e.message,true);root.SafeBusNational?.loadError()});setInterval(()=>{expireTraffic();drawArrivals();drawVehicles();if(state.arrivalAt&&Date.now()-state.arrivalAt>110000)showWarn('⚠ התחזיות ישנות; אל תסתמך על הדקות שמוצגות.');},15000);setInterval(()=>{if(!document.hidden)refreshAll();},45000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAll();});}
 function clearSelection(){state.request++;clearRoute();state.allRoutes=[];state.vehicles.clear();state.vehicleLayer?.clearLayers();activeMarkers.clear();state.arrivals=[];state.arrivalAt=0;state.arrivalsError=null;state.gpsError=null;state.routeError=null;}
 root.SafeBusApp={setPanel,clearSelection,state,getArrivals,getPositions,serviceDay,unwrap,esc,refreshAll,applySelection,init,healthSnapshot,diagnosticText,applyTrafficSnapshot,updateTrafficStatus,builtInLive,getLiveArrivals,openVehicleArchive,loadArchive,archiveState,expireTraffic,version:'DEV-9.3.7'};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);