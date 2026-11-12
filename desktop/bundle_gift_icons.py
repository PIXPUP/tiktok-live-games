"""Keep tiny original gift icons in CSS so a partial asset fetch cannot hide them.
Large character images and chanting audio remain external lazy assets.
"""
import base64
import re
from pathlib import Path

PATTERN = re.compile(r'(\.gift-\d+\{background-image:url\(")(/assets/[a-f0-9]{64}\.webp)("\)\})')


def bundle(game):
    game = Path(game)
    path = game / 'style.css'
    source = path.read_text(encoding='utf-8')
    def replace(match):
        data = (game / match[2].lstrip('/')).read_bytes()
        return match[1] + 'data:image/webp;base64,' + base64.b64encode(data).decode('ascii') + match[3]
    result, count = PATTERN.subn(replace, source)
    if count:
        path.write_text(result, encoding='utf-8')
    return count


if __name__ == '__main__':
    for game in (Path(__file__).resolve().parent.parent / 'games').iterdir():
        if game.is_dir() and (game/'style.css').is_file():
            print(game.name, bundle(game))
