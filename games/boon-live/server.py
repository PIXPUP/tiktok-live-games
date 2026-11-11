"""Local live-game server. Python standard library only."""
import json
import os
import queue
import re
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
clients = set()
lock = threading.Lock()
state = {'score': 0, 'actions': 0, 'players': {}, 'recent': []}
POINTS = {'incense': 1, 'temple': 5, 'tree': 10, 'fruit': 20,
          'lamp': 30, 'lantern': 99, 'bell': 100, 'grand': 1000}

class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if path.startswith('/assets/') else 'no-cache')
            self.end_headers()
            q = queue.Queue(maxsize=100)
            with lock:
                clients.add(q)
                q.put({'state': json.loads(json.dumps(state))})
            try:
                while True:
                    try:
                        msg = 'data: ' + json.dumps(q.get(timeout=15), ensure_ascii=False) + '\n\n'
                    except queue.Empty:
                        msg = ': heartbeat\n\n'
                    self.wfile.write(msg.encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            finally:
                with lock:
                    clients.discard(q)
            return
        if path == '/api/state':
            with lock:
                self.send_json(200, state)
            return
        files = {'/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css',
                 '/game.js': 'game.js', '/temple-bg.png': 'temple-bg.png',
                 '/pilgrim.png': 'pilgrim.png'}
        if re.fullmatch(r'/assets/[a-f0-9]{64}\.(?:png|webp|jpg|mp3)', path):
            files[path] = path.lstrip('/')
        if path not in files:
            self.send_error(404)
            return
        file_path = ROOT / files[path]
        if not file_path.is_file():
            self.send_error(404)
            return
        size = file_path.stat().st_size
        self.send_response(200)
        self.send_header('Content-Type', {'html':'text/html; charset=utf-8', 'css':'text/css', 'js':'text/javascript', 'png':'image/png', 'webp':'image/webp', 'jpg':'image/jpeg', 'mp3':'audio/mpeg'}[files[path].split('.')[-1]])
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-Length', str(size))
        self.end_headers()
        with file_path.open('rb') as source:
            shutil.copyfileobj(source, self.wfile, 65536)

    def do_POST(self):
        if urlparse(self.path).path != '/api/event':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 4096:
                raise ValueError('Invalid body size')
            data = json.loads(self.rfile.read(length))
            action = data.get('action')
            if action not in POINTS:
                raise ValueError('action must be one of: ' + ', '.join(POINTS))
            name = str(data.get('name', 'ผู้ร่วมบุญ')).strip()[:40] or 'ผู้ร่วมบุญ'
            count = data.get('count', 1)
            if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 100:
                raise ValueError('count must be an integer from 1 to 100')
        except (ValueError, TypeError, AttributeError) as e:
            self.send_json(400, {'error': str(e)})
            return
        with lock:
            event = {'action': action, 'name': name, 'count': count, 'points': POINTS[action] * count}
            if data.get('preview') is True:
                event['preview'] = True
                event['points'] = 0
            else:
                state['score'] += event['points']
                state['actions'] += count
                state['players'][name] = state['players'].get(name, 0) + event['points']
                state['recent'] = [event] + state['recent'][:7]
            msg = {'state': json.loads(json.dumps(state)), 'event': event}
            for q in list(clients):
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass
        self.send_json(200, {'ok': True, **event})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8765'))
    print(f'Lan Boon LIVE: http://127.0.0.1:{port}', flush=True)
    print('OBS portrait overlay: /?overlay=1 | Ctrl+C to stop', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
