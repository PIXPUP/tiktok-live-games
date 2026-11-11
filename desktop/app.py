"""Windows desktop entry point and bundled Python service host."""
import os
import queue
import runpy
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(ROOT / 'desktop'))


def service(args):
    # A windowed executable has no Python stdout, even with redirected OS handles.
    destination = os.environ.get('DESK_SERVICE_LOG', os.devnull)
    sys.stdout = sys.stderr = open(destination, 'a', encoding='utf-8', buffering=1)
    if args[0] in ('game', 'script'):
        target = Path(args[1]) / 'server.py' if args[0] == 'game' else Path(args[1])
        runpy.run_path(str(target), run_name='__main__')
    elif args[0] == 'gateway':
        from gateway import serve
        serve(int(args[1]), int(args[2]))
    else:
        raise ValueError('Unknown service')


def self_test(report_path):
    """Exercise the actual frozen executable and its bundled runtimes, isolated from LIVE."""
    import dataclasses
    import json
    import socket
    import tempfile
    import traceback
    from manager import GAMES, Manager, json_get

    def port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            return sock.getsockname()[1]

    results = []
    try:
        with tempfile.TemporaryDirectory(prefix='game-desk-test-') as temporary:
            manager = Manager(ROOT, temporary)
            try:
                for original in GAMES:
                    game = dataclasses.replace(original, port=port(), bridge=port(), gateway=port())
                    manager.start(game)
                    assert manager.running()
                    if '--test-tunnel' in sys.argv:
                        url = manager.start_public()
                        assert url.startswith('https://')
                    results.append({'game': game.key, 'running': True, 'public': bool(manager.public_url)})
                    manager.stop()
                    assert not manager.running()
            finally:
                manager.close()
        result = {'ok': True, 'games': results}
    except Exception:
        result = {'ok': False, 'games': results, 'error': traceback.format_exc()}
    Path(report_path).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if result['ok'] else 1


