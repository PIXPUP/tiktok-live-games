import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8').split('/* CURSOR FEED START */')[1].split('/* CURSOR FEED END */')[0];
const create=vm.runInNewContext(source+'\ncreateCursorFeed;',{setTimeout,clearTimeout,AbortController});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('poll cursor suppresses duplicate gifts and retries the same cursor after failure',async()=>{
 const tasks=new Map(),deliveries=[],statuses=[],requests=[];let id=0;
 const payload=(cursor,events=[],reset=false,epoch='one')=>({ready:true,epoch,cursor,events,state:{score:cursor},reset});
 const responses=[payload(2,[],true),payload(3,[{seq:3,event:{name:'หมูเฮง'}}]),Error('network'),payload(3,[{seq:3,event:{name:'หมูเฮง'}}]),payload(0,[],true,'two')];
 const feed=create({fetchFn:async url=>{requests.push(url);const data=responses.shift();if(data instanceof Error)throw data;return {ok:true,json:async()=>data};},deliver:data=>deliveries.push(data),status:s=>statuses.push(s),timer:(fn,delay)=>{tasks.set(++id,{fn,delay});return id;},clearTimer:key=>tasks.delete(key)});
 await flush();
 for(let i=0;i<4;i++){const [key,next]=[...tasks].find(([,task])=>task.delay===1000);tasks.delete(key);await next.fn();}
 assert.equal(deliveries.flatMap(d=>d.events).length,1);assert.equal(deliveries[1].events[0].event.name,'หมูเฮง');
 assert.equal(requests[2],requests[3]);assert.ok(statuses.includes('disconnected'));assert.equal(deliveries.at(-1).reset,true);
 feed.close();assert.equal(tasks.size,0);
});
