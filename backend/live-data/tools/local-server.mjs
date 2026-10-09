import http from 'node:http';import {createService} from '../service.mjs';
const service=createService({config:process.env});
const server=http.createServer(async(req,res)=>{try{const r=await service.fetch(new Request('http://localhost:8787'+req.url,{method:req.method,headers:req.headers}),{ip:req.socket.remoteAddress});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text())}catch{res.writeHead(500);res.end('server error')}});
server.listen(8787,'127.0.0.1',()=>console.log('Live data backend: http://127.0.0.1:8787'));