def main():
    import tkinter as tk
    from tkinter import filedialog, messagebox
    from manager import GAMES, Manager, VERSION

    # A second copy must not compete for ownership of the same game processes.
    mutex = None
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
        kernel.CreateMutexW.restype = wintypes.HANDLE
        mutex = kernel.CreateMutexW(None, False, 'Local\\TikTokLiveGameDesk')
        if ctypes.get_last_error() == 183:
            messagebox.showinfo('เปิดแอปอยู่แล้ว', 'TikTok LIVE Game Desk เปิดอยู่แล้ว ดูที่แถบงานด้านล่างได้เลยค่ะ')
            return

    data = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'TikTokLiveGameDesk'
    messages = queue.Queue()
    manager = Manager(ROOT, data, lambda text: messages.put(('message', text)))
    window = tk.Tk()
    window.title('TikTok LIVE Game Desk — รวมเกมไลฟ์')
    height = min(780, window.winfo_screenheight() - 90)
    window.geometry(f'1140x{height}')
    window.minsize(1000, 620)
    bg, surface, muted, text, green = '#0b1320', '#162235', '#9baec7', '#f0f5fb', '#70e0b3'
    window.configure(bg=bg)
    font = 'Leelawadee UI'
    busy, closing = False, False
    cards = {}
    status = tk.StringVar(value='เลือกเกมที่ต้องการ แล้วกด «เปิดเกม»')
    gift = tk.StringVar(value='TikFinity ยังไม่ได้เชื่อม')
    public = tk.StringVar(value='ยังไม่มีลิงก์ — เปิดเกมแล้วกด «สร้างลิงก์ไลฟ์»')

    def label(parent, value, size=12, color=text, **options):
        return tk.Label(parent, text=value, font=(font, size), fg=color, bg=parent['bg'], **options)

    def button(parent, title, command, primary=False, width=None):
        result = tk.Button(parent, text=title, command=command, font=(font, 12, 'bold'),
                           bg=green if primary else '#25364e', fg='#0b2420' if primary else text,
                           activebackground='#a1f0ce' if primary else '#354a65', activeforeground='#0b2420' if primary else text,
                           disabledforeground='#708198', relief='flat', bd=0, padx=16, pady=9, cursor='hand2')
        if width:
            result.configure(width=width)
        return result

    def work(function, done=None):
        nonlocal busy
        if busy:
            return
        busy = True
        refresh()

        def worker():
            try:
                result = function()
                messages.put(('done', (done, result)))
            except Exception as error:
                messages.put(('error', str(error)))
        threading.Thread(target=worker, daemon=True).start()

    def open_game(game):
        if manager.active == game and manager.running():
            webbrowser.open(game.url)
            return
        if manager.active and not messagebox.askyesno('เปลี่ยนเกม', 'ปิดเกมปัจจุบันและเปิดเกมนี้แทนไหม?\nคะแนน/คิวรอบเดิมจะถูกล้าง และลิงก์ไลฟ์เดิมจะหยุดทำงาน'):
            return

        def start():
            manager.stop()
            manager.start(game)
        work(start, lambda _: webbrowser.open(game.url))

    def stop_game():
        if manager.active and messagebox.askyesno('ปิดเกม', 'ปิดเกมและลิงก์ไลฟ์ไหม?\nคะแนน/คิวรอบนี้จะถูกล้าง'):
            work(manager.stop, lambda _: status.set('ปิดเกมแล้ว เลือกเกมใหม่ได้เลย'))

    def public_start():
        work(manager.start_public)

    def copy_link():
        if manager.public_url:
            window.clipboard_clear()
            window.clipboard_append(manager.public_url)
            status.set('คัดลอกลิงก์แล้ว ไปวางใน TikTok LIVE Studio → เพิ่ม Link ได้เลย')

    def launch_tikfinity():
        settings_path = data / 'settings.json'
        import json
        try:
            configured = json.loads(settings_path.read_text(encoding='utf-8')).get('tikfinity', '')
        except (OSError, ValueError):
            configured = ''
        local = Path(os.environ.get('LOCALAPPDATA', ''))
        candidates = [Path(configured)] if configured else []
        candidates += [local / 'Programs' / folder / 'TikFinity.exe' for folder in ('TikFinity', 'tikfinity', 'TikFinity Desktop')]
        for candidate in candidates:
            if candidate.is_file() and candidate.suffix.lower() == '.exe':
                import subprocess
                subprocess.Popen([str(candidate)], cwd=candidate.parent,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                return
        if messagebox.askyesno('เปิด TikFinity', 'ถ้าติดตั้ง TikFinity แล้ว กด «ใช่» เพื่อเลือกตัวโปรแกรมครั้งเดียว\nถ้ายังไม่ได้ติดตั้ง กด «ไม่ใช่» เพื่อเปิดหน้าดาวน์โหลด'):
            path = filedialog.askopenfilename(title='เลือก TikFinity.exe', filetypes=[('TikFinity program', '*.exe')])
            if path:
                settings_path.write_text(json.dumps({'tikfinity': path}), encoding='utf-8')
                launch_tikfinity()
        else:
            webbrowser.open('https://tikfinity.zerody.one/')

    def help_user():
        messagebox.showinfo('เริ่มไลฟ์ใน 4 ขั้นตอน',
            '1. เลือกเกมแล้วกดเปิดเกม หน้าควบคุมจะเปิดให้\n'
            '2. เปิด TikFinity ใส่ @ ของผู้ไลฟ์ เริ่ม LIVE แล้วกด Connect\n'
            '3. กดสร้างลิงก์ไลฟ์ → คัดลอกลิงก์ → วางใน LIVE Studio (1080 × 1920)\n'
            '4. เปิดเสียงจากหน้าที่ส่งออกไลฟ์ และตรวจภาพ/เสียงก่อนใช้งาน\n\n'
            'เก็บแอปนี้เปิดไว้ระหว่างไลฟ์ ปิดแอปจะหยุดเกมและลิงก์\n'
            'ลิงก์ Cloudflare อาจเปลี่ยนเมื่อสร้างใหม่ ผู้มีลิงก์เห็นชื่อ/คะแนนได้\n'
            'TikFinity กับ TikTok LIVE Studio ยังต้องเข้าสู่ระบบด้วยตนเอง')

    # Scroll on small laptop displays instead of clipping the lower controls.
    canvas = tk.Canvas(window, bg=bg, highlightthickness=0)
    scrollbar = tk.Scrollbar(window, orient='vertical', command=canvas.yview)
    scrollbar.pack(side='right', fill='y')
    canvas.pack(side='left', fill='both', expand=True)
    canvas.configure(yscrollcommand=scrollbar.set)
    content = tk.Frame(canvas, bg=bg)
    content_id = canvas.create_window(0, 0, window=content, anchor='nw')
    content.bind('<Configure>', lambda _: canvas.configure(scrollregion=canvas.bbox('all')))
    canvas.bind('<Configure>', lambda event: canvas.itemconfigure(content_id, width=event.width))
    window.bind('<MouseWheel>', lambda event: canvas.yview_scroll(-int(event.delta / 120), 'units'))

    header = tk.Frame(content, bg=bg)
    header.pack(fill='x', padx=28, pady=(22, 14))
    label(header, 'LIVE GAME DESK', 10, green).pack(anchor='w')
    label(header, 'ทุกเกมไลฟ์ อยู่ที่เดียว', 26).pack(anchor='w', pady=(3, 2))
    label(header, 'เลือกเกม • เปิดหน้าควบคุม • คัดลอกลิงก์ขึ้นไลฟ์', 12, muted).pack(anchor='w')
    top_actions = tk.Frame(header, bg=bg)
    top_actions.place(relx=1, rely=.2, anchor='ne')
    button(top_actions, 'เปิด TikFinity', launch_tikfinity).pack(side='left', padx=4)
    button(top_actions, 'วิธีใช้งาน', help_user).pack(side='left', padx=4)

    row = tk.Frame(content, bg=bg)
    row.pack(fill='x', padx=24)
    for index, game in enumerate(GAMES):
        card = tk.Frame(row, bg=surface, padx=18, pady=16, highlightthickness=1, highlightbackground='#2b3c55')
        card.grid(row=0, column=index, sticky='nsew', padx=5)
        row.columnconfigure(index, weight=1, uniform='card')
        label(card, f'0{index+1}  /  INTERACTIVE LIVE', 9, green).pack(anchor='w')
        label(card, game.title, 20).pack(anchor='w', pady=(10, 5))
        label(card, game.description, 11, muted, wraplength=285, justify='left', height=2).pack(anchor='w')
        state = label(card, '● ปิดอยู่', 11, muted)
        state.pack(anchor='w', pady=(13, 8))
        start_button = button(card, 'เปิดเกม', lambda g=game: open_game(g), True)
        start_button.pack(fill='x')
        cards[game.key] = (state, start_button, card)

    panel = tk.Frame(content, bg=surface, padx=20, pady=15)
    panel.pack(fill='x', padx=29, pady=(17, 10))
    active_title = label(panel, 'ยังไม่ได้เปิดเกม', 16)
    active_title.pack(anchor='w')
    tk.Label(panel, textvariable=gift, font=(font, 11), bg=surface, fg=muted).pack(anchor='w', pady=(3, 10))
    controls = tk.Frame(panel, bg=surface)
    controls.pack(fill='x')
    control_button = button(controls, 'หน้าควบคุมเกม', lambda: webbrowser.open(manager.active.url) if manager.active else None)
    control_button.pack(side='left', padx=(0, 7))
    screen_button = button(controls, 'หน้าจอไลฟ์ในเครื่อง', lambda: webbrowser.open(manager.active.url + '&overlay=1') if manager.active else None)
    screen_button.pack(side='left', padx=(0, 7))
    stop_button = button(controls, 'ปิดเกม', stop_game)
    stop_button.pack(side='right')

    links = tk.Frame(content, bg=surface, padx=20, pady=14)
    links.pack(fill='x', padx=29)
    label(links, 'ลิงก์สำหรับ TikTok LIVE Studio', 15).pack(anchor='w')
    entry = tk.Entry(links, textvariable=public, state='readonly', readonlybackground='#0d1828',
                     fg=green, font=(font, 11), relief='flat', bd=0)
    entry.pack(fill='x', ipady=10, pady=(8, 9))
    link_controls = tk.Frame(links, bg=surface)
    link_controls.pack(fill='x')
    create_button = button(link_controls, 'สร้างลิงก์ไลฟ์', public_start, True)
    create_button.pack(side='left', padx=(0, 7))
    copy_button = button(link_controls, 'คัดลอกลิงก์', copy_link)
    copy_button.pack(side='left', padx=(0, 7))
    view_button = button(link_controls, 'เปิดลิงก์', lambda: webbrowser.open(manager.public_url))
    view_button.pack(side='left')
    stop_link_button = button(link_controls, 'ปิดลิงก์', lambda: work(manager.stop_public))
    stop_link_button.pack(side='right')

    bottom = tk.Frame(content, bg=bg)
    bottom.pack(fill='x', padx=29, pady=(14, 6))
    tk.Label(bottom, textvariable=status, font=(font, 11), bg=bg, fg=green, anchor='w',
             wraplength=800, justify='left').pack(side='left', fill='x', expand=True)

    def copy_help():
        window.clipboard_clear()
        window.clipboard_append(manager.diagnostics())
        status.set('คัดลอกข้อมูลช่วยเหลือแล้ว ส่งให้ผู้ดูแลได้โดยไม่ต้องเปิดไฟล์เอง')
    def help_or_cancel():
        if busy:
            manager.cancel.set()
            status.set('กำลังยกเลิก กรุณารอสักครู่…')
        else:
            copy_help()
    help_button = button(bottom, 'คัดลอกข้อมูลช่วยเหลือ', help_or_cancel)
    help_button.pack(side='right')
    label(content, 'เปิดได้ทีละเกม • ปิดแอปจะหยุดเกมและลิงก์ที่แอปนี้เปิดไว้ • v' + VERSION, 9, muted).pack(pady=(3, 8))

    def refresh():
        help_button.configure(text='ยกเลิกการทำงาน' if busy else 'คัดลอกข้อมูลช่วยเหลือ')
        active = manager.active
        running = active is not None and manager.running()
        for game in GAMES:
            state, start_button, card = cards[game.key]
            chosen = running and active == game
            state.configure(text='● กำลังเปิดอยู่' if chosen else '● ปิดอยู่', fg=green if chosen else muted)
            card.configure(highlightbackground=green if chosen else '#2b3c55')
            start_button.configure(state='disabled' if busy else 'normal', text='เปิดหน้าควบคุม' if chosen else 'เปิดเกม')
        active_title.configure(text=('กำลังใช้: ' + active.title) if running else 'ยังไม่ได้เปิดเกม')
        for item in (control_button, screen_button, stop_button, create_button):
            item.configure(state='normal' if running and not busy else 'disabled')
        valid_link = bool(manager.public_url) and running and manager.processes.get('tunnel') and manager.processes['tunnel'].poll() is None
        for item in (copy_button, view_button, stop_link_button):
            item.configure(state='normal' if valid_link and not busy else 'disabled')
        public.set(manager.public_url if valid_link else 'ยังไม่มีลิงก์ — เปิดเกมแล้วกด «สร้างลิงก์ไลฟ์»')
        create_button.configure(text='ลิงก์พร้อมแล้ว' if valid_link else 'สร้างลิงก์ไลฟ์')

    def poll():
        nonlocal busy
        if closing:
            return
        while not messages.empty():
            kind, content = messages.get_nowait()
            if kind == 'message':
                status.set(content)
            elif kind == 'gift':
                gift.set(content)
            elif kind == 'done':
                busy = False
                callback, result = content
                if callback:
                    callback(result)
            elif kind == 'error':
                busy = False
                status.set(content)
                if content != 'ยกเลิกแล้ว':
                    messagebox.showerror('ยังทำรายการไม่สำเร็จ', content)
        if not closing:
            refresh()
            window.after(180, poll)

    def health_loop():
        import time
        while not closing:
            messages.put(('gift', manager.gift_status()))
            time.sleep(2)

    def on_close():
        nonlocal closing
        if busy:
            if not messagebox.askyesno('ยกเลิกและออก', 'ยกเลิกงานที่กำลังทำและออกจากแอปไหม?'):
                return
            manager.cancel.set()
        if manager.active and not messagebox.askyesno('ออกจากแอป', 'ปิดเกมและลิงก์ไลฟ์ แล้วออกจากแอปไหม?'):
            return
        closing = True
        window.withdraw()

        shutdown_done = threading.Event()

        def shutdown():
            try:
                manager.close()
            finally:
                shutdown_done.set()
        threading.Thread(target=shutdown, daemon=True).start()

        def finish_close():
            if shutdown_done.is_set():
                window.destroy()
            else:
                window.after(100, finish_close)
        window.after(100, finish_close)

    window.protocol('WM_DELETE_WINDOW', on_close)
    threading.Thread(target=health_loop, daemon=True).start()
    refresh()
    poll()
    window.mainloop()


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--service':
        service(sys.argv[2:])
    elif len(sys.argv) > 2 and sys.argv[1] == '--self-test':
        raise SystemExit(self_test(sys.argv[2]))
    else:
        main()
