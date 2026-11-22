import test from 'node:test';import assert from 'node:assert/strict';
import {isAdmin,registerUser,memberAccess,changeAccess,listUsers} from './members.mjs';
import {createHandler} from './worker.mjs';import {SESSION_COOKIE,mintOverlay} from './security.mjs';
const origin='https://pixpup-live-games.pages.dev';
function environment(){const data=new Map([['user:member',JSON.stringify({uid:'member',email:'member@example.invalid',registeredAt:'2026-01-01T00:00:00Z'})]]);return {MANUAL_ACCESS_ENABLED:'true',ADMIN_UIDS:'owner',OVERLAY_SIGNING_KEY:'fixture-only-overlay-secret-0123456789',MEMBERS_KV:{get:async(k,t)=>{const v=data.get(k);return v&&t==='json'?JSON.parse(v):v||null;},put:async(k,v)=>{data.set(k,v);},list:async({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true}),delete:async k=>data.delete(k)},ASSETS:{fetch:async()=>new Response('asset')},data};}
const admin={uid:'owner',email:'owner@example.invalid'},member={uid:'member',email:'member@example.invalid'};
const identity=async token=>{if(token==='admin')return admin;if(token==='user')return member;throw Error('invalid');};
const handler=createHandler({verifyIdentity:identity});
const req=(path,token,method='GET',body,site=origin)=>new Request(origin+path,{method,headers:{Cookie:SESSION_COOKIE+'='+token,Origin:site,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('Desktop access requires a verified bearer, shares membership, bounds leases and never accepts cookie identity',async()=>{
 const env=environment();
 const desktop=token=>new Request(origin+'/api/desktop/access',{headers:{Authorization:'Bearer '+token}});
 assert.equal((await handler(req('/api/desktop/access','admin'),env)).status,401);
 assert.equal((await handler(desktop('forged'),env)).status,401);
 let response=await handler(desktop('user'),env),access=await response.json();
 assert.equal(response.status,200);assert.equal(access.active,false);assert.equal(access.leaseSeconds,0);assert.equal(access.email,member.email);
 await changeAccess(env,admin,{uid:member.uid,action:'grant'});
 access=await (await handler(desktop('user'),env)).json();assert.equal(access.active,true);assert(access.leaseSeconds<=90);
 await env.MEMBERS_KV.put('access:member',JSON.stringify({enabled:true,expiresAt:Date.now()+2000}));
 access=await (await handler(desktop('user'),env)).json();assert(access.leaseSeconds<=2);
 await changeAccess(env,admin,{uid:member.uid,action:'suspend'});
 access=await (await handler(desktop('user'),env)).json();assert.equal(access.active,false);assert.equal(access.leaseSeconds,0);
 assert.equal((await handler(new Request(origin+'/api/desktop/access',{method:'POST',headers:{Authorization:'Bearer admin'}}),env)).status,405);
 const unavailable=createHandler({verifyIdentity:identity,checkMembership:async()=>{throw Error('unavailable');}});
 assert.equal((await unavailable(desktop('user'),env)).status,503);
});
test('Existing accounts keep their prior access; only configured UID is administrator',async()=>{
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
test('Members can browse the catalog; approval still gates game assets and signed LIVE links',async()=>{
 const env=environment();await registerUser(env,member);
 for(const path of ['/','/index.html','/portal.js','/games.json','/gift-editor.js','/gift-layout.js'])assert.equal((await handler(req(path,'user'),env)).status,200);
 for(const path of ['/games/boon-live/','/games/boon-live/game.js','/games/bbq-live/','/games/garden-live/','/games/christmas-live/','/christmas-scene.js','/mini-live.js','/mini-live.css','/gift-library/catalog.json'])assert.equal((await handler(req(path,'user'),env)).status,402);
 assert.equal((await handler(req('/membership','user'),env)).status,200);
 const body={url:origin+'/games/boon-live/?overlay=1'};
 assert.equal((await handler(req('/api/overlay','user','POST',body),env)).status,402);
 await changeAccess(env,admin,{uid:'member',action:'grant'});
 assert.equal((await handler(req('/','user'),env)).status,200);
 const result=await handler(req('/api/overlay','user','POST',body),env);assert.equal(result.status,200);const url=(await result.json()).url;
 assert.equal((await handler(new Request(url),env)).status,200);
 for(const game of ['bbq-live','garden-live','christmas-live']){const minted=await handler(req('/api/overlay','user','POST',{url:origin+'/games/'+game+'/?overlay=1'}),env);assert.equal(minted.status,200);const screen=await handler(new Request((await minted.json()).url),env);const cookie=screen.headers.get('Set-Cookie').split(';')[0];assert.equal((await handler(new Request(origin+'/mini-live.js',{headers:{Cookie:cookie}}),env)).status,200);if(game==='christmas-live')assert.equal((await handler(new Request(origin+'/christmas-scene.js',{headers:{Cookie:cookie}}),env)).status,200);}
 await changeAccess(env,admin,{uid:'member',action:'suspend'});assert.equal((await handler(new Request(url),env)).status,402);
});
test('Verified session registers profile without trusting posted user identity',async()=>{
 const env=environment();env.data.delete('user:member');const response=await handler(new Request(origin+'/api/session',{method:'POST',headers:{Origin:origin,Authorization:'Bearer user'},body:JSON.stringify({uid:'owner',email:'forged@example.invalid'})}),env);
 assert.equal(response.status,200);assert.equal((await env.MEMBERS_KV.get('user:member','json')).email,member.email);assert.equal(await env.MEMBERS_KV.get('user:owner'),null);
});


test('A new account gets one 24-hour trial; login and email changes cannot restart it',async()=>{
 const env=environment(),fresh={uid:'new-user',email:'new@example.invalid'},before=Date.now();await registerUser(env,fresh);
 const profile=await env.MEMBERS_KV.get('user:new-user','json');assert.equal(profile.trialExpiresAt-profile.trialStartedAt,86400000);assert(profile.trialStartedAt>=before);assert.equal((await memberAccess(env,fresh)).status,'trial');
 await registerUser(env,fresh);await registerUser(env,{...fresh,email:'changed@example.invalid'});assert.equal((await memberAccess(env,fresh)).expiresAt,profile.trialExpiresAt);
 await env.MEMBERS_KV.put('user:new-user',JSON.stringify({...profile,trialExpiresAt:Date.now()-1}));await registerUser(env,fresh);const expired=await memberAccess(env,fresh);assert.equal(expired.status,'trial_expired');assert.equal(expired.active,false);
});
test('Administrator suspension and paid expiry override an unused trial',async()=>{
 const env=environment(),fresh={uid:'new-user',email:'new@example.invalid'};await registerUser(env,fresh);await changeAccess(env,admin,{uid:fresh.uid,action:'suspend'});assert.equal((await memberAccess(env,fresh)).status,'suspended');
 await changeAccess(env,admin,{uid:fresh.uid,action:'grant'});assert.equal((await memberAccess(env,fresh)).status,'approved');await env.MEMBERS_KV.put('access:new-user',JSON.stringify({enabled:true,expiresAt:1}));assert.equal((await memberAccess(env,fresh)).active,false);
});
test('Trial accounts can open games and mint links only until their trial ends',async()=>{
 const env=environment();env.data.delete('user:member');await registerUser(env,member);assert.equal((await handler(req('/games/bbq-live/','user'),env)).status,200);
 const result=await handler(req('/api/overlay','user','POST',{url:origin+'/games/bbq-live/?overlay=1'}),env);assert.equal(result.status,200);const grant=await result.json(),profile=await env.MEMBERS_KV.get('user:member','json');assert(Date.parse(grant.expiresAt)<=profile.trialExpiresAt);assert(Date.parse(grant.expiresAt)>Date.now()+23*3600000);
 await env.MEMBERS_KV.put('user:member',JSON.stringify({...profile,trialExpiresAt:1}));assert.equal((await handler(req('/games/bbq-live/','user'),env)).status,402);assert.equal((await handler(new Request(grant.url),env)).status,402);
});
