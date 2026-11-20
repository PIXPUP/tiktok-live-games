import test from 'node:test';import assert from 'node:assert/strict';
import {isAdmin,registerUser,memberAccess,changeAccess,listUsers} from './members.mjs';
import {createHandler} from './worker.mjs';import {SESSION_COOKIE,mintOverlay} from './security.mjs';
const origin='https://pixpup-live-games.pages.dev';
function environment(){const data=new Map();return {MANUAL_ACCESS_ENABLED:'true',ADMIN_UIDS:'owner',OVERLAY_SIGNING_KEY:'fixture-only-overlay-secret-0123456789',MEMBERS_KV:{get:async(k,t)=>{const v=data.get(k);return v&&t==='json'?JSON.parse(v):v||null;},put:async(k,v)=>{data.set(k,v);},list:async({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true}),delete:async k=>data.delete(k)},ASSETS:{fetch:async()=>new Response('asset')},data};}
const admin={uid:'owner',email:'owner@example.invalid'},member={uid:'member',email:'member@example.invalid'};
const identity=async token=>{if(token==='admin')return admin;if(token==='user')return member;throw Error('invalid');};
const handler=createHandler({verifyIdentity:identity});
const req=(path,token,method='GET',body,site=origin)=>new Request(origin+path,{method,headers:{Cookie:SESSION_COOKIE+'='+token,Origin:site,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('New users wait for approval; only server-configured UID is administrator',async()=>{
 const env=environment();await registerUser(env,member);assert.equal((await memberAccess(env,member)).status,'pending');assert.equal((await memberAccess(env,admin)).active,true);assert.equal(isAdmin(env,'owner2'),false);assert.equal(isAdmin(env,''),false);
 const page=await listUsers(env);assert.equal(page.users[0].email,member.email);assert.equal(page.users[0].active,false);
});
test('Approve and extend exactly 30 days, suspend, expire, and keep an actor audit trail',async()=>{
 const env=environment();await registerUser(env,member);const start=Date.now(),first=await changeAccess(env,admin,{uid:member.uid,action:'grant',role:'admin',expiresAt:999999999999999});
 assert(first.expiresAt>=start+30*86400000&&first.expiresAt<Date.now()+30*86400000+100);assert.equal(first.admin,false);
 const next=await changeAccess(env,admin,{uid:member.uid,action:'extend'});assert.equal(next.expiresAt,first.expiresAt+30*86400000);assert.equal((await memberAccess(env,member)).active,true);
 await changeAccess(env,admin,{uid:member.uid,action:'suspend'});assert.equal((await memberAccess(env,member)).status,'suspended');
 await env.MEMBERS_KV.put('access:member',JSON.stringify({enabled:true,expiresAt:1}));assert.equal((await memberAccess(env,member)).status,'expired');
 const renewed=await changeAccess(env,admin,{uid:member.uid,action:'extend'});assert(renewed.expiresAt>Date.now()+29*86400000);
 const audit=[...env.data.entries()].filter(([k])=>k.startsWith('audit:')).map(([,v])=>JSON.parse(v));assert.equal(audit.length,4);assert(audit.every(a=>a.actorUid==='owner'&&a.targetUid==='member'));
 await assert.rejects(changeAccess(env,member,{uid:member.uid,action:'grant'}));await assert.rejects(changeAccess(env,admin,{uid:'owner',action:'suspend'}));await assert.rejects(changeAccess(env,admin,{uid:'unknown',action:'grant'}));
});
test('Ordinary users cannot list accounts, visit admin paths, self-approve or forge admin role',async()=>{
 const env=environment();await registerUser(env,member);
 for(const path of ['/admin','/admin.html','/admin.js','/api/admin/users'])assert.equal((await handler(req(path,'user'),env)).status,403);
 assert.equal((await handler(req('/api/admin/access','user','POST',{uid:'member',action:'grant',admin:true}),env)).status,403);
 assert.equal((await handler(req('/api/admin/access','admin','POST',{uid:'member',action:'grant'},'https://evil.invalid'),env)).status,403);
 assert.equal((await handler(req('/api/admin/users','bad'),env)).status,401);
 assert.equal((await handler(req('/api/admin/users','admin'),env)).status,200);
 assert.equal((await handler(req('/api/admin/access','admin','POST',{uid:'member',action:'grant'}),env)).status,200);
});
test('Approval gates direct game assets, catalog, new and existing signed LIVE links',async()=>{
 const env=environment();await registerUser(env,member);
 assert.equal((await handler(req('/','user'),env)).headers.get('Location'),'/membership');
 for(const path of ['/games/boon-live/','/games/boon-live/game.js','/games/bbq-live/','/games/garden-live/','/mini-live.js','/mini-live.css','/gift-library/catalog.json'])assert.equal((await handler(req(path,'user'),env)).status,402);
 assert.equal((await handler(req('/membership','user'),env)).status,200);
 const body={url:origin+'/games/boon-live/?overlay=1'};
 assert.equal((await handler(req('/api/overlay','user','POST',body),env)).status,402);
 await changeAccess(env,admin,{uid:'member',action:'grant'});
 assert.equal((await handler(req('/','user'),env)).status,200);
 const result=await handler(req('/api/overlay','user','POST',body),env);assert.equal(result.status,200);const url=(await result.json()).url;
 assert.equal((await handler(new Request(url),env)).status,200);
 for(const game of ['bbq-live','garden-live']){const minted=await handler(req('/api/overlay','user','POST',{url:origin+'/games/'+game+'/?overlay=1'}),env);assert.equal(minted.status,200);const screen=await handler(new Request((await minted.json()).url),env);const cookie=screen.headers.get('Set-Cookie').split(';')[0];assert.equal((await handler(new Request(origin+'/mini-live.js',{headers:{Cookie:cookie}}),env)).status,200);}
 await changeAccess(env,admin,{uid:'member',action:'suspend'});assert.equal((await handler(new Request(url),env)).status,402);
});
test('Verified session registers profile without trusting posted user identity',async()=>{
 const env=environment();const response=await handler(new Request(origin+'/api/session',{method:'POST',headers:{Origin:origin,Authorization:'Bearer user'},body:JSON.stringify({uid:'owner',email:'forged@example.invalid'})}),env);
 assert.equal(response.status,200);assert.equal((await env.MEMBERS_KV.get('user:member','json')).email,member.email);assert.equal(await env.MEMBERS_KV.get('user:owner'),null);
});
