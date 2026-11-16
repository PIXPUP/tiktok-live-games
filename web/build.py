"""Build an allowlisted static Pages upload; never publish servers or runtime data."""
import json,re,shutil,sys,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'desktop'))
from manager import GAMES
OUT=ROOT/'dist'/'pages'
OUT.mkdir(parents=True,exist_ok=True)
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
   text=text.replace('<head>','<head><script src="/game-runtime.js"></script>',1)
  if name=='game.js':
   text=text.replace('bridgeStatus();setInterval(bridgeStatus,5000);','/* Native bridge is controlled from the desktop app. */')
   text+='\nwindow.addEventListener("pages-demo",e=>'+('receive(e.detail,true)' if game.key=='curry-shop-3d' else 'animateEvent(e.detail)')+');\n'
  (target/name).write_text(text,encoding='utf-8')
 for folder in ['assets','vendor','chant-audio']:
  if (source/folder).exists():
   for f in (source/folder).rglob('*'):
    if f.is_file() and (f.suffix.lower() in ('.png','.jpg','.webp','.mp3','.js','.md','.txt') or f.name.upper().startswith('LICENSE')):
     dest=target/f.relative_to(source);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,dest)
 for name in ['temple-bg.png','pilgrim.png','dance-music.mp3']:
  if (source/name).exists():shutil.copyfile(source/name,target/name)
 catalog.append({'key':game.key,'title':game.title,'description':game.description})
for script in OUT.glob('games/*/game.js'): subprocess.run(['node','--check',str(script)],check=True)
for name in ['index.html','portal.css','portal.js','game-runtime.js','_headers','404.html']:
 shutil.copyfile(ROOT/'web'/name,OUT/name)
(OUT/'games.json').write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8')
shutil.copyfile(ROOT/'THIRD_PARTY_NOTICES.md',OUT/'THIRD_PARTY_NOTICES.txt')
files=[p for p in OUT.rglob('*') if p.is_file()]
for p in files:
 if p.stat().st_size>25*1024*1024:raise ValueError('Pages asset exceeds 25 MiB: '+str(p))
print(f'Pages ready: {len(files)} files, {sum(p.stat().st_size for p in files)/1024**2:.1f} MiB at {OUT}')
