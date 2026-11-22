import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('./portal.js',import.meta.url),'utf8');
function portal(status){const elements=new Map(),loads=[];function el(id){if(!elements.has(id)){const node={textContent:'',value:'',checked:true,hidden:true,open:false,children:[],setAttribute(){},getAttribute(){return '';},showModal(){this.open=true;},close(){this.open=false;},contentWindow:{postMessage(){}}};Object.defineProperty(node,'src',{set:v=>loads.push(String(v))});elements.set(id,node);}return elements.get(id);}
 const ctx={document:{getElementById:el},window:null,location:{origin:'https://test.invalid',assign(){}},URL,URLSearchParams,console,fetch:async()=>({ok:true,json:async()=>status}),clearInterval(){},setInterval(){return 1;},addEventListener(){},LiveGiftEditor:{select(game,callback){callback(null);}},LiveAuth:{authenticated:false}};ctx.window=ctx;vm.runInNewContext(code,ctx);return {ctx,elements,loads};}
const game={key:'bbq-live',title:'ร้านหมูกระทะ',labels:[]};
const pending=portal({active:false,status:'pending'});assert.equal(await pending.ctx.select(game),false);assert.equal(pending.loads.length,0);assert.equal(pending.elements.get('membership-prompt').open,true);assert.match(pending.elements.get('purchase-title').textContent,/หมูกระทะ/);
const active=portal({active:true,status:'approved'});assert.equal(await active.ctx.select(game),true);assert.equal(active.loads.length,1);assert.match(active.loads[0],/games\/bbq-live/);assert.equal(active.elements.get('membership-prompt'),undefined);
const unavailable=portal({active:false,status:'unavailable'});assert.equal(await unavailable.ctx.select(game),false);assert.equal(unavailable.loads.length,0);assert.equal(unavailable.elements.get('membership-prompt'),undefined);assert(unavailable.elements.get('game-access-message').textContent);
const race=portal({active:false,status:'pending'});let resolve;race.ctx.fetch=()=>new Promise(r=>resolve=r);const first=race.ctx.select(game);race.ctx.fetch=async()=>({ok:true,json:async()=>({active:false,status:'pending'})});await race.ctx.select({...game,title:'สวนผัก'});resolve({ok:true,json:async()=>({active:true})});assert.equal(await first,false);assert.equal(race.loads.length,0);assert.match(race.elements.get('purchase-title').textContent,/สวนผัก/);
console.log('Browse-first portal: purchase only on game selection, no unpaid iframe, outage handling and stale selection checks passed');

const trial=portal({active:true,status:'trial',expiresAt:Date.now()+86400000});assert.equal(await trial.ctx.select(game),true);assert.equal(trial.loads.length,1);assert.equal(trial.elements.get('trial-status').hidden,false);

// Catalog details are static DOM; expanding them never starts game frames.
const catalog=portal({active:true,status:'approved'});
function node(){return {children:[],dataset:{},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){}};}
catalog.ctx.document.createElement=node;
const library=catalog.ctx.document.getElementById('library');library.append=function(...items){this.children.push(...items);};library.replaceChildren=function(){this.children=[];};
catalog.ctx.fetch=async path=>({ok:true,json:async()=>path==='/games.json'?[{...game,labels:['A','B','C','D','E','F','G','H']}]:{active:true,status:'approved'}});
catalog.ctx.startPortal();await new Promise(resolve=>setImmediate(resolve));
assert.equal(library.children.length,1);const card=library.children[0];assert.equal(card.className,'card');
const body=card.children[1],details=body.children.find(n=>n.className==='game-details');assert.equal(details.children[2].children.length,8);assert.equal(catalog.loads.length,0);
await body.children.at(-1).onclick();assert.equal(catalog.loads.length,1);
