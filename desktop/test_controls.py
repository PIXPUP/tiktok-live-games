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

    def say(self, text):
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
                # Wait until the event listener has subscribed; retry boundedly if startup races.
                for attempt in range(15):
                    controls.send('incense', 'ผู้ชมทดสอบ')
                    if speaker.received.wait(.2):
                        break
                self.assertTrue(speaker.messages)
                self.assertIn('ผู้ชมทดสอบ', speaker.messages[0])
                self.assertIn('ถวายดอกไม้', speaker.messages[0])
            finally:
                controls.close()
                manager.close()

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
