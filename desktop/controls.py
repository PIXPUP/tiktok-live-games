"""Native in-application game controls and five-second demo scheduling."""
import http.client
import json
import random
import threading
import time
import urllib.request

ACTIONS = ('incense', 'temple', 'tree', 'fruit', 'lamp', 'lantern', 'bell', 'grand')
LABELS = {
    'boon-live': ('ตักบาตร', 'ถวายสังฆทาน', 'ถวายผ้าไตร', 'ถวายยา', 'เติมน้ำมัน', 'ถวายพระไตรปิฎก', 'บูรณะโบสถ์', 'ทอดกฐิน'),
    'ganesha-live': ('ถวายดอกไม้', 'ถวายขนมโมทกะ', 'ถวายผลไม้', 'ถวายนม', 'จุดประทีป', 'ถวายธูปหอม', 'บูชาอารตี', 'มหาอารตี'),
    'curry-shop-3d': ('ไข่พะโล้', 'แกงเขียวหวาน', 'ผัดกะเพรา', 'ผัดพริกแกง', 'หมูทอด', 'ข้าวสองอย่าง', 'ชุดอิ่มอร่อย', 'เหมายกร้าน'),
    'alms-live': ('ถวายข้าวสวย', 'ถวายกับข้าว', 'ถวายผลไม้', 'ถวายน้ำดื่ม', 'ถวายขนม', 'ถวายเครื่องดื่ม', 'ถวายชุดอาหาร', 'ร่วมมหาทาน'),
}
ALMS_PRAYER = 'ขออนุโมทนาบุญกับทุกท่านที่มาร่วมตักบาตรยามเช้า ขอให้วันนี้เป็นวันที่ร่มเย็น มีสติ มีกำลังใจ สุขภาพแข็งแรง และครอบครัวอยู่เย็นเป็นสุข ขอบคุณทุกน้ำใจที่ร่วมถวายอาหารแด่พระสงฆ์'
GANESHA_PRAYER = ('พระพิฆเนศ เทพแห่งความสำเร็จ ประทานพรให้ทุกท่าน ทุกคนทำสิ่งใด ปรารถนาสิ่งใด '
                  'ขอให้สำเร็จ สำเร็จ สำเร็จ เป็นอัศจรรย์ทันตาเห็น และผู้ที่ศรัทธาในองค์พระพิฆเนศ '
                  'ที่ร่วมส่งของขวัญเพื่อบูชา ขอให้ชีวิตต่อจากนี้ไป พบเจอความโชคดี มีความสุข '
                  'เงินทองไหลมากอง นองเต็มบ้าน ด้วยบารมีองค์ท่านที่ดูแล '
                  'ผู้ที่รักและศรัทธาองค์พระพิฆเนศ ด้วยเทอญ')


def default_script(game):
    if game and game.key == 'ganesha-live':
        return GANESHA_PRAYER
    if game and game.key == 'alms-live':
        return ALMS_PRAYER
    return 'ขอต้อนรับทุกท่าน ขอบคุณที่มาร่วมกิจกรรม ฝากกดติดตามไว้ แล้วกลับมาพบกันอีก ขอให้มีความสุข สุขภาพแข็งแรง'


