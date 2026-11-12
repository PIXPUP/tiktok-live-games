// Node.js 22+, standard library only. Listens only on this computer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const DEFAULT_BINDINGS = [
 {action:'incense',gift:'Rose'}, {action:'temple',gift:'Finger Heart'},
 {action:'tree',gift:'Rosa'}, {action:'fruit',gift:'Perfume'},
 {action:'lamp',gift:'Doughnut'}, {action:'lantern',gift:'Paper Crane'},
 {action:'bell',gift:'Hand Heart'}, {action:'grand',gift:'Galaxy'}
];
const ACTIONS = new Set(DEFAULT_BINDINGS.map(b=>b.action));
const key = value=>String(value??'').normalize('NFKC').trim().toLowerCase();

export function validateBindings(bindings){
 if(!Array.isArray(bindings)||bindings.length!==8)throw Error('ต้องตั้งค่ากิจกรรมให้ครบ 8 แบบ');
 const actions=new Set(),gifts=new Set();
 return bindings.map(b=>{
  if(!b||!ACTIONS.has(b.action)||actions.has(b.action))throw Error('รหัสกิจกรรมไม่ถูกต้องหรือซ้ำกัน');
  const gift=String(b.gift??'').trim();
  if(!gift||gift.length>100||gifts.has(key(gift)))throw Error('ชื่อหรือ ID ของขวัญว่าง ยาวเกินไป หรือซ้ำกัน');
  actions.add(b.action);gifts.add(key(gift));return {action:b.action,gift};
 });
}

export class GiftRouter{
 constructor(bindings=DEFAULT_BINDINGS){this.bindings=validateBindings(bindings);this.seen=new Map();}
 route(data){
  if(!data||typeof data!=='object')return {kind:'invalid'};
  const giftId=String(data.giftId??data.gift?.id??data.giftDetails?.id??'');
  const giftName=String(data.giftName??data.giftDetails?.giftName??data.giftDetails?.name??data.gift?.name??data.extendedGiftInfo?.name??'');
  const user=data.user??{};
  const name=String(data.nickname??user.nickname??data.uniqueId??user.uniqueId??'ผู้ชม TikTok').slice(0,40);
  const userId=String(data.userId??user.userId??data.uniqueId??user.uniqueId??name);
  const giftType=Number(data.giftType??data.gift?.type??data.gift?.gift_type??data.giftDetails?.type??0);
  const repeatEnd=data.repeatEnd===true||data.repeatEnd===1||data.repeatEnd==='true';
  const count=Number(data.repeatCount??1);
  if(!Number.isInteger(count)||count<1||count>10000||(!giftId&&!giftName))return {kind:'invalid'};
  const gift={giftId,giftName,name,count};
  if(giftType===1&&!repeatEnd)return {kind:'pending',gift};
  const binding=this.bindings.find(b=>key(b.gift)===key(giftId)||key(b.gift)===key(giftName));
  if(!binding)return {kind:'unmapped',gift};
  const group=String(data.groupId??'');
  const msgId=String(data.msgId??data.common?.msgId??'');
  const dedup=giftType===1&&group&&group!=='0'?`combo:${userId}:${giftId||giftName}:${group}`:
   msgId?`msg:${msgId}`:group&&group!=='0'?`group:${userId}:${giftId||giftName}:${group}`:null;
  const now=Date.now();
  for(const [id,time] of this.seen){if(now-time>7200000)this.seen.delete(id);else break;}
  if(dedup&&this.seen.has(dedup))return {kind:'duplicate',gift};
  if(dedup){this.seen.set(dedup,now);if(this.seen.size>10000)this.seen.delete(this.seen.keys().next().value);}
  return {kind:'mapped',gift,event:{action:binding.action,name,count}};
 }
}

