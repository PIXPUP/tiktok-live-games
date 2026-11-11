"""Read-only gateway for a public ngrok overlay; game control stays local."""
import http.client
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ALLOWED = {'/', '/index.html', '/style.css', '/game.js', '/temple-bg.png',
           '/pilgrim.png', '/api/events', '/api/state'}

class OverlayHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path not in ALLOWED:
            self.send_error(404)
            return
        if parsed.path in ('/', '/index.html') and 'overlay' not in parse_qs(parsed.query):
            self.send_response(302)
            self.send_header('Location', '/?overlay=1&v=14')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        connection = http.client.HTTPConnection('127.0.0.1', 8765, timeout=30)
        try:
            connection.request('GET', self.path)
            response = connection.getresponse()
            self.send_response(response.status)
            for name in ('Content-Type', 'Content-Length', 'Cache-Control'):
                value = response.getheader(name)
                if value:
                    self.send_header(name, value)
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            if parsed.path == '/api/events':
                while True:
                    line = response.readline()
                    if not line:
                        break
                    self.wfile.write(line)
                    self.wfile.flush()
            else:
                self.wfile.write(response.read())
        except (BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
            pass
        finally:
            connection.close()

    def do_POST(self):
        self.send_error(403, 'Overlay is read-only. Use local controls.')

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST

if __name__ == '__main__':
    port = int(os.environ.get('OVERLAY_PORT', '8767'))
    print(f'Read-only overlay: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), OverlayHandler).serve_forever()
