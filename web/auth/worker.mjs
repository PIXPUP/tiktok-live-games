import {accessEnabled,isAdmin,registerUser,memberAccess,listUsers,changeAccess} from './members.mjs';
import {verifyFirebase,cookieValue,safeNext,SESSION_COOKIE,GAME_KEYS,overlayCookie,verifyOverlay,mintOverlay,canonicalTarget,parseOverlayTarget} from './security.mjs';
const PUBLIC_PATHS=new Set(['/login','/login/','/login.html','/auth.js','/auth.css','/portal.css','/favicon.ico','/404.html']);
const SHARED_OVERLAY=new Set(['/gift-layout.js','/game-runtime.js','/mini-live.js','/mini-live.css']);
const unsafeMethods=new Set(['POST','PUT','DELETE','PATCH']);
function reply(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
function isSameOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin;}
function cookie(name,value,maxAge=3600){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAge))}`;}
function redirect(url){return new Response(null,{status:302,headers:{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
function noStore(response){const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers});}
export function createHandler({verifyIdentity=verifyFirebase,checkMembership=memberAccess}={}){
 return async(request,env)=>{
  const url=new URL(request.url),path=url.pathname,origin=url.origin;
  let sessionPromise;
  const user=()=>sessionPromise??=(async()=>{try{return await verifyIdentity(cookieValue(request,SESSION_COOKIE));}catch{return null;}})();
  const paid=async identity=>{try{return await checkMembership(env,identity);}catch{return {active:false,status:'unavailable'};}};
  if(path==='/api/access'){
   if(request.method!=='GET')return reply({error:'Method not allowed'},405);
   const identity=await user();if(!identity)return reply({error:'Sign in required'},401);
   try{return reply(await checkMembership(env,identity));}catch{return reply({error:'ตรวจสิทธิ์ไม่สำเร็จ กรุณาลองใหม่'},503);}
  }
  if(path.startsWith('/api/admin/')){
   const identity=await user();if(!identity)return reply({error:'Sign in required'},401);
   if(!isAdmin(env,identity.uid))return reply({error:'Administrator only'},403);
   if(path==='/api/admin/users'&&request.method==='GET'){
    try{return reply(await listUsers(env,url.searchParams.get('cursor')));}catch{return reply({error:'โหลดรายการไม่สำเร็จ กรุณาลองใหม่'},503);}
   }
   if(path==='/api/admin/access'&&request.method==='POST'){
    if(!isSameOrigin(request))return reply({error:'Origin not allowed'},403);
    if(!env.MEMBERS_KV)return reply({error:'Member store unavailable'},503);
    try{const raw=await request.text();if(raw.length>4096)return reply({error:'Request too large'},413);return reply(await changeAccess(env,identity,JSON.parse(raw)));}catch{return reply({error:'แก้สิทธิ์ไม่สำเร็จ กรุณาตรวจผู้ใช้และลองใหม่'},400);}
   }
   return reply({error:'Method not allowed'},405);
  }
  if(path==='/api/session'){
   if(request.method==='DELETE'){
    if(!isSameOrigin(request))return reply({error:'Origin not allowed'},403);
    return reply({ok:true},200,{'Set-Cookie':cookie(SESSION_COOKIE,'',0)});
   }
   if(request.method==='POST'){
    if(!isSameOrigin(request))return reply({error:'Origin not allowed'},403);
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
    try{const identity=await verifyIdentity(token);await registerUser(env,identity);return reply({uid:identity.uid,email:identity.email},200,{'Set-Cookie':cookie(SESSION_COOKIE,token,Math.min(3600,identity.exp-Math.floor(Date.now()/1000)))});}catch{return reply({error:'เข้าสู่ระบบใหม่เพื่อใช้งานต่อ'},401);}
   }
   if(request.method==='GET'){const identity=await user();return identity?reply({uid:identity.uid,email:identity.email}):reply({error:'Sign in required'},401);}
   return reply({error:'Method not allowed'},405);
  }
  if(path==='/api/overlay'){
   if(request.method!=='POST')return reply({error:'Method not allowed'},405);
   if(!isSameOrigin(request))return reply({error:'Origin not allowed'},403);
   const identity=await user();if(!identity)return reply({error:'Sign in required'},401);
   if(!(await paid(identity)).active)return reply({error:'กรุณารอแอดมินเปิดสิทธิ์ก่อนสร้างลิงก์ไลฟ์',accessUrl:'/membership'},402);
   if(Number(request.headers.get('Content-Length'))>10000)return reply({error:'Request too large'},413);
   try{
    const raw=await request.text();if(raw.length>10000)return reply({error:'Request too large'},413);
    const data=JSON.parse(raw),target=parseOverlayTarget(data.url,origin);
    const grant=await mintOverlay(env,origin,identity.uid,target.game,canonicalTarget(target.url));
    target.url.searchParams.set('access',grant.token);
    return reply({url:target.url.href,expiresAt:new Date(grant.expires*1000).toISOString(),readOnly:true});
   }catch(error){return reply({error:error.message==='Overlay signing unavailable'?'ยังไม่พร้อมสร้างลิงก์ไลฟ์ กรุณาลองใหม่':'ลิงก์เกมไม่ถูกต้อง'},error.message==='Overlay signing unavailable'?503:400);}
  }
  if(PUBLIC_PATHS.has(path)||/^\/licenses\/[a-zA-Z0-9-]+\.txt$/.test(path)){
   if(!['GET','HEAD'].includes(request.method))return reply({error:'Method not allowed'},405);
   const file=path==='/login/'?new URL('/login',origin):url;
   return noStore(await env.ASSETS.fetch(new Request(file,request)));
  }
  if(unsafeMethods.has(request.method))return reply({error:'Read-only website'},403);
  if(!['GET','HEAD'].includes(request.method))return reply({error:'Method not allowed'},405);
  const identity=await user();
  const memberPage=['/membership','/membership/','/membership.html','/membership.js'].includes(path);
  const adminPage=['/admin','/admin/','/admin.html','/admin.js'].includes(path);
  if(path==='/billing'||path==='/billing.html')return redirect('/membership');
  if(adminPage){if(!identity)return redirect('/login?next=%2Fadmin');if(!isAdmin(env,identity.uid))return reply({error:'Administrator only'},403);return noStore(await env.ASSETS.fetch(path==='/admin/'?new Request(new URL('/admin',origin),request):request));}
  if(identity){
   if(memberPage)return noStore(await env.ASSETS.fetch(path==='/membership/'?new Request(new URL('/membership',origin),request):request));
   if((await paid(identity)).active)return noStore(await env.ASSETS.fetch(request));
   if(path==='/'||path==='/index.html')return redirect('/membership');
  }
  const match=path.match(/^\/games\/([^/]+)(?:\/|$)/),game=match?.[1];
  if(game&&GAME_KEYS.has(game)){
   const navigation=path===`/games/${game}/`||path===`/games/${game}/index.html`||path===`/games/${game}`;
   const explicit=url.searchParams.get('access');
   const token=explicit||cookieValue(request,overlayCookie(game));
   try{
    const grant=await verifyOverlay(token,env,origin,game,navigation?canonicalTarget(url):null);
    if(accessEnabled(env)&&!(await paid({uid:grant.sub})).active)return reply({error:'สิทธิ์ใช้งานหมดอายุ กรุณาติดต่อแอดมิน'},402);
    const response=noStore(await env.ASSETS.fetch(request));
    if(explicit)response.headers.append('Set-Cookie',cookie(overlayCookie(game),token,grant.exp-Math.floor(Date.now()/1000)));
    return response;
   }catch{/* A failed grant never becomes a logged-in user. */}
  }
  if(SHARED_OVERLAY.has(path)||path.startsWith('/gift-library/')){
   for(const key of GAME_KEYS)try{const grant=await verifyOverlay(cookieValue(request,overlayCookie(key)),env,origin,key);if(accessEnabled(env)&&!(await paid({uid:grant.sub})).active)continue;return noStore(await env.ASSETS.fetch(request));}catch{}
  }
  if(identity)return reply({error:'กรุณารอแอดมินเปิดสิทธิ์เพื่อใช้งาน',accessUrl:'/membership'},402);
  if(path.startsWith('/api/')||/\.(?:json|js|css|png|webp|jpg|mp3)$/.test(path))return reply({error:'Sign in required'},401);
  return redirect('/login?next='+encodeURIComponent(safeNext(path+url.search)));
 };
}
const handler=createHandler();
export default {fetch:handler};
