export const accessEnabled=env=>env.MANUAL_ACCESS_ENABLED==='true';
export function isAdmin(env,uid){return Boolean(uid)&&(env.ADMIN_UIDS||'').split(',').map(x=>x.trim()).includes(uid);}
const userKey=uid=>'user:'+encodeURIComponent(uid);
const accessKey=uid=>'access:'+encodeURIComponent(uid);
export async function registerUser(env,user){
 if(!env.MEMBERS_KV)return;
 const key=userKey(user.uid),existing=await env.MEMBERS_KV.get(key,'json');
 if(existing?.email===user.email)return;
 await env.MEMBERS_KV.put(key,JSON.stringify({uid:user.uid,email:user.email,registeredAt:existing?.registeredAt||new Date().toISOString()}));
}
export async function memberAccess(env,user){
 if(isAdmin(env,user.uid))return {active:true,admin:true,status:'admin',enforced:accessEnabled(env)};
 if(!accessEnabled(env))return {active:true,admin:false,status:'open',enforced:false};
 if(!env.MEMBERS_KV)return {active:false,admin:false,status:'unavailable',enforced:true};
 const record=await env.MEMBERS_KV.get(accessKey(user.uid),'json');
 const active=Boolean(record?.enabled&&Number.isFinite(record.expiresAt)&&record.expiresAt>Date.now());
 return {active,admin:false,status:active?'approved':record?.enabled?'expired':record?'suspended':'pending',expiresAt:record?.expiresAt||null,enforced:true};
}
export async function listUsers(env,cursor){
 if(!env.MEMBERS_KV)throw Error('Member store unavailable');
 const page=await env.MEMBERS_KV.list({prefix:'user:',limit:50,...(cursor?{cursor}:{})});
 const users=await Promise.all(page.keys.map(async key=>{const user=await env.MEMBERS_KV.get(key.name,'json');return user?{...user,...await memberAccess(env,user)}:null;}));
 return {users:users.filter(Boolean),cursor:page.list_complete?null:page.cursor};
}
export async function changeAccess(env,admin,input){
 if(!isAdmin(env,admin.uid))throw Error('Forbidden');
 const uid=input?.uid;if(typeof uid!=='string'||!uid||uid.length>128||!['grant','extend','suspend'].includes(input.action))throw Error('Invalid request');
 if(isAdmin(env,uid))throw Error('Cannot change administrator access');
 const user=await env.MEMBERS_KV.get(userKey(uid),'json');if(!user)throw Error('User not found');
 const now=Date.now(),previous=await env.MEMBERS_KV.get(accessKey(uid),'json');
 const record=input.action==='suspend'?{enabled:false,expiresAt:previous?.expiresAt||null}:{enabled:true,expiresAt:(input.action==='extend'?Math.max(now,previous?.expiresAt||0):now)+30*86400000};
 const next={...record,updatedAt:new Date(now).toISOString(),updatedBy:admin.uid};
 // Append-only unique audit record; no client-supplied role, admin UID or expiry is accepted.
 await env.MEMBERS_KV.put('audit:'+now+':'+crypto.randomUUID(),JSON.stringify({targetUid:uid,action:input.action,actorUid:admin.uid,before:previous||null,after:next}));
 await env.MEMBERS_KV.put(accessKey(uid),JSON.stringify(next));
 return {uid,active:record.enabled,admin:false,status:record.enabled?'approved':'suspended',expiresAt:record.expiresAt,enforced:true};
}
