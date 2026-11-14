"""Optional online Thai speech, cached locally, played through Windows audio."""
import asyncio
import collections
import ctypes
import hashlib
import json
import os
import threading
import time
from pathlib import Path

VOICES = {'เสียงไทย · Google': 'google-th', 'ผู้ชาย · นิวัฒน์': 'th-TH-NiwatNeural'}


def spoken_phrases(text):
    # Explicit sentence boundaries avoid empty Thai voice responses and make the
    # host pause between Thai clauses (Thai spaces usually separate phrases).
    return '. '.join(part.strip('.,。') for part in str(text).split() if part.strip('.,。'))


class Player:
    def __init__(self, alias='desk_speech'):
        self.alias = alias
        self.lock = threading.RLock()

    def command(self, command):
        result = ctypes.create_unicode_buffer(512)
        code = ctypes.windll.winmm.mciSendStringW(command, result, 512, None)
        if code:
            raise OSError('Windows audio playback failed: ' + str(code))
        return result.value

    def stop(self):
        if os.name == 'nt':
            with self.lock:
                try:
                    self.command('close ' + self.alias)
                except OSError:
                    pass

    def play(self, path, volume, cancelled):
        if os.name != 'nt':
            raise OSError('Windows audio is required')
        self.stop()
        try:
            with self.lock:
                self.command(f'open "{Path(path).resolve()}" type mpegvideo alias {self.alias}')
                self.command(f'setaudio {self.alias} volume to {int(volume * 1000)}')
                self.command('play ' + self.alias)
            while not cancelled():
                with self.lock:
                    if self.command('status ' + self.alias + ' mode') != 'playing':
                        break
                time.sleep(.08)
        finally:
            self.stop()


class Speech:
    def __init__(self, directory, notify=lambda text: None, renderer=None, player=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.notify = notify
        self.enabled, self.voice, self.volume = False, next(iter(VOICES.values())), .8
        self.pending = collections.deque(maxlen=8)
        self.condition = threading.Condition()
        self.generation, self.closed, self.speaking = 0, False, False
        self.last_finished = 0
        self.active_preview = False
        self.active_chat = False
        self.player = player or Player()
        self.renderer = renderer or self.render
        self.thread = threading.Thread(target=self.worker, daemon=True)
        self.thread.start()

    def render(self, text, voice, path):
        if voice == 'google-th':
            from gtts import gTTS
            gTTS(text, lang='th', lang_check=False, timeout=(10, 25)).save(str(path))
            if path.stat().st_size < 500:
                raise OSError('Empty Thai audio')
            return
        import edge_tts
        text = spoken_phrases(text)

        async def generate():
            # Retry a transient empty response once; never leave a partial cache entry.
            for attempt in range(2):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(text, voice).save(str(path)), 30)
                    if path.stat().st_size < 500:
                        raise OSError('Empty audio')
                    return
                except Exception:
                    if attempt:
                        raise
                    await asyncio.sleep(.5)
        asyncio.run(generate())

    def say(self, text, ambient=False, preview=False, chat=False):
        text = str(text).strip()[:1800]
        with self.condition:
            if not self.enabled or not text or self.closed:
                return False
            if (ambient or preview) and (self.speaking or self.pending):
                return False
            if chat:
                if len(self.pending) >= 8 or sum(item[4] for item in self.pending) >= 4:
                    return False
                self.pending.append((text, self.voice, self.generation, False, True))
            elif not ambient and not preview:
                if self.active_preview or self.active_chat:
                    self.generation += 1
                    self.active_preview = self.active_chat = False
                    self.player.stop()
                normal = [(t, v, self.generation, False, False) for t, v, _, demo, comment in self.pending if not demo and not comment]
                comments = [(t, v, self.generation, False, True) for t, v, _, demo, comment in self.pending if comment]
                normal.append((text, self.voice, self.generation, False, False))
                normal = normal[-8:]
                self.pending = collections.deque(normal + comments[:8-len(normal)], maxlen=8)
            else:
                self.pending.append((text, self.voice, self.generation, preview, False))
            self.condition.notify()
            return True

    def stop(self):
        with self.condition:
            self.generation += 1
            self.pending.clear()
        self.player.stop()

    def worker(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.pending or self.closed)
                if self.closed:
                    return
                text, voice, generation, self.active_preview, self.active_chat = self.pending.popleft()
                self.speaking = True
            try:
                key = hashlib.sha256((voice + '\n' + text).encode()).hexdigest()
                path = self.directory / (key + '.mp3')
                if not path.exists():
                    self.notify('กำลังสร้างเสียงไทยออนไลน์…')
                    temporary = path.with_suffix('.partial.mp3')
                    self.renderer(text, voice, temporary)
                    temporary.replace(path)
                if generation != self.generation or not self.enabled:
                    continue
                self.notify('กำลังพูด · ' + ('เสียงไทย Google' if voice == 'google-th' else 'เสียงผู้ชาย'))
                self.player.play(path, self.volume, lambda: self.closed or generation != self.generation or not self.enabled)
                self.notify('เสียงไทยพร้อม · รอข้อความถัดไป')
                cached = sorted(self.directory.glob('*.mp3'), key=lambda p: p.stat().st_mtime)
                for old in cached[:-80]:
                    if old != path:
                        old.unlink(missing_ok=True)
            except Exception as error:
                if generation == self.generation and self.enabled and not self.closed:
                    self.notify('สร้างเสียงไม่ได้ ลองเลือกเสียงไทย Google หรือตรวจอินเทอร์เน็ตแล้วกดทดลองใหม่ (' + type(error).__name__ + ')')
            finally:
                self.active_preview = False
                self.active_chat = False
                self.speaking = False
                self.last_finished = time.monotonic()

    def close(self):
        self.enabled = False
        self.stop()
        with self.condition:
            self.closed = True
            self.condition.notify_all()
