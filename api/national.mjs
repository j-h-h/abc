import {createNationalProviders,validBBox} from '../backend/national/providers.mjs';
const providers=createNationalProviders();
const out=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
export async function GET(request){
 const q=new URL(request.url).searchParams,kind=q.get('kind'),allowed=kind==='station'?['kind','stopCode']:['kind','bbox'];
 if(!['station','area'].includes(kind)||[...q.keys()].some(k=>!allowed.includes(k)||q.getAll(k).length!==1))return out({error:'INVALID_REQUEST'},400);
 try{if(kind==='station'){const code=q.get('stopCode');if(!/^\d{3,7}$/.test(code||''))return out({error:'INVALID_STOP'},400);return out(await providers.station(code))}
  const text=q.get('bbox')||'';if(!/^[-\d.,]+$/.test(text))return out({error:'INVALID_BBOX'},400);const bbox=text.split(',').map(Number);if(!validBBox(bbox))return out({error:'ZOOM_IN_REQUIRED'},400);return out(await providers.area(bbox));
 }catch(e){console.error('DEV national source',e.message);return out({error:e.message},e.status||502)}
}
