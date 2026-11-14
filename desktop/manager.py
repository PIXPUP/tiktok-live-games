"""Own and supervise only processes launched by this application."""
import ctypes
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

VERSION = '1.5.1'


def physical_ram_gb():
    if os.name != 'nt':
        return None
    class Status(ctypes.Structure):
        _fields_ = [('length', ctypes.c_uint32), ('load', ctypes.c_uint32)] + [
            (key, ctypes.c_uint64) for key in ('total', 'available', 'page', 'available_page', 'virtual', 'available_virtual', 'extended')]
    status = Status()
    status.length = ctypes.sizeof(status)
    return status.total / 1024**3 if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)) else None


@dataclass(frozen=True)
class Game:
    key: str
    title: str
    description: str
    port: int
    bridge: int
    gateway: int
    version: int

    @property
    def url(self):
        return f'http://127.0.0.1:{self.port}/?v={self.version}'


GAMES = (
    Game('boon-live', 'ลานบุญ', 'โบสถ์แดงทอง · กราบพระ · ร่วมศรัทธา', 8765, 8766, 8768, 35),
    Game('ganesha-live', 'พระพิฆเนศ', 'ศาลากลางแจ้ง · ตัวละคร 4 แบบ · บทอวยพร', 8785, 8786, 8788, 9),
    Game('curry-shop-3d', 'ร้านข้าวราดแกง', 'ร้านอาหาร 3D · รับออร์เดอร์ · ลูกค้านั่งโต๊ะ', 8775, 8776, 8778, 12),
    Game('alms-live', 'ตักบาตรยามเช้า', 'พระเดินรับบาตร · ถวายอาหาร · แสดงชื่อผู้ส่ง', 8795, 8796, 8798, 1),
    Game('ramwong-live', 'รำวงสามช่า', 'งานวัดยามเย็น · เต้นตามของขวัญ · เพลงสามช่า', 8805, 8806, 8808, 1),
)


def json_get(url, timeout=2):
    # Never send localhost requests through a user's HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=timeout) as response:
        return json.load(response)


def port_busy(port):
    with socket.socket() as connection:
        connection.settimeout(.2)
        return connection.connect_ex(('127.0.0.1', port)) == 0


def tunnel_url(text):
    match = re.search(r'https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com\b', text)
    return match.group() if match else None


