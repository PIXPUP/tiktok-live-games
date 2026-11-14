import tempfile
import threading
import time
import unittest
from pathlib import Path
from controls import Controls
from manager import GAMES
from speech import Speech,Player

class FakePlayer:
    def __init__(self):self.played=[]
    def stop(self):pass
    def play(self,path,volume,cancelled):
        if not cancelled():self.played.append(Path(path).read_text())

def wait_for(predicate,seconds=3):
    deadline=time.monotonic()+seconds
    while not predicate() and time.monotonic()<deadline:time.sleep(.02)
    return predicate()

class VoiceReliabilityTests(unittest.TestCase):
    def test_render_failure_retries_same_name_instead_of_skipping(self):
        attempts=[];player=FakePlayer()
        def render(text,voice,path):
            attempts.append(text)
            if len(attempts)==1:raise OSError('temporary network failure')
            Path(path).write_text(text)
        with tempfile.TemporaryDirectory() as d:
            speech=Speech(d,renderer=render,player=player);speech.enabled=True
            try:
                speech.say('viewer-one')
                self.assertTrue(wait_for(lambda:len(player.played)==1 and not speech.speaking))
                self.assertEqual(attempts,['viewer-one','viewer-one'])
                self.assertEqual(speech.snapshot()['retried'],1)
                self.assertEqual(speech.snapshot()['failed'],0)
            finally:speech.close()

    def test_playback_failure_retries_cached_audio_without_another_network_call(self):
        rendered=[]
        class Player(FakePlayer):
            tries=0
            def play(self,*args):
                self.tries+=1
                if self.tries==1:raise OSError('device busy')
                return super().play(*args)
        player=Player()
        def render(text,voice,path):rendered.append(text);Path(path).write_text(text)
        with tempfile.TemporaryDirectory() as d:
            speech=Speech(d,renderer=render,player=player);speech.enabled=True
            try:
                speech.say('viewer-two')
                self.assertTrue(wait_for(lambda:len(player.played)==1))
                self.assertEqual(rendered,['viewer-two']);self.assertEqual(player.tries,2)
            finally:speech.close()

    def test_more_than_eight_real_names_are_kept_and_duplicate_pending_names_merge(self):
        start,release=threading.Event(),threading.Event();player=FakePlayer()
        def render(text,voice,path):
            if text=='first':start.set();release.wait(3)
            Path(path).write_text(text)
        with tempfile.TemporaryDirectory() as d:
            speech=Speech(d,renderer=render,player=player);speech.enabled=True
            try:
                speech.say('first');self.assertTrue(start.wait(2))
                for i in range(12):self.assertTrue(speech.say('name-'+str(i)))
                self.assertTrue(speech.say('name-2'))
                self.assertEqual(speech.snapshot()['queued'],12)
                release.set();self.assertTrue(wait_for(lambda:len(player.played)==13))
                self.assertEqual(player.played,['first']+['name-'+str(i) for i in range(12)])
                self.assertEqual(speech.snapshot()['merged'],1)
            finally:release.set();speech.close()

    def test_failed_name_is_visible_and_can_be_retried_manually(self):
        available=[False];player=FakePlayer()
        def render(text,voice,path):
            if not available[0]:raise OSError('offline')
            Path(path).write_text(text)
        with tempfile.TemporaryDirectory() as d:
            speech=Speech(d,renderer=render,player=player);speech.enabled=True
            try:
                speech.say('retry-me')
                self.assertTrue(wait_for(lambda:speech.snapshot()['failed']==1))
                self.assertEqual(speech.failed_text,'retry-me')
                available[0]=True;self.assertTrue(speech.retry_last())
                self.assertTrue(wait_for(lambda:len(player.played)==1 and not speech.speaking))
                self.assertEqual(player.played,['retry-me'])
                self.assertIsNone(speech.failed_text)
            finally:speech.close()

    def test_low_memory_profile_uses_short_name_announcements(self):
        class Manager:
            active=None
            low_memory=True
            def running(self):return False
        class Recorder:
            def __init__(self):self.messages=[]
            def say(self,text,**options):self.messages.append(text)
            def close(self):pass
        speaker=Recorder();controls=Controls(Manager(),speaker)
        try:
            self.assertTrue(controls.short_names)
            controls.read_gifts=True;controls.read_sadhu=True
            controls.handle_event(GAMES[0],{'action':'incense','name':'มะลิ'})
            controls.handle_sadhu({'name':'สายบุญ','userId':'short-one'})
            self.assertEqual(speaker.messages,['อนุโมทนาคุณมะลิ','สาธุคุณสายบุญ'])
        finally:controls.close()

    def test_delayed_windows_device_start_is_not_mistaken_for_finished_audio(self):
        class SlowPlayer(Player):
            def __init__(self):super().__init__();self.modes=iter(['stopped','stopped','playing','stopped']);self.polls=0
            def command(self,command):
                if command.endswith(' mode'):self.polls+=1;return next(self.modes)
                if command.endswith(' position'):return '0'
                if command.endswith(' length'):return '1500'
                return ''
        player=SlowPlayer();player.play(Path('fake.mp3'),0,lambda:False)
        self.assertEqual(player.polls,4)
