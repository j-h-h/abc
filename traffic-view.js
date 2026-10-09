/* The official Waze embed is a separate map. No data scraping, API subscription or ETA correction. */
(function(){'use strict';
 const q=new URL(location.href).searchParams,read=k=>q.has(k)&&q.get(k).trim()!==''?Number(q.get(k)):NaN;
 const a=read('lat'),b=read('lon'),valid=Number.isFinite(a)&&Number.isFinite(b)&&a>=29&&a<=34&&b>=34&&b<=36;
 const lat=valid?a:31.733251,lon=valid?b:35.187968;
 const url=new URL('https://embed.waze.com/he/iframe');for(const [k,v]of Object.entries({lat,lon,zoom:14}))url.searchParams.set(k,v);
 const source=new URL('https://www.waze.com/he/live-map/');source.searchParams.set('lat',lat);source.searchParams.set('lon',lon);source.searchParams.set('zoom','14');
 document.getElementById('openTrafficSource').href=source.href;
 const google=new URL('https://www.google.com/maps/@');for(const [k,v]of Object.entries({api:1,map_action:'map',center:lat+','+lon,zoom:14,layer:'traffic'}))google.searchParams.set(k,v);
 document.getElementById('openGoogleTraffic').href=google.href;
 const frame=document.getElementById('trafficFrame'),status=document.getElementById('trafficLoadStatus');
 let timer=null;
 function load(){clearTimeout(timer);status.textContent='טוען את מפת התנועה…';frame.src=url.href;timer=setTimeout(()=>{status.textContent='אם המפה לא מוצגת, אפשר לפתוח אותה ישירות ב־Waze.';},12000);}
 frame.addEventListener('load',()=>{clearTimeout(timer);status.textContent='מפת תנועה של Waze · אפשר להזיז ולהגדיל';});
 frame.addEventListener('error',()=>{clearTimeout(timer);status.textContent='מפת התנועה לא נטענה. נסה רענון או פתיחה ב־Waze.';});
 document.getElementById('reloadTraffic').onclick=load;load();
})();
