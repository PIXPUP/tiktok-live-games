"""Read-only overlay gateway with cursor polling for Cloudflare Quick Tunnels."""
import collections
import http.client
import json
import os
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

class EventJournal:
    def __init__(self, capacity=512):
        self.lock = threading.Lock()
        self.state = None
        self.events = collections.deque(maxlen=capacity)
        self.cursor = 0
        self.epoch = uuid.uuid4().hex

    def accept(self, message):
        if not isinstance(message.get('state'), dict):
            return
        with self.lock:
            current = message['state']
            if self.state is not None and not message.get('event') and current != self.state:
                # A source reconnect cannot safely replay a possibly missed batch.
                self.epoch = uuid.uuid4().hex
                self.cursor = 0
                self.events.clear()
            self.state = current
            if message.get('event'):
                self.cursor += 1
                self.events.append({'seq': self.cursor, 'event': message['event']})

    def read(self, cursor=None, epoch=None):
        with self.lock:
            if self.state is None:
                return {'ready': False}
            reset = cursor is None or epoch != self.epoch or cursor > self.cursor
            if self.events and cursor is not None and cursor < self.events[0]['seq'] - 1:
                reset = True
            events = [] if reset else [e for e in self.events if e['seq'] > cursor][:64]
            next_cursor = events[-1]['seq'] if events else self.cursor
            return {'ready': True, 'reset': reset, 'epoch': self.epoch,
                    'cursor': next_cursor, 'state': self.state, 'events': events}

JOURNAL = EventJournal()
FILES = {'/': 'text/html', '/index.html': 'text/html', '/style.css': 'text/css',
         '/game.js': 'text/javascript', '/temple-bg.png': 'image/png',
         '/pilgrim.png': 'image/png'}

def follow_game():
    while True:
        connection = http.client.HTTPConnection('127.0.0.1', int(os.environ.get('GAME_PORT', '8765')), timeout=35)
        try:
            connection.request('GET', '/api/events')
            response = connection.getresponse()
            if response.status != 200:
                raise OSError('Game server unavailable')
            while True:
                line = response.readline()
                if not line:
                    break
                if line.startswith(b'data: '):
                    JOURNAL.accept(json.loads(line[6:]))
        except (OSError, ValueError, http.client.HTTPException):
            pass
        finally:
            connection.close()
        time.sleep(1)

class CloudflareHandler(BaseHTTPRequestHandler):
    def reply(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path in ('/api/poll', '/api/state', '/health'):
            try:
                cursor = int(query['after'][0]) if 'after' in query else None
                if cursor is not None and cursor < 0:
                    raise ValueError()
            except (ValueError, IndexError):
                self.reply(400, {'error': 'Invalid cursor'})
                return
            data = JOURNAL.read(cursor, query.get('epoch', [None])[0])
            if parsed.path == '/health':
                self.reply(200 if data['ready'] else 503,
                           {'ready': data['ready'], 'transport': 'poll', 'readOnly': True})
            else:
                self.reply(200 if data['ready'] else 503, data if parsed.path == '/api/poll' else data.get('state', {}))
            return
        if parsed.path not in FILES and not re.fullmatch(r'/assets/[a-f0-9]{64}\.(?:png|webp|jpg|mp3)', parsed.path):
            self.send_error(404)
            return
        if parsed.path in ('/', '/index.html') and ('overlay' not in query or query.get('transport') != ['poll']):
            self.send_response(302)
            self.send_header('Location', '/?overlay=1&transport=poll&v=15')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        connection = http.client.HTTPConnection('127.0.0.1', int(os.environ.get('GAME_PORT', '8765')), timeout=15)
        try:
            connection.request('GET', self.path)
            response = connection.getresponse()
            body = response.read()
            self.send_response(response.status)
            self.send_header('Content-Type', response.getheader('Content-Type', FILES.get(parsed.path, 'application/octet-stream')))
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', response.getheader('Cache-Control', 'no-cache') if parsed.path.startswith('/assets/') else 'no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)
        except (OSError, http.client.HTTPException):
            self.close_connection = True
        finally:
            connection.close()

    def do_POST(self):
        self.send_error(403, 'Read-only overlay. Use local game controls.')

    do_PUT = do_POST
    do_DELETE = do_POST
    do_PATCH = do_POST

if __name__ == '__main__':
    port = int(os.environ.get('CLOUDFLARE_GATEWAY_PORT', '8768'))
    threading.Thread(target=follow_game, daemon=True).start()
    print(f'Cloudflare polling overlay: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), CloudflareHandler).serve_forever()
