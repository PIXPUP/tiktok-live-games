'use strict';
(() => {
 const params=new URLSearchParams(location.search), game=location.pathname.split('/')[2];
 const feedGame=({'bbq-live':'curry-shop-3d','garden-live':'curry-shop-3d'})[game]||game;
 params.set('transport','poll');params.set('overlay','1');
 history.replaceState(null,'',location.pathname+'?'+params.toString());
 const originalFetch=window.fetch.bind(window), empty={score:0,actions:0,players:{},recent:[]};
 const epoch='pages-demo', backend=params.get('backend')||'';
 let verified=null, ready=false, pendingDemo=null;
 function validBackend(value){try{const u=new URL(value);return u.protocol==='https:'&&/^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname)&&u.host===u.hostname&&!u.username&&!u.password&&(u.pathname==='/'||!u.pathname)&&!u.search&&!u.hash;}catch{return false;}}
 function report(mode,message){parent.postMessage({type:'pages-status',game,mode,message},location.origin);}
 function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
 async function remote(route,options={}){
  if(!validBackend(backend))throw Error('ลิงก์ Tunnel ไม่ถูกต้อง');
  if(!verified)verified=originalFetch(backend+'/health',{credentials:'omit',signal:AbortSignal.timeout(8000)}).then(async r=>{const h=await r.json();if(!r.ok||!h.ready||h.readOnly!==true||h.game!==feedGame||h.protocol!==1)throw Error('Tunnel ไม่ใช่เกมนี้ หรือโปรแกรมยังไม่พร้อม');}).catch(e=>{verified=null;throw e;});
  await verified;
  return originalFetch(backend+route,{...options,credentials:'omit',signal:AbortSignal.timeout(8000)});
 }
 window.fetch=async(input,options={})=>{
  const raw=typeof input==='string'?input:input.url;
  const url=new URL(raw,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);
  if(url.pathname==='/api/poll'){
   if(!backend){report('demo','โหมดทดลอง · ยังไม่เชื่อมไลฟ์');return response({ready:true,reset:true,epoch,cursor:0,state:empty,events:[]});}
   try{const r=await remote(url.pathname+url.search,options);if(!r.ok)throw Error('เซิร์ฟเวอร์ยังไม่พร้อม');const data=await r.json();window.LiveGiftLayout?.fromServer(feedGame!==game&&data.presentation?{...data,presentation:{...data.presentation,game}}:data);report('live','เชื่อมเซิร์ฟเวอร์แล้ว · ควบคุมจากโปรแกรมบนคอม');return response(data);}
   catch(error){report('offline',error.message||'Tunnel หยุดอยู่ กดเชื่อมใหม่ด้วยลิงก์ปัจจุบัน');throw error;}
  }
  if(url.pathname==='/api/event'){
   let e;try{e=JSON.parse(options.body||'{}');}catch{return response({error:'Invalid demo'},400);}
   if(e.preview!==true)return response({error:'ใช้หน้าควบคุมบนคอมสำหรับกิจกรรมจริง'},403);
   demo(e);return response({ok:true,preview:true});
  }
  return response({error:'ใช้หน้าควบคุมบนคอม'},403);
 };
 function demo(data){
  if(!ready){pendingDemo=data;return;}
  const actions=['incense','temple','tree','fruit','lamp','lantern','bell','grand'];
  if(!actions.includes(data.action))return;
  window.dispatchEvent(new CustomEvent('pages-demo',{detail:{action:data.action,name:String(data.name||'ผู้ชมทดลอง').slice(0,40),count:1,points:0,preview:true}}));
 }
 addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='pages-demo')demo(e.data);});
 addEventListener('DOMContentLoaded',()=>{ready=true;if(pendingDemo){demo(pendingDemo);pendingDemo=null;}report(backend?'connecting':'demo',backend?'กำลังเชื่อมต่อไลฟ์…':'โหมดทดลอง · ยังไม่เชื่อมไลฟ์');});
 window.PagesRuntime={validBackend};
})();
