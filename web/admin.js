(()=>{const $=id=>document.getElementById(id);let users=[],cursor=null,busy=false;
 function element(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
 function render(){const root=$('users');root.replaceChildren();const query=$('search').value.trim().toLowerCase();
  for(const user of users.filter(u=>(u.email+' '+u.uid).toLowerCase().includes(query))){const row=element('div',null,'member'),details=element('div',null,'details');details.append(element('strong',user.email||'ไม่มีอีเมล'),element('small',user.uid,'member-id'));
   const label=user.admin?'แอดมิน':user.active?'เปิดสิทธิ์อยู่':user.status==='expired'?'หมดอายุ':user.status==='suspended'?'ระงับสิทธิ์':'รออนุมัติ';details.append(element('p',label+(user.expiresAt?' · '+new Date(user.expiresAt).toLocaleString('th-TH'):''),'status'));row.append(details);
   if(!user.admin){const actions=element('div',null,'actions');for(const [action,label,cls] of [['grant','เปิดสิทธิ์ 30 วัน',''],['extend','ต่ออายุ +30 วัน','secondary'],['suspend','ระงับสิทธิ์','danger']]){if(action==='grant'&&user.active)continue;if(action==='suspend'&&!user.active)continue;const button=element('button',label,cls);button.disabled=busy;button.onclick=()=>update(user,action);actions.append(button);}row.append(actions);}root.append(row);
  }
  if(!root.childElementCount)root.append(element('p','ไม่พบผู้ใช้ในรายการที่โหลดแล้ว'));
  $('load-more').hidden=!cursor;$('refresh').disabled=busy;$('load-more').disabled=busy;
 }
 async function load(more=false){if(busy)return;busy=true;render();try{await window.LiveAuth.ready;const r=await fetch('/api/admin/users'+(more&&cursor?'?cursor='+encodeURIComponent(cursor):'')),d=await r.json();if(!r.ok)throw Error(d.error||'โหลดรายการไม่สำเร็จ');users=more?[...users,...d.users]:d.users;cursor=d.cursor;$('admin-status').textContent='โหลดแล้ว '+users.length+' บัญชี';}catch(e){$('admin-status').textContent=e.message;}finally{busy=false;render();}}
 async function update(user,action){if(busy)return;busy=true;render();$('admin-status').textContent='กำลังบันทึกสิทธิ์ของ '+user.email;
  try{const r=await fetch('/api/admin/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:user.uid,action})}),d=await r.json();if(!r.ok)throw Error(d.error||'บันทึกไม่สำเร็จ');Object.assign(user,d);$('admin-status').textContent='บันทึกสิทธิ์ของ '+user.email+' แล้ว · ให้ผู้ใช้กดตรวจสิทธิ์อีกครั้ง';}catch(e){$('admin-status').textContent=e.message;}finally{busy=false;render();}}
 $('search').oninput=render;$('refresh').onclick=()=>load();$('load-more').onclick=()=>load(true);addEventListener('live-auth-ready',()=>load());if(window.LiveAuth?.authenticated)load();})();
