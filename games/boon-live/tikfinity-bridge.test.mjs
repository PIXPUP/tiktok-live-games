import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GiftRouter,DEFAULT_BINDINGS,startBridge} from './tikfinity-bridge.mjs';

test('completed combos score once; equal later combos remain distinct',()=>{
 const router=new GiftRouter();
 const base={giftId:5655,giftName:'Rose',giftType:1,user:{userId:'42',nickname:'หมูเฮง'},groupId:'combo-one'};
 assert.equal(router.route({...base,repeatCount:1,repeatEnd:false}).kind,'pending');
 assert.equal(router.route({...base,repeatCount:7,repeatEnd:false}).kind,'pending');
 const final=router.route({...base,repeatCount:7,repeatEnd:true,msgId:'first'});
 assert.deepEqual(final.event,{action:'incense',name:'หมูเฮง',count:7});
 assert.equal(router.route({...base,repeatCount:7,repeatEnd:true,msgId:'second'}).kind,'duplicate');
 assert.equal(router.route({...base,groupId:'combo-two',repeatCount:7,repeatEnd:true}).kind,'mapped');
});
test('gift IDs, legacy payloads, modern nested payloads, unknowns and invalid counts',()=>{
 const bindings=DEFAULT_BINDINGS.map(b=>({...b,gift:b.action==='temple'?'123':b.gift}));
 const router=new GiftRouter(bindings);
 assert.equal(router.route({giftId:123,uniqueId:'sender',giftType:0,repeatEnd:false,repeatCount:1}).event.action,'temple');
 assert.equal(router.route({giftId:500,gift:{name:'Galaxy',type:0},user:{nickname:'คนใจดี'},repeatCount:1,common:{msgId:'abc'}}).event.action,'grand');
 assert.equal(router.route({giftId:500,giftName:'Galaxy',repeatCount:1,msgId:'abc'}).kind,'duplicate');
 assert.equal(router.route({giftId:999999,giftName:'Unknown',repeatCount:1}).kind,'unmapped');
 assert.equal(router.route({giftName:'Rose',repeatCount:-1}).kind,'invalid');
});
test('WebSocket gift to game HTTP, count chunking, status and saved mapping',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'boon-bridge-test-'));
 const received=[];
 const game=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end('{"ok":true}');});
 const mock=http.createServer();let wsSocket;
 mock.on('upgrade',(req,socket)=>{
  wsSocket=socket;
  const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
 });
 const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await listen(game);await listen(mock);
 const bridge=startBridge({root,port:0,gameUrl:`http://127.0.0.1:${game.address().port}`,wsUrl:`ws://127.0.0.1:${mock.address().port}`});
 const until=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out');};
 try{
  await until(()=>bridge.status.connection==='connected');
  const frame=data=>{
   const payload=Buffer.from(JSON.stringify(data));const header=Buffer.alloc(payload.length<126?2:4);header[0]=0x81;
   if(payload.length<126)header[1]=payload.length;else{header[1]=126;header.writeUInt16BE(payload.length,2);}wsSocket.write(Buffer.concat([header,payload]));
  };
  const event={event:'gift',data:{giftId:5655,giftName:'Rose',giftType:1,nickname:'ผู้ชมทดสอบ',groupId:'test-combo',repeatCount:205,repeatEnd:true}};
  frame({...event,data:{...event.data,repeatEnd:false}});frame(event);frame(event);
  await until(()=>bridge.status.forwardedEvents===3);
  assert.deepEqual(received.map(e=>e.count),[100,100,5]);assert.equal(received[0].name,'ผู้ชมทดสอบ');
  assert.equal(bridge.status.receivedGifts,1);
  const base=`http://127.0.0.1:${bridge.server.address().port}`;
  const status=await(await fetch(base+'/status')).json();assert.equal(status.forwardedEvents,3);
  const response=await fetch(base+'/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bindings:DEFAULT_BINDINGS.map(b=>({...b,gift:b.action==='incense'?'5655':b.gift}))})});
  assert.equal(response.status,200);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'gift-map.json'))).bindings[0].gift,'5655');
  const denied=await fetch(base+'/config',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.com'},body:'{}'});assert.equal(denied.status,403);
 }finally{
  bridge.close();wsSocket?.destroy();game.close();mock.close();
  // Only this test-created temporary directory is removed.
  fs.rmSync(root,{recursive:true,force:true});
 }
});
