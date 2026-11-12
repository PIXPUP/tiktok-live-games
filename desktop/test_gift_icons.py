import base64
import hashlib
import re
import unittest
from pathlib import Path
from manager import GAMES

ROOT=Path(__file__).resolve().parent.parent


class GiftIconTests(unittest.TestCase):
    def test_all_gift_icons_load_with_css_and_match_original_files(self):
        for game in GAMES:
            folder=ROOT/'games'/game.key
            css=(folder/'style.css').read_text(encoding='utf-8')
            icons=dict(re.findall(r'\.gift-(\d+)\{background-image:url\("data:image/webp;base64,([A-Za-z0-9+/=]+)"\)\}',css))
            for gift in ['5655','5487','8913','5658','5879','5659','6968','11046']:
                self.assertIn(gift,icons,game.key)
            for encoded in icons.values():
                original=base64.b64decode(encoded,validate=True)
                self.assertEqual(original[:4],b'RIFF')
                self.assertEqual(original[8:12],b'WEBP')
                asset=folder/'assets'/(hashlib.sha256(original).hexdigest()+'.webp')
                self.assertEqual(original,asset.read_bytes())
            self.assertNotRegex(css,r'\.gift-\d+\{background-image:url\("/assets/')
            self.assertLess(len(css.encode()),180000)
