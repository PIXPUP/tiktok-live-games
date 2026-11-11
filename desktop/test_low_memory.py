import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from manager import GAMES, Manager

ROOT = Path(__file__).resolve().parent.parent


class LowMemoryTests(unittest.TestCase):
    def test_mode_persists_and_updates_link_without_restarting_game(self):
        with tempfile.TemporaryDirectory() as temporary:
            manager = Manager(ROOT, temporary)
            try:
                manager.active = GAMES[0]
                manager.public_url = 'https://a-b.trycloudflare.com/?overlay=1&transport=poll&v=34'
                manager.set_low_memory(True)
                self.assertIn('lite=1', manager.control_url())
                self.assertIn('lite=1', manager.public_url)
                self.assertEqual(manager.active, GAMES[0])
                manager.set_low_memory(False)
                self.assertNotIn('lite=', manager.public_url)
                self.assertNotIn('lite=', manager.control_url())
                self.assertEqual(json.loads((Path(temporary) / 'performance.json').read_text()), {'low_memory': False})
            finally:
                manager.close()

    def test_lazy_assets_are_content_addressed_and_script_payload_is_small(self):
        import re
        for game in GAMES:
            root = ROOT / 'games' / game.key
            for asset in (root / 'assets').iterdir():
                self.assertEqual(asset.stem, hashlib.sha256(asset.read_bytes()).hexdigest())
            for name in ('game.js', 'style.css'):
                text = (root / name).read_text(encoding='utf-8')
                self.assertLess(len(text.encode()), 180000)
                for relative in re.findall(r'/assets/([a-f0-9]{64}\.(?:png|webp|jpg|mp3))', text):
                    self.assertTrue((root / 'assets' / relative).is_file())
                self.assertNotIn('data:audio/mpeg;base64,', text)


if __name__ == '__main__':
    unittest.main()
