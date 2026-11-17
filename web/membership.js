(()=>{const $=id=>document.getElementById(id);let busy=false;async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;
 try{const identity=await window.LiveAuth.ready;const r=await fetch('/api/access',{credentials:'same-origin'}),s=await r.json();if(!r.ok)throw Error(s.error||'ตรวจสิทธิ์ไม่สำเร็จ');
 $('access-status').textContent=s.admin?'แอดมิน · ใช้งานได้ครบทุกเกม':s.active?'สิทธิ์ใช้งานเปิดอยู่':s.status==='expired'?'สิทธิ์หมดอายุ กรุณาติดต่อแอดมินเพื่อต่ออายุ':s.status==='suspended'?'สิทธิ์ถูกระงับ กรุณาติดต่อแอดมิน':s.status==='unavailable'?'ระบบสิทธิ์ยังไม่พร้อม กรุณาลองใหม่':'รอแอดมินอนุมัติสิทธิ์';
 if(s.expiresAt)$('access-status').textContent+=' · หมดอายุ '+new Date(s.expiresAt).toLocaleString('th-TH');
 $('member-id').textContent='รหัสผู้ใช้: '+identity.uid;$('play').hidden=!s.active;$('admin-link').hidden=!s.admin;
 }catch(e){$('access-status').textContent=e.message;}finally{busy=false;$('refresh').disabled=false;}}
 $('refresh').onclick=refresh;addEventListener('live-auth-ready',refresh);if(window.LiveAuth?.authenticated)refresh();})();
