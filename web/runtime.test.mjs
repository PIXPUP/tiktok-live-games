import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('./game-runtime.js',import.meta.url),'utf8');
function make(search='',healthGame='boon-live',game='boon-live'){
 const listeners={},calls=[],reports=[],events=[];
 const w={location:{href:'https://pixpup-live-games.pages.dev/games/'+game+'/'+search,pathname:'/games/'+game+'/',search,origin:'https://pixpup-live-games.pages.dev'},history:{replaceState(){}},parent:{postMessage:x=>reports.push(x)},Response,URL,URLSearchParams,AbortSignal,CustomEvent:class{constructor(type,x){this.type=type;this.detail=x.detail;}},fetch:async(u)=>{calls.push(String(u));return new Response(JSON.stringify(String(u).endsWith('/health')?{ready:true,readOnly:true,game:healthGame,protocol:1}:{ready:true,events:[]}));},addEventListener:(type,fn)=>listeners[type]=fn,dispatchEvent:e=>events.push(e)};
 w.window=w;vm.runInNewContext(source,w);listeners.DOMContentLoaded();return {w,listeners,calls,reports,events};
}
const a=make();let r=await a.w.fetch('/api/poll');assert.equal((await r.json()).state.score,0);assert.equal(a.calls.length,0);
r=await a.w.fetch('/api/event',{method:'POST',body:JSON.stringify({action:'incense',preview:true,name:'demo'})});assert.equal(r.status,200);assert.equal(a.events[0].detail.preview,true);
r=await a.w.fetch('/api/event',{method:'POST',body:JSON.stringify({action:'incense',name:'fake-real'})});assert.equal(r.status,403);
for(const bad of ['http://x.trycloudflare.com','https://x.trycloudflare.com.evil.test','https://x.trycloudflare.com@evil.test','https://127.0.0.1','https://x.trycloudflare.com:8443'])assert.equal(a.w.PagesRuntime.validBackend(bad),false);
const b=make('?backend=https%3A%2F%2Fx.trycloudflare.com');await b.w.fetch('/api/poll?after=2&epoch=a');assert.deepEqual(b.calls,['https://x.trycloudflare.com/health','https://x.trycloudflare.com/api/poll?after=2&epoch=a']);
const c=make('?backend=https%3A%2F%2Fx.trycloudflare.com','ramwong-live');await assert.rejects(c.w.fetch('/api/poll'));assert.equal(c.calls.length,1);assert.equal(c.reports.at(-1).mode,'offline');
console.log('Pages runtime: offline demo, validation, live polling, wrong-game rejection, blocked real writes passed');

for(const game of ['bbq-live','garden-live']){const v=make('?backend=https%3A%2F%2Fx.trycloudflare.com','curry-shop-3d',game);assert.equal((await v.w.fetch('/api/poll')).status,200);const wrong=make('?backend=https%3A%2F%2Fx.trycloudflare.com','boon-live',game);await assert.rejects(wrong.w.fetch('/api/poll'));}
