import {createService} from '../service.mjs';
const service=createService({config:process.env});
export default async function handler(req,res){
 const input=new URL(req.url,'https://relay.internal'),relayPath=input.searchParams.get('relayPath');
 if(relayPath){input.pathname=relayPath;input.searchParams.delete('relayPath')}
 const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
 const request=new Request(input,{method:req.method,headers});
 const response=await service.fetch(request,{ip:String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()});
 res.statusCode=response.status;for(const [k,v] of response.headers)res.setHeader(k,v);res.end(await response.text());
}
