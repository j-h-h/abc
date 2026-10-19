import {createService} from '../service.mjs';
const service=createService({config:process.env});
export function requestFromVercel(req){
 const input=new URL(req.url,'https://relay.internal'),relayPath=input.searchParams.get('relayPath');
 if(relayPath){
  input.pathname=relayPath;
  input.searchParams.delete('relayPath');
  // Vercel injects named rewrite captures into the query string. They are adapter metadata,
  // not public endpoint parameters. Keep ordinary unknown client parameters for rejection.
  input.searchParams.delete('__relayTail');
  input.searchParams.delete('__relayStop');
 }
 const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
 return new Request(input,{method:req.method,headers});
}
export default async function handler(req,res){
 const request=requestFromVercel(req);
 const response=await service.fetch(request,{ip:String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()});
 res.statusCode=response.status;for(const [k,v] of response.headers)res.setHeader(k,v);res.end(await response.text());
}
