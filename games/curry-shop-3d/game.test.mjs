import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from './vendor/three.module.js';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const queueCode=source.split('// ORDER QUEUE START')[1].split('// ORDER QUEUE END')[0];
const {OrderQueue}=await import('data:text/javascript,'+encodeURIComponent(queueCode));
test('FIFO orders preserve quantities; matching waiting orders merge and previews stay separate',()=>{
 const q=new OrderQueue();q.enqueue({action:'incense',name:'มะลิ',count:3});q.enqueue({action:'tree',name:'ต้น',count:1});q.enqueue({action:'incense',name:'มะลิ',count:2});q.enqueue({action:'incense',name:'มะลิ',count:1},true);
 assert.equal(q.waiting,3);assert.equal(q.next().count,5);assert.equal(q.next().name,'มะลิ');assert.equal(q.finish().count,5);assert.equal(q.served,5);assert.equal(q.next().name,'ต้น');q.finish();assert.equal(q.next().preview,true);q.finish();assert.equal(q.waiting,0);assert.equal(q.served,7);
 assert.equal(q.enqueue({action:'unknown',count:1}),null);assert.equal(q.enqueue({action:'tree',count:-2}),null);
});
for(const isLite of [false,true]){
 test('3D customer cycle and performance profile '+(isLite?'lite':'normal'),async()=>{
 class Element{constructor(){this.textContent='';this.style={};this.firstChild={textContent:''};this.children=[];this.classList={add(){},toggle(){}};this.value='ลูกค้าทดสอบ';}append(x){this.children.push(x);}replaceChildren(...x){this.children=x;}remove(){this.removed=true;}getContext(){return {fillRect(){},fillText(){}};}}
 const elements=new Map();let tick,eventStream;
 globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement(){return new Element();},body:new Element(),addEventListener(){}};
 globalThis.window={};globalThis.devicePixelRatio=2;globalThis.innerWidth=450;globalThis.innerHeight=800;globalThis.location={search:isLite?'?lite=1':''};globalThis.addEventListener=()=>{};
 globalThis.requestAnimationFrame=f=>{tick=f;};globalThis.EventSource=class{constructor(){eventStream=this;}};
 globalThis.fetch=async()=>({json:async()=>({connection:'connected',forwardedEvents:0})});
 const realInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
 class Renderer{constructor(options){globalThis.lastRenderer=this;this.options=options;this.shadowMap={};this.info={render:{calls:0}};}setSize(){}setPixelRatio(value){this.pixelRatio=value;}setClearColor(){}render(scene,camera){scene.updateMatrixWorld();camera.updateMatrixWorld();this.info.render.calls++;}}
 globalThis.TestRenderer=Renderer;globalThis.TestThree=THREE;
 try{
  const code=source.replace("import * as THREE from './vendor/three.module.js';",'const THREE=globalThis.TestThree;').replace('new THREE.WebGLRenderer(','new globalThis.TestRenderer(');
  await import('data:text/javascript,'+encodeURIComponent('// profile '+isLite+'\n'+code));
  assert.equal(globalThis.lastRenderer.pixelRatio,isLite?1:2);assert.equal(globalThis.lastRenderer.shadowMap.enabled,!isLite);assert.equal(globalThis.lastRenderer.options.antialias,!isLite);assert.equal(elements.get('actions').children.length,8);
  eventStream.onmessage({data:JSON.stringify({action:'incense',name:'มะลิ',count:2})});eventStream.onmessage({data:JSON.stringify({action:'tree',name:'ต้น',count:1})});
  for(let frame=1;frame<1000;frame++){tick(frame*50);assert.equal(window.kitchenState().seated,0,'single-dish gifts, including count 2, must not sit');}
  const state=window.kitchenState();assert.equal(state.waiting,0);assert.equal(state.served,3);assert.equal(state.visibleCustomers,0);assert.equal(state.webgl,true);assert.equal(elements.get('leaders').children.length,2);
  // Test-button customers move and receive food without entering the real leaderboard.
  elements.get('actions').children[0].onclick();for(let f=1000;f<1500;f++)tick(f*50);assert.equal(window.kitchenState().served,4);assert.equal(elements.get('leaders').children.length,2);
  let clock=1500;assert.equal(window.kitchenState().tables,4);for(let menu=1;menu<8;menu++){elements.get('actions').children[menu].onclick();let sat=false;for(let i=0;i<650;i++){tick((clock++)*50);sat ||= window.kitchenState().seated>0;}assert.equal(sat,menu>=5,'only multi-dish menus may sit');assert.equal(window.kitchenState().menu,menu);assert.equal(window.kitchenState().waiting,0);assert.equal(window.kitchenState().visibleCustomers,0);assert.equal(window.kitchenState().seated,0,'seat must be free after dining');}
  assert.equal(window.kitchenState().served,11);
  const rendered=globalThis.lastRenderer.info.render.calls;for(let i=0;i<1000;i++)tick((clock+1)*50+i);const added=globalThis.lastRenderer.info.render.calls-rendered;assert.ok(isLite?added<=32:added>900,'lite render rate is limited to 30fps');
 }finally{globalThis.setInterval=realInterval;}
});

}
