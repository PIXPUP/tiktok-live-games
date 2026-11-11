"""Allowlisted, read-only HTTP gateway; no credentials or local control routes."""
import http.client
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

STATIC = {'/', '/index.html', '/game.js', '/style.css', '/temple-bg.png',
          '/pilgrim.png', '/vendor/three.module.js'}


def serve(source_port, gateway_port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            route = urlsplit(self.path).path
            if route == '/health':
                body = b'{"ready":true,"readOnly":true}'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if route not in STATIC | {'/api/poll', '/api/bridge'} and not re.fullmatch(r'/assets/[a-f0-9]{64}\.(?:png|webp|jpg|mp3)', route):
                self.send_error(404)
                return
            upstream = http.client.HTTPConnection('127.0.0.1', source_port, timeout=12)
            try:
                upstream.request('GET', self.path)
                response = upstream.getresponse()
                body = response.read()
                self.send_response(response.status)
                self.send_header('Content-Type', response.getheader('Content-Type', 'application/octet-stream'))
                self.send_header('Cache-Control', response.getheader('Cache-Control', 'no-store') if route.startswith('/assets/') else 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (OSError, http.client.HTTPException):
                self.send_error(502, 'Game is not available')
            finally:
                upstream.close()

        def do_POST(self):
            self.send_error(403, 'Read-only game screen')

        do_PUT = do_DELETE = do_PATCH = do_POST

    ThreadingHTTPServer(('127.0.0.1', gateway_port), Handler).serve_forever()
