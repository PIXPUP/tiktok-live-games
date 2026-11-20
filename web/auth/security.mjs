import {createRemoteJWKSet,jwtVerify,SignJWT} from 'jose';
import config from '../firebase-config.json' with {type:'json'};
export const SESSION_COOKIE='__Host-live-session';
export const GAME_KEYS=new Set(['boon-live','ganesha-live','curry-shop-3d','alms-live','ramwong-live','bbq-live','garden-live']);
const remoteKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyFirebase(token,projectId=config.projectId,keys=remoteKeys){
 if(typeof token!=='string'||token.length>8192)throw Error('Invalid session');
 const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],issuer:'https://securetoken.google.com/'+projectId,audience:projectId,clockTolerance:30});
 const now=Math.floor(Date.now()/1000);
 if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||!Number.isFinite(payload.auth_time)||payload.auth_time>now+30||!Number.isFinite(payload.iat)||payload.iat>now+30||!payload.exp||payload.firebase?.sign_in_provider==='anonymous')throw Error('Invalid Firebase user');
 return {uid:payload.sub,email:typeof payload.email==='string'?payload.email:'',exp:payload.exp};
}
export function cookieValue(request,name){for(const part of (request.headers.get('Cookie')||'').split(';')){const index=part.indexOf('=');if(index>0&&part.slice(0,index).trim()===name)return part.slice(index+1).trim();}return '';}
export function safeNext(value){try{if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')||/[\r\n]/.test(value))return '/';const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'?u.pathname+u.search+u.hash:'/';}catch{return '/';}}
export function overlayCookie(game){return '__Host-live-overlay-'+game;}
function secretKey(env){if(typeof env.OVERLAY_SIGNING_KEY!=='string'||env.OVERLAY_SIGNING_KEY.length<32)throw Error('Overlay signing unavailable');return new TextEncoder().encode(env.OVERLAY_SIGNING_KEY);}
export function canonicalTarget(url){const u=new URL(url);u.searchParams.delete('access');u.searchParams.sort();return u.pathname+u.search;}
export async function targetHash(target){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(target)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function mintOverlay(env,origin,uid,game,target,now=Math.floor(Date.now()/1000)){
 const expires=now+7*86400;
 const token=await new SignJWT({kind:'overlay',game,targetHash:await targetHash(target)}).setProtectedHeader({alg:'HS256'}).setSubject(uid).setIssuer(origin).setAudience('live-overlay').setIssuedAt(now).setExpirationTime(expires).setJti(crypto.randomUUID()).sign(secretKey(env));
 return {token,expires};
}
export async function verifyOverlay(token,env,origin,game,target=null){
 if(!token||token.length>2048)throw Error('Overlay access required');
 const {payload}=await jwtVerify(token,secretKey(env),{algorithms:['HS256'],issuer:origin,audience:'live-overlay'});
 if(payload.kind!=='overlay'||!GAME_KEYS.has(payload.game)||(game&&payload.game!==game)||typeof payload.sub!=='string'||!payload.sub)throw Error('Wrong overlay scope');
 if(target!==null&&payload.targetHash!==await targetHash(target))throw Error('Overlay target was changed');
 return payload;
}
export function parseOverlayTarget(input,origin){
 if(typeof input!=='string'||input.length>6000)throw Error('Invalid game URL');
 const url=new URL(input,origin),match=url.pathname.match(/^\/games\/([^/]+)\/(?:index\.html)?$/);
 if(url.origin!==origin||url.username||url.password||!match||!GAME_KEYS.has(match[1]))throw Error('Choose a game on this website');
 const backend=url.searchParams.get('backend');
 if(backend){const b=new URL(backend);if(b.protocol!=='https:'||!/^[a-z0-9-]+\.trycloudflare\.com$/.test(b.hostname)||b.host!==b.hostname||b.username||b.password||b.pathname!=='/'||b.search||b.hash)throw Error('Invalid game server');}
 for(const key of [...url.searchParams.keys()])if(!['overlay','transport','lite','backend','layout'].includes(key))url.searchParams.delete(key);
 url.searchParams.set('overlay','1');url.searchParams.set('transport','poll');url.hash='';
 return {url,game:match[1]};
}
