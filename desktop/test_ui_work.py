import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from ui_work import BackgroundActions, update_widget
from manager import Manager, GAMES


class UIWorkTests(unittest.TestCase):
    def test_slow_device_action_does_not_block_submit_or_other_ui_work(self):
        started, release, finished = threading.Event(), threading.Event(), threading.Event()
        worker = BackgroundActions()
        def slow():
            started.set()
            release.wait(3)
            finished.set()
        try:
            self.assertTrue(worker.submit(slow))
            self.assertTrue(started.wait(2))
            self.assertTrue(worker.submit(lambda: None))
            self.assertFalse(finished.is_set())
            # Work is pending without blocking the caller's event loop.
            self.assertEqual(worker.pending.qsize(), 1)
        finally:
            release.set()
            self.assertTrue(finished.wait(2))
            worker.close()

    def test_unchanged_status_does_not_reconfigure_tk_widgets(self):
        class Widget:
            def __init__(self): self.calls=[]
            def configure(self, **options): self.calls.append(options)
        widget=Widget()
        for _ in range(50): update_widget(widget, text='ready', state='normal')
        update_widget(widget, text='running', state='normal')
        self.assertEqual(widget.calls, [{'text':'ready','state':'normal'},{'text':'running'}])

    def test_frozen_prepare_copies_only_selected_game_and_preserves_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'bundle';data=Path(directory)/'data'
            for game in GAMES:
                folder=root/'games'/game.key;folder.mkdir(parents=True)
                (folder/'gift-map.json').write_text('{"bindings": []}')
            old=data/'games-older'/GAMES[0].key;old.mkdir(parents=True)
            mapping={'bindings':[{'action':'incense','gift':'custom'}]}
            (old/'gift-map.json').write_text(json.dumps(mapping))
            manager=Manager(root,data)
            try:
                with patch('manager.sys.frozen',True,create=True):
                    manager.prepare(GAMES[0])
                    self.assertFalse((manager.games_dir/GAMES[1].key).exists())
                    target=manager.games_dir/GAMES[0].key/'gift-map.json'
                    self.assertEqual(json.loads(target.read_text()),mapping)
                    target.write_text('{"bindings": [{"action":"tree","gift":"new"}]}')
                    manager.prepare(GAMES[0])
                    self.assertEqual(json.loads(target.read_text())['bindings'][0]['gift'],'new')
                    manager.prepare(GAMES[1])
                    self.assertTrue((manager.games_dir/GAMES[1].key/'.ready').exists())
                    self.assertFalse((manager.games_dir/GAMES[2].key).exists())
            finally: manager.close()

    def test_native_music_and_stop_buttons_keep_tk_responsive_during_slow_audio(self):
        import tkinter as tk
        from controls import ControlPanel
        class ManagerStub:
            active=GAMES[0]
            def running(self): return True
        class ControllerStub:
            read_gifts=False
            latest_real_name=None
            demo_running=False
        started, release, finished = threading.Event(), threading.Event(), threading.Event()
        class Speaker:
            voice='google-th'
            volume=.8
            last_finished=0
            def stop(self):
                started.set();release.wait(3);finished.set()
        class MusicStub:
            volume=.35
            running=False
            def set_volume(self,value): self.volume=value
            def start(self):
                started.set();release.wait(3);self.running=True;finished.set()
        root=tk.Tk();root.withdraw()
        panel=ControlPanel(root,ManagerStub(),ControllerStub(),Speaker(),lambda _:None,MusicStub())
        try:
            for button in [panel.music_button,panel.stop_sound]:
                started.clear();release.clear();finished.clear()
                button.invoke()
                self.assertTrue(started.wait(2))
                heartbeat=threading.Event()
                panel.window.after(0,heartbeat.set)
                root.update()
                self.assertTrue(heartbeat.is_set())
                self.assertFalse(finished.is_set())
                release.set()
                self.assertTrue(finished.wait(2))
        finally:
            release.set();panel.close();root.destroy()
