import copy,dataclasses,json,os,shutil,socket,tempfile,unittest,urllib.request
from pathlib import Path
from manager import Manager,GAMES,json_get
from gift_layout import normalize
ROOT=Path(__file__).resolve().parent.parent
DEFAULT=['id-5655','id-5487','id-8913','id-5658','id-5879','id-5659','id-6968','id-11046']
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def config(game='boon-live'):return {'version':1,'game':game,'slots':['id-6369',*DEFAULT[1:]],'layout':{'position':'right','width':23,'top':20,'font':11,'icon':28,'gap':4}}
class GiftLayoutTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.catalog=json.loads((ROOT/'gift-library/catalog.json').read_text(encoding='utf-8'))
 def test_every_saved_icon_is_webp_and_catalog_has_no_unverified_numeric_ids(self):
  self.assertGreater(len(self.catalog['gifts']),1000)
  for gift in self.catalog['gifts']:
   path=ROOT/'gift-library'/gift['file'];data=path.read_bytes()
   self.assertEqual(data[:4],b'RIFF');self.assertEqual(data[8:12],b'WEBP')
   if gift['id'] is not None:self.assertTrue(gift['id'].isdigit())
 def test_new_gift_maps_to_verified_id_and_preserves_layout(self):
  clean,bindings=normalize(config(),'boon-live',self.catalog)
  self.assertEqual(bindings[0],{'action':'incense','gift':'6369'})
  self.assertEqual(clean['layout']['position'],'right')
 def test_unknown_id_uses_exact_catalog_name(self):
  gift=next(g for g in self.catalog['gifts'] if g['id'] is None)
  c=config();c['slots'][0]=gift['key'];_,b=normalize(c,'boon-live',self.catalog)
  self.assertEqual(b[0]['gift'],gift['name'])
 def test_invalid_file_cannot_change_another_game_or_escape_catalog(self):
  cases=[];bad=config();bad['game']='ramwong-live';cases.append(bad)
  bad=config();bad['slots'][0]='../../secrets';cases.append(bad)
  bad=config();bad['slots'][0]=bad['slots'][1];cases.append(bad)
  bad=config();bad['layout']['top']=float('nan');cases.append(bad)
  bad=config();bad['version']=True;cases.append(bad)
  for c in cases:
   with self.assertRaises(ValueError):normalize(c,'boon-live',self.catalog)
 def test_import_updates_local_bridge_and_pages_url_without_public_writes(self):
  original=(ROOT/'games/boon-live/gift-map.json').read_bytes()
  with tempfile.TemporaryDirectory() as d:
   folder=Path(d);games=folder/'games';shutil.copytree(ROOT/'games/boon-live',games/'boon-live')
   m=Manager(ROOT,folder/'data');m.games_dir=games
   try:
    game=dataclasses.replace(GAMES[0],port=port(),bridge=port(),gateway=port());m.start(game)
    path=folder/'layout.json';path.write_text(json.dumps(config()),encoding='utf-8')
    m.import_gift_layout(path)
    bindings=json_get(f'http://127.0.0.1:{game.bridge}/status')['bindings'];self.assertEqual(bindings[0]['gift'],'6369')
    m.public_url='https://test.trycloudflare.com/';self.assertIn('layout=',m.pages_url())
    m.spawn('gateway',m.service_command('script',ROOT/'desktop/gateway.py'),games/'boon-live',dict(os.environ,GAME_KEY=game.key,GAME_PORT=str(game.port),CLOUDFLARE_GATEWAY_PORT=str(game.gateway),PAGES_ORIGIN=m.pages_base,GAME_DIRECTORY=str(games/'boon-live')))
    m.wait_ready(f'http://127.0.0.1:{game.gateway}/health','gateway')
    feed=json_get(f'http://127.0.0.1:{game.gateway}/api/poll');self.assertEqual(feed['bindings'][0]['gift'],'6369');self.assertEqual(feed['presentation']['slots'][0],'id-6369')
    before=(games/'boon-live/gift-map.json').read_bytes();bad=config('ramwong-live');path.write_text(json.dumps(bad))
    with self.assertRaises(ValueError):m.import_gift_layout(path)
    self.assertEqual((games/'boon-live/gift-map.json').read_bytes(),before)
   finally:m.close()
  self.assertEqual((ROOT/'games/boon-live/gift-map.json').read_bytes(),original)
