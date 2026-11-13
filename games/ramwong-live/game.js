'use strict';
const lowPower=new URLSearchParams(location.search).get('lite')==='1';
if(lowPower)document.documentElement?.classList?.add('lite');
const $ = id => document.getElementById(id);
const giftCatalog=[{"id": "5655", "name": "Rose", "coins": 1}, {"id": "5487", "name": "Finger Heart", "coins": 5}, {"id": "8913", "name": "Rosa", "coins": 10}, {"id": "5658", "name": "Perfume", "coins": 20}, {"id": "5879", "name": "Doughnut", "coins": 30}, {"id": "5659", "name": "Paper Crane", "coins": 99}, {"id": "6968", "name": "Hand Heart", "coins": 100}, {"id": "5660", "name": "Hand Heart", "coins": 100}, {"id": "11046", "name": "Galaxy", "coins": 1000}];
const defaultGiftBindings=[{action:'incense',gift:'Rose'},{action:'temple',gift:'Finger Heart'},{action:'tree',gift:'Rosa'},{action:'fruit',gift:'Perfume'},{action:'lamp',gift:'Doughnut'},{action:'lantern',gift:'Paper Crane'},{action:'bell',gift:'Hand Heart'},{action:'grand',gift:'Galaxy'}];
let displayedGiftBindings='';
const offerings = [{"action": "incense", "label": "รำวงพื้นฐาน", "short": "รำวง", "icon": "💃", "points": 1}, {"action": "temple", "label": "โยกซ้ายขวา", "short": "โยกซ้ายขวา", "icon": "🕺", "points": 5}, {"action": "tree", "label": "หมุนตัว", "short": "หมุนตัว", "icon": "🌀", "points": 10}, {"action": "fruit", "label": "ตบมือ", "short": "ตบมือ", "icon": "👏", "points": 20}, {"action": "lamp", "label": "เต้นสามช่า", "short": "สามช่า", "icon": "🥁", "points": 30}, {"action": "lantern", "label": "เดินรำรอบวง", "short": "รอบวง", "icon": "🎶", "points": 99}, {"action": "bell", "label": "รำคู่", "short": "รำคู่", "icon": "👫", "points": 100}, {"action": "grand", "label": "เปิดฟลอร์ใหญ่", "short": "เปิดฟลอร์", "icon": "🎉", "points": 1000}];
const byAction=offerings.reduce((map,o)=>{map[o.action]=o;return map;},{});
const colors=['#6756a8','#af4a6d','#36978e','#c38a30','#5473a9','#789746'];
const overlay=Boolean(window.__LIVE_OVERLAY__)||/(?:[?&])overlay(?:=|&|$)/i.test(location.search);
if(overlay)document.body.classList.add('overlay');
let latestState={score:0,actions:0,players:{},recent:[]};
let knownCeremony=null,ceremonyTimer=null,demoTimer=null,avatarId=0;
const liveAvatars=new Map();
let backgroundMusic=null,chantPlayer=null;
function colorFor(name){let hash=0;for(const c of name)hash=(hash*31+c.codePointAt(0))|0;return colors[Math.abs(hash)%colors.length];}
function initialBadge(name){const s=document.createElement('span');s.className='name-initial';s.style.setProperty('--avatar-color',colorFor(name));s.textContent=Array.from(name)[0]||'✦';return s;}
function fitStage(){
 const full=overlay||Boolean(document.fullscreenElement);
 const width=full?innerWidth:Math.min(450,innerWidth-(innerWidth<=790?32:48));
 const scale=full?Math.min(innerWidth/450,innerHeight/800):width/450;
 const shell=$('game-shell');shell.style.width=`${450*scale}px`;shell.style.height=`${800*scale}px`;
 $('stage').style.transform=`scale(${scale})`;
 $('stage').style.left=full?`${(innerWidth-450*scale)/2}px`:'0';
 $('stage').style.top=full?`${(innerHeight-800*scale)/2}px`:'0';
 if(overlay){shell.style.width='100vw';shell.style.height='100vh';}
}
addEventListener('resize',fitStage);document.addEventListener('fullscreenchange',fitStage);fitStage();
const thaiGiftNames={'Rose':'กุหลาบ','Finger Heart':'มินิฮาร์ต','Rosa':'โรซ่า','Perfume':'น้ำหอม','Doughnut':'โดนัท','Paper Crane':'นกกระเรียน','Hand Heart':'หัวใจมือ','Galaxy':'กาแล็กซี'};
function giftName(o){return o.giftArt?.name||o.giftKey||'ของขวัญ';}
function readableGiftName(o){return thaiGiftNames[giftName(o)]||giftName(o);}
function giftVisual(o,extra=''){
 const el=document.createElement('span');el.className=`gift-image ${o.giftArt?'gift-'+o.giftArt.id:'gift-unknown'} ${extra}`;
 el.setAttribute('role','img');el.setAttribute('aria-label',giftName(o));if(!o.giftArt)el.textContent='🎁';return el;
}
function buildGiftButtons(){
 $('offering-grid').replaceChildren();$('offering-grid-right').replaceChildren();$('studio-offerings').replaceChildren();
 offerings.forEach((o,i)=>{
  const tile=document.createElement('button');tile.className='offering-tile';tile.title=`${giftName(o)}${o.giftArt?' '+o.giftArt.coins+' เหรียญ':''} → ${o.label} +${o.points} แต้ม (ปุ่ม ${i+1})`;tile.setAttribute('aria-label',tile.title);
  const key=document.createElement('span');key.className='key';key.textContent=i+1;
  const name=document.createElement('span');name.className='gift-title';name.textContent=readableGiftName(o);
  const action=document.createElement('b');action.textContent=o.short;
  const coins=document.createElement('small');coins.textContent=o.giftArt?`${o.giftArt.coins.toLocaleString()} เหรียญ`:'ยังไม่ทราบเหรียญ';
  tile.append(key,giftVisual(o,'offering-icon'),name,action,coins);tile.onclick=()=>send(o.action);$(i<4?'offering-grid':'offering-grid-right').append(tile);
  const button=document.createElement('button');button.className='studio-offering';button.title=tile.title;
  const copy=document.createElement('div');const label=document.createElement('b');label.textContent=o.label;
  const detail=document.createElement('small');detail.textContent=`${giftName(o)}${o.giftArt?' · '+o.giftArt.coins.toLocaleString()+' เหรียญ':''}`;
  const shortcut=document.createElement('kbd');shortcut.textContent=i+1;copy.append(label,detail);button.append(giftVisual(o),copy,shortcut);
  button.onclick=()=>send(o.action);$('studio-offerings').append(button);
 });
}
function applyGiftBindings(bindings){
 const signature=JSON.stringify(bindings);if(signature===displayedGiftBindings)return;displayedGiftBindings=signature;
 for(const o of offerings){
  o.giftKey=String(bindings.find(b=>b.action===o.action)?.gift||'');
  const normalized=o.giftKey.normalize('NFKC').trim().toLowerCase();
  o.giftArt=giftCatalog.find(g=>g.id===normalized||g.name.toLowerCase()===normalized)||null;
 }
 buildGiftButtons();
 for(const [index,row] of [...$('gift-map').children].entries()){
  const o=offerings[index];if(!o)continue;const text=document.createElement('span');text.textContent=o.label;
  row.firstElementChild.replaceChildren(giftVisual(o),text);
 }
}
applyGiftBindings(defaultGiftBindings);
for(let i=0;i<24;i++){const p=document.createElement('i');p.className='particle';p.style.cssText=`left:${10+Math.random()*80}%;top:${25+Math.random()*60}%;--duration:${5+Math.random()*7}s;--delay:-${Math.random()*10}s`;$('particles').append(p);}
function leaderboardRows(target,limit,ceremony=false){
 const entries=Object.entries(latestState.players).sort((a,b)=>b[1]-a[1]).slice(0,limit);
 target.replaceChildren(...entries.map(([name,points],i)=>{
  const row=document.createElement(ceremony?'div':'li');if(ceremony)row.className='ceremony-person';
  if(!ceremony){const rank=document.createElement('span');rank.className='rank';rank.textContent=i+1;row.append(rank);}
  row.append(initialBadge(name));const text=document.createElement('span');text.className='player-name';text.textContent=name;row.append(text);
  const value=document.createElement('b');value.className='points';value.textContent=points.toLocaleString();row.append(value);return row;
 }));
 if(!entries.length){const p=document.createElement(ceremony?'div':'li');p.className='empty';p.textContent=ceremony?'ขอบคุณทุกน้ำใจที่ร่วมสร้างแสงสว่าง':'รอผู้ร่วมสนุกคนแรก';target.append(p);}
}
let lastRenderedKey=null;
function render(state){
 const key=JSON.stringify([state.score,state.actions,state.recent]);
 latestState=state;
 if(key===lastRenderedKey&&knownCeremony!==null)return;
 lastRenderedKey=key;$('score').textContent=state.score.toLocaleString();
 const completed=Math.floor(state.actions/100),progress=state.actions%100;
 $('ceremony-progress').textContent=`${progress} / 100`;$('progress').style.width=`${progress}%`;
 $('actions').textContent=`${state.actions.toLocaleString()} ครั้ง`;leaderboardRows($('leaders'),3);
 $('feed').replaceChildren(...state.recent.slice(0,5).map(e=>{
  const o=byAction[e.action];const p=document.createElement('p');const icon=giftVisual(o,'feed-icon');
  const text=document.createElement('span');text.textContent=`${e.name} · ${o.label}${e.count>1?' ×'+e.count:''}`;
  const points=document.createElement('small');points.textContent=`+${e.points.toLocaleString()}`;p.append(icon,text,points);return p;
 }));
 if(knownCeremony!==null&&completed>knownCeremony)showCeremony(completed);knownCeremony=completed;
}
/* CARPET PLACEMENT START */
function carpetPlacement(slot){
 const count=lowPower?4:6,angle=-Math.PI/2+slot*Math.PI*2/count;
 const row=Math.floor(slot/2),lane=Math.cos(angle)>=0?1:-1;
 return {row,lane,targetX:50+Math.cos(angle)*18,targetY:73+Math.sin(angle)*10,startX:50+lane*48,startY:105,exitX:50+lane*48,exitY:105};
}
/* CARPET PLACEMENT END */
// Every pilgrim is a transparent character sprite with a real event name.
/* CHARACTER SELECTION START */
function characterForViewer(name){
 const key=String(name||'ผู้ร่วมสนุก').normalize('NFC').trim().toLowerCase();
 let hash=2166136261;
 for(const letter of key)hash=Math.imul(hash^letter.codePointAt(0),16777619)>>>0;
 return hash%4;
}
/* CHARACTER SELECTION END */
/* AVATAR PRIORITY START */
function avatarAdmission(entries,incomingDemo,limit){
 if(entries.length<limit)return {allowed:true};
 const demo=entries.find(entry=>entry[1].demo);
 if(demo)return {allowed:true,victim:demo[0]};
 if(incomingDemo)return {allowed:false};
 return {allowed:true,victim:entries[0][0]};
}
/* AVATAR PRIORITY END */
let lastRealGiftAt=-Infinity;
function addPilgrim(e,{preview=false,partner=0}={}){

 const demo=preview||e.preview===true,admission=avatarAdmission([...liveAvatars],demo,lowPower?4:6);if(!admission.allowed)return;if(admission.victim!==undefined)removePilgrim(admission.victim);
 $('idle-invite').style.opacity='0';
 const occupied=new Set([...liveAvatars.values()].map(entry=>entry.slot));
 const slot=Array.from({length:6},(_,i)=>i).find(i=>!occupied.has(i));
 const id=++avatarId,person=document.createElement('div');person.className=`pilgrim walking character-${(characterForViewer(e.name)+partner)%4}`;const human=document.createElement('div');human.className='human';human.setAttribute('aria-hidden','true');person.append(human);
 const bow=document.createElement('div');bow.className='bow-animation';bow.setAttribute('aria-hidden','true');
 for(const pose of ['stand','kneel','reach','prostrate']){const frame=document.createElement('i');frame.className=`bow-frame pose-${pose}`;bow.append(frame);}person.append(bow);
 const badge=document.createElement('div');badge.className='avatar-name';badge.title=e.name;badge.append(initialBadge(e.name));const text=document.createElement('span');text.className='name-text';text.textContent=e.name;badge.append(text);const nameplate=document.createElement('div');nameplate.className='pilgrim-label '+(demo?'demo-person':'real-person');nameplate.append(badge);
 const offering=document.createElement('span');offering.className='avatar-offering';offering.textContent=byAction[e.action].icon;person.append(offering);
 const {lane,row,targetX,targetY,startX,startY,exitX,exitY}=carpetPlacement(slot);person.style.left=`${startX}%`;person.style.top=`${startY}%`;person.style.transform='translate(-50%,-100%) scale(1.05)';person.style.zIndex='100';if(preview){person.classList.remove('walking');person.style.left=`${targetX}%`;person.style.top=`${targetY}%`;person.style.transform='translate(-50%,-100%) scale(.95)';}nameplate.style.cssText=person.style.cssText;nameplate.style.zIndex='1';$('avatars').append(person);$('nameplates').append(nameplate);
 const timers=[],bowStart=preview?300:1800,departure=bowStart+(e.action==='grand'?18000:14000);liveAvatars.set(id,{person,nameplate,timers,slot,demo});
 timers.push(setTimeout(()=>{if(!person.isConnected)return;person.style.left=`${targetX}%`;person.style.top=`${targetY}%`;person.style.transform='translate(-50%,-100%) scale(.95)';person.style.zIndex=String(50+row);nameplate.style.cssText=person.style.cssText;nameplate.style.zIndex='1';},80));
 timers.push(setTimeout(()=>{person.classList.remove('walking');person.classList.add('bowing');person.classList.add('dancing','dance-'+e.action);if(e.action==='lantern'&&!lowPower){person.classList.add('orbiting');nameplate.classList.add('orbiting');}},bowStart));
 timers.push(setTimeout(()=>{person.classList.remove('bowing','dancing','orbiting');nameplate.classList.remove('orbiting');person.classList.add('departing');person.style.left=`${exitX}%`;person.style.top=`${exitY}%`;nameplate.classList.add('departing');nameplate.style.cssText=person.style.cssText;nameplate.style.zIndex='1';},departure));
 timers.push(setTimeout(()=>removePilgrim(id),departure+2200));
}
function removePilgrim(id){const entry=liveAvatars.get(id);if(!entry)return;entry.timers.forEach(clearTimeout);entry.person.remove();entry.nameplate.remove();liveAvatars.delete(id);if(!liveAvatars.size)$('idle-invite').style.opacity='1';}
function effectNode(className,left,top,text,duration=5500){const el=document.createElement('div');el.className=className;el.style.left=`${left}%`;el.style.top=`${top}%`;if(text)el.textContent=text;$('effects').append(el);setTimeout(()=>el.remove(),duration);return el;}
const sceneEffectTimers=new Map();
function sceneEffect(name,duration){
 clearTimeout(sceneEffectTimers.get(name));$('world').classList.remove(name);void $('world').offsetWidth;$('world').classList.add(name);
 sceneEffectTimers.set(name,setTimeout(()=>{$('world').classList.remove(name);sceneEffectTimers.delete(name);},duration));
}
function offeringEffect(e){
 const o=byAction[e.action];
 document.querySelectorAll('.ritual-card').forEach(el=>el.remove());
 const card=effectNode(`ritual-card ritual-${e.action}`,57,55,'',4200);
 const object=document.createElement('span');object.className='ritual-object';object.textContent=o.icon;
 const label=document.createElement('b');label.textContent=o.label;
 const caption=document.createElement('small');caption.textContent=`${giftName(o)} จาก ${e.name}${e.count>1?' ×'+e.count:''}`;
 card.append(object,label,caption);
 if(lowPower){if(e.action==='grand'){card.remove();showCeremony(0,true);}return;}
 if(e.action==='incense')for(let i=0;i<5;i++)setTimeout(()=>effectNode('petal',48+Math.random()*10,45,'',2500),i*140);
 if(e.action==='temple')for(let i=0;i<5;i++)setTimeout(()=>effectNode('merit-spark',46+Math.random()*22,52,'✦',2300),i*150);
 if(e.action==='tree')for(let i=0;i<5;i++)setTimeout(()=>effectNode('effect-symbol',45+Math.random()*18,50,'🍎',3300),i*180);
 if(e.action==='fruit')for(let i=0;i<4;i++)setTimeout(()=>effectNode('healing-heart',43+Math.random()*25,59,'♥',2600),i*220);
 if(e.action==='lamp')sceneEffect('lamp-glow',4500);
 if(e.action==='lantern')for(let i=0;i<6;i++)setTimeout(()=>effectNode('merit-spark',43+Math.random()*24,57,'✦',2800),i*200);
 if(e.action==='bell')sceneEffect('restoring',4500);
 if(e.action==='grand'){card.remove();showCeremony(0,true);sceneEffect('kathin-blessing',8500);}
}
function animateEvent(e){
 const demo=e.preview===true;if(!demo)lastRealGiftAt=Date.now();const spotlight=!demo||Date.now()-lastRealGiftAt>6000;
 const o=byAction[e.action];if(spotlight)$('toast').textContent=`${demo?'เดโม · ':''}${e.name} · ${giftName(o)} → ${o.label}${e.count>1?' ×'+e.count:''}  +${e.points.toLocaleString()}`;
 const dancers=e.action==='bell'?2:e.action==='grand'?(lowPower?2:4):Math.min(e.count,lowPower?1:4);
 for(let i=0;i<dancers;i++)setTimeout(()=>addPilgrim(e,{partner:i}),i*300);
 if(spotlight)offeringEffect(e);
 if(!demo)blessingVoice.enqueue(e);
}
function showCeremony(number,special=false,preview=false){
 clearTimeout(ceremonyTimer);$('ceremony-title').textContent=preview?'ตัวอย่างเปิดฟลอร์':special?'เปิดฟลอร์':`เปิดฟลอร์ ครั้งที่ ${number}`;
 $('ceremony-banner').classList.toggle('kathin-ceremony',special);
 const ornament=$('ceremony-banner').querySelector('.banner-ornament');
 if(special)ornament.replaceChildren(giftVisual(byAction.grand));else ornament.textContent='✦';
 $('ceremony-banner').querySelector('.ceremony-eyebrow').textContent=special?'RAMWONG PARTY · TOGETHER IN KINDNESS':'LET US DANCE TOGETHER';
 leaderboardRows($('ceremony-leaders'),3,true);$('ceremony-banner').hidden=false;$('world').classList.add('celebrating');
 for(let i=0;i<18;i++)setTimeout(()=>{const el=effectNode('effect-lantern',8+Math.random()*84,67+Math.random()*27);el.style.setProperty('--flight',`${4+Math.random()*2}s`);},i*140);
 ceremonyTimer=setTimeout(()=>{$('ceremony-banner').hidden=true;$('world').classList.remove('celebrating');},8500);
}
/* CURSOR FEED START */
function createCursorFeed({fetchFn,deliver,status,timer=setTimeout,clearTimer=clearTimeout,Abort=AbortController,pollInterval=1000}){
 let closed=false,epoch=null,cursor=0,scheduled=null,request=null;
 async function poll(){
  if(closed)return;let timeout=null;
  try{
   request=new Abort();timeout=timer(()=>request?.abort(),8000);
   const query=epoch?`?after=${cursor}&epoch=${encodeURIComponent(epoch)}`:'';
   const response=await fetchFn('/api/poll'+query,{cache:'no-store',signal:request.signal});
   if(!response.ok)throw Error('Feed unavailable');const data=await response.json();
   if(closed)return;
   if(!data.ready||typeof data.epoch!=='string'||!Number.isInteger(data.cursor)||data.cursor<0||!data.state||!Array.isArray(data.events))throw Error('Invalid feed');
   const reset=data.reset||epoch!==data.epoch;
   const events=reset?[]:data.events.filter(item=>Number.isInteger(item.seq)&&item.seq>cursor&&item.seq<=data.cursor);
   deliver({state:data.state,events,reset});epoch=data.epoch;cursor=data.cursor;status('connected');
  }catch(error){if(!closed)status('disconnected');}
  finally{clearTimer(timeout);request=null;if(!closed)scheduled=timer(poll,pollInterval);}
 }
 void poll();
 return {close(){closed=true;clearTimer(scheduled);request?.abort();}};
}
/* CURSOR FEED END */
function applyGameMessage(data){try{render(data.state);if(data.event)animateEvent(data.event);}catch(error){console.error('Event could not be rendered',error);$('error').textContent='ข้อมูลกิจกรรมไม่สมบูรณ์ กรุณารีเฟรชหน้าจอ';}}
const pollingMode=new URLSearchParams(location.search).get('transport')==='poll'||location.hostname.endsWith('.trycloudflare.com');
let stream;
if(pollingMode){
 stream=createCursorFeed({fetchFn:fetch,pollInterval:lowPower?1500:1000,deliver(data){if(data.reset)knownCeremony=null;render(data.state);for(const item of data.events)animateEvent(item.event);},status(value){$('connection').textContent=value==='connected'?'● จอเกมพร้อม':'○ กำลังเชื่อมต่อใหม่';}});
}else{
 stream=new EventSource('/api/events');stream.onopen=()=>{$('connection').textContent='● จอเกมพร้อม';};stream.onerror=()=>{$('connection').textContent='○ กำลังเชื่อมต่อใหม่';};
 stream.onmessage=msg=>{try{applyGameMessage(JSON.parse(msg.data));}catch(error){console.error(error);}};
}
async function send(action,name,preview=false){try{const response=await fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,name:name||$('name').value,count:1,...(preview?{preview:true}:{})})});if(!response.ok)throw Error(`HTTP ${response.status}`);$('error').textContent='';}catch(err){$('error').textContent='ส่งกิจกรรมไม่สำเร็จ กรุณาตรวจว่าเซิร์ฟเวอร์เปิดอยู่ แล้วลองอีกครั้ง';}}
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;const o=offerings[Number(e.key)-1];if(o)send(o.action);});
$('demo').onclick=()=>{if(demoTimer){clearInterval(demoTimer);demoTimer=null;$('demo').textContent='▷ เริ่มเดโมผู้ชม';return;}const names=['แสงดาว','ใจดี','สายบุญ','น้องฟ้า','ต้นกล้า','มะลิ','ปันปัน'];const next=()=>send(offerings[Math.floor(Math.random()*7)].action,names[Math.floor(Math.random()*names.length)],true);next();demoTimer=setInterval(next,5000);$('demo').textContent='◼ หยุดเดโมผู้ชม';};
$('preview-bow').onclick=()=>addPilgrim({name:'ตัวอย่างท่ากราบ',action:'temple',count:1},{preview:true});
$('preview-ceremony').onclick=()=>showCeremony(1,false,true);
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('game-shell').requestFullscreen().catch(()=>$('error').textContent='เปิดลิงก์หน้าจอ OBS เพื่อดูเกมเต็มหน้าได้ค่ะ');};
addEventListener('pagehide',()=>{if(demoTimer)clearInterval(demoTimer);stream.close();});

