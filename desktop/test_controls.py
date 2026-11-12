import dataclasses
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from controls import Controls
from manager import GAMES, Manager
from speech import Speech

ROOT = Path(__file__).resolve().parent.parent


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class QuietSpeech:
    def __init__(self):
        self.messages = []
        self.received = threading.Event()

    def say(self, text, **kwargs):
        self.messages.append(text)
        self.received.set()

    def close(self):
        pass


class ControlsTests(unittest.TestCase):
    def test_native_demo_one_person_per_tick_and_stops_with_game(self):
        class FakeManager:
            active = dataclasses.replace(GAMES[0], port=0)
            def running(self):
                return self.active is not None
        fake = FakeManager()
        controls = Controls(fake, QuietSpeech())
        self.assertEqual(controls.interval, 5.0)
        controls.interval = .06
        sent, enough = [], threading.Event()
        def send(action, name, preview):
            sent.append(time.monotonic())
            if len(sent) == 3:
                enough.set()
        controls.send = send
        try:
            controls.start_demo()
            controls.start_demo()  # Never create a second timer.
            self.assertTrue(enough.wait(2))
            controls.stop_demo()
            self.assertEqual(len(sent), 3)
            self.assertTrue(all(b-a >= .05 for a, b in zip(sent, sent[1:])))
            time.sleep(.1)
            self.assertEqual(len(sent), 3)
        finally:
            controls.close()

    def test_real_local_event_reaches_native_speech_without_browser_voice(self):
        with tempfile.TemporaryDirectory() as directory:
            manager = Manager(ROOT, directory)
            speaker = QuietSpeech()
            controls = Controls(manager, speaker)
            controls.read_gifts = True
            try:
                game = dataclasses.replace(GAMES[1], port=port(), bridge=port(), gateway=port())
                manager.start(game)
                controls.send('grand', 'ชื่อเดโม', preview=True)
                from manager import json_get
                state = json_get(f'http://127.0.0.1:{game.port}/api/state')
                self.assertEqual(state['score'], 0)
                self.assertNotIn('ชื่อเดโม', state['players'])
                # Wait until the event listener has subscribed; retry boundedly if startup races.
                for attempt in range(15):
                    speaker.received.clear()
                    controls.send('incense', 'ผู้ชมทดสอบ')
                    speaker.received.wait(.2)
                    if any('ผู้ชมทดสอบ' in text for text in speaker.messages):
                        break
                self.assertTrue(speaker.messages)
                self.assertIn('ผู้ชมทดสอบ', speaker.messages[-1])
                self.assertIn('ถวายดอกไม้', speaker.messages[-1])
                self.assertEqual(controls.latest_real_name, 'ผู้ชมทดสอบ')
                state = json_get(f'http://127.0.0.1:{game.port}/api/state')
                self.assertIn('ผู้ชมทดสอบ', state['players'])
                self.assertNotIn('ชื่อเดโม', state['players'])
            finally:
                controls.close()
                manager.close()

    def test_demo_names_are_read_when_checked_without_changing_latest_real_name(self):
        class FakeManager:
            active = None
            def running(self): return False
        class Recorder(QuietSpeech):
            def say(self, text, **kwargs): self.messages.append((text, kwargs))
        speaker = Recorder()
        controls = Controls(FakeManager(), speaker)
        try:
            for game in GAMES:
                event = {'action':'incense', 'name':'มะลิ', 'preview':True}
                controls.handle_event(game, event)
                self.assertFalse(speaker.messages)
                controls.read_gifts = True
                controls.latest_real_name = 'ผู้ส่งจริง'
                controls.handle_event(game, event)
                text, options = speaker.messages.pop()
                self.assertIn('มะลิ', text)
                self.assertIn('ทดลองเสียง', text)
                self.assertTrue(options['preview'])
                self.assertEqual(controls.latest_real_name, 'ผู้ส่งจริง')
                controls.read_gifts = False
        finally: controls.close()

    def test_real_speech_cancels_demo_and_preserves_multiple_real_names(self):
        started, finish = threading.Event(), threading.Event()
        played = []
        class FakePlayer:
            def stop(self): pass
            def play(self, path, volume, cancelled):
                if not cancelled(): played.append(Path(path).read_text(encoding='utf-8'))
        def render(text, voice, path):
            if text == 'demo':
                started.set()
                finish.wait(3)
            Path(path).write_text(text, encoding='utf-8')
        with tempfile.TemporaryDirectory() as directory:
            speech = Speech(directory, renderer=render, player=FakePlayer())
            try:
                speech.enabled = True
                self.assertTrue(speech.say('demo', preview=True))
                self.assertTrue(started.wait(2))
                self.assertFalse(speech.say('another-demo', preview=True))
                speech.say('real-one')
                speech.say('real-two')
                self.assertFalse(speech.say('late-demo', preview=True))
                finish.set()
                deadline = time.monotonic()+3
                while len(played)<2 and time.monotonic()<deadline: time.sleep(.02)
                self.assertEqual(played, ['real-one','real-two'])
            finally:
                finish.set()
                speech.close()

    def test_cancelling_late_generated_speech_cannot_play(self):
        started, finish, played = threading.Event(), threading.Event(), []
        class FakePlayer:
            def stop(self):
                pass
            def play(self, *args):
                played.append(args)
        def render(text, voice, path):
            started.set()
            finish.wait(2)
            Path(path).write_bytes(b'test audio')
        with tempfile.TemporaryDirectory() as directory:
            speech = Speech(directory, renderer=render, player=FakePlayer())
            try:
                speech.enabled = True
                speech.say('ทดสอบ')
                self.assertTrue(started.wait(2))
                speech.stop()
                finish.set()
                deadline = time.monotonic() + 2
                while speech.speaking and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertFalse(played)
            finally:
                finish.set()
                speech.close()


if __name__ == '__main__':
    unittest.main()
