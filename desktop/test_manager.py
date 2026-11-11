import dataclasses
import json
import socket
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from manager import GAMES, Manager, json_get, port_busy, tunnel_url

ROOT = Path(__file__).resolve().parent.parent


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class ManagerTests(unittest.TestCase):
    def test_process_lifecycle_all_games_and_gateway_write_protection(self):
        for original in GAMES:
            with self.subTest(game=original.key), tempfile.TemporaryDirectory() as temporary:
                game = dataclasses.replace(original, port=free_port(), bridge=free_port(), gateway=free_port())
                manager = Manager(ROOT, temporary)
                try:
                    manager.start(game)
                    self.assertTrue(manager.running())
                    self.assertTrue(port_busy(game.port))
                    before = manager.processes['game'].pid
                    manager.start(game)
                    self.assertEqual(manager.processes['game'].pid, before)
                    # Different games must not get a second gift bridge accidentally.
                    with self.assertRaises(RuntimeError):
                        manager.start(GAMES[(GAMES.index(original) + 1) % 3])
                    directory = manager.games_dir / game.key
                    if game.key == 'curry-shop-3d':
                        command = manager.service_command('gateway', game.port, game.gateway)
                    else:
                        command = manager.service_command('script', directory / 'cloudflare_gateway.py')
                    import os
                    manager.spawn('gateway', command, directory, dict(os.environ, GAME_PORT=str(game.port), CLOUDFLARE_GATEWAY_PORT=str(game.gateway)))
                    base = f'http://127.0.0.1:{game.gateway}'
                    manager.wait_ready(base + '/health', 'gateway')
                    self.assertTrue(json_get(base + '/health')['readOnly'])
                    with urllib.request.urlopen(base + '/?overlay=1&transport=poll', timeout=5) as response:
                        self.assertIn(b'<html', response.read())
                    assets = list((directory / 'assets').iterdir())
                    for asset in assets:
                        with urllib.request.urlopen(base + '/assets/' + asset.name, timeout=5) as response:
                            import hashlib
                            self.assertEqual(hashlib.sha256(response.read()).hexdigest(), asset.stem)
                    for route in ['/api/event', '/api/bridge/config']:
                        with self.assertRaises(urllib.error.HTTPError) as denied:
                            urllib.request.urlopen(urllib.request.Request(base + route, data=b'{}'), timeout=5)
                        self.assertEqual(denied.exception.code, 403)
                    with self.assertRaises(urllib.error.HTTPError) as denied:
                        urllib.request.urlopen(base + '/../../desktop/app.py', timeout=5)
                    self.assertEqual(denied.exception.code, 404)
                    if game.key == 'curry-shop-3d':
                        initial = json_get(base + '/api/poll')
                        payload = json.dumps({'action': 'incense', 'name': 'test', 'count': 1}).encode()
                        request = urllib.request.Request(f'http://127.0.0.1:{game.port}/api/event', data=payload, headers={'Content-Type': 'application/json'})
                        with urllib.request.urlopen(request, timeout=5) as response:
                            self.assertEqual(response.status, 200)
                        poll = json_get(base + f'/api/poll?after={initial["cursor"]}&epoch={initial["epoch"]}')
                        self.assertEqual(len(poll['events']), 1)
                        repeated = json_get(base + f'/api/poll?after={poll["cursor"]}&epoch={poll["epoch"]}')
                        self.assertEqual(repeated['events'], [])
                    owned = list(manager.processes.values())
                    manager.stop()
                    self.assertFalse(manager.running())
                    self.assertEqual(manager.public_url, '')
                    self.assertTrue(all(process.poll() is not None for process in owned))
                    self.assertFalse(port_busy(game.port))
                finally:
                    manager.close()

    def test_foreign_listener_is_not_stopped(self):
        with tempfile.TemporaryDirectory() as temporary, socket.socket() as foreign:
            foreign.bind(('127.0.0.1', 0))
            foreign.listen()
            game = dataclasses.replace(GAMES[0], port=foreign.getsockname()[1])
            manager = Manager(ROOT, temporary)
            try:
                with self.assertRaises(RuntimeError):
                    manager.start(game)
                manager.stop()
                self.assertTrue(port_busy(game.port))
                self.assertEqual(manager.processes, {})
            finally:
                manager.close()

    def test_only_accepts_cloudflare_hostnames(self):
        self.assertIsNone(tunnel_url('https://github.com/test'))
        self.assertEqual(tunnel_url('Your link: https://one-two-three.trycloudflare.com'), 'https://one-two-three.trycloudflare.com')


if __name__ == '__main__':
    unittest.main()
