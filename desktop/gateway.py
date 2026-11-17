"""Read-only game gateway. Public access never forwards control requests."""
import collections
import http.client
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

STATIC = {'/', '/index.html', '/game.js', '/style.css', '/temple-bg.png',
          '/pilgrim.png', '/vendor/three.module.js', '/dance-music.mp3'}

class EventJournal:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = None
        self.events = collections.deque(maxlen=512)
        self.cursor = 0
        self.epoch = uuid.uuid4().hex
    def accept(self, message):
        if not isinstance(message.get('state'), dict): return
        with self.lock:
            current = message['state']
            if self.state is not None and not message.get('event') and current != self.state:
                self.epoch = uuid.uuid4().hex
                self.cursor = 0
                self.events.clear()
            self.state = current
            if message.get('event'):
                self.cursor += 1
                self.events.append({'seq': self.cursor, 'event': message['event']})
    def read(self, cursor=None, epoch=None):
        with self.lock:
            if self.state is None: return {'ready': False}
            reset = cursor is None or epoch != self.epoch or cursor > self.cursor
            if self.events and cursor is not None and cursor < self.events[0]['seq'] - 1: reset = True
            events = [] if reset else [e for e in self.events if e['seq'] > cursor][:64]
            return {'ready': True, 'reset': reset, 'epoch': self.epoch,
                    'cursor': events[-1]['seq'] if events else self.cursor, 'state': self.state, 'events': events}

def serve(source_port, gateway_port):
    game = os.environ.get('GAME_KEY', 'curry-shop-3d')
    pages_origin = os.environ.get('PAGES_ORIGIN', '').rstrip('/')
    journal = EventJournal()
    config_directory = Path(os.environ.get('GAME_DIRECTORY', '.'))
    def settings():
        result = {}
        for file, key in (('gift-map.json', 'bindings'), ('gift-layout.json', 'presentation')):
            try:
                path = config_directory / file
                if path.stat().st_size > 16384: continue
                value = json.loads(path.read_text(encoding='utf-8-sig'))
                result[key] = value.get('bindings', []) if key == 'bindings' else value
            except (OSError, ValueError, AttributeError): pass
        return result
    def follow():
        while True:
            upstream = http.client.HTTPConnection('127.0.0.1', source_port, timeout=35)
            try:
                upstream.request('GET', '/api/events')
                response = upstream.getresponse()
                if response.status != 200: raise OSError('Game unavailable')
                while True:
                    line = response.readline()
                    if not line: break
                    if line.startswith(b'data: '): journal.accept(json.loads(line[6:]))
            except (OSError, ValueError, http.client.HTTPException): pass
            finally: upstream.close()
            time.sleep(1)
    if game != 'curry-shop-3d': threading.Thread(target=follow, daemon=True).start()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def end_headers(self):
            if pages_origin and self.headers.get('Origin') == pages_origin:
                self.send_header('Access-Control-Allow-Origin', pages_origin)
                self.send_header('Vary', 'Origin')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()
        def reply(self, code, data):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            parsed = urlsplit(self.path)
            route = parsed.path
            if route == '/health':
                ready = game == 'curry-shop-3d' or journal.read().get('ready', False)
                self.reply(200 if ready else 503, {'ready':ready, 'readOnly':True, 'game':game, 'protocol':1})
                return
            if route == '/api/poll' and game != 'curry-shop-3d':
                query = parse_qs(parsed.query)
                try:
                    cursor = int(query['after'][0]) if 'after' in query else None
                    if cursor is not None and cursor < 0: raise ValueError()
                except (ValueError, IndexError):
                    self.reply(400, {'error':'Invalid cursor'}); return
                data = journal.read(cursor, query.get('epoch', [None])[0])
                data.update(settings())
                self.reply(200 if data['ready'] else 503, data)
                return
            if route not in STATIC | {'/api/poll', '/api/bridge'} and not re.fullmatch(r'/assets/[a-f0-9]{64}\.(?:png|webp|jpg|mp3)', route):
                self.send_error(404); return
            upstream = http.client.HTTPConnection('127.0.0.1', source_port, timeout=12)
            try:
                upstream.request('GET', self.path)
                response = upstream.getresponse()
                body = response.read()
                if route == '/api/poll' and response.status == 200:
                    data = json.loads(body)
                    data.update(settings())
                    body = json.dumps(data).encode()
                self.send_response(response.status)
                self.send_header('Content-Type', response.getheader('Content-Type', 'application/octet-stream'))
                self.send_header('Cache-Control', response.getheader('Cache-Control', 'no-store') if route.startswith('/assets/') else 'no-store')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (OSError, http.client.HTTPException): self.send_error(502, 'Game is not available')
            finally: upstream.close()
        def do_POST(self): self.send_error(403, 'Read-only game screen')
        do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_POST
    ThreadingHTTPServer(('127.0.0.1', gateway_port), Handler).serve_forever()

if __name__ == '__main__':
    serve(int(os.environ.get('GAME_PORT', '8765')), int(os.environ.get('CLOUDFLARE_GATEWAY_PORT', '8768')))
