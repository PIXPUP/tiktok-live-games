import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {verifyFirebase,mintOverlay,verifyOverlay,canonicalTarget,parseOverlayTarget,safeNext,SESSION_COOKIE,overlayCookie} from './security.mjs';
import {createHandler} from './worker.mjs';
const origin='https://pixpup-live-games.pages.dev',project='tiktoklive-93333';
const env={OVERLAY_SIGNING_KEY:'local-test-fixture-only-key-0123456789abcdef',ASSETS:{fetch:async req=>new Response('ASSET '+new URL(req.url).pathname,{headers:{'Content-Type':'text/html','Cache-Control':'public,max-age=86400'}})}};
const now=()=>Math.floor(Date.now()/1000);
const identity=async token=>{if(token!=='firebase-id-good')throw Error('invalid');return {uid:'member-one',email:'member@example.invalid',exp:now()+3600};};
const handler=createHandler({verifyIdentity:identity});
const request=(path,init={})=>new Request(origin+path,init);
test('Firebase tokens require real signature, expected issuer, audience and non-anonymous user',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='qa-key';const keys=createLocalJWKSet({keys:[jwk]});
 const sign=async changes=>new SignJWT({auth_time:now(),firebase:{sign_in_provider:'password'},...changes}).setProtectedHeader({alg:'RS256',kid:'qa-key'}).setSubject('member-one').setIssuedAt().setIssuer('https://securetoken.google.com/'+project).setAudience(project).setExpirationTime('1h').sign(privateKey);
 const token=await sign({});assert.equal((await verifyFirebase(token,project,keys)).uid,'member-one');
 await assert.rejects(verifyFirebase(token+'bad',project,keys));await assert.rejects(verifyFirebase(token,'different-project',keys));await assert.rejects(verifyFirebase(await sign({auth_time:now()+1000}),project,keys));await assert.rejects(verifyFirebase(await sign({firebase:{sign_in_provider:'anonymous'}}),project,keys));
 const expired=await new SignJWT({auth_time:now()-4000}).setProtectedHeader({alg:'RS256',kid:'qa-key'}).setSubject('member-one').setIssuedAt(now()-4000).setIssuer('https://securetoken.google.com/'+project).setAudience(project).setExpirationTime(now()-100).sign(privateKey);await assert.rejects(verifyFirebase(expired,project,keys));
});
test('Anonymous visitors cannot fetch portal, direct game or catalog',async()=>{
 for(const path of ['/','/index.html','/games/boon-live/','/games/boon-live/index.html']){const r=await handler(request(path),env);assert.equal(r.status,302);assert.match(r.headers.get('Location'),/^\/login\?next=/);}
 for(const path of ['/games.json','/gift-library/catalog.json','/portal.js'])assert.equal((await handler(request(path),env)).status,401);
 const login=await handler(request('/login'),env);assert.equal(login.status,200);assert.match(await login.text(),/ASSET \/login/);
});
test('Login checks origin and token before setting an HttpOnly Secure session',async()=>{
 const headers={Origin:origin,Authorization:'Bearer firebase-id-good'};
 const r=await handler(request('/api/session',{method:'POST',headers}),env);assert.equal(r.status,200);const set=r.headers.get('Set-Cookie');assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Lax/);
 assert.equal((await handler(request('/api/session',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'}}),env)).status,403);
 assert.equal((await handler(request('/api/session',{method:'POST',headers:{Origin:origin,Authorization:'Bearer forged'}}),env)).status,401);
 const member=await handler(request('/',{headers:{Cookie:SESSION_COOKIE+'=firebase-id-good'}}),env);assert.equal(member.status,200);assert.match(member.headers.get('Cache-Control'),/no-store/);
 const logout=await handler(request('/api/session',{method:'DELETE',headers:{Origin:origin}}),env);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});
test('Only signed-in owners can generate a read-only game grant',async()=>{
 const target='/games/boon-live/?overlay=1&transport=poll&backend=https%3A%2F%2Fexample.trycloudflare.com';
 const body=JSON.stringify({url:origin+target});
 assert.equal((await handler(request('/api/overlay',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body}),env)).status,401);
 const minted=await handler(request('/api/overlay',{method:'POST',headers:{Origin:origin,Cookie:SESSION_COOKIE+'=firebase-id-good','Content-Type':'application/json'},body}),env);assert.equal(minted.status,200);const data=await minted.json();assert.equal(data.readOnly,true);assert.equal(new URL(data.url).searchParams.has('access'),true);assert.equal(data.url.includes('firebase-id-good'),false);
 const display=await handler(new Request(data.url),env);assert.equal(display.status,200);assert.match(display.headers.get('Set-Cookie'),/live-overlay-boon-live/);
 const grantCookie=display.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await handler(request('/games/boon-live/game.js',{headers:{Cookie:grantCookie}}),env)).status,200);
 assert.equal((await handler(request('/gift-layout.js',{headers:{Cookie:grantCookie}}),env)).status,200);
 assert.equal((await handler(request('/gift-library/catalog.json',{headers:{Cookie:grantCookie}}),env)).status,200);
 assert.equal((await handler(request('/',{headers:{Cookie:grantCookie}}),env)).status,302);
 assert.equal((await handler(request('/api/overlay',{method:'POST',headers:{Origin:origin,Cookie:grantCookie},body}),env)).status,401);
 assert.equal((await handler(request('/games/ganesha-live/',{headers:{Cookie:grantCookie}}),env)).status,302);
 const altered=new URL(data.url);altered.searchParams.set('backend','https://other.trycloudflare.com');assert.equal((await handler(new Request(altered),env)).status,302);
});
test('Overlay grants expire, cannot be forged, and cannot authorize a changed game or target',async()=>{
 const target='/games/boon-live/?overlay=1',grant=await mintOverlay(env,origin,'member-one','boon-live',target);
 assert.equal((await verifyOverlay(grant.token,env,origin,'boon-live',target)).sub,'member-one');
 await assert.rejects(verifyOverlay(grant.token+'bad',env,origin,'boon-live',target));await assert.rejects(verifyOverlay(grant.token,env,origin,'alms-live',target));await assert.rejects(verifyOverlay(grant.token,env,origin,'boon-live',target+'&lite=1'));
 const expired=await mintOverlay(env,origin,'member-one','boon-live',target,now()-8*86400);await assert.rejects(verifyOverlay(expired.token,env,origin,'boon-live',target));
});
test('Redirects and overlay targets cannot escape the website',()=>{
 for(const value of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/\r\nLocation:evil'])assert.equal(safeNext(value),'/');
 assert.equal(safeNext('/?game=boon-live'),'/?game=boon-live');
 for(const value of ['https://evil.invalid/games/boon-live/','/api/session','/games/fake/','/games/boon-live/?backend=http://127.0.0.1','/games/boon-live/?backend=https://example.trycloudflare.com.evil.invalid'])assert.throws(()=>parseOverlayTarget(value,origin));
});

test('Cloudflare pretty HTML redirects never loop on the login page',async()=>{
 const pretty={...env,ASSETS:{fetch:async req=>new URL(req.url).pathname==='/login.html'?new Response(null,{status:301,headers:{Location:'/login'}}):new Response('login form')}};
 for(const entry of ['/login','/login/','/login.html']){let r=await handler(request(entry),pretty);for(let i=0;i<3&&r.status>=300&&r.status<400;i++)r=await handler(request(r.headers.get('Location')),pretty);assert.equal(r.status,200);}
});