class ProcessGroup:
    """Windows kill-on-close Job Object also cleans up after a launcher crash."""
    def __init__(self):
        self.handle = None
        if os.name != 'nt':
            return
        from ctypes import wintypes

        class Basic(ctypes.Structure):
            _fields_ = [('a', ctypes.c_int64), ('b', ctypes.c_int64), ('flags', wintypes.DWORD),
                        ('min', ctypes.c_size_t), ('max', ctypes.c_size_t), ('active', wintypes.DWORD),
                        ('affinity', ctypes.c_size_t), ('priority', wintypes.DWORD), ('scheduling', wintypes.DWORD)]

        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ('r', 'w', 'o', 'rb', 'wb', 'ob')]

        class Extended(ctypes.Structure):
            _fields_ = [('basic', Basic), ('io', IO), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t),
                        ('peak_job', ctypes.c_size_t)]

        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        info = Extended()
        info.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.handle or not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(info), ctypes.sizeof(info)):
            raise OSError('Cannot initialize managed process group')

    def add(self, process):
        if self.handle and not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
            process.terminate()
            process.wait(timeout=5)
            raise OSError('Cannot supervise the game process')

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class Manager:
    def __init__(self, root, data, notify=lambda message: None):
        self.root, self.data, self.notify = Path(root), Path(data), notify
        self.data.mkdir(parents=True, exist_ok=True)
        self.ram_gb = physical_ram_gb()
        self.low_memory = self.ram_gb is not None and self.ram_gb < 6
        try:
            saved = json.loads((self.data / 'performance.json').read_text())
            if isinstance(saved.get('low_memory'), bool):
                self.low_memory = saved['low_memory']
        except (OSError, ValueError):
            pass
        self.games_dir = self.root / 'games'
        self.processes = {}
        self.active = None
        self.public_url = ''
        self.lock = threading.RLock()
        self.cancel = threading.Event()
        self.group = ProcessGroup()

    def control_url(self):
        if not self.active:
            return ''
        return self.active.url + ('&lite=1' if self.low_memory else '')

    def set_low_memory(self, enabled):
        self.low_memory = bool(enabled)
        (self.data / 'performance.json').write_text(json.dumps({'low_memory': self.low_memory}))
        if self.public_url:
            parts = urlsplit(self.public_url)
            query = [(key, value) for key, value in parse_qsl(parts.query) if key != 'lite']
            if self.low_memory:
                query.append(('lite', '1'))
            self.public_url = urlunsplit(parts._replace(query=urlencode(query)))

    def prepare(self, game):
        if getattr(sys, 'frozen', False):
            target = self.data / ('games-' + VERSION)
            destination = target / game.key
            marker = destination / '.ready'
            if not marker.exists():
                self.notify('กำลังเตรียม ' + game.title + ' ครั้งแรก…')
                shutil.copytree(self.root / 'games' / game.key, destination, dirs_exist_ok=True,
                                ignore=shutil.ignore_patterns('__pycache__', '*.log', '*.pyc'))
                previous = sorted((p for p in self.data.glob('games-*') if p.is_dir() and p != target),
                                  key=lambda p: p.stat().st_mtime, reverse=True)
                for directory in previous:
                    try:
                        old = directory / game.key / 'gift-map.json'
                        mapping = json.loads(old.read_text(encoding='utf-8-sig'))
                        if isinstance(mapping.get('bindings'), list):
                            shutil.copy2(old, destination / 'gift-map.json')
                            break
                    except (OSError, ValueError):
                        pass
                marker.write_text(VERSION)
            self.games_dir = target

    def runtime(self, name):
        bundled = self.root / 'runtime' / (name + '.exe')
        if bundled.exists():
            return str(bundled)
        found = shutil.which(name)
        if found:
            return found
        raise RuntimeError('ไม่พบตัวรัน ' + name + ' กรุณาใช้แอปชุดเต็มจากหน้าดาวน์โหลด')

    def service_command(self, *args):
        if getattr(sys, 'frozen', False):
            return [sys.executable, '--service', *map(str, args)]
        return [sys.executable, str(self.root / 'desktop' / 'app.py'), '--service', *map(str, args)]

    def spawn(self, label, command, cwd, env=None):
        output = self.data / (label + '.log')
        with output.open('wb') as stream:
            child_env = dict(os.environ if env is None else env, DESK_SERVICE_LOG=str(output))
            process = subprocess.Popen(command, cwd=cwd, env=child_env, stdout=stream, stderr=stream,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
                                       stdin=subprocess.DEVNULL)
        self.group.add(process)
        self.processes[label] = process
        return process

    def wait_ready(self, url, label, timeout=25):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.cancel.is_set():
                raise RuntimeError('ยกเลิกแล้ว')
            if self.processes[label].poll() is not None:
                raise RuntimeError('เปิดระบบไม่สำเร็จ กรุณากดลองใหม่ หรือกด «คัดลอกข้อมูลช่วยเหลือ»')
            try:
                json_get(url)
                return
            except (OSError, ValueError):
                time.sleep(.25)
        raise RuntimeError('เปิดระบบนานกว่าปกติ กรุณากดลองอีกครั้ง')

    def start(self, game):
        with self.lock:
            if self.active == game and self.running():
                return
            if self.active:
                raise RuntimeError('กรุณาปิดเกมปัจจุบันก่อนเปลี่ยนเกม')
            for port in (game.port, game.bridge, game.gateway):
                if port_busy(port):
                    raise RuntimeError(f'มีโปรแกรมอื่นใช้ช่อง {port} อยู่ หากเปิดเกมด้วยวิธีเดิมไว้ ให้ปิดก่อน แล้วกดลองใหม่')
            self.cancel.clear()
            self.prepare(game)
            directory = self.games_dir / game.key
            node = self.runtime('node')
            self.active = game
            try:
                self.notify('กำลังเปิด ' + game.title + '…')
                if game.key == 'curry-shop-3d':
                    self.spawn('game', [node, str(directory / 'server.mjs')], directory, dict(os.environ, PORT=str(game.port), BRIDGE_PORT=str(game.bridge)))
                    self.wait_ready(game.url.split('/?')[0] + '/api/bridge', 'game')
                else:
                    self.spawn('game', self.service_command('game', directory), directory, dict(os.environ, PORT=str(game.port)))
                    self.wait_ready(f'http://127.0.0.1:{game.port}/api/state', 'game')
                    self.spawn('bridge', [node, str(self.root / 'desktop' / 'bridge.mjs'), str(directory), str(game.port), str(game.bridge)], directory)
                    self.wait_ready(f'http://127.0.0.1:{game.bridge}/status', 'bridge')
                self.notify('เกมพร้อมแล้ว เปิดเสียงจากหน้าควบคุมก่อนเริ่มไลฟ์')
            except Exception:
                self.stop()
                raise

    def running(self):
        return self.active is not None and 'game' in self.processes and self.processes['game'].poll() is None

    def start_public(self, timeout=100):
        with self.lock:
            if not self.running():
                raise RuntimeError('เปิดเกมก่อนสร้างลิงก์ไลฟ์')
            if 'tunnel' in self.processes and self.processes['tunnel'].poll() is None and self.public_url:
                return self.public_url
            self.cancel.clear()
            self.stop_public()
            game = self.active
            cloudflared = self.runtime('cloudflared')
            directory = self.games_dir / game.key
            self.notify('กำลังเตรียมลิงก์ Cloudflare…')
            if game.key == 'curry-shop-3d':
                command = self.service_command('gateway', game.port, game.gateway)
            else:
                command = self.service_command('script', directory / 'cloudflare_gateway.py')
            try:
                self.spawn('gateway', command, directory, dict(os.environ, GAME_PORT=str(game.port), CLOUDFLARE_GATEWAY_PORT=str(game.gateway)))
                self.wait_ready(f'http://127.0.0.1:{game.gateway}/health', 'gateway')
                # Dedicated config avoids any existing named-tunnel configuration.
                config = self.data / 'quick-tunnel.yml'
                config.write_text('loglevel: info\n', encoding='utf-8')
                self.spawn('tunnel', [cloudflared, 'tunnel', '--config', str(config), '--url',
                                     f'http://127.0.0.1:{game.gateway}', '--protocol', 'http2',
                                     '--edge-ip-version', '4', '--no-autoupdate'], directory)
                deadline = time.monotonic() + timeout
                candidate = None
                announced = False
                while time.monotonic() < deadline:
                    if self.cancel.is_set():
                        raise RuntimeError('ยกเลิกแล้ว')
                    process = self.processes['tunnel']
                    if process.poll() is not None:
                        raise RuntimeError('Cloudflare เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วกดสร้างลิงก์ใหม่')
                    text = (self.data / 'tunnel.log').read_text(encoding='utf-8', errors='replace')
                    candidate = tunnel_url(text) or candidate
                    # An issued hostname is not ready until the remote page responds.
                    if candidate and 'Registered tunnel connection' in text:
                        if not announced:
                            self.notify('ได้ลิงก์แล้ว กำลังรอให้เว็บไซต์พร้อมใช้งาน… กดยกเลิกได้หากไม่ต้องการรอ')
                            announced = True
                        try:
                            with urllib.request.urlopen(candidate + '/health', timeout=4) as response:
                                ready = json.load(response).get('ready')
                            if ready:
                                self.public_url = candidate + '/?overlay=1&transport=poll&v=' + str(game.version)
                                if self.low_memory:
                                    self.public_url += '&lite=1'
                                self.notify('ลิงก์พร้อมแล้ว กดคัดลอกไปวางใน LIVE Studio ได้เลย')
                                return self.public_url
                        except (OSError, ValueError):
                            pass
                    time.sleep(1)
                raise RuntimeError('สร้างลิงก์ไม่ทันเวลา ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง เกมยังเปิดอยู่ตามปกติ')
            except Exception:
                self.stop_public()
                raise

    def stop_process(self, label):
        process = self.processes.pop(label, None)
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=4)

    def stop_public(self):
        with self.lock:
            self.stop_process('tunnel')
            self.stop_process('gateway')
            self.public_url = ''

    def stop(self):
        with self.lock:
            self.stop_public()
            self.stop_process('bridge')
            self.stop_process('game')
            self.active = None

    def gift_status(self):
        game = self.active
        if game is None or not self.running():
            return 'ยังไม่ได้เปิดเกม'
        try:
            state = json_get(f'http://127.0.0.1:{game.bridge}/status', timeout=1)
            if state.get('connection') == 'connected':
                return 'TikFinity เชื่อมแล้ว · รับ ' + str(state.get('receivedGifts', 0)) + ' ของขวัญ'
            return 'รอ TikFinity — เปิดโปรแกรมและเชื่อม LIVE ของคุณ'
        except (OSError, ValueError):
            return 'กำลังเชื่อมตัวรับของขวัญใหม่'

    def diagnostics(self):
        lines = ['TikTok LIVE Game Desk ' + VERSION, 'Game: ' + (self.active.key if self.active else 'none')]
        for label in ('game', 'bridge', 'gateway', 'tunnel'):
            process = self.processes.get(label)
            lines.append(label + ': ' + ('not started' if not process else str(process.poll())))
            path = self.data / (label + '.log')
            if path.exists():
                # Do not include an entire live chat/gift history in diagnostics.
                lines.extend(path.read_text(encoding='utf-8', errors='replace').splitlines()[-8:])
        return '\n'.join(lines)

    def close(self):
        self.stop()
        self.group.close()
