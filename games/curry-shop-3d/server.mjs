import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startBridge} from './tikfinity-bridge.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),clients=new Set();
const actions=new Set(['incense','temple','tree','fruit','lamp','lantern','bell','grand']);
let id=0;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/events'&&req.method==='GET'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
 }
 if(url.pathname==='/api/bridge'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(bridge.status));return;}
 if(url.pathname==='/api/event'&&req.method==='POST'){
  if(!String(req.headers['content-type']).startsWith('application/json')){res.writeHead(415);res.end();return;}
  try{let raw='';for await(const c of req){raw+=c;if(raw.length>8192)throw Error('large');}const e=JSON.parse(raw);
   if(!actions.has(e.action)||!Number.isInteger(e.count)||e.count<1||e.count>100)throw Error('invalid');
   const event={id:++id,action:e.action,name:String(e.name||'ผู้ชม').slice(0,40),count:e.count};
   for(const client of clients)client.write('data: '+JSON.stringify(event)+'\n\n');
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,id}));
  }catch{res.writeHead(400);res.end('Invalid event');}return;
 }
 const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/game.js':'game.js','/vendor/three.module.js':'vendor/three.module.js'};
 if(req.method!=='GET'||!files[url.pathname]){res.writeHead(404);res.end();return;}
 const file=files[url.pathname],types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
 res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});fs.createReadStream(path.join(root,file)).pipe(res);
});
const bridge=startBridge({root,gameUrl:'http://127.0.0.1:8775',port:8776});
const heartbeat=setInterval(()=>{for(const c of clients)c.write(': heartbeat\n\n');},15000);
server.listen(8775,'127.0.0.1',()=>console.log('Crispy Pork 3D: http://127.0.0.1:8775'));
server.on('error',err=>{console.error(err.message);bridge.close();clearInterval(heartbeat);process.exitCode=1;});
