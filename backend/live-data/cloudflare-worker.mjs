import {createService} from './service.mjs';
let service,previousEnv;
export default {async fetch(request,env){if(!service||previousEnv!==env){service=createService({config:env});previousEnv=env}return service.fetch(request,{ip:request.headers.get('cf-connecting-ip')||'unknown'})}};
