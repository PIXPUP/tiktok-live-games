"""Extract embedded image/audio bytes without altering any media content."""
import base64
import hashlib
import re
from pathlib import Path

PATTERN = re.compile(r'data:(image/(?:png|webp|jpeg)|audio/(?:mpeg|mp3));base64,([A-Za-z0-9+/=]+)')
EXTENSIONS = {'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3'}


def extract(game):
    game = Path(game)
    assets = game / 'assets'
    before, after, count = 0, 0, 0
    for name in ('game.js', 'style.css'):
        path = game / name
        text = path.read_text(encoding='utf-8')
        before += len(text.encode())

        def replace(match):
            nonlocal count
            data = base64.b64decode(match[2], validate=True)
            filename = hashlib.sha256(data).hexdigest() + '.' + EXTENSIONS[match[1]]
            assets.mkdir(exist_ok=True)
            output = assets / filename
            if output.exists():
                assert output.read_bytes() == data
            else:
                output.write_bytes(data)
            count += 1
            return '/assets/' + filename

        text = PATTERN.sub(replace, text)
        path.write_text(text, encoding='utf-8')
        after += len(text.encode())
    return before, after, count


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent / 'games'
    for game in root.iterdir():
        if game.is_dir():
            print(game.name, extract(game))
