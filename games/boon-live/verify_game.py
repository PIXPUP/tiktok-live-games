"""Smoke checks against an isolated temporary game server, never the live session."""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
env = dict(os.environ, PORT=str(port))
process = subprocess.Popen([sys.executable, 'server.py'], env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def get(path):
    return urllib.request.urlopen(base + path, timeout=4)

def post(payload):
    req = urllib.request.Request(base + '/api/event',
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={'Content-Type': 'application/json'})
    return urllib.request.urlopen(req, timeout=4)

try:
    for attempt in range(40):
        try:
            with get('/api/state') as response:
                assert json.load(response)['score'] == 0
            break
        except OSError:
            if process.poll() is not None:
                raise RuntimeError('Test server exited')
            time.sleep(.1)
    else:
        raise RuntimeError('Test server not ready')
    for path in ['/', '/?overlay=1', '/style.css?v=3', '/game.js?v=3']:
        with get(path) as response:
            assert response.status == 200
    for asset in ['/temple-bg.png', '/pilgrim.png']:
        with get(asset) as response:
            assert response.headers['Content-Type'] == 'image/png'
            assert response.read(8) == b'\x89PNG\r\n\x1a\n'
    with get('/api/events') as stream:
        initial = json.loads(stream.readline().decode()[6:])
        assert initial['state']['score'] == 0
        stream.readline()
        total = 0
        actions = {'incense':1, 'temple':5, 'tree':10, 'fruit':20,
                   'lamp':30, 'lantern':99, 'bell':100, 'grand':1000}
        for action, points in actions.items():
            with post({'action':action, 'name':'ผู้ชมทดสอบ', 'count':2}) as response:
                assert json.load(response)['points'] == points * 2
            message = json.loads(stream.readline().decode()[6:])
            stream.readline()
            assert message['event']['action'] == action
            total += points * 2
            assert message['state']['score'] == total
        with get('/api/state') as response:
            state = json.load(response)
            assert state['actions'] == 16
            assert state['players']['ผู้ชมทดสอบ'] == total
    for payload in [{'action':'invalid'}, {'action':'bell','count':101},
                    {'action':'bell','count':True}, {'action':'bell','count':0}]:
        try:
            post(payload)
            raise AssertionError('Invalid event accepted')
        except urllib.error.HTTPError as err:
            assert err.code == 400
    print('PASS: pages, PNG asset, 8 offerings, Thai names, scoring, SSE broadcast, invalid event rejection')
finally:
    process.terminate()
    process.wait(timeout=5)
