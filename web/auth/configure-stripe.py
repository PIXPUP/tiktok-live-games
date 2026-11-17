"""Configure TEST billing on Cloudflare preview. Never prints or saves Stripe secrets."""
import json,os,tomllib,urllib.request,urllib.parse,hashlib,sys
from pathlib import Path
ACCOUNT='c7f29df00b2ca309f3fc1a9b0bf3f24f'
PROJECT='pixpup-live-games'
ORIGIN='https://stripe-subscription-preview.pixpup-live-games.pages.dev'
STRIPE_VERSION='2026-10-28.endive'

def main():
 live='--live' in sys.argv
 environment='production' if live else 'preview'
 mode='live' if live else 'test'
 origin='https://pixpup-live-games.pages.dev' if live else ORIGIN
 config=tomllib.loads((Path.home()/'.config/stripe/config.toml').read_text())['default']
 stripe_key=config['test_mode_api_key']
 if live:
  import tkinter as tk
  from tkinter import simpledialog
  root=tk.Tk();root.withdraw();root.attributes('-topmost',True)
  stripe_key=simpledialog.askstring('เชื่อม Stripe รับเงินจริง','ใส่ Secret key โหมดจริง (sk_live_) จาก Stripe\nคีย์จะเก็บใน Cloudflare Secrets เท่านั้น ไม่บันทึกไฟล์หรือแชต\nแพ็กเกจ 299 บาท/เดือน ใช้ทุกเกม',show='*',parent=root);root.destroy()
  if not stripe_key:print('Setup canceled; nothing changed');return
 if not stripe_key.startswith(('sk_live_',) if live else ('sk_test_','rk_test_')):raise RuntimeError('Wrong Stripe key mode')
 cf=tomllib.loads((Path(os.environ['APPDATA'])/'xdg.config/.wrangler/config/default.toml').read_text())['oauth_token']
 def api(base,path,data=None,key=None,idem=None,method=None):
  stripe=base=='https://api.stripe.com/v1/'
  headers={'Authorization':'Bearer '+(key or (stripe_key if stripe else cf))}
  if stripe:headers['Stripe-Version']=STRIPE_VERSION
  if idem:headers['Idempotency-Key']=idem
  if data is not None:headers['Content-Type']='application/x-www-form-urlencoded' if stripe else 'application/json'
  body=(urllib.parse.urlencode(data).encode() if stripe else json.dumps(data).encode()) if data is not None else None
  req=urllib.request.Request(base+path,data=body,headers=headers,method=method or ('POST' if body else 'GET'))
  try:
   with urllib.request.urlopen(req,timeout=40) as r:result=json.load(r)
  except urllib.error.HTTPError as e:raise RuntimeError(('Stripe' if stripe else 'Cloudflare')+' request failed: '+str(e.code)+' at '+path.split('?')[0]) from None
  if not stripe:
   if not result.get('success'):raise RuntimeError('Cloudflare operation failed')
   return result['result']
  return result
 def st(path,data=None,idem=None):return api('https://api.stripe.com/v1/',path,data,idem=idem)
 cfbase='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/'
 def cloud(path,data=None,method=None):return api(cfbase,path,data,method=method)
 if live:
  account=st('account')
  if not account.get('charges_enabled'):raise RuntimeError('Stripe account is not enabled to accept live payments; finish activation in Stripe first')
 project=cloud('pages/projects/'+PROJECT)
 preview=project['deployment_configs'].get(environment,{})
 values=preview.get('env_vars') or {}
 # Existing configured webhook secret must be preserved on reruns (Stripe only returns it at creation).
 existing=values.get('STRIPE_PRICE_ID',{}).get('value')
 if existing and 'STRIPE_WEBHOOK_SECRET' in values:
  price=st('prices/'+existing);assert price['unit_amount']==29900 and price['livemode']==live
 else:
  product=st('products',{'name':'Moo Heng LIVE Games - All Games','description':'All five LIVE games. THB 299 per month.','metadata[application]':'pixpup-live-games'},'live-games-'+mode+'-product-v1')
  price=st('prices',{'product':product['id'],'currency':'thb','unit_amount':'29900','recurring[interval]':'month','tax_behavior':'inclusive'},'live-games-'+mode+'-price-299-v1')
  endpoint=st('webhook_endpoints',{'url':origin+'/api/stripe/webhook','api_version':STRIPE_VERSION,'enabled_events[0]':'checkout.session.completed','enabled_events[1]':'customer.subscription.created','enabled_events[2]':'customer.subscription.updated','enabled_events[3]':'customer.subscription.deleted','enabled_events[4]':'invoice.paid','enabled_events[5]':'invoice.payment_failed'},'live-games-'+mode+'-webhook-v1')
  values['STRIPE_WEBHOOK_SECRET']={'type':'secret_text','value':endpoint['secret']}
  values['STRIPE_PRICE_ID']={'type':'plain_text','value':price['id']}
 configs=st('billing_portal/configurations?limit=100')
 portal=next((p for p in configs['data'] if p.get('metadata',{}).get('application')=='pixpup-live-games' and p.get('active')),None)
 if not portal:
  portal=st('billing_portal/configurations',{'business_profile[headline]':'Moo Heng LIVE Games','default_return_url':origin+'/billing','features[subscription_cancel][enabled]':'true','features[subscription_cancel][mode]':'at_period_end','features[payment_method_update][enabled]':'true','features[invoice_history][enabled]':'true','metadata[application]':'pixpup-live-games'},'live-games-'+mode+'-portal-v1')
 values['STRIPE_PORTAL_CONFIGURATION']={'type':'plain_text','value':portal['id']}
 namespaces=cloud('storage/kv/namespaces?per_page=1000')
 ns=next((n for n in namespaces if n['title']=='live-games-billing-'+mode),None)
 if not ns:ns=cloud('storage/kv/namespaces',{'title':'live-games-billing-'+mode})
 bindings=preview.get('kv_namespaces') or {};bindings['BILLING_KV']={'namespace_id':ns['id']}
 values['STRIPE_SECRET_KEY']={'type':'secret_text','value':stripe_key}
 values['STRIPE_BILLING_ENABLED']={'type':'plain_text','value':'true'}
 cloud('pages/projects/'+PROJECT,{'deployment_configs':{environment:{'env_vars':values,'kv_namespaces':bindings}}},'PATCH')
 print(json.dumps({'billingConfigured':True,'mode':mode,'price':price['id'],'amountTHB':299,'interval':'month','site':origin,'productionChanged':live}))
if __name__=='__main__':
 try:main()
 except Exception as error:
  # Never dump credentials or HTTP response bodies.
  print('Setup failed: '+str(error));sys.exit(1)