// Only the studio polls bridge status; OBS displays the game without extra controls.
const BRIDGE='http://127.0.0.1:8806';
let bridgePoll=null,mappingLoaded=false,observedSignature='',pollingBridge=false;
function buildGiftMap(bindings){
 $('gift-map').replaceChildren(...offerings.map(o=>{
  const row=document.createElement('label');row.className='gift-map-row';
  const label=document.createElement('span');label.append(giftVisual(o));const text=document.createElement('span');text.textContent=o.label;label.append(text);
  const input=document.createElement('input');input.dataset.action=o.action;input.maxLength=100;input.placeholder='ชื่อหรือ ID ของขวัญ';input.setAttribute('aria-label',`ของขวัญสำหรับ${o.label}`);input.value=bindings.find(b=>b.action===o.action)?.gift||'';
  row.append(label,input);return row;
 }));mappingLoaded=true;
}
async function pollBridge(){
 if(pollingBridge)return;pollingBridge=true;
 try{
  const response=await fetch(`${BRIDGE}/status`,{signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error('Bridge unavailable');const status=await response.json();applyGiftBindings(status.bindings);
  $('bridge-card').classList.toggle('bridge-connected',status.connection==='connected');
  $('bridge-title').textContent=status.connection==='connected'?'เชื่อมต่อ TikFinity Event API แล้ว':'ตัวเชื่อมพร้อม · รอ TikFinity Desktop';
  $('bridge-detail').textContent=status.lastError||`รับของขวัญ ${status.receivedGifts} รายการ · ส่งเข้าเกม ${status.forwardedEvents} ครั้ง${status.connection==='connected'&&!status.lastGiftAt?' · รอ event จากไลฟ์':''}`;
  if(!mappingLoaded)buildGiftMap(status.bindings);$('save-gifts').disabled=false;
  const signature=JSON.stringify(status.gifts);
  if(signature!==observedSignature){
   observedSignature=signature;
   $('observed-gifts').replaceChildren(...status.gifts.slice(0,8).map(g=>{
    const row=document.createElement('p');
    const title=document.createElement('b');title.textContent=g.giftName||'ของขวัญ';
    const detail=document.createElement('span');detail.textContent=`ID ${g.giftId||'ไม่ระบุ'} · ×${g.count} · ${{mapped:'จับคู่แล้ว',unmapped:'ยังไม่จับคู่',pending:'กำลังส่งคอมโบ',duplicate:'ข้าม event ซ้ำ'}[g.kind]||g.kind}`;
    if(g.kind==='unmapped')row.className='unmapped-gift';row.append(title,detail);return row;
   }));
   if(!status.gifts.length){const p=document.createElement('p');p.textContent='ยังไม่มี event ของขวัญ';$('observed-gifts').append(p);}
  }
 }catch(error){
  $('bridge-card').classList.remove('bridge-connected');$('bridge-title').textContent='ตัวเชื่อม TikFinity ยังไม่เปิด';$('bridge-detail').textContent='เปิดเกมรำวงจาก Game Desk เพื่อเปิดตัวเชื่อม TikFinity';$('save-gifts').disabled=true;
 }finally{pollingBridge=false;}
}
$('save-gifts').onclick=async()=>{
 $('save-gifts').disabled=true;
 try{
  const bindings=[...$('gift-map').querySelectorAll('input')].map(input=>({action:input.dataset.action,gift:input.value.trim()}));
  const response=await fetch(`${BRIDGE}/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bindings}),signal:AbortSignal.timeout(5000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'บันทึกไม่สำเร็จ');
  applyGiftBindings(result.bindings);$('bridge-message').textContent='บันทึกแล้ว ของขวัญครั้งต่อไปจะใช้การจับคู่นี้';
 }catch(error){$('bridge-message').textContent=error.message;}
 finally{$('save-gifts').disabled=false;}
};
if(!overlay||['127.0.0.1','localhost'].includes(location.hostname)){void pollBridge();bridgePoll=setInterval(pollBridge,3000);}
addEventListener('pagehide',()=>{if(bridgePoll)clearInterval(bridgePoll);});

/* BLESSING VOICE ENGINE START */
function createBlessingSpeaker({synth,Utterance,onStatus=()=>{},getGiftInvitations=()=>[],timer=setTimeout,clearTimer=clearTimeout}){
 const wishes={
  incense:'ขอให้วันนี้อิ่มใจ และพบเจอสิ่งดีดี',
  temple:'ขอให้มีความสุขกายสบายใจ และมีคนดีอยู่เคียงข้าง',
  tree:'ขอให้ชีวิตอบอุ่น มีความร่มเย็นในทุกวัน',
  fruit:'ขอให้สุขภาพแข็งแรง มีกำลังใจที่สดใส',
  lamp:'ขอให้พบทางที่ดี และมีแสงสว่างในใจเสมอ',
  lantern:'ขอให้มีสติและปัญญา พบคำตอบที่ดีในทุกเรื่อง',
  bell:'ขอให้สิ่งที่ตั้งใจ ค่อยค่อยสำเร็จอย่างราบรื่น',
  grand:'ขอให้ครอบครัวมีความสุข อยู่เย็นเป็นสุข และมีน้ำใจที่งดงาม'
 };
 const ceremonyWishes=[
  'ขอให้มีสุขภาพแข็งแรง จิตใจแจ่มใส และครอบครัวอยู่เย็นเป็นสุข',
  'ขอให้ร่างกายแข็งแรง มีกำลังกายกำลังใจที่ดี และพบเจอแต่สิ่งดีงาม',
  'ขอให้ทุกวันมีรอยยิ้ม มีความสุขกายสบายใจ และสุขภาพแข็งแรง',
  'ขอให้ท่านและครอบครัวมีสุขภาพแข็งแรง มีความร่มเย็น และความอบอุ่นใจ'
 ];
 const danceWelcome="ยินดีต้อนรับสู่ลานรำวง มาสนุกกับเพลงสามช่าไปด้วยกัน ขอบคุณทุกท่านที่ส่งของขวัญมาร่วมเต้น ฝากกดติดตามแล้วมาเจอกันอีกนะคะ";
 const ambientLines=[
  'ขอต้อนรับทุกท่าน ทุกท่านที่เพิ่งเข้ามา เชิญทางนี้ก่อน{soft} มาพักใจ ฟังเพลงสามช่า แล้วอยู่เป็นเพื่อนกัน ขอให้ทุกท่านมีความสุขกาย สบายใจ{end}',
  'เอ้า ทุกท่านท่านใดเพิ่งมาถึง ยินดีต้อนรับ เชิญนั่งตามสบาย{soft} วันนี้เรามาพบกันในบรรยากาศงานบุญ ยิ้มให้กัน ส่งความปรารถนาดีให้กัน อบอุ่นใจไปด้วยกัน{end}',
  'ทุกท่านที่ชอบบรรยากาศแบบนี้ ฝากกดติดตามไว้สักนิด{soft} วันหน้าจะได้กลับมาพบกันอีก มานั่งฟังเพลงสามช่า พักใจด้วยกัน{end}',
  'ขอส่งความปรารถนาดีไปถึงทุกท่านทุกท่าน{soft} ขอให้มีสุขภาพแข็งแรง กินอิ่ม นอนหลับ มีแรงกายแรงใจ และครอบครัวอยู่เย็นเป็นสุข{end}',
  'ขอบคุณสำหรับน้ำใจของทุกท่านที่อยู่เป็นเพื่อนกัน{soft} ทุกท่านที่มาทีหลังไม่ต้องรีบร้อน เชิญชมบรรยากาศตามสบาย ยินดีต้อนรับทุกท่าน{end}',
  'เอ้า ท่านใดอยากกลับมาพบกันอีก ฝากกดติดตามช่องไว้{soft} จะได้ไม่คลาดกัน ขอให้วันนี้เป็นวันที่ร่มเย็น มีแต่เรื่องสบายใจ{end}',
  'ทุกท่านเหนื่อยจากงาน จากการเดินทาง ก็มาพักตรงนี้สักครู่{soft} วางเรื่องหนักใจลงก่อน หายใจสบายสบาย ขอให้ใจค่อยค่อยเบิกบาน{end}',
  'ขอให้ทุกท่านทุกท่านกลับไปทำหน้าที่ของตัวเองด้วยใจที่เข้มแข็ง{soft} มีสติ มีรอยยิ้ม และมีคนดีดีอยู่เคียงข้าง ขอบคุณในทุกน้ำใจ{end}',
  'ขอต้อนรับทุกท่านทั้งท่านเก่าและท่านใหม่{soft} อยู่ใกล้อยู่ไกลก็มาพบกันได้ ฝากกดติดตามไว้ แล้วกลับมานั่งพักใจในลานรำวงด้วยกันอีก{end}'
 ];
 let enabled=false,voice=null,volume=.8,rate=.9,readName=true,style='ceremony',ending='ครับ',blessingIndex=0,active=null,activeItem=null,scheduled=null,watchdog=null,generation=0;
 let ambientLoop=false,ambientGap=20,ambientTimer=null,ambientIndex=0,invitationIndex=0,ambientMode="mixed";
 const queue=[];
 const supported=Boolean(synth&&Utterance);
 const cleanName=value=>String(value??'').replace(/https?:\/\/\S+|www\.\S+/giu,'').replace(/[^\p{L}\p{M}\p{N}\s._-]/gu,' ').trim().slice(0,30)||'ผู้ร่วมสนุก';
 function report(message){onStatus({enabled,supported,queued:queue.length,speaking:Boolean(active),ambientLoop,ambientGap,ambientMode,message});}
 function stop(){generation++;clearTimer(scheduled);clearTimer(watchdog);clearTimer(ambientTimer);scheduled=null;watchdog=null;ambientTimer=null;ambientLoop=false;queue.length=0;active=null;activeItem=null;if(supported)synth.cancel();report(enabled?'เปิดเสียงอยู่ · ไม่มีคิวค้าง':'ปิดเสียงอยู่');}
 function scheduleAmbient(){
  clearTimer(ambientTimer);ambientTimer=null;
  if(!enabled||!ambientLoop||active||queue.length)return;
  ambientTimer=timer(()=>{ambientTimer=null;if(enabled&&ambientLoop&&!active&&!queue.length){queue.push({ambient:true});drain();}},ambientGap*1000);
 }
 function interruptAmbient(){
  if(!activeItem?.ambient)return;
  generation++;clearTimer(watchdog);clearTimer(scheduled);watchdog=null;scheduled=null;active=null;activeItem=null;synth.cancel();
 }
 function sentence(item){
  if(item.ambient&&ambientMode==='ramwong')return danceWelcome;
  if(item.ambient){const soft=ending==='ค่ะ'?'นะคะ':ending==='ครับ'?'นะครับ':'';const invite=item.invitation||ambientMode==='cheer'||(ambientMode==='mixed'&&ambientIndex%3===2);let text;
   if(invite){const lines=getGiftInvitations();const fallback='ขอเรียนเชิญทุกท่านที่สะดวกร่วมกิจกรรมตามรายการของขวัญได้เลย{soft} ขอขอบคุณทุกท่านที่มาร่วมบรรยากาศอบอุ่นด้วยกัน{end}';text=lines.length?lines[invitationIndex++%lines.length]:fallback;}else text=ambientLines[ambientIndex%ambientLines.length];ambientIndex++;return text.replaceAll('{soft}',soft).replaceAll('{end}',ending);}

  if(item.combined)return `ขอขอบคุณผู้ร่วมสนุกทุกท่าน ขอบคุณสำหรับทุกน้ำใจ ขอให้ทุกท่านมีสุขภาพแข็งแรง มีความสุข และครอบครัวอยู่เย็นเป็นสุข${ending}`;
  const address=readName?'คุณ'+cleanName(item.name):'ผู้ร่วมสนุก';
  const quantity=item.count>1?' จำนวน '+item.count+' ครั้ง':'';
  if(style==='brief'||queue.length>=3)return `ขอบคุณ${address} ที่ร่วม${item.label}${quantity} ${wishes[item.action]||'ขอให้มีความสุขและเบิกบานใจ'}${ending}`;
  const index=blessingIndex++;
  const opening=['ขอขอบคุณ','ขอบคุณน้ำใจของ','ขอต้อนรับน้ำใจจาก'][index%3];
  const wish=ceremonyWishes[Math.floor(index/3)%ceremonyWishes.length];
  const signoff=['ขอบคุณที่มาร่วมสนุกด้วยกัน','ขอบคุณสำหรับน้ำใจที่งดงาม'][index%2];
  const soft=ending==='ค่ะ'?'นะคะ':ending==='ครับ'?'นะครับ':'';
  return `เอ้า ${opening}${address} ที่มาร่วม${item.label}${quantity}${soft}, ${wish}, ${signoff}${ending}`;
 }
 function drain(){
  scheduled=null;if(!enabled||active)return;if(!queue.length){scheduleAmbient();return;}
  const item=queue.shift(),token=generation;
  const utterance=new Utterance(sentence(item));utterance.lang='th-TH';utterance.voice=voice;utterance.volume=volume;utterance.rate=rate;utterance.pitch=style==='ceremony'?0.94:1;
  active=utterance;activeItem=item;
  const finish=message=>{if(token!==generation||active!==utterance)return;clearTimer(watchdog);watchdog=null;active=null;activeItem=null;report(message);scheduled=timer(drain,300);};
  utterance.onstart=()=>report(item.ambient?'กำลังกล่าวต้อนรับและทักทายสร้างบรรยากาศ':'กำลังทักทาย'+(readName&&!item.combined?'คุณ'+cleanName(item.name):'ผู้ร่วมสนุก'));
  utterance.onend=()=>finish('เปิดเสียงอยู่ · ทักทายเรียบร้อย');
  utterance.onerror=event=>{if(token!==generation||active!==utterance)return;if(event.error==='not-allowed'){enabled=false;stop();report('เบราว์เซอร์ยังไม่อนุญาตเสียง กรุณากดเปิดเสียงอีกครั้ง');}else finish('เสียงไม่พร้อม ('+(event.error||'unknown')+') ลองกดทดลองฟัง');};
  watchdog=timer(()=>{if(token!==generation||active!==utterance)return;synth.cancel();finish('เสียงใช้เวลานานเกินไป ข้ามไปคิวถัดไป');},item.ambient&&ambientMode==='ramwong'?120000:40000);
  try{synth.resume();synth.speak(utterance);report('กำลังเตรียมเสียงทักทาย');}catch(error){finish('ไม่สามารถเล่นเสียงได้ กรุณาทดลองฟังอีกครั้ง');}
 }
 function enqueue(event,{immediate=false}={}){
  if(!enabled||!supported)return;
  clearTimer(ambientTimer);ambientTimer=null;interruptAmbient();
  for(let index=queue.length-1;index>=0;index--)if(queue[index].ambient)queue.splice(index,1);
  const item={name:cleanName(event.name),action:event.action,label:event.label||'ส่งน้ำใจ',count:Number(event.count)||1};
  const existing=queue.find(q=>!q.combined&&q.name===item.name&&q.action===item.action);
  if(existing)existing.count+=item.count;
  else if(queue.length>=12){const last=queue[queue.length-1];last.combined=true;}
  else queue.push(item);
  report('เปิดเสียงอยู่ · รอทักทาย '+queue.length+' คิว');
  if(!active&&!scheduled){if(immediate)drain();else scheduled=timer(drain,650);}
 }
 return {
  supported,
  configure(settings){if(['mixed','cheer','welcome','ramwong'].includes(settings.ambientMode))ambientMode=settings.ambientMode;voice=settings.voice??voice;if(settings.volume!==undefined)volume=Math.max(0,Math.min(1,Number(settings.volume)));if(settings.rate!==undefined)rate=Math.max(.7,Math.min(1.2,Number(settings.rate)));if(settings.readName!==undefined)readName=Boolean(settings.readName);if(['ceremony','brief'].includes(settings.style))style=settings.style;if(['ครับ','ค่ะ',''].includes(settings.ending))ending=settings.ending;if(settings.ambientGap!==undefined){const gap=Math.max(5,Math.min(120,Number(settings.ambientGap)||20));if(gap!==ambientGap){ambientGap=gap;scheduleAmbient();}}},
  enable(){if(!supported){report('เบราว์เซอร์นี้ไม่มีระบบเสียงสังเคราะห์');return false;}enabled=true;report('เปิดเสียงอยู่ · รอของขวัญ');return true;},
  disable(){enabled=false;stop();},stop,
  enqueue(event){enqueue(event);},
  preview(name){enqueue({name,action:'incense',label:'ถวายดอกไม้',count:1},{immediate:true});},
  previewInvitation(){if(!enabled||!supported)return false;queue.push({ambient:true,invitation:true});if(!active&&!scheduled)drain();return true;},
  startAmbient(){if(!enabled||!supported)return false;ambientLoop=true;clearTimer(ambientTimer);ambientTimer=null;if(!active&&!queue.length){clearTimer(scheduled);scheduled=null;queue.push({ambient:true});drain();}report('เปิดพูดวนแล้ว · ของขวัญมาก่อนเสมอ');return true;},
  stopAmbient(){ambientLoop=false;clearTimer(ambientTimer);ambientTimer=null;interruptAmbient();if(queue.length&&!active)scheduled=timer(drain,300);report('ปิดพูดวน · ยังขอบคุณผู้ส่งของขวัญตามปกติ');},
  getState(){return {enabled,queued:queue.length,speaking:Boolean(active),ambientLoop,ambientGap,ambientMode};}
 };
}
/* BLESSING VOICE ENGINE END */
const voiceChannel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('ramwong-live-host-voice'):null;
const voiceTabId=String(Date.now())+Math.random();
const blessingVoice=createBlessingSpeaker({
 synth:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,
 getGiftInvitations(){const known=offerings.filter(o=>o.giftArt);return known.map((o,i)=>{
  const gift=readableGiftName(o),action=o.label;
  return [
   `เอ้า ทุกท่าน เชิญทางนี้ก่อน{soft} ท่านที่สะดวกอยากร่วมกิจกรรม${action} เชิญส่ง${gift}ได้เลย ค่อยค่อยมากันตามสะดวก ขอขอบคุณทุกน้ำใจที่มาร่วมกันในวันนี้{end}`,
   `ขอเรียนเชิญทุกท่านทุกท่าน{soft} ตอนนี้เปิดรับของขวัญ${gift} สำหรับกิจกรรม${action} ท่านใดสะดวกก็เชิญได้เลย ขอบคุณสำหรับน้ำใจของทุกท่าน{end}`,
   `ทุกท่านที่เพิ่งมาถึง ยินดีต้อนรับ{soft} เชิญนั่งตามสบาย ท่านที่อยากร่วมกิจกรรม${action} เลือกส่ง${gift}ได้เลย ขอบคุณที่มาอยู่เป็นเพื่อนกัน{end}`,
   `เอ้า ท่านใดสนใจกิจกรรม${action} เชิญร่วมผ่าน${gift}ตามสะดวก{soft} ทุกท่านที่อยู่ด้วยกัน ฝากกดติดตามไว้ด้วย วันหน้าจะได้กลับมาพบกันอีก{end}`,
   `ทุกท่านทางบ้าน ขอส่งเสียงทักทายกันหน่อย{soft} ท่านที่สะดวกเชิญร่วมกิจกรรม${action}ด้วย${gift}ได้เลย เรามานั่งฟังเพลงสามช่า ส่งความปรารถนาดีให้กัน ขอบคุณในทุกน้ำใจ{end}`,
   `ขอเรียนเชิญทุกท่านที่สนใจ${action}{soft} ของขวัญ${gift}ร่วมกิจกรรมนี้ได้ ท่านไหนพร้อมก็เชิญตามสะดวก ขอให้บรรยากาศวันนี้เต็มไปด้วยรอยยิ้มและความสบายใจ{end}`,
   `เอ้า ทุกท่านทั้งท่านเก่าท่านใหม่ ยินดีต้อนรับ{soft} ท่านใดอยากร่วมกิจกรรม${action} เชิญส่ง${gift}ได้เลย ขอบคุณทุกท่านที่แวะมาให้กำลังใจและอยู่เป็นเพื่อนกัน{end}`,
   `ขอเรียนเชิญร่วมกิจกรรม${action}ผ่าน${gift}{soft} อยู่ใกล้อยู่ไกลก็มาพบกันได้ ขอขอบคุณทุกน้ำใจ ขอให้ทุกท่านสบายกายสบายใจ แล้วแวะกลับมาเยี่ยมกันอีก{end}`
  ][i%8];});},
 onStatus(state){
  backgroundMusic?.duck(state.speaking);chantPlayer?.duck(state.speaking);
  voiceChannel?.postMessage({type:'voice-state',speaking:state.speaking});
  $('voice-toggle').textContent=state.enabled?'ปิดเสียงทักทาย':'เปิดเสียงทักทาย';$('voice-toggle').setAttribute('aria-pressed',String(state.enabled));
  $('voice-overlay-toggle').textContent=state.enabled?'🔊 เสียงทักทายเปิดอยู่':'🔇 เปิดเสียงทักทาย';$('voice-overlay-toggle').setAttribute('aria-pressed',String(state.enabled));
  $('voice-status').textContent=state.message+(state.speaking&&state.queued?' · รอ '+state.queued+' คิว':'');
  $('ambient-toggle').textContent=state.ambientLoop?'■ ปิดพูดวนสร้างบรรยากาศ':'🔁 เปิดพูดวนสร้างบรรยากาศ';$('ambient-toggle').setAttribute('aria-pressed',String(state.ambientLoop));
  $('ambient-status').textContent=state.ambientLoop?`ต้อนรับ ทักทาย ชวนติดตาม และเชิญร่วมกิจกรรมตามโหมดที่เลือก · เว้นช่วง ${state.ambientGap} วินาทีหลังพูดจบ · หยุดให้ของขวัญก่อน`:'ปิดพูดวนอยู่ · เปิดได้แม้ยังไม่มีของขวัญ';
 }
});
const originalEnqueue=blessingVoice.enqueue;
blessingVoice.enqueue=e=>originalEnqueue({...e,label:byAction[e.action]?.label||'ส่งน้ำใจ'});
function loadThaiVoices(){
 const selected=$('voice-select').value;
 const voices=window.speechSynthesis?.getVoices().filter(v=>/^th(?:-|_)/i.test(v.lang)||v.lang.toLowerCase()==='th')||[];
 $('voice-select').replaceChildren(...voices.map(v=>{const option=document.createElement('option');option.value=v.voiceURI;option.textContent=v.name;return option;}));
 if(!voices.length){const option=document.createElement('option');option.value='';option.textContent='ไม่พบเสียงไทยในเบราว์เซอร์นี้';$('voice-select').append(option);}
 else{$('voice-select').value=voices.some(v=>v.voiceURI===selected)?selected:voices[0].voiceURI;}
 if(!blessingVoice.supported)$('voice-status').textContent='เบราว์เซอร์นี้ไม่รองรับเสียงสังเคราะห์ ลองเปิดด้วย Chrome หรือ Edge';
 else if(!voices.length)$('voice-status').textContent='ยังไม่พบเสียงไทย ลองเปิดในเบราว์เซอร์ที่มีเสียงไทย แล้วกดเปิดเสียงอีกครั้ง';
 updateVoiceSettings();return voices;
}
function updateVoiceSettings(){
 const voice=window.speechSynthesis?.getVoices().find(v=>v.voiceURI===$('voice-select').value);
 blessingVoice.configure({voice,volume:$('voice-volume').value,rate:$('voice-rate').value,readName:$('voice-read-name').checked,style:$('voice-style').value,ending:$('voice-ending').value,ambientGap:$('ambient-gap').value,ambientMode:$('ambient-mode').value});
}
function enableBlessingVoice(preview=false){
 if(!loadThaiVoices().length)return false;updateVoiceSettings();
 if(blessingVoice.enable()){voiceChannel?.postMessage({type:'claim',tab:voiceTabId});if(preview)blessingVoice.preview($('name').value);return true;}return false;
}
function toggleBlessingVoice(){if(blessingVoice.getState().enabled)blessingVoice.disable();else enableBlessingVoice(true);}
$('voice-toggle').onclick=toggleBlessingVoice;$('voice-overlay-toggle').onclick=toggleBlessingVoice;
$('voice-preview').onclick=()=>{if(blessingVoice.getState().enabled){blessingVoice.stop();blessingVoice.preview($('name').value);}else enableBlessingVoice(true);};
$('voice-stop').onclick=()=>blessingVoice.stop();
$('cheer-preview').onclick=()=>{if(!blessingVoice.getState().enabled&&!enableBlessingVoice(false))return;blessingVoice.previewInvitation();};
for(const id of ['voice-select','voice-volume','voice-rate','voice-read-name','voice-style','voice-ending','ambient-gap','ambient-mode'])$(id).addEventListener('change',updateVoiceSettings);
$('ambient-toggle').onclick=()=>{if(blessingVoice.getState().ambientLoop)blessingVoice.stopAmbient();else if(enableBlessingVoice(false))blessingVoice.startAmbient();};
if(window.speechSynthesis)window.speechSynthesis.addEventListener('voiceschanged',loadThaiVoices);
loadThaiVoices();
if(voiceChannel)voiceChannel.onmessage=e=>{
 if(e.data?.type==='claim'&&e.data.tab!==voiceTabId&&blessingVoice.getState().enabled){blessingVoice.disable();$('voice-status').textContent='ปิดเสียงหน้านี้ เพราะเปิดเสียงในอีกแท็บแล้ว';}
 if(e.data?.type==='music-claim'&&e.data.tab!==voiceTabId)backgroundMusic?.stop();
 if(e.data?.type==='voice-state'){backgroundMusic?.duck(e.data.speaking);chantPlayer?.duck(e.data.speaking);}if(e.data?.type==='chant-claim'&&e.data.tab!==voiceTabId)chantPlayer?.stop();if(e.data?.type==='music-claim'&&e.data.tab!==voiceTabId)chantPlayer?.stop();
};
addEventListener('pagehide',()=>{blessingVoice.disable();voiceChannel?.close();});

/* ORIGINAL MUSIC ENGINE START */
function createOriginalMusic({onStatus=()=>{}}){
 let audio=null,running=false,starting=false,volume=.32,ducked=false,autoDuck=true,operation=0;
 const gain=()=>{if(audio)audio.volume=volume*(ducked&&autoDuck?.2:1);};
 const report=message=>onStatus({running,starting,volume,ducked,autoDuck,message});
 return {
  async start(){if(running||starting)return;const id=++operation;starting=true;report('กำลังเปิดเพลงสามช่า…');try{
   if(!audio){audio=new Audio('/dance-music.mp3');audio.loop=true;audio.preload='none';audio.addEventListener('error',()=>{++operation;running=false;starting=false;report('โหลดเพลงไม่สำเร็จ กรุณากดเปิดใหม่');});}
   gain();await audio.play();if(id!==operation){if(!running&&!starting)audio.pause();return;}running=true;starting=false;report('กำลังเล่น · สามซ่า.mp3');return true;
  }catch{if(id===operation){running=false;starting=false;report('กดเปิดเพลงอีกครั้งจากหน้าที่ใช้ส่งเสียง');}return false;}},
  stop(){++operation;running=false;starting=false;audio?.pause();report('ปิดเพลงอยู่');},
  configure(settings){if(settings.volume!==undefined)volume=Math.max(0,Math.min(.7,Number(settings.volume)||0));if(settings.autoDuck!==undefined)autoDuck=Boolean(settings.autoDuck);gain();},
  duck(value){ducked=Boolean(value);gain();},getState(){return {running,starting,volume,ducked,autoDuck};}
 };
}
/* ORIGINAL MUSIC ENGINE END */
backgroundMusic=createOriginalMusic({AudioContext:window.AudioContext||window.webkitAudioContext,onStatus(state){
 $('music-toggle').textContent=state.running?'■ ปิดเพลงคลอ':'▶ เปิดเพลงคลอ';$('music-toggle').setAttribute('aria-pressed',String(state.running));
 $('music-overlay-toggle').textContent=state.running?'♫ เพลงคลอเปิดอยู่':'♫ เปิดเพลงคลอ';$('music-overlay-toggle').setAttribute('aria-pressed',String(state.running));$('music-status').textContent=state.message;
}});
async function toggleMusic(){
 if(backgroundMusic.getState().running||backgroundMusic.getState().starting)backgroundMusic.stop();
 else{chantPlayer?.stop();backgroundMusic.duck(blessingVoice.getState().speaking);if(await backgroundMusic.start())voiceChannel?.postMessage({type:'music-claim',tab:voiceTabId});}
}
$('music-toggle').onclick=toggleMusic;$('music-overlay-toggle').onclick=toggleMusic;
$('music-test').onclick=async()=>{
 const AudioCtx=window.AudioContext||window.webkitAudioContext;
 if(!AudioCtx){$('music-status').textContent='หน้านี้ไม่มีระบบเสียง ลองเปิดลิงก์หน้าควบคุมใน Chrome';return;}
 $('music-test').disabled=true;let testContext=null,deadline=null;
 try{
  testContext=new AudioCtx();
  await Promise.race([testContext.resume(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('blocked')),4000);})]);
  clearTimeout(deadline);
  if(testContext.state!=='running')throw Error('blocked');
  [523.25,659.25,783.99].forEach((frequency,index)=>{
   const osc=testContext.createOscillator(),gain=testContext.createGain(),time=testContext.currentTime+.08+index*.35;
   osc.frequency.value=frequency;osc.type='sine';gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.2,time+.025);gain.gain.exponentialRampToValueAtTime(.0001,time+.28);osc.connect(gain);gain.connect(testContext.destination);osc.start(time);osc.stop(time+.3);
  });
  $('music-status').textContent='ส่งเสียงทดสอบ 3 โน้ตแล้ว ถ้าไม่ได้ยิน ให้เปิดเสียงแท็บและตรวจ Volume Mixer ของ Windows';
  setTimeout(()=>void testContext.close().catch(()=>{}),1600);
 }catch(error){clearTimeout(deadline);if(testContext)void testContext.close().catch(()=>{});$('music-status').textContent='เบราว์เซอร์ยังไม่เปิดเสียง ให้เปิดหน้าควบคุมใน Chrome แล้วกดทดสอบอีกครั้ง';}
 finally{$('music-test').disabled=false;}
};
$('music-volume').addEventListener('input',()=>backgroundMusic.configure({volume:$('music-volume').value}));
$('music-duck').addEventListener('change',()=>backgroundMusic.configure({autoDuck:$('music-duck').checked}));
addEventListener('pagehide',()=>backgroundMusic.stop());



