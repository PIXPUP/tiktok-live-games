import {initializeApp} from '@firebase/app';
import {initializeAuth,browserLocalPersistence,onIdTokenChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from '@firebase/auth';
import config from '../firebase-config.json' with {type:'json'};
const auth=initializeAuth(initializeApp(config),{persistence:browserLocalPersistence});
auth.languageCode='th';
const loginPage=document.body.dataset.page==='login';
const $=id=>document.getElementById(id);
function safeNext(value){try{if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/';const u=new URL(value,location.origin);return u.origin===location.origin?u.pathname+u.search+u.hash:'/';}catch{return '/';}}
const next=safeNext(new URLSearchParams(location.search).get('next'));
let currentUid=null,readyResolve,registration=false,sequence=0,loggingOut=false;
const ready=new Promise(resolve=>readyResolve=resolve),links=new Map();
async function establish(user,force=false){const token=await user.getIdToken(force);const r=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer '+token},credentials:'same-origin'});if(!r.ok)throw Error('สร้างการเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');return r.json();}
function message(text){if($('auth-message'))$('auth-message').textContent=text;}
function friendly(error){return ({'auth/invalid-credential':'อีเมลหรือรหัสผ่านไม่ถูกต้อง','auth/wrong-password':'อีเมลหรือรหัสผ่านไม่ถูกต้อง','auth/user-not-found':'อีเมลหรือรหัสผ่านไม่ถูกต้อง','auth/email-already-in-use':'อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ','auth/invalid-email':'กรุณาใส่อีเมลให้ถูกต้อง','auth/weak-password':'ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร','auth/too-many-requests':'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่','auth/network-request-failed':'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ต','auth/operation-not-allowed':'ระบบสมัครสมาชิกยังไม่พร้อม กรุณาติดต่อผู้ดูแล','auth/user-disabled':'บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแล'})[error.code]||error.message||'ทำรายการไม่สำเร็จ กรุณาลองใหม่';}
function returnTarget(){
 const u=new URL(next,location.origin),match=u.pathname.match(/^\/games\/([^/]+)\/(?:index\.html)?$/);
 if(match){u.pathname='/';u.searchParams.set('game',match[1]);u.searchParams.delete('access');}
 return u.pathname+u.search+u.hash;
}
onIdTokenChanged(auth,async user=>{
 const id=++sequence;
 if(!user){
  currentUid=null;
  if(!loginPage&&!loggingOut){try{await fetch('/api/session',{method:'DELETE',credentials:'same-origin'});}catch{}location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));}
  return;
 }
 try{
  const identity=await establish(user);if(id!==sequence)return;
  if(loginPage){location.replace(returnTarget());return;}
  if(currentUid&&currentUid!==user.uid){location.reload();return;}
  currentUid=user.uid;document.documentElement.dataset.userId=user.uid;
  if($('account-email')){$('account-email').textContent=identity.email||'สมาชิก';$('account-email').dataset.uid=user.uid;}
  readyResolve(identity);window.dispatchEvent(new Event('live-auth-ready'));
 }catch(error){if(loginPage)message(friendly(error));else location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));}
});
async function ensure(){if(!auth.currentUser){location.assign('/login');throw Error('กรุณาเข้าสู่ระบบ');}return establish(auth.currentUser,true);}
async function createOverlay(url){await ready;const cached=links.get(url);if(cached&&Date.parse(cached.expiresAt)>Date.now()+60000)return cached;await ensure();const r=await fetch('/api/overlay',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});const data=await r.json();if(r.status===402){location.assign('/membership');throw Error(data.error);}if(!r.ok)throw Error(data.error||'สร้างลิงก์ไม่สำเร็จ');links.set(url,data);return data;}
window.LiveAuth={ready,createOverlay,get uid(){return currentUid;},get authenticated(){return Boolean(currentUid);}};
if(loginPage){
 $('auth-form').onsubmit=async event=>{
  event.preventDefault();const button=$('auth-submit');button.disabled=true;message(registration?'กำลังสมัครสมาชิก…':'กำลังเข้าสู่ระบบ…');
  try{const email=$('email').value.trim(),password=$('password').value;if(registration&&password.length<8)throw Error('ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร');await (registration?createUserWithEmailAndPassword:signInWithEmailAndPassword)(auth,email,password);message('เข้าสู่ระบบแล้ว กำลังเปิดเกม…');}
  catch(error){message(friendly(error));}finally{button.disabled=false;}
 };
 $('toggle-registration').onclick=()=>{registration=!registration;$('auth-title').textContent=registration?'สร้างบัญชีของคุณ':'เข้าสู่ระบบ';$('auth-submit').textContent=registration?'สมัครสมาชิก':'เข้าสู่ระบบ';$('toggle-registration').textContent=registration?'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ':'ยังไม่มีบัญชี? สมัครสมาชิก';$('password').autocomplete=registration?'new-password':'current-password';message('');};
 $('reset-password').onclick=async()=>{const email=$('email').value.trim();if(!email){message('ใส่อีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง');$('email').focus();return;}try{await sendPasswordResetEmail(auth,email,{url:location.origin+'/login',handleCodeInApp:false});message('หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านให้ กรุณาตรวจกล่องจดหมาย');}catch(error){message(friendly(error));}};
}else if($('logout')){
 $('logout').onclick=async()=>{loggingOut=true;const button=$('logout');button.disabled=true;try{await signOut(auth);await fetch('/api/session',{method:'DELETE',credentials:'same-origin'});}finally{location.replace('/login');}};
}
