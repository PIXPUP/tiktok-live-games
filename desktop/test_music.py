import tempfile
import unittest
import wave
from pathlib import Path
from music import Music, render_music


class MusicTests(unittest.TestCase):
    def test_small_original_loop_is_finite_and_fades_at_boundaries(self):
        import array
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'music.wav'
            render_music(path)
            self.assertLess(path.stat().st_size, 2_000_000)
            with wave.open(str(path)) as audio:
                self.assertEqual(audio.getnchannels(), 1)
                samples = array.array('h', audio.readframes(audio.getnframes()))
            self.assertEqual(samples[0], 0)
            self.assertEqual(samples[-1], 0)
            self.assertGreater(max(samples), 1000)
            self.assertLess(max(abs(value) for value in samples), 32767)

    def test_music_volume_ducks_for_voice_and_stop_closes_only_music(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'exists.wav'
            path.write_bytes(b'test')
            speaking = [False]
            commands = []
            class Player:
                def command(self, command):
                    commands.append(command)
                def stop(self):
                    commands.append('stop music')
            music = Music(path, lambda: speaking[0])
            music.player = Player()
            try:
                music.set_volume(.5)
                music.start()
                self.assertTrue(music.running)
                self.assertIn('setaudio desk_music volume to 500', commands)
                speaking[0] = True
                with music.lock:
                    music.apply_gain()
                self.assertIn('setaudio desk_music volume to 100', commands)
                speaking[0] = False
                with music.lock:
                    music.apply_gain()
                self.assertEqual(music.gain, 500)
                music.stop()
                self.assertFalse(music.running)
                self.assertEqual(commands[-1], 'stop music')
            finally:
                music.close()
