"""Small pre-rendered original music loop; no browser or model is required."""
import array
import math
import threading
import time
import wave
from pathlib import Path
from speech import Player


def render_music(path):
    # Original note sequence from the games' createOriginalMusic engine.
    melody = [72, None, 76, 79, 81, None, 79, 76, 74, None, 76, 79, 76, None, 74, 72,
              69, None, 72, 76, 79, None, 76, 72, 67, None, 69, 72, 74, None, 72, 67]
    chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 60]]
    sample_rate, beat = 22050, 60 / 64
    count = round(len(melody) * beat * sample_rate)
    samples = [0.0] * count

    def tone(note, start, duration, gain, pad=False):
        frequency = 440 * 2 ** ((note - 69) / 12)
        first, length = round(start * sample_rate), round(duration * sample_rate)
        for offset in range(min(length, count - first)):
            t = offset / sample_rate
            envelope = min(1, t / (1.2 if pad else .025)) * math.exp(-t / (2.8 if pad else .65))
            samples[first + offset] += math.sin(2 * math.pi * frequency * t) * envelope * gain
    for index, note in enumerate(melody):
        if index % 8 == 0:
            for chord_note in chords[index // 8]:
                tone(chord_note, index * beat, beat * 8, .035, True)
        if note is not None:
            tone(note, index * beat, 2.6, .20)
            tone(note + 12, index * beat, 1.1, .025)
    pcm = array.array('h')
    for index, value in enumerate(samples):
        fade = min(1, index / (sample_rate * .1), (count - index - 1) / (sample_rate * .3))
        pcm.append(round(max(-.85, min(.85, value * fade)) * 32767))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as output:
        output.setparams((1, 2, sample_rate, count, 'NONE', 'not compressed'))
        output.writeframes(pcm.tobytes())


class Music:
    def __init__(self, path, speaking=lambda: False):
        self.path = Path(path)
        self.speaking = speaking
        self.player = Player('desk_music')
        self.volume, self.running = .35, False
        self.lock, self.closed = threading.RLock(), threading.Event()
        self.gain = None
        self.status, self.error, self.volume_warning = 'ปิดเพลง', '', ''
        self.manual_loop = False
        self.device_errors = 0
        self.thread = threading.Thread(target=self.watch, daemon=True)
        self.thread.start()

    def start(self):
        with self.lock:
            if self.running:
                return
            if not self.path.exists():
                if self.path.suffix.lower() == '.mp3' or self.path.name == 'dance-native.wav':
                    raise FileNotFoundError('ไม่พบไฟล์เพลงที่เลือก กรุณาแตก ZIP โปรแกรมให้ครบ')
                if self.path.name == 'dance-music.wav':
                    from ramwong_music import render_ramwong
                    render_ramwong(self.path)
                else:
                    render_music(self.path)
            self.error = self.volume_warning = ''
            for attempt in range(2):
                self.status = 'กำลังเปิดเพลง…' if attempt == 0 else 'อุปกรณ์เสียงเริ่มช้า กำลังลองใหม่…'
                self.player.stop()  # Release a stale alias left by an earlier failed start.
                self.gain = None
                try:
                    self.player.command(f'open "{self.path.resolve()}" type mpegvideo alias desk_music')
                    self.apply_gain(force=True)
                    self.manual_loop = False
                    try:
                        self.player.command('play desk_music repeat')
                    except OSError:
                        self.manual_loop = True
                        self.player.command('play desk_music from 0')
                    self.wait_started()
                    self.running = True
                    self.device_errors = 0
                    self.status = 'กำลังเล่นเพลง'
                    return
                except Exception as error:
                    self.running = False
                    self.player.stop()
                    if self.closed.is_set():
                        return
                    if attempt == 0:
                        if self.closed.wait(.5): return
                    else:
                        self.error = str(error)
                        self.status = 'เปิดเพลงไม่สำเร็จ · กดเปิดเพื่อลองใหม่'
                        raise

    def wait_started(self):
        deadline = time.monotonic() + 5
        while not self.closed.is_set():
            if self.player.command('status desk_music mode') == 'playing':
                return
            if time.monotonic() >= deadline:
                raise OSError('อุปกรณ์เสียงยังไม่เริ่มเล่นภายใน 5 วินาที')
            self.closed.wait(.1)
        raise OSError('ปิดโปรแกรมระหว่างเปิดเพลง')

    def apply_gain(self, force=False):
        gain = round(self.volume * (.2 if self.speaking() else 1) * 1000)
        if (self.running or force) and gain != self.gain:
            try:
                self.player.command('setaudio desk_music volume to ' + str(gain))
                self.volume_warning = ''
            except OSError as error:
                # Some older drivers play successfully but reject volume control.
                self.volume_warning = 'ปรับความดังอัตโนมัติไม่ได้ · ใช้ความดังระบบ (' + str(error) + ')'
            self.gain = gain

    def set_volume(self, value):
        # Slider callbacks must never wait for a slow Windows audio device.
        self.volume = max(0, min(1, float(value)))

    def watch(self):
        while not self.closed.wait(.25):
            with self.lock:
                if self.running:
                    try:
                        self.apply_gain()
                        mode = self.player.command('status desk_music mode')
                        if mode == 'stopped':
                            # Also recover when a driver accepts repeat but ignores it.
                            self.player.command('play desk_music from 0')
                            self.wait_started()
                        self.device_errors = 0
                    except OSError as error:
                        self.device_errors += 1
                        if self.device_errors >= 3:
                            self.error = str(error)
                            self.stop()
                            self.status = 'เพลงหยุดจากอุปกรณ์เสียง · กดเปิดเพื่อลองใหม่'

    def stop(self):
        with self.lock:
            self.running, self.gain = False, None
            self.player.stop()
            self.status = 'ปิดเพลง'

    def close(self):
        self.closed.set()
        self.stop()


if __name__ == '__main__':
    import sys
    render_music(sys.argv[1])
