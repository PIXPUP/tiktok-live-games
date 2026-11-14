import dataclasses
import json
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from controls import Controls
from manager import Manager,GAMES,json_get
from speech import Speech
from test_controls import port,QuietSpeech
ROOT=Path(__file__).resolve().parent.parent

class SadhuTests(unittest.TestCase):
    def test_chat_reaches_voice_without_scoring_or_replacing_real_gift_name(self):
        with tempfile.TemporaryDirectory() as d:
            manager=Manager(ROOT,d);speaker=QuietSpeech();controls=Controls(manager,speaker)
            controls.read_sadhu=True
            game=dataclasses.replace(GAMES[0],port=port(),bridge=port(),gateway=port())
            def post(payload,origin=None):
                headers={'Content-Type':'application/json'}
                if origin: headers['Origin']=origin
                return urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{game.port}/api/chat',data=json.dumps(payload).encode(),headers=headers),timeout=4)
            try:
                manager.start(game);before=json_get(f'http://127.0.0.1:{game.port}/api/state')
                event={'action':'sadhu','name':'มะลิ','userId':'one','count':1}
                for _ in range(15):
                    with post(event): pass
                    if speaker.received.wait(.2): break
                self.assertTrue(speaker.messages);self.assertIn('สาธุคุณมะลิ',speaker.messages[0])
                self.assertIsNone(controls.latest_real_name)
                self.assertEqual(before,json_get(f'http://127.0.0.1:{game.port}/api/state'))
                count=len(speaker.messages)
                with post(event):pass
                time.sleep(.1);self.assertEqual(len(speaker.messages),count)
                with self.assertRaises(urllib.error.HTTPError) as denied: post(event,'https://example.com')
                self.assertEqual(denied.exception.code,403)
                with self.assertRaises(urllib.error.HTTPError) as denied: post(dict(event,action='incense'))
                self.assertEqual(denied.exception.code,400)
            finally:controls.close();manager.close()

    def test_gifts_interrupt_chat_and_queued_chat_stays_after_real_names(self):
        started,release=threading.Event(),threading.Event();played=[]
        class Player:
            def stop(self):pass
            def play(self,path,volume,cancelled):
                if not cancelled():played.append(Path(path).read_text())
        def render(text,voice,path):
            if text=='chat-active':started.set();release.wait(3)
            Path(path).write_text(text)
        with tempfile.TemporaryDirectory() as d:
            speech=Speech(d,renderer=render,player=Player());speech.enabled=True
            try:
                speech.say('chat-active',chat=True);self.assertTrue(started.wait(2))
                for i in range(8):self.assertTrue(speech.say('chat-'+str(i),chat=True))
                self.assertFalse(speech.say('chat-overflow',chat=True))
                speech.say('gift-one');speech.say('gift-two');release.set()
                deadline=time.monotonic()+3
                while len(played)<10 and time.monotonic()<deadline:time.sleep(.02)
                self.assertEqual(played,['gift-one','gift-two']+['chat-'+str(i) for i in range(8)])
            finally:release.set();speech.close()
