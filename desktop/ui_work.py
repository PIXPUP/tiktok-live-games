"""Keep slow device calls off Tk's event thread and avoid unchanged redraws."""
import queue
import threading


def update_widget(widget, **options):
    previous = getattr(widget, '_desk_options', {})
    changed = {key:value for key,value in options.items() if previous.get(key) != value}
    if changed:
        widget.configure(**changed)
        widget._desk_options = dict(previous, **changed)


class BackgroundActions:
    def __init__(self, notify=lambda text: None):
        self.notify = notify
        self.pending = queue.Queue(maxsize=16)
        self.closed = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def submit(self, action):
        if self.closed.is_set(): return False
        try:
            self.pending.put_nowait(action)
            return True
        except queue.Full:
            self.notify('กำลังทำรายการ กรุณารอสักครู่')
            return False

    def run(self):
        while not self.closed.is_set():
            try: action = self.pending.get(timeout=.25)
            except queue.Empty: continue
            try: action()
            except Exception as error: self.notify(str(error))
            finally: self.pending.task_done()

    def close(self):
        self.closed.set()
