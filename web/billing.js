(()=>{
 const $=id=>document.getElementById(id);let busy=false;
 async function status(){
  if(busy)return;busy=true;$('refresh').disabled=true;$('billing-status').textContent='กำลังตรวจสอบสถานะสมาชิก…';
  try{await window.LiveAuth.ready;const r=await fetch('/api/billing/status?refresh=1',{credentials:'same-origin'}),s=await r.json();if(!r.ok)throw Error(s.error||'ตรวจสถานะไม่สำเร็จ');
   $('subscribe').hidden=!s.configured||s.active||s.hasSubscription;$('manage').hidden=!s.configured||!s.hasSubscription;$('play').hidden=!s.active;
   let text=!s.configured?'กำลังเตรียมเปิดรับสมัครสมาชิก ยังไม่รับชำระเงิน':!s.enforced?'ระบบสมาชิกอยู่ระหว่างเตรียมเปิดใช้งาน':s.active?'สมาชิกใช้งานได้ครบทุกเกม':s.status==='past_due'?'ชำระเงินไม่สำเร็จ กรุณาอัปเดตวิธีชำระเงินในหน้าจัดการสมาชิก':s.status==='unavailable'?'ระบบชำระเงินยังไม่พร้อม':'ยังไม่มีสมาชิกที่ใช้งานได้';
   if(s.periodEnd)text+=' · '+(s.cancelAtPeriodEnd?'ใช้งานถึง ':'สิ้นสุดรอบ ')+new Date(s.periodEnd*1000).toLocaleDateString('th-TH');
   if(new URLSearchParams(location.search).get('checkout')==='success'&&!s.active)text+=' · หากเพิ่งชำระเงิน รอสักครู่แล้วกดตรวจสถานะอีกครั้ง';
   $('billing-status').textContent=text;
  }catch(e){$('billing-status').textContent=e.message;}finally{busy=false;$('refresh').disabled=false;}
 }
 async function open(kind){if(busy)return;busy=true;const button=$(kind==='checkout'?'subscribe':'manage');button.disabled=true;
  try{const r=await fetch('/api/billing/'+kind,{method:'POST',credentials:'same-origin'}),s=await r.json();if(!r.ok)throw Error(s.error||'เปิดหน้าชำระเงินไม่สำเร็จ');const url=new URL(s.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('ลิงก์ชำระเงินไม่ถูกต้อง');location.assign(url.href);}
  catch(e){$('billing-status').textContent=e.message;busy=false;button.disabled=false;}
 }
 $('subscribe').onclick=()=>open('checkout');$('manage').onclick=()=>open('portal');$('refresh').onclick=status;
 addEventListener('live-auth-ready',status);if(window.LiveAuth?.authenticated)status();
})();
