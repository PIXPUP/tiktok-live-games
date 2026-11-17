'use strict';
(() => {
 const actions=['incense','temple','tree','fruit','lamp','lantern','bell','grand'];
 const defaults=['id-5655','id-5487','id-8913','id-5658','id-5879','id-5659','id-6968','id-11046'];
 const ranges={width:[14,34,23],top:[5,65,20],font:[8,18,11],icon:[16,48,28],gap:[0,10,4]};
 let catalogPromise=null,drawNumber=0,config=null,catalog=null,serverBindings=null;
 function normalize(data,game){
  if(!data||data.version!==1||data.game!==game||!Array.isArray(data.slots)||data.slots.length!==8||new Set(data.slots).size!==8||!data.slots.every(x=>typeof x==='string'&&/^(id-\d+|image-[a-f0-9]{20})$/.test(x)))throw Error('ไฟล์จัดของขวัญไม่ถูกต้องหรือคนละเกม');
  const input=data.layout||{},layout={position:input.position||'split'};
  if(!['split','left','right','bottom'].includes(layout.position))throw Error('ตำแหน่งไม่ถูกต้อง');
  for(const [key,[min,max,value]] of Object.entries(ranges)){const n=input[key]??value;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('ขนาดแถบเกินช่วงที่กำหนด');layout[key]=n;}
  return {version:1,game,slots:[...data.slots],layout};
 }
 function initial(game){return normalize({version:1,game,slots:defaults},game);}
 function loadCatalog(){if(!catalogPromise)catalogPromise=fetch('/gift-library/catalog.json',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('โหลดคลังของขวัญไม่สำเร็จ');return r.json();}).then(data=>{catalog=data;return data;}).catch(e=>{catalogPromise=null;throw e;});return catalogPromise;}
 function giftsFor(value,data){const indexed=new Map(data.gifts.map(g=>[g.key,g]));return value.slots.map(key=>{const g=indexed.get(key);if(!g||!/^icons\/[a-f0-9]{64}\.webp$/.test(g.file))throw Error('รูปของขวัญไม่อยู่ในคลัง');return g;});}
 function matching(value,data,bindings){if(!Array.isArray(bindings))return false;const gifts=giftsFor(value,data);return actions.every((action,i)=>{const match=bindings.find(b=>b.action===action);if(!match)return false;const key=String(match.gift).normalize('NFKC').trim().toLowerCase();return [gifts[i].id,gifts[i].name,...(gifts[i].aliases||[])].some(n=>n!=null&&String(n).normalize('NFKC').trim().toLowerCase()===key);});}
 function report(){if(!config||!catalog)return;parent.postMessage({type:'pages-layout-status',game:config.game,matched:matching(config,catalog,serverBindings)},location.origin);}
 async function apply(input,labels=[]){
  const n=++drawNumber,game=location.pathname.split('/')[2];const next=normalize(input,game);
  const data=await loadCatalog();if(n!==drawNumber)return;
  const gifts=giftsFor(next,data);config=next;
  const host=document.getElementById('world')||document.getElementById('game');if(!host)return;
  document.getElementById('pages-gift-board')?.remove();
  let style=document.getElementById('pages-gift-style');if(!style){style=document.createElement('style');style.id='pages-gift-style';document.head.append(style);}
  style.textContent=`.offering-rail,.gift-strip{visibility:hidden!important}#pages-gift-board{position:absolute;inset:0;pointer-events:none;z-index:35}.pages-gift-column{position:absolute;display:flex;flex-direction:column;gap:${config.layout.gap}px;top:${config.layout.top}%;width:${config.layout.width}%}.pages-gift-tile{background:rgba(16,45,34,.94);border:1px solid #d0b778;border-radius:7px;padding:5px;display:flex;gap:4px;align-items:center;min-width:0;color:#fff4ce;font-size:${config.layout.font}px;line-height:1.22;box-shadow:0 1px 4px #0007}.pages-gift-tile img{width:${config.layout.icon}px;height:${config.layout.icon}px;object-fit:contain;flex:none}.pages-gift-tile div{min-width:0}.pages-gift-tile b,.pages-gift-tile strong,.pages-gift-tile small{display:block;overflow-wrap:anywhere}.pages-gift-tile b{font-size:1em}.pages-gift-tile strong{color:#f3ce73;font-size:1em;margin:2px 0}.pages-gift-tile small{font-size:.8em;opacity:.9}`;
  for(const gift of gifts)style.textContent+=`.gift-${gift.key}{background-image:url('/gift-library/${gift.file}')!important}`;
  const board=document.createElement('div');board.id='pages-gift-board';board.setAttribute('aria-label','ของขวัญที่จัดเอง');
  const split=config.layout.position==='split';
  const groups=split?[gifts.slice(0,4),gifts.slice(4)]:[gifts];
  groups.forEach((group,side)=>{const column=document.createElement('div');column.className='pages-gift-column';column.style[config.layout.position==='right'||side===1?'right':'left']='1%';if(config.layout.position==='bottom'){column.style.cssText='left:1%;right:1%;bottom:2%;top:auto;width:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:'+config.layout.gap+'px';}
   group.forEach((gift,j)=>{const i=split?side*4+j:j,tile=document.createElement('div');tile.className='pages-gift-tile';tile.dataset.key=gift.key;const img=document.createElement('img');img.src='/gift-library/'+gift.file;img.alt=gift.name;img.decoding='async';const copy=document.createElement('div'),name=document.createElement('b'),label=document.createElement('strong'),coins=document.createElement('small');name.textContent=gift.name;label.textContent=labels[i]||window.__GAME_ACTION_LABELS__?.[i]||'กิจกรรม '+(i+1);coins.textContent=gift.coins.toLocaleString()+' เหรียญ';copy.append(name,label,coins);tile.append(img,copy);column.append(tile);});board.append(column);});
  host.append(board);
  window.dispatchEvent(new CustomEvent('pages-bindings',{detail:gifts.map((g,i)=>({action:actions[i],key:g.key,name:g.name,coins:g.coins}))}));report();
 }
 function fromServer(data){serverBindings=data.bindings||null;if(!config&&data.presentation)void apply(data.presentation).catch(()=>{});else report();}
 window.LiveGiftLayout={actions,defaults,ranges,initial,normalize,loadCatalog,giftsFor,matching,apply,fromServer};
 addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='pages-layout')void apply(e.data.config,e.data.labels||[]).catch(error=>parent.postMessage({type:'pages-layout-error',game:e.data.config?.game,message:error.message},location.origin));});
 addEventListener('DOMContentLoaded',()=>{const raw=new URLSearchParams(location.search).get('layout');if(raw)try{void apply(JSON.parse(raw)).catch(()=>{});}catch{}});
})();
