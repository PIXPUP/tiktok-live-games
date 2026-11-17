import dataclasses,json,os,socket,tempfile,time,unittest,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from manager import Manager,GAMES,json_get
ROOT=Path(__file__).resolve().parent.parent

def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

class PagesTests(unittest.TestCase):
 def test_pages_urls_use_only_https_pages_origin_and_encode_backend(self):
  with tempfile.TemporaryDirectory() as d:
   m=Manager(ROOT,d)
   try:
    m.set_pages_base('https://pixpup-live-games.pages.dev/')
    for value in ['https://evil.test','http://x.pages.dev','https://x.pages.dev@evil.test','https://x.pages.dev/path','https://x.pages.dev:443']:
     with self.assertRaises(ValueError):m.set_pages_base(value)
    m.active=GAMES[0];m.public_url='https://test.trycloudflare.com/?overlay=1'
    self.assertIn('/games/boon-live/?',m.pages_url())
    self.assertIn('backend=https%3A%2F%2Ftest.trycloudflare.com',m.pages_url())
    dashboard=urlsplit(m.pages_dashboard_url());self.assertEqual(dashboard.path,'/');self.assertEqual(parse_qs(dashboard.query)['game'],['boon-live']);self.assertEqual(parse_qs(dashboard.query)['backend'],['https://test.trycloudflare.com'])
    with self.assertRaises(ValueError):m.set_pages_base('https://different.pages.dev')
   finally:m.close()
 def test_every_game_gateway_has_scoped_cors_and_blocks_control_requests(self):
  with tempfile.TemporaryDirectory() as d:
   m=Manager(ROOT,d)
   try:
    m.set_pages_base('https://pixpup-live-games.pages.dev')
    for original in GAMES:
     with self.subTest(game=original.key):
      game=dataclasses.replace(original,port=port(),bridge=port(),gateway=port());m.start(game)
      m.spawn('gateway',m.service_command('script',ROOT/'desktop/gateway.py'),ROOT,dict(os.environ,GAME_PORT=str(game.port),CLOUDFLARE_GATEWAY_PORT=str(game.gateway),GAME_KEY=game.key,PAGES_ORIGIN=m.pages_base))
      base=f'http://127.0.0.1:{game.gateway}';m.wait_ready(base+'/health','gateway')
      req=urllib.request.Request(base+'/health',headers={'Origin':m.pages_base})
      with urllib.request.urlopen(req,timeout=5) as r:
       self.assertEqual(r.headers.get('Access-Control-Allow-Origin'),m.pages_base)
       self.assertEqual(json.load(r)['game'],game.key)
      req=urllib.request.Request(base+'/health',headers={'Origin':'https://evil.test'})
      with urllib.request.urlopen(req,timeout=5) as r:self.assertIsNone(r.headers.get('Access-Control-Allow-Origin'))
      first=json_get(base+'/api/poll');self.assertTrue(first['ready'])
      event={'action':'incense','count':1,'name':'pages-integration'}
      req=urllib.request.Request(f'http://127.0.0.1:{game.port}/api/event',data=json.dumps(event).encode(),headers={'Content-Type':'application/json'})
      with urllib.request.urlopen(req,timeout=5) as r:self.assertEqual(r.status,200)
      deadline=time.monotonic()+3;received=[]
      while time.monotonic()<deadline:
       feed=json_get(base+'/api/poll?after='+str(first['cursor'])+'&epoch='+first['epoch']);received=feed['events']
       if received:break
       time.sleep(.05)
      self.assertTrue(received)
      e=received[0] if game.key=='curry-shop-3d' else received[0]['event'];self.assertEqual(e['name'],'pages-integration')
      for route in ['/api/event','/api/chat','/config']:
       with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(urllib.request.Request(base+route,data=b'{}',headers={'Origin':m.pages_base,'Content-Type':'application/json'}),timeout=5)
       self.assertEqual(error.exception.code,403)
      m.stop()
   finally:m.close()
