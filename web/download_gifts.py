"""Download publicly listed TikTok gift icons, keeping provenance and a retry report."""
import concurrent.futures,datetime,hashlib,html,json,re,subprocess,time,threading
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'gift-library';CACHE=ROOT/'build/gift-sources'

def read_catalog():
 gifts={};by_image={};by_name={}
 old=json.loads((CACHE/'antiops.json').read_text(encoding='utf-8-sig'))
 for g in old:
  urls=g.get('image',{}).get('url_list',[])
  if not urls:continue
  item={'key':'id-'+str(g['id']),'id':str(g['id']),'name':str(g['name']),'coins':int(g['diamond_count']),'source':urls[0],'sources':['antiops']}
  gifts[item['key']]=item;by_image[urlsplit(urls[0]).path]=item;by_name[(item['name'].casefold(),item['coins'])]=item
 page=(CACHE/'streamtoearn.html').read_text(encoding='utf-8')
 for block in re.findall(r'<div class="gift"[^>]*>(.*?)</div>',page,re.S):
  image=re.search(r'<img\s+src="([^"]+)"',block);name=re.search(r'<p class="gift-name">(.*?)</p>',block,re.S);cost=re.search(r'<p class="gift-price">([\d,\s]+)',block)
  if not(image and name and cost):continue
  url=html.unescape(image[1]);n=html.unescape(re.sub('<[^>]+>','',name[1])).strip();coins=int(re.sub(r'\D','',cost[1]))
  found=by_image.get(urlsplit(url).path)
  if found:
   if 'streamtoearn' not in found['sources']:found['sources'].append('streamtoearn')
   found.setdefault('aliases',[])
   if n!=found['name'] and found['name'] not in found['aliases']:found['aliases'].append(found['name'])
   found['name']=n;found['coins']=coins
   # Keep the image used by the current catalog when names and costs match.
   found['source']=url
  else:
   key='image-'+hashlib.sha256(urlsplit(url).path.encode()).hexdigest()[:20]
   gifts[key]={'key':key,'id':None,'name':n,'coins':coins,'source':url,'sources':['streamtoearn']}
 aliases={'Rose':'กุหลาบ','Finger Heart':'มินิฮาร์ต','Rosa':'โรซ่า','Perfume':'น้ำหอม','Doughnut':'โดนัท','Paper Crane':'นกกระเรียน','Hand Heart':'หัวใจมือ','Galaxy':'กาแล็กซี','Lion':'สิงโต','TikTok Universe':'จักรวาลติ๊กต็อก','Heart Me':'หัวใจ','Ice Cream Cone':'ไอศกรีม','Heart':'หัวใจ','TikTok':'ติ๊กต็อก'}
 for g in gifts.values():
  if g['name'] in aliases and aliases[g['name']] not in g.setdefault('aliases',[]):g['aliases'].append(aliases[g['name']])
 return sorted(gifts.values(),key=lambda g:(g['coins'],g['name'].casefold(),g['key']))

_locks={}
_lock_guard=threading.Lock()

def download(gift):
 with _lock_guard: lock=_locks.setdefault(urlsplit(gift["source"]).path,threading.Lock())
 with lock:
  try:return download_one(gift)
  except (OSError,subprocess.TimeoutExpired):return gift,"file or download timeout"

def download_one(gift):
 url=gift['source'];host=urlsplit(url).hostname or ''
 if urlsplit(url).scheme!='https' or not host.endswith('.tiktokcdn.com'):return gift,'CDN host not allowlisted'
 digest=hashlib.sha256(urlsplit(url).path.encode()).hexdigest();folder=OUT/'icons';folder.mkdir(parents=True,exist_ok=True)
 dest=folder/(digest+'.webp');tmp=dest.with_suffix('.partial')
 def valid(path):
  if not path.exists() or not 100<=path.stat().st_size<=2_000_000:return False
  b=path.read_bytes();return b[:4]==b'RIFF' and b[8:12]==b'WEBP'
 if not valid(dest):
  p=subprocess.run(['curl.exe','--ipv4','--location','--fail','--silent','--show-error','--max-time','25','--retry','1','--max-filesize','2000000','--output',str(tmp),url],capture_output=True,timeout=65)
  if p.returncode or not valid(tmp):
   tmp.unlink(missing_ok=True);return gift,'download or WebP validation failed'
  tmp.replace(dest)
 gift['file']='icons/'+dest.name;gift['bytes']=dest.stat().st_size
 return gift,None

def main():
 OUT.mkdir(exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
 for name,url in [('antiops.json','https://raw.githubusercontent.com/antiops/tiktok-trending-data/main/live-gift-details.json'),('streamtoearn.html','https://streamtoearn.io/gifts')]:
  target=CACHE/name
  if not target.exists():subprocess.run(['curl.exe','--ipv4','--fail','--silent','--show-error','--max-time','45','--output',str(target),url],check=True)
 gifts=read_catalog();print('Catalog entries:',len(gifts),flush=True)
 complete=[];failed=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for i,(g,error) in enumerate(pool.map(download,gifts),1):
   (failed if error else complete).append(dict(g,error=error) if error else g)
   if i%100==0:print('Processed',i,'saved',len(complete),'failed',len(failed),flush=True)
 date=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (OUT/'catalog.json').write_text(json.dumps({'retrievedAt':date,'scope':'Public catalog snapshot; regional, seasonal and room-specific gifts may differ. IDs are null when not verified.','sources':['https://raw.githubusercontent.com/antiops/tiktok-trending-data/main/live-gift-details.json','https://streamtoearn.io/gifts'],'gifts':complete},ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'download-report.json').write_text(json.dumps({'retrievedAt':date,'listed':len(gifts),'downloaded':len(complete),'failed':failed},ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'SOURCES.md').write_text('# TikTok gift image library\n\nImages belong to TikTok and their respective rights holders. Downloaded from the publicly accessible TikTok CDN as identifying reference artwork, not original artwork. Full per-file URLs and catalog provenance are in catalog.json. Metadata is a public catalog snapshot, not a guarantee of every region or LIVE room. Unknown IDs remain null; select those gifts by their exact name.\n',encoding='utf-8')
 print('Saved',len(complete),'of',len(gifts),'failures',len(failed),flush=True)
if __name__=='__main__':main()