class Controls:
    def __init__(self, manager, speech, notify=lambda text: None, interval=5.0):
        self.manager, self.speech, self.notify = manager, speech, notify
        self.interval, self.demo_stop = interval, threading.Event()
        self.read_gifts = False
        self.latest_real_name = None
        self.observed_game = None
        self.demo_thread = None
        self.closed = threading.Event()
        self.thread = threading.Thread(target=self.listen, daemon=True)
        self.thread.start()

    @property
    def demo_running(self):
        return self.demo_thread is not None and self.demo_thread.is_alive() and not self.demo_stop.is_set()

    def send(self, action, name='ผู้ชมทดลอง', preview=False):
        game = self.manager.active
        if not game or not self.manager.running():
            raise RuntimeError('เปิดเกมก่อนทดลองส่งของขวัญ')
        if action not in ACTIONS:
            raise ValueError('Unknown action')
        payload = {'action': action, 'name': str(name).strip()[:40] or 'ผู้ชมทดลอง', 'count': 1}
        if preview:
            payload['preview'] = True
        request = urllib.request.Request(f'http://127.0.0.1:{game.port}/api/event',
                                         data=json.dumps(payload, ensure_ascii=False).encode(),
                                         headers={'Content-Type': 'application/json'})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=4) as response:
            return json.load(response)

    def start_demo(self):
        if self.demo_running:
            return
        if not self.manager.running():
            raise RuntimeError('เปิดเกมก่อนเริ่มเดโม')
        game = self.manager.active
        self.demo_stop = threading.Event()
        stop = self.demo_stop

        def run():
            names = ['แสงดาว', 'ใจดี', 'สายบุญ', 'น้องฟ้า', 'ต้นกล้า', 'มะลิ', 'ปันปัน']
            while not stop.is_set() and not self.closed.is_set():
                if self.manager.active != game or not self.manager.running():
                    break
                try:
                    self.send(random.choice(ACTIONS[:-1]), random.choice(names), preview=True)
                except Exception:
                    self.notify('เดโมหยุดแล้ว กรุณาตรวจว่าเกมยังเปิดอยู่')
                    break
                if stop.wait(self.interval):
                    break
            stop.set()
        self.demo_thread = threading.Thread(target=run, daemon=True)
        self.demo_thread.start()

    def stop_demo(self):
        self.demo_stop.set()
        if self.demo_thread and self.demo_thread is not threading.current_thread():
            self.demo_thread.join(timeout=4.5)

    def listen(self):
        while not self.closed.is_set():
            game = self.manager.active
            if not game or not self.manager.running():
                self.closed.wait(.4)
                continue
            if game != self.observed_game:
                self.latest_real_name = None
                self.observed_game = game
            connection = http.client.HTTPConnection('127.0.0.1', game.port, timeout=20)
            try:
                connection.request('GET', '/api/events')
                response = connection.getresponse()
                if response.status != 200:
                    raise OSError('Game unavailable')
                while not self.closed.is_set() and self.manager.active == game:
                    line = response.readline()
                    if not line:
                        break
                    if not line.startswith(b'data: '):
                        continue
                    message = json.loads(line[6:])
                    event = message.get('event') if 'state' in message else message
                    if not event or event.get('action') not in ACTIONS:
                        continue
                    if event.get('preview') is True:
                        continue
                    self.latest_real_name = str(event.get('name', ''))[:40]
                    if not self.read_gifts:
                        continue
                    name = str(event.get('name', 'ผู้ร่วมกิจกรรม'))[:40]
                    label = LABELS[game.key][ACTIONS.index(event['action'])]
                    if game.key == 'curry-shop-3d':
                        male = getattr(self.speech, 'voice', '') == 'th-TH-NiwatNeural'
                        ending, soft = ('ครับ', 'นะครับ') if male else ('ค่ะ', 'นะคะ')
                        text = f'ขอบคุณคุณ{name} ที่มาสั่ง{label}{ending} ทานให้อร่อย{soft} แล้วแวะมาอีก{soft}'
                    else:
                        text = f'ขอขอบคุณคุณ{name} ที่ร่วม{label} ขอให้มีความสุข สุขภาพแข็งแรง และครอบครัวอยู่เย็นเป็นสุข'
                    self.speech.say(text)
            except (OSError, ValueError, http.client.HTTPException):
                self.closed.wait(.3)
            finally:
                connection.close()

    def close(self):
        self.closed.set()
        self.stop_demo()
        self.speech.close()


