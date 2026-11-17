import json,os,tomllib,urllib.request
from pathlib import Path
ACCOUNT='c7f29df00b2ca309f3fc1a9b0bf3f24f';PROJECT='pixpup-live-games'

def configure(admin_uid,preview_test_admin=None):
 if not admin_uid or ',' in admin_uid or len(admin_uid)>128:raise ValueError('One explicit administrator UID required')
 token=tomllib.loads((Path(os.environ['APPDATA'])/'xdg.config/.wrangler/config/default.toml').read_text())['oauth_token']
 base='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/'
 def api(path,data=None,method=None):
  req=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'))
  with urllib.request.urlopen(req,timeout=30) as response:result=json.load(response)
  if not result.get('success'):raise RuntimeError('Cloudflare operation failed')
  return result['result']
 project=api('pages/projects/'+PROJECT);namespaces=api('storage/kv/namespaces?per_page=1000');updates={}
 for environment in ['production','preview']:
  old=project['deployment_configs'].get(environment,{})
  # Cloudflare PATCH merges env_vars; null deletes only the named obsolete variable.
  values={k:None for k in (old.get('env_vars') or {}) if k.startswith('STRIPE_')}
  values['ADMIN_UIDS']={'type':'plain_text','value':admin_uid+(','+preview_test_admin if environment=='preview' and preview_test_admin else '')}
  values['MANUAL_ACCESS_ENABLED']={'type':'plain_text','value':'true'}
  title='live-games-members-'+environment;namespace=next((n for n in namespaces if n['title']==title),None)
  if not namespace:namespace=api('storage/kv/namespaces',{'title':title})
  bindings={k:v for k,v in (old.get('kv_namespaces') or {}).items() if k!='BILLING_KV'};bindings['MEMBERS_KV']={'namespace_id':namespace['id']}
  updates[environment]={'env_vars':values,'kv_namespaces':bindings}
 api('pages/projects/'+PROJECT,{'deployment_configs':updates},'PATCH')
 print(json.dumps({'manualAccessConfigured':True,'environments':list(updates),'stripeRemoved':True,'previewTestAdmin':bool(preview_test_admin)}))
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--admin-uid',required=True);args=parser.parse_args();configure(args.admin_uid)
