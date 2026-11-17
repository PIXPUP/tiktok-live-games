const VERSION='2026-10-28.endive';
const encoder=new TextEncoder();
export const billingEnabled=env=>env.STRIPE_BILLING_ENABLED==='true';
export const billingReady=env=>Boolean(env.STRIPE_SECRET_KEY&&env.STRIPE_PRICE_ID&&env.BILLING_KV&&env.STRIPE_WEBHOOK_SECRET);
export async function stripe(env,path,params=null,idempotency=null){
 const headers={Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':VERSION};
 if(params)headers['Content-Type']='application/x-www-form-urlencoded';
 if(idempotency)headers['Idempotency-Key']=idempotency;
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers,body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(12000)});
 const data=await response.json();if(!response.ok){console.error('Stripe API failure',response.status,data.error?.code||'',data.error?.param||'');throw Error('Stripe service unavailable');}return data;
}
function key(uid){return 'customer:'+encodeURIComponent(uid);}
const stateKey=customer=>'status:'+customer;
export async function customerFor(env,user,create=false){
 const saved=await env.BILLING_KV.get(key(user.uid));if(saved)return saved;
 if(!create)return null;
 // Deterministic key prevents parallel requests creating multiple customers.
 const customer=await stripe(env,'customers',{'email':user.email,'metadata[firebase_uid]':user.uid},'live-customer-v1-'+user.uid);
 await env.BILLING_KV.put(key(user.uid),customer.id);return customer.id;
}
export function entitlement(sub,env,now=Math.floor(Date.now()/1000)){
 const item=sub.items?.data?.find(i=>i.price?.id===env.STRIPE_PRICE_ID&&i.price?.currency==='thb'&&i.price?.unit_amount===29900&&i.price?.recurring?.interval==='month'&&(i.price?.recurring?.interval_count||1)===1&&i.quantity===1);
 const end=item?.current_period_end||sub.current_period_end||0;
 return ['active','trialing'].includes(sub.status)&&!sub.pause_collection&&Boolean(item)&&end>now;
}
export async function membership(env,user,{fresh=false}={}){
 if(!billingEnabled(env))return {active:true,enforced:false};
 if(!billingReady(env))return {active:false,enforced:true,configured:false,status:'unavailable'};
 const customer=await customerFor(env,user);if(!customer)return {active:false,enforced:true,configured:true,status:'none'};
 if(!fresh){const cached=await env.BILLING_KV.get(stateKey(customer),'json');if(cached&&cached.checkedAt>Date.now()-60000&&(!cached.active||cached.periodEnd*1000>Date.now()))return cached;}
 const list=await stripe(env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100');
 if(list.has_more)throw Error('Subscription list requires review');
 const all=list.data.filter(s=>s.customer===customer&&s.metadata?.firebase_uid===user.uid);
 const sub=all.find(s=>entitlement(s,env))||all.find(s=>!['canceled','incomplete_expired'].includes(s.status))||all[0];
 const item=sub?.items?.data?.find(i=>i.price?.id===env.STRIPE_PRICE_ID);
 const data={active:Boolean(sub&&entitlement(sub,env)),enforced:true,configured:true,status:sub?.status||'none',periodEnd:item?.current_period_end||sub?.current_period_end||null,cancelAtPeriodEnd:Boolean(sub?.cancel_at_period_end||(sub?.cancel_at&&sub.cancel_at>=Date.now()/1000)),hasSubscription:Boolean(sub&&!['canceled','incomplete_expired'].includes(sub.status)),checkedAt:Date.now()};
 await env.BILLING_KV.put(stateKey(customer),JSON.stringify(data),{expirationTtl:60});return data;
}
export async function checkout(env,user,origin){
 if(!billingReady(env))throw Error('Billing is not configured');
 const price=await stripe(env,'prices/'+encodeURIComponent(env.STRIPE_PRICE_ID));
 if(!price.active||price.currency!=='thb'||price.unit_amount!==29900||price.recurring?.interval!=='month'||(price.recurring?.interval_count||1)!==1||price.tax_behavior==='exclusive')throw Error('Expected a tax-inclusive THB 299 monthly price');
 const customer=await customerFor(env,user,true),state=await membership({...env,STRIPE_BILLING_ENABLED:'true'},user,{fresh:true});
 if(state.hasSubscription)return portal(env,user,origin);
 const sessions=await stripe(env,'checkout/sessions?customer='+encodeURIComponent(customer)+'&status=open&limit=100');
 const existing=sessions.data.find(s=>s.mode==='subscription'&&s.metadata?.firebase_uid===user.uid&&s.metadata?.price_id===env.STRIPE_PRICE_ID);
 if(existing)return {url:existing.url};
 const session=await stripe(env,'checkout/sessions',{
  mode:'subscription',customer,'line_items[0][price]':env.STRIPE_PRICE_ID,'line_items[0][quantity]':'1',
  'subscription_data[metadata][firebase_uid]':user.uid,'metadata[firebase_uid]':user.uid,'metadata[price_id]':env.STRIPE_PRICE_ID,
  client_reference_id:user.uid,success_url:origin+'/billing?checkout=success',cancel_url:origin+'/billing?checkout=cancel',locale:'th',
  expires_at:String((Math.floor(Date.now()/1800000)+2)*1800)
 },'live-checkout-v2-'+user.uid+'-'+Math.floor(Date.now()/1800000));
 return {url:session.url};
}
export async function portal(env,user,origin){
 const customer=await customerFor(env,user);if(!customer)throw Error('No customer');
 return {url:(await stripe(env,'billing_portal/sessions',{customer,return_url:origin+'/billing',...(env.STRIPE_PORTAL_CONFIGURATION?{configuration:env.STRIPE_PORTAL_CONFIGURATION}:{})})).url};
}
export async function webhook(request,env){
 if(!env.STRIPE_WEBHOOK_SECRET||!env.BILLING_KV)return new Response('Unavailable',{status:503});
 if(Number(request.headers.get('Content-Length'))>262144)return new Response('Too large',{status:413});
 let raw='';const reader=request.body?.getReader();let size=0;const chunks=[];
 if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}raw=new TextDecoder().decode(bytes);
 const signature=request.headers.get('Stripe-Signature')||'',parts=signature.split(',').map(p=>p.split('='));
 const timestamp=parts.find(p=>p[0]==='t')?.[1],values=parts.filter(p=>p[0]==='v1').map(p=>p[1]);
 if(!/^\d+$/.test(timestamp||'')||Math.abs(Date.now()/1000-Number(timestamp))>300)return new Response('Invalid signature',{status:400});
 const secret=await crypto.subtle.importKey('raw',encoder.encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 let verified=false;
 for(const hex of values){if(!/^[a-f0-9]{64}$/.test(hex))continue;const bytes=Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));if(await crypto.subtle.verify('HMAC',secret,bytes,encoder.encode(timestamp+'.'+raw)))verified=true;}
 if(!verified)return new Response('Invalid signature',{status:400});
 let event;try{event=JSON.parse(raw);}catch{return new Response('Invalid body',{status:400});}
 if(event.livemode!==/^([sr]k)_live_/.test(env.STRIPE_SECRET_KEY||''))return new Response('Wrong mode',{status:400});
 const customer=event.data?.object?.customer;
 // Invalidate only: the next read gets current Stripe state, so duplicates and out-of-order events cannot restore old access.
 if(typeof customer==='string'&&/^cus_[A-Za-z0-9]+$/.test(customer))await env.BILLING_KV.delete(stateKey(customer));
 return new Response('ok');
}