class ControlPanel:
    def __init__(self, parent, manager, controller, speech, notify, music=None):
        import tkinter as tk
        from tkinter import ttk
        from speech import VOICES
        self.manager, self.controller, self.speech = manager, controller, speech
        self.music = music
        self.window = tk.Toplevel(parent)
        self.window.title('หน้าควบคุมเกม — TikTok LIVE Game Desk')
        self.window.geometry('820x750')
        self.window.minsize(760, 640)
        self.window.configure(bg='#0b1320')
        self.window.transient(parent)
        self.window.protocol('WM_DELETE_WINDOW', self.close)
        self.loop_id = None
        bg, fg, muted = '#0b1320', '#f0f5fb', '#a9bdd3'
        font = 'Leelawadee UI'
        height = min(750, self.window.winfo_screenheight()-90)
        self.window.geometry(f'820x{height}')
        canvas = tk.Canvas(self.window, bg=bg, highlightthickness=0)
        scrollbar = tk.Scrollbar(self.window, orient='vertical', command=canvas.yview)
        scrollbar.pack(side='right', fill='y')
        canvas.pack(side='left', fill='both', expand=True)
        canvas.configure(yscrollcommand=scrollbar.set)
        self.body = tk.Frame(canvas, bg=bg)
        body_id = canvas.create_window(0, 0, window=self.body, anchor='nw')
        self.body.bind('<Configure>', lambda _: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda e: canvas.itemconfigure(body_id, width=e.width))
        self.window.bind('<MouseWheel>', lambda e: canvas.yview_scroll(-int(e.delta/120), 'units'))

        def text(value, size=11, color=fg):
            label = tk.Label(self.body, text=value, fg=color, bg=bg, font=(font, size), anchor='w')
            label.pack(fill='x', padx=22, pady=4)
            return label

        def button(parent, title, command):
            result = tk.Button(parent, text=title, command=command, font=(font, 11),
                               bg='#25364e', fg=fg, activebackground='#38536e', activeforeground=fg,
                               relief='flat', padx=12, pady=7)
            return result

        self.title = text('หน้าควบคุมเกม', 20)
        text('ทำงานในโปรแกรมนี้ · ไม่ต้องเปิดหน้าควบคุมใน Chrome', 10, muted)
        name_row = tk.Frame(self.body, bg=bg)
        name_row.pack(fill='x', padx=22, pady=8)
        tk.Label(name_row, text='ชื่อผู้ชมทดลอง', font=(font, 11), bg=bg, fg=fg).pack(side='left', padx=(0, 12))
        self.name = tk.StringVar(value='ผู้ชมทดลอง')
        tk.Entry(name_row, textvariable=self.name, font=(font, 12), width=30).pack(side='left')
        self.notice = text('เลือกกิจกรรมเพื่อส่งเข้าหน้าจอเกมที่เปิดอยู่', 10, muted)
        gifts = tk.Frame(self.body, bg=bg)
        gifts.pack(fill='x', padx=18)
        self.gifts = []

        def send(action):
            name = self.name.get()
            def run():
                try:
                    controller.send(action, name, preview=True)
                except Exception as error:
                    notify(str(error))
            threading.Thread(target=run, daemon=True).start()
        for index, action in enumerate(ACTIONS):
            b = button(gifts, action, lambda a=action: send(a))
            b.grid(row=index // 4, column=index % 4, padx=4, pady=4, sticky='ew')
            gifts.columnconfigure(index % 4, weight=1)
            self.gifts.append(b)
        demo_row = tk.Frame(self.body, bg=bg)
        demo_row.pack(fill='x', padx=22, pady=8)

        def toggle_demo():
            try:
                if controller.demo_running:
                    controller.stop_demo()
                else:
                    controller.start_demo()
            except Exception as error:
                notify(str(error))
        self.demo = button(demo_row, 'เปิดเดโม · 5 วิ / 1 คน', toggle_demo)
        self.demo.pack(side='left')
        button(demo_row, 'หยุดเสียง / ล้างคิว', speech.stop).pack(side='left', padx=8)
        text('เดโมส่งครั้งละ 1 คน · ไม่เพิ่มอันดับจริง · ของขวัญจริงแทรกก่อนเดโม', 9, muted)
        music_row = tk.Frame(self.body, bg=bg)
        music_row.pack(fill='x', padx=22, pady=8)
        def toggle_music():
            if not self.music:
                return
            try:
                if self.music.running:
                    self.music.stop()
                else:
                    self.music.start()
            except Exception:
                notify('เปิดเพลงไม่ได้ กรุณาตรวจอุปกรณ์เสียงแล้วลองใหม่')
        self.music_button = button(music_row, 'เปิดเพลงคลอ', toggle_music)
        self.music_button.pack(side='left')
        self.music_volume = tk.Scale(music_row, from_=0, to=70, orient='horizontal',
                                    label='ความดังเพลง', bg=bg, fg=fg, troughcolor='#25364e',
                                    highlightthickness=0, length=280, font=(font, 10),
                                    command=lambda value: self.music.set_volume(float(value)/100) if self.music else None)
        self.music_volume.set((self.music.volume if self.music else .35)*100)
        self.music_volume.pack(side='left', padx=16)
        text('เพลงออกจากโปรแกรม วนให้อัตโนมัติและลดเสียงตอนพูด ไม่ต้องเปิดเพลงซ้ำในหน้าเว็บ', 9, muted)
        text('เสียงพูดภาษาไทยออนไลน์', 16)
        text('ไม่ต้องติดตั้งโมเดลหรือเสียงไทยใน Windows · ต้องใช้อินเทอร์เน็ต', 10, muted)
        voice_row = tk.Frame(self.body, bg=bg)
        voice_row.pack(fill='x', padx=22, pady=5)
        self.voice_name = tk.StringVar(value=next((k for k, v in VOICES.items() if v == speech.voice), next(iter(VOICES))))
        voices = ttk.Combobox(voice_row, textvariable=self.voice_name, values=list(VOICES), state='readonly', width=22, font=(font, 11))
        voices.pack(side='left')
        voices.bind('<<ComboboxSelected>>', lambda _: setattr(speech, 'voice', VOICES[self.voice_name.get()]))
        self.enabled = tk.BooleanVar(value=controller.read_gifts)

        def enable():
            controller.read_gifts = self.enabled.get()
            if controller.read_gifts:
                speech.enabled = True
            elif not self.loop.get():
                speech.stop()
        tk.Checkbutton(voice_row, text='กล่าวขอบคุณเมื่อมีของขวัญ', variable=self.enabled, command=enable,
                       font=(font, 11), bg=bg, fg=fg, selectcolor='#25364e', activebackground=bg,
                       activeforeground=fg).pack(side='left', padx=10)

        def preview():
            speech.enabled = True
            speech.say('ขอให้มีความสุข สุขภาพแข็งแรง และพบเจอแต่สิ่งดีงาม')
        button(voice_row, 'ทดลองเสียง', preview).pack(side='right')
        self.volume = tk.Scale(self.body, from_=0, to=100, orient='horizontal',
                               label='ความดังเสียงพูด', bg=bg, fg=fg, troughcolor='#25364e',
                               highlightthickness=0, font=(font, 10),
                               command=lambda value: setattr(speech, 'volume', float(value) / 100))
        self.volume.set(speech.volume * 100)
        self.volume.pack(fill='x', padx=22)
        self.speech_state = text('กดทดลองเสียงเพื่อเริ่มฟัง', 10, '#70e0b3')
        text('ข้อความและชื่อที่อ่านจะส่งไปยังบริการเสียงออนไลน์ · เสียงออกที่ลำโพงคอม', 9, muted)
        text('ใน LIVE Studio ให้จับเสียงระบบ และปิดเสียงอวยพรจากหน้าเว็บเพื่อไม่ให้พูดซ้ำ', 9, muted)
        text('บทพูดระหว่างไลฟ์', 13)
        self.script = tk.Text(self.body, height=4, font=(font, 11), wrap='word', bg='#162235', fg=fg, insertbackground=fg)
        self.script.pack(fill='both', expand=True, padx=22, pady=3)
        game = manager.active
        self.script.insert('1.0', default_script(game))
        ambient = tk.Frame(self.body, bg=bg)
        ambient.pack(fill='x', padx=22, pady=(6, 16))

        def speak_script():
            speech.enabled = True
            speech.say(self.script.get('1.0', 'end'))
        button(ambient, 'พูดบทนี้', speak_script).pack(side='left')
        self.loop = tk.BooleanVar(value=False)

        def loop_tick():
            if self.loop.get():
                speech.enabled = True
                if time.monotonic() - speech.last_finished >= 20:
                    speech.say(self.script.get('1.0', 'end'), ambient=True)
                self.loop_id = self.window.after(1000, loop_tick)

        def toggle_loop():
            if self.loop_id:
                self.window.after_cancel(self.loop_id)
                self.loop_id = None
            if self.loop.get():
                loop_tick()
        tk.Checkbutton(ambient, text='พูดวน · เว้นอย่างน้อย 20 วินาที', variable=self.loop, command=toggle_loop,
                       font=(font, 11), bg=bg, fg=fg, selectcolor='#25364e',
                       activebackground=bg, activeforeground=fg).pack(side='left', padx=12)

        self.notify = notify
        self.key = None
        self.refresh()

    def refresh(self):
        if not self.window.winfo_exists():
            return
        game = self.manager.active
        running = game is not None and self.manager.running()
        if self.controller.latest_real_name:
            self.notice.configure(text='ผู้ส่งของขวัญจริงล่าสุด: '+self.controller.latest_real_name)
        else:
            self.notice.configure(text='เปิดเดโมค้างได้ · ของขวัญจริงจะแทรกก่อนเดโม')
        self.title.configure(text='ควบคุม: ' + game.title if running else 'ยังไม่ได้เปิดเกม')
        for i, button in enumerate(self.gifts):
            button.configure(text=LABELS[game.key][i] if game else ACTIONS[i], state='normal' if running else 'disabled')
        self.demo.configure(text='หยุดเดโม' if self.controller.demo_running else 'เปิดเดโม · 5 วิ / 1 คน', state='normal' if running else 'disabled')
        supported = running and game.key in ('boon-live', 'ganesha-live', 'alms-live') and self.music is not None
        self.music_button.configure(text='ปิดเพลงคลอ' if self.music and self.music.running else 'เปิดเพลงคลอ', state='normal' if supported else 'disabled')
        if game and self.key != game.key:
            self.key = game.key
            self.script.delete('1.0', 'end')
            self.script.insert('1.0', default_script(game))
        self.window.after(500, self.refresh)

    def show_status(self, message):
        if self.window.winfo_exists():
            self.speech_state.configure(text=message)

    def close(self):
        self.loop.set(False)
        if self.loop_id:
            self.window.after_cancel(self.loop_id)
        if self.window.winfo_exists():
            self.window.destroy()
