"""Build an allowlisted static Pages upload; never publish servers or runtime data."""
import json,re,shutil,sys,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'desktop'))
from manager import GAMES
from controls import LABELS
OUT=ROOT/'dist'/'pages'
OUT.mkdir(parents=True,exist_ok=True)
for obsolete in ['billing.html','billing.js']:
 if (OUT/obsolete).exists():(OUT/obsolete).unlink()
# Only remove the known generated static subtree, never the desktop release output.
if (OUT/'games').exists():shutil.rmtree(OUT/'games')
catalog=[]
for game in GAMES:
 source=ROOT/'games'/game.key;target=OUT/'games'/game.key;target.mkdir(parents=True)
 base='/games/'+game.key+'/'
 for name in ['index.html','style.css','game.js']:
  text=(source/name).read_text(encoding='utf-8-sig')
  # Root paths in game source must remain inside this game's static directory.
  # API routes are intercepted separately by the Pages runtime.
  text=re.sub(r'([\x22\x27])/(?!/|api/)',lambda m:m[1]+base,text)
  if name=='style.css': text=text.replace('url(/', 'url('+base)
  if name=='index.html':
   text=text.replace('<head>','<head><script src="/gift-layout.js"></script><script src="/game-runtime.js"></script>',1)
  if name=='game.js':
   text=text.replace('bridgeStatus();setInterval(bridgeStatus,5000);','/* Native bridge is controlled from the desktop app. */')
   text+='\nwindow.addEventListener("pages-demo",e=>'+('receive(e.detail,true)' if game.key=='curry-shop-3d' else 'animateEvent(e.detail)')+');\n'
  if name=='game.js':
   if game.key=='curry-shop-3d':
    text+='\nwindow.addEventListener("pages-bindings",e=>{for(const g of e.detail){const i=giftBindings.findIndex(b=>b[0]===g.action);if(i>=0){giftBindings[i][2]=g.name;gifts[i][3]=g.name;giftArtIds[i]=g.key;}}});\n'
   else:
    text+='\nwindow.addEventListener("pages-bindings",e=>{for(const g of e.detail){if(!giftCatalog.some(v=>v.id===g.key))giftCatalog.push({id:g.key,name:g.name,coins:g.coins});}applyGiftBindings(e.detail.map(g=>({action:g.action,gift:g.key})));});\n'
   text+='\nwindow.__GAME_ACTION_LABELS__='+json.dumps(LABELS[game.key],ensure_ascii=False)+';\n'
  (target/name).write_text(text,encoding='utf-8')
 for folder in ['assets','vendor','chant-audio']:
  if (source/folder).exists():
   for f in (source/folder).rglob('*'):
    if f.is_file() and (f.suffix.lower() in ('.png','.jpg','.webp','.mp3','.js','.md','.txt') or f.name.upper().startswith('LICENSE')):
     dest=target/f.relative_to(source);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,dest)
 for name in ['temple-bg.png','pilgrim.png','dance-music.mp3']:
  if (source/name).exists():shutil.copyfile(source/name,target/name)
 catalog.append({'key':game.key,'title':game.title,'description':game.description,'labels':LABELS[game.key]})
for extra in json.loads((ROOT/'web/games/catalog.json').read_text(encoding='utf-8')):
 target=OUT/'games'/extra['key'];target.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(ROOT/'web/games'/extra['key']/'index.html',target/'index.html')
 catalog.append(extra)
for script in OUT.glob('games/*/game.js'): subprocess.run(['node','--check',str(script)],check=True)
for name in ['index.html','portal.css','portal.js','game-runtime.js','gift-layout.js','gift-editor.js','_headers','404.html','login.html','auth.css','membership.html','membership.js','admin.html','admin.js','mini-live.js','mini-live.css']:
 shutil.copyfile(ROOT/'web'/name,OUT/name)
shutil.copytree(ROOT/'web/licenses',OUT/'licenses',dirs_exist_ok=True)
shutil.copytree(ROOT/'gift-library',OUT/'gift-library',dirs_exist_ok=True,ignore=shutil.ignore_patterns('*.partial','download-report.json'))
(OUT/'games.json').write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8')
shutil.copyfile(ROOT/'THIRD_PARTY_NOTICES.md',OUT/'THIRD_PARTY_NOTICES.txt')
subprocess.run(['node',str(ROOT/'web/build-auth.mjs')],cwd=ROOT,check=True)
files=[p for p in OUT.rglob('*') if p.is_file()]
for p in files:
 if p.stat().st_size>25*1024*1024:raise ValueError('Pages asset exceeds 25 MiB: '+str(p))
print(f'Pages ready: {len(files)} files, {sum(p.stat().st_size for p in files)/1024**2:.1f} MiB at {OUT}')
