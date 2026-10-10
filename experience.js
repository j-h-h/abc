/* A clear bus view. Reported locations are never animated or promoted to measured GPS. */
(function(root){'use strict';
 const $=id=>document.getElementById(id),C=root.SafeBusCore;
 let markerIds=[],lastState=null,focusBeforePanel=null;
 const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const busSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 10h14M8 19v2m8-2v2M9 6h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.5" cy="15" r="1" fill="currentColor"/><circle cx="15.5" cy="15" r="1" fill="currentColor"/></svg>';
 function marker(v,line,history,now=Date.now()){
  const age=C.gpsAge(v.observed_at,now),old=age>180;
  const bearing=typeof v.bearing==='number'&&Number.isFinite(v.bearing)&&v.bearing>=0&&v.bearing<360?v.bearing:null;
  const arrow=bearing===null?'':'<span class="bus-heading" style="transform:rotate('+bearing+'deg)" aria-hidden="true"></span>';
  return '<div class="bus-marker '+(old?'reported-old':'')+' '+(history?.recurrent?'recurrent':'')+'">'+arrow+'<span class="bus-face">'+busSvg+'</span><span class="bus-marker-label">'+(history?.recurrent?'⚠ ':'')+(line==='?'?'?':esc(line))+'<small>'+(old?'מיקום אחרון · ':'דיווח לפני ')+esc(C.ageText(age))+'</small></span></div>';
 }
 function trafficUrl(state){
  const p=state?.stopMarker?.getLatLng?.()||state?.map?.getCenter?.()||{lat:31.733251,lng:35.187968};
  const url=new URL('./traffic.html',root.location.href);
  if(C.validCoord(p.lat,p.lng)){url.searchParams.set('lat',p.lat.toFixed(6));url.searchParams.set('lon',p.lng.toFixed(6));}
  return url.href;
 }
 function vehicles(state){return markerIds.map(id=>state.vehicles.get(id)).filter(Boolean);}
 function focusVehicle(v){
  if(!lastState?.map)return;
  lastState.map.setView([v.lat,v.lon],16,{animate:false});
  for(const layer of lastState.vehicleLayer?.getLayers?.()||[]){const p=layer.getLatLng?.();if(p&&Math.abs(p.lat-v.lat)<.000001&&Math.abs(p.lng-v.lon)<.000001){layer.openPopup();break;}}
  $('map').scrollIntoView({block:'nearest'});
 }
 function focusBuses(){
  const list=lastState?vehicles(lastState):[];if(!list.length)return;
  const bounds=root.L.latLngBounds(list.map(v=>[v.lat,v.lon]));
  if(lastState.stopMarker)bounds.extend(lastState.stopMarker.getLatLng());
  lastState.map.fitBounds(bounds.pad(.2),{maxZoom:16,animate:false});$('map').scrollIntoView({block:'nearest'});
 }
 function update(state,ids){
  if(!$('fleetStatus'))return;lastState=state;if(ids)markerIds=[...ids];
  const list=vehicles(state),fresh=list.filter(v=>C.gpsAge(v.observed_at)<=180);
  $('fleetCount').textContent=list.length?list.length+' על המפה':'אין מיקום עדכני';
  $('focusBuses').disabled=!list.length;
  $('fleetStatus').textContent=list.length?(fresh.length?'כחול: דיווח חדש · אפור: מיקום אחרון. לחץ על רכב לפרטים.':'מוצגים מיקומים אחרונים באפור; אין אישור שהם עדיין שם.'):
   state.arrivalsError?'חיבור הנתונים אינו זמין כרגע. מתבצע ניסיון נוסף באופן אוטומטי.':state.polling?'מחפש דיווחי מיקום לקו שבחרת…':'לא התקבל מיקום עדכני לקו '+state.line+' בכיוון הזה. ייתכן שיש אוטובוסים שלא דווחו.';
  $('mapVehicleStatus').textContent=list.length?'🚌 '+list.length+' אוטובוסים מדווחים · לחץ על רכב לפרטים':state.polling?'מחפש אוטובוסים…':'אין כרגע מיקום עדכני לקו '+state.line;
  const output=$('fleetList');output.replaceChildren();
  for(const v of list){
   const card=document.createElement('button');card.type='button';card.className='fleet-card';
   const title=document.createElement('strong');title.textContent='🚌 קו '+state.line+' · רכב '+(v.vehicle_ref||'ללא מזהה');
   const detail=document.createElement('span');detail.textContent='דיווח לפני '+C.ageText(C.gpsAge(v.observed_at))+(C.gpsAge(v.observed_at)>180?' · מיקום אחרון':' · הצג על המפה');
   card.append(title,detail);card.onclick=()=>focusVehicle(v);output.append(card);
  }
  const traffic=trafficUrl(state);$('trafficPageLink').href=traffic;$('trafficToggle').onclick=()=>{root.location.href=traffic;};
  if(!root.SafeBusNational?.state.ready)$('trafficApply').onclick=()=>{root.location.href=traffic;};
  $('trafficToggle').textContent='🚦 מפת פקקים';$('trafficToggle').removeAttribute('aria-pressed');
  if(!state.trafficReport?.available)$('trafficStatus').textContent='פקקים זמינים במפת התנועה הנפרדת';
 }
 function panel(open){
  if(open){focusBeforePanel=document.activeElement;$('settingsClose').focus();root.SafeBusNational?.services();}else focusBeforePanel?.focus?.();
 }
 function init(){
  $('focusBuses').onclick=focusBuses;
  document.addEventListener('keydown',event=>{
   if($('panel').hidden)return;
   if(event.key==='Escape'){$('settingsClose').click();return;}
   if(event.key!=='Tab')return;
   const items=[...$('panel').querySelectorAll('button,input,select,a[href],summary')].filter(e=>!e.disabled&&e.getClientRects().length),first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  if(root.ResizeObserver){new ResizeObserver(()=>root.SafeBusApp?.state.map?.invalidateSize()).observe($('map'));}
  if('serviceWorker' in navigator&&root.location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
 }
 root.SafeBusExperience={marker,update,panel,trafficUrl,focusBuses,version:'DEV-9.3.0'};
 document.addEventListener('DOMContentLoaded',init);
})(window);
