import test from 'node:test';
import assert from 'node:assert/strict';
import {membership,entitlement,checkout,webhook} from './billing.mjs';
import {createHandler} from './worker.mjs';
import {SESSION_COOKIE,mintOverlay} from './security.mjs';
const origin='https://pixpup-live-games.pages.dev',uid='fixture-user';
function environment(){const values=new Map();return {STRIPE_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',OVERLAY_SIGNING_KEY:'fixture-only-overlay-secret-0123456789',BILLING_KV:{get:async(k,t)=>{const s=values.get(k);return s&&t==='json'?JSON.parse(s):s||null;},put:async(k,v)=>{values.set(k,v);},delete:async k=>{values.delete(k);}},ASSETS:{fetch:async()=>new Response('asset')}};}
const sub=()=>({id:'sub_fixture',customer:'cus_fixture',metadata:{firebase_uid:uid},status:'active',items:{data:[{quantity:1,current_period_end:Math.floor(Date.now()/1000)+86400,price:{id:'price_fixture',currency:'thb',unit_amount:29900,recurring:{interval:'month',interval_count:1}}}]}});
const identity=async token=>{if(token!=='good')throw Error('bad');return {uid,email:'fixture@example.invalid'};};
const req=(path,init={})=>new Request(origin+path,init);
const headers={Cookie:SESSION_COOKIE+'=good',Origin:origin};
test('Only current matching THB 299 monthly subscriptions grant all-game access',()=>{
 const env=environment();assert.equal(entitlement(sub(),env),true);
 for(const status of ['past_due','unpaid','incomplete','incomplete_expired','canceled','paused'])assert.equal(entitlement({...sub(),status},env),false);
 assert.equal(entitlement({...sub(),pause_collection:{behavior:'void'}},env),false);
 for(const change of [{id:'other'},{currency:'usd'},{unit_amount:9900},{recurring:{interval:'year'}}]){const s=sub();Object.assign(s.items.data[0].price,change);assert.equal(entitlement(s,env),false);}
 const expired=sub();expired.items.data[0].current_period_end=1;assert.equal(entitlement(expired,env),false);
});
test('Unpaid users cannot bypass billing by direct paths or old signed LIVE grants',async()=>{
 const env=environment(),handler=createHandler({verifyIdentity:identity});
 assert.equal((await handler(req('/api/billing/status'),env)).status,401);
 assert.equal((await handler(req('/api/billing/checkout',{method:'POST',headers:{Cookie:headers.Cookie,Origin:'https://evil.invalid'}}),env)).status,403);
 assert.equal((await handler(req('/',{headers}),env)).headers.get('Location'),'/billing');
 for(const p of ['/games/boon-live/','/games/boon-live/game.js','/gift-library/catalog.json'])assert.equal((await handler(req(p,{headers}),env)).status,402);
 assert.equal((await handler(req('/billing',{headers}),env)).status,200);
 assert.equal((await handler(req('/api/overlay',{method:'POST',headers,body:JSON.stringify({url:origin+'/games/boon-live/'})}),env)).status,402);
 const grant=await mintOverlay(env,origin,uid,'boon-live','/games/boon-live/?overlay=1');
 assert.equal((await handler(req('/games/boon-live/?overlay=1&access='+grant.token),env)).status,402);
 const status=await(await handler(req('/api/billing/status',{headers}),env)).json();assert.equal(status.active,false);
});
test('Subscription ownership, live Stripe status and cancellation are authoritative',async()=>{
 const env=environment();await env.BILLING_KV.put('customer:'+uid,'cus_fixture');
 const old=globalThis.fetch;let current=sub();
 globalThis.fetch=async()=>Response.json({data:[current],has_more:false});
 try{
  assert.equal((await membership(env,{uid},{fresh:true})).active,true);
  current={...sub(),metadata:{firebase_uid:'another-user'}};assert.equal((await membership(env,{uid},{fresh:true})).active,false);
  current={...sub(),status:'canceled'};assert.equal((await membership(env,{uid},{fresh:true})).active,false);
  current={...sub(),cancel_at_period_end:false,cancel_at:Math.floor(Date.now()/1000)+86400};const state=await membership(env,{uid},{fresh:true});assert.equal(state.active,true);assert.equal(state.cancelAtPeriodEnd,true);
  globalThis.fetch=async()=>{throw Error('outage');};await assert.rejects(membership(env,{uid},{fresh:true}));
 }finally{globalThis.fetch=old;}
});
test('Checkout fixes amount and UID on server, reuses open sessions, refuses wrong prices',async()=>{
 const env=environment();await env.BILLING_KV.put('customer:'+uid,'cus_fixture');const old=globalThis.fetch;let calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);if(url.includes('/prices/'))return Response.json({...sub().items.data[0].price,active:true,tax_behavior:'inclusive'});if(url.includes('/subscriptions?'))return Response.json({data:[],has_more:false});if(url.includes('/checkout/sessions?'))return Response.json({data:[]});return Response.json({url:'https://checkout.stripe.com/c/pay/test'});};
 try{
  assert.match((await checkout(env,{uid,email:'fixture@example.invalid'},origin)).url,/checkout.stripe.com/);
  const params=calls.at(-1)[1].body;assert.equal(params.get('line_items[0][price]'),'price_fixture');assert.equal(params.get('subscription_data[metadata][firebase_uid]'),uid);assert.equal(params.get('mode'),'subscription');assert.equal(params.get('success_url'),origin+'/billing?checkout=success');
  globalThis.fetch=async url=>Response.json(url.includes('/prices/')?{...sub().items.data[0].price,active:true,unit_amount:999}:{});await assert.rejects(checkout(env,{uid},origin));
 }finally{globalThis.fetch=old;}
});
test('Webhook checks raw-body signature, timestamp and mode; replay only invalidates cache',async()=>{
 const env=environment();await env.BILLING_KV.put('status:cus_fixture','old-state');
 const raw=JSON.stringify({id:'evt_fixture',livemode:false,type:'customer.subscription.deleted',data:{object:{customer:'cus_fixture'}}});
 async function signed(body=raw,time=Math.floor(Date.now()/1000)){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(time+'.'+raw)));const sig=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return req('/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${time},v1=${sig}`},body});
 }
 assert.equal((await webhook(await signed(raw+' '),env)).status,400);
 assert.equal((await webhook(await signed(raw,1),env)).status,400);
 assert.equal((await webhook(await signed(),env)).status,200);assert.equal(await env.BILLING_KV.get('status:cus_fixture'),null);
 assert.equal((await webhook(await signed(),env)).status,200);
 assert.equal((await webhook(await signed(),{...env,STRIPE_SECRET_KEY:'sk_live_fixture'})).status,400);
});
