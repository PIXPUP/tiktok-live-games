import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../games/curry-shop-3d/game.js',import.meta.url),'utf8').split('/* CURRY POLL TRANSPORT START */')[1].split('/* CURRY POLL TRANSPORT END */')[0];
const create=vm.runInNewContext(source+';createCurryPoll;', {setTimeout,encodeURIComponent});
test('poll starts at latest event, retries cursor after failure, and does not replay gifts', async()=>{
 const requests=[],events=[],timers=[];
 const responses=[{ready:true,reset:true,epoch:'a',cursor:10,events:[]},new Error('offline'),{ready:true,reset:false,epoch:'a',cursor:11,events:[{id:11}]},{ready:true,reset:false,epoch:'a',cursor:11,events:[]}];
 const poll=create({fetchFn:async url=>{requests.push(url);const next=responses.shift();if(next instanceof Error)throw next;return {ok:true,json:async()=>next};},onEvent:e=>events.push(e),timer:f=>timers.push(f)});
 await poll.start();await timers.shift()();await timers.shift()();await timers.shift()();poll.stop();
 assert.equal(requests[0],'/api/poll');assert.equal(requests[1],requests[2]);assert.equal(events.length,1);assert.equal(events[0].id,11);assert.ok(requests[3].includes('after=11'));
});
