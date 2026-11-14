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
            started = False
            deadline = time.monotonic() + 2
            while not cancelled():
                with self.lock:
                    mode = self.command('status ' + self.alias + ' mode')
                if mode == 'playing':
                    started = True
                elif started:
                    break
                elif mode == 'stopped':
                    try:
                        position = float(self.command('status ' + self.alias + ' position'))
                        length = float(self.command('status ' + self.alias + ' length'))
                        if length > 0 and position >= length:
                            break
                    except (OSError, ValueError):
                        pass
                if not started and time.monotonic() >= deadline:
                    raise OSError('Audio device did not start playback')
                time.sleep(.08)
        finally:
            self.stop()


class Speech:
    def __init__(self, directory, notify=lambda text: None, renderer=None, player=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.notify = notify
        self.enabled, self.voice, self.volume = False, next(iter(VOICES.values())), .8
        self.pending = collections.deque(maxlen=40)
        self.condition = threading.Condition()
        self.generation, self.closed, self.speaking = 0, False, False
        self.last_finished = 0
        self.active_preview = False
        self.active_chat = False
        self.player = player or Player()
        self.renderer = renderer or self.render
        self.custom_renderer = renderer is not None
        self.active_text = self.active_voice = None
        self.active_generation = None
        self.failed_text = None
        self.stage = 'รอข้อความ'
        self.counts = {'played': 0, 'retried': 0, 'failed': 0, 'rejected': 0, 'merged': 0, 'background_skipped': 0}
        self.prune_plays = 0
        self.last_prune = time.monotonic()
        self.thread = threading.Thread(target=self.worker, daemon=True)
        self.thread.start()

    def render(self, text, voice, path):
        if voice == 'google-th':
            from gtts import gTTS
            gTTS(text, lang='th', lang_check=False, timeout=(5, 12)).save(str(path))
            if path.stat().st_size < 500:
                raise OSError('Empty Thai audio')
            return
        import edge_tts
        text = spoken_phrases(text)

        async def generate():
            await asyncio.wait_for(edge_tts.Communicate(text, voice).save(str(path)), 18)
            if path.stat().st_size < 500:
                raise OSError('Empty Thai audio')
        asyncio.run(generate())

    def say(self, text, ambient=False, preview=False, chat=False):
        text = str(text).strip()[:1800]
        with self.condition:
            if not self.enabled or not text or self.closed:
                return False
            if (ambient or preview) and (self.speaking or self.pending):
                self.counts['background_skipped'] += 1
                return False
            if chat:
                if len(self.pending) >= 40 or sum(item[4] for item in self.pending) >= 8:
                    self.counts['rejected'] += 1
                    self.notify('คิวสาธุเต็ม ข้อความนี้ยังไม่ได้เข้าคิวเสียง')
                    return False
                if self.active_preview:
                    self.generation += 1
                    self.active_preview = False
                    self.player.stop()
                    self.pending = collections.deque(((t,v,self.generation,d,c) for t,v,_,d,c in self.pending),maxlen=40)
                self.pending.append((text, self.voice, self.generation, False, True))
            elif not ambient and not preview:
                if (self.speaking and self.active_generation == self.generation and self.stage in ('เตรียมเสียง','กำลังสร้างเสียง','กำลังเล่นเสียง','กำลังลองซ้ำ') and not self.active_preview and not self.active_chat
                        and self.active_text == text and self.active_voice == self.voice) or any(t == text and v == self.voice and not d and not c for t,v,_,d,c in self.pending):
                    self.counts['merged'] += 1
                    return True
                if sum(not d and not c for t,v,g,d,c in self.pending) >= 32:
                    self.counts['rejected'] += 1
                    self.failed_text = text
                    self.notify('คิวอ่านชื่อเต็ม ยังไม่ได้อ่าน: ' + text[:55])
                    return False
                if self.active_preview or self.active_chat:
                    self.generation += 1
                    self.active_preview = self.active_chat = False
                    self.player.stop()
                normal = [(t, v, self.generation, False, False) for t, v, _, demo, comment in self.pending if not demo and not comment]
                comments = [(t, v, self.generation, False, True) for t, v, _, demo, comment in self.pending if comment]
                normal.append((text, self.voice, self.generation, False, False))
                self.pending = collections.deque(normal + comments, maxlen=40)
            else:
                self.pending.append((text, self.voice, self.generation, preview or ambient, False))
            self.condition.notify()
            return True

    def stop(self):
        with self.condition:
            self.generation += 1
            self.pending.clear()
            self.stage = 'หยุดเสียงแล้ว'
        self.player.stop()

    def snapshot(self):
        # The Tk event loop must never wait for an audio-device lock.
        return dict(self.counts, queued=len(self.pending), stage=self.stage, failed_text=self.failed_text)

    def retry_last(self):
        if not self.failed_text:
            return False
        self.enabled = True
        return self.say(self.failed_text)

    def prune_cache(self):
        self.prune_plays += 1
        if self.prune_plays < 20 and time.monotonic() - self.last_prune < 60:
            return
        self.prune_plays = 0
        self.last_prune = time.monotonic()
        try:
            cached = sorted((p for p in self.directory.glob('*.mp3') if '.partial.' not in p.name), key=lambda p:p.stat().st_mtime)
            for old in cached[:-160]: old.unlink(missing_ok=True)
        except OSError:
            pass  # Cache housekeeping must not turn successful playback into a voice failure.

    def worker(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.pending or self.closed)
                if self.closed:
                    return
                text, voice, generation, self.active_preview, self.active_chat = self.pending.popleft()
                self.active_text, self.active_voice, self.active_generation = text, voice, generation
                self.speaking = True
                self.stage = 'เตรียมเสียง'
            cancelled = lambda: self.closed or generation != self.generation or not self.enabled
            path = self.directory / (hashlib.sha256((voice + '\n' + text).encode()).hexdigest() + '.mp3')
            temporary = path.with_suffix('.partial.mp3')
            try:
                for attempt in range(2):
                    if cancelled(): break
                    step = 'สร้างเสียง'
                    try:
                        if path.exists() and not self.custom_renderer and path.stat().st_size < 500:
                            path.unlink()
                        if not path.exists():
                            self.stage = 'กำลังสร้างเสียง'
                            self.notify('กำลังสร้างเสียง · ' + text[:55])
                            self.renderer(text, voice, temporary)
                            temporary.replace(path)
                        if cancelled(): break
                        step = 'เล่นเสียง'
                        self.stage = 'กำลังเล่นเสียง'
                        self.notify('กำลังพูด · ' + text[:55])
                        self.player.play(path, self.volume, cancelled)
                        if cancelled(): break
                        self.counts['played'] += 1
                        if self.failed_text == text: self.failed_text = None
                        self.stage = 'พร้อมอ่านชื่อถัดไป'
                        self.notify('อ่านเสียงแล้ว · ' + text[:55])
                        self.prune_cache()
                        break
                    except Exception as error:
                        if cancelled(): break
                        if attempt == 0:
                            self.counts['retried'] += 1
                            self.stage = 'กำลังลองซ้ำ'
                            self.notify(step + 'สะดุด กำลังลองซ้ำ · ' + text[:45])
                            with self.condition: self.condition.wait(.25)
                        else:
                            self.counts['failed'] += 1
                            self.failed_text = text
                            self.stage = step + 'ไม่สำเร็จ'
                            self.notify(step + 'ไม่สำเร็จ กดลองอ่านชื่อที่ไม่สำเร็จ (' + type(error).__name__ + ') · ' + text[:45])
            finally:
                self.active_preview = False
                self.active_chat = False
                self.active_text = self.active_voice = None
                self.active_generation = None
                self.speaking = False
                self.last_finished = time.monotonic()

    def close(self):
        self.enabled = False
        self.stop()
        with self.condition:
            self.closed = True
            self.condition.notify_all()