export function startBridge(options={}){
 const root=options.root??path.dirname(fileURLToPath(import.meta.url));
 const configPath=path.join(root,'gift-map.json');
 let bindings=DEFAULT_BINDINGS;
 try{bindings=validateBindings(JSON.parse(fs.readFileSync(configPath,'utf8')).bindings);}catch(error){if(error.code!=='ENOENT')console.error('Gift map:',error.message);}
 const router=new GiftRouter(bindings);
 const gameUrl=options.gameUrl??'http://127.0.0.1:8795';
 const wsUrl=options.wsUrl??'ws://127.0.0.1:21213/';
 const port=options.port??8796;
 const status={connection:'connecting',receivedGifts:0,forwardedEvents:0,unmappedGifts:0,lastGiftAt:null,lastForwardedAt:null,lastError:null,gifts:[],queue:0};
 let socket,retryTimer,connectTimer,closed=false,draining=false;
 const pending=[];
 function recordGift(gift,kind){
  const id=gift.giftId||gift.giftName;
  const item={...gift,kind,at:new Date().toISOString()};
  status.gifts=[item,...status.gifts.filter(g=>(g.giftId||g.giftName)!==id)].slice(0,12);
 }
 async function drain(){
  if(draining)return;draining=true;
  try{
   while(pending.length&&!closed){
    const event=pending.shift();status.queue=pending.length;
    // Never automatically retry an uncertain HTTP delivery: it may already have scored.
    try{
     const response=await fetch(`${gameUrl}/api/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(5000)});
     if(!response.ok)throw Error(`HTTP ${response.status}`);
     await response.json();status.forwardedEvents++;status.lastForwardedAt=new Date().toISOString();status.lastError=null;
    }catch(error){status.lastError=`ส่งเข้าเกมไม่สำเร็จ (${error.message}) ไม่ส่งซ้ำอัตโนมัติเพื่อป้องกันคะแนนซ้ำ`;console.error(status.lastError);}
   }
  }finally{draining=false;}
 }
 function receive(raw){
  try{
   const envelope=JSON.parse(String(raw));if(envelope.event!=='gift')return;
   const result=router.route(envelope.data);
   if(!result.gift)return;
   status.lastGiftAt=new Date().toISOString();recordGift(result.gift,result.kind);
   if(result.kind==='pending'||result.kind==='duplicate')return;
   status.receivedGifts++;
   if(result.kind==='unmapped'){status.unmappedGifts++;return;}
   const chunks=Math.ceil(result.event.count/100);
   if(pending.length+chunks>500){status.lastError='คิวกิจกรรมเต็ม กิจกรรมล่าสุดยังไม่ถูกส่งเข้าเกม';return;}
   for(let remaining=result.event.count;remaining>0;remaining-=100)pending.push({...result.event,count:Math.min(remaining,100)});
   status.queue=pending.length;void drain();
  }catch(error){status.lastError=`อ่าน event ไม่สำเร็จ: ${error.message}`;}
 }
 function connect(){
  if(closed)return;clearTimeout(retryTimer);clearTimeout(connectTimer);status.connection='connecting';
  const current=new WebSocket(wsUrl);socket=current;
  const retry=()=>{
   if(closed||socket!==current)return;status.connection='disconnected';clearTimeout(connectTimer);clearTimeout(retryTimer);
   retryTimer=setTimeout(()=>{if(closed||socket!==current)return;try{current.close();}catch(error){}connect();},4000);
  };
  connectTimer=setTimeout(retry,8000);
  current.addEventListener('open',()=>{if(closed||socket!==current){current.close();return;}clearTimeout(connectTimer);clearTimeout(retryTimer);status.connection='connected';console.log('TikFinity Event API connected');});
  current.addEventListener('message',e=>{if(!closed&&socket===current)receive(e.data);});
  current.addEventListener('error',retry);
  current.addEventListener('close',retry);
 }
 const origins=new Set(['http://127.0.0.1:8795','http://localhost:8795']);
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const host=(req.headers.host??'').split(':')[0];
  if((origin&&!origins.has(origin))||!['127.0.0.1','localhost'].includes(host)){res.writeHead(403);res.end();return;}
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Vary']='Origin';}
  const reply=(code,payload)=>{res.writeHead(code,headers);res.end(JSON.stringify(payload));};
  if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  if(req.url==='/status'&&req.method==='GET'){reply(200,{...status,bindings:router.bindings,wsUrl});return;}
  if(req.url==='/config'&&req.method==='POST'){
   if(!String(req.headers['content-type']).startsWith('application/json')){reply(415,{error:'Expected JSON'});return;}
   try{
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384){reply(413,{error:'Body too large'});return;}}
    const next=validateBindings(JSON.parse(body).bindings);
    fs.writeFileSync(configPath+'.tmp',JSON.stringify({bindings:next},null,2));fs.renameSync(configPath+'.tmp',configPath);
    router.bindings=next;reply(200,{ok:true,bindings:next});
   }catch(error){reply(400,{error:error.message});}return;
  }
  reply(404,{error:'Not found'});
 });
 server.on('error',error=>{console.error('Bridge:',error.message);closed=true;clearTimeout(retryTimer);clearTimeout(connectTimer);socket?.close();});
 server.listen(port,'127.0.0.1',()=>{console.log(`Game bridge status: http://127.0.0.1:${server.address().port}/status`);connect();});
 return {server,status,receive,close(){closed=true;clearTimeout(retryTimer);clearTimeout(connectTimer);socket?.close();server.close();}};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)startBridge();
