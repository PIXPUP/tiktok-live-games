"""Small native login screen; no embedded browser or additional UI runtime."""
import tkinter as tk
import webbrowser
from member_session import SITE


class LoginPanel(tk.Frame):
    def __init__(self, parent, submit):
        super().__init__(parent, bg='#0b1c18')
        self.submit = submit
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)
        card = tk.Frame(self, bg='#17382d', padx=38, pady=30, highlightthickness=1, highlightbackground='#46694e')
        card.grid(row=1, column=0, padx=28, pady=20)
        def label(text, size=12, color='#fff4d6'):
            result = tk.Label(card, text=text, bg='#17382d', fg=color, font=('Leelawadee UI', size), justify='left')
            result.pack(anchor='w', pady=(0, 9))
            return result
        label('หมูเฮง  /  LIVE GAME DESK', 12, '#eacb83')
        label('พร้อมสร้างสีสันให้ไลฟ์ของคุณ', 23)
        label('เข้าสู่ระบบด้วยบัญชีเดียวกับเว็บเกม', 12, '#b9cebf')
        label('อีเมล')
        self.email = tk.Entry(card, width=38, font=('Leelawadee UI', 13), bg='#0e251e', fg='#fff4d6', insertbackground='white', relief='flat')
        self.email.pack(fill='x', ipady=9, pady=(0, 15))
        label('รหัสผ่าน')
        self.password = tk.Entry(card, show='●', font=('Leelawadee UI', 13), bg='#0e251e', fg='#fff4d6', insertbackground='white', relief='flat')
        self.password.pack(fill='x', ipady=9)
        self.show_password = tk.BooleanVar(value=False)
        tk.Checkbutton(card, text='แสดงรหัสผ่าน', variable=self.show_password,
            command=lambda: self.password.configure(show='' if self.show_password.get() else '●'),
            bg='#17382d', fg='#b9cebf', selectcolor='#0e251e', activebackground='#17382d', activeforeground='white',
            font=('Leelawadee UI', 11)).pack(anchor='w', pady=8)
        self.message = label('โปรแกรมไม่บันทึกรหัสผ่าน · ต้องใช้อินเทอร์เน็ต', 11, '#b9cebf')
        self.message.configure(wraplength=410)
        self.button = tk.Button(card, text='เข้าสู่ระบบ', command=self.send, bg='#ebca80', fg='#182c20',
            font=('Leelawadee UI', 13, 'bold'), relief='flat', pady=11, cursor='hand2')
        self.button.pack(fill='x', pady=(7, 12))
        tk.Button(card, text='สมัครใหม่ / ลืมรหัสผ่าน', command=self.open_account,
            bg='#25483a', fg='#fff4d6', font=('Leelawadee UI', 11), relief='flat', pady=8).pack(fill='x')
        label('สมัครใหม่ทดลองฟรี 1 วัน · สมาชิก 299 บาท / 30 วัน', 11, '#eacb83').pack_configure(pady=(15, 0))
        self.password.bind('<Return>', lambda _: self.send())
        self.email.bind('<Return>', lambda _: self.password.focus_set())

    def open_account(self):
        import threading
        threading.Thread(target=webbrowser.open, args=(SITE + '/login',), daemon=True).start()

    def send(self):
        if str(self.button['state']) == 'disabled':
            return
        email, password = self.email.get().strip(), self.password.get()
        if not email or not password:
            self.message.configure(text='กรอกอีเมลและรหัสผ่านก่อนค่ะ')
            return
        self.password.delete(0, 'end')
        self.button.configure(state='disabled', text='กำลังตรวจบัญชี…')
        self.message.configure(text='กำลังเชื่อมต่อระบบสมาชิก กรุณารอสักครู่')
        self.submit(email, password)

    def ready(self, message=''):
        self.button.configure(state='normal', text='เข้าสู่ระบบ')
        if message:
            self.message.configure(text=message)
