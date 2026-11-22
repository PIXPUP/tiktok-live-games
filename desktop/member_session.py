"""Firebase desktop sign-in. Credentials and tokens stay in process memory only."""
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SITE = 'https://pixpup-live-games.pages.dev'


class SessionError(RuntimeError):
    pass


def request_json(url, body=None, headers=None):
    headers = dict(headers or {})
    if isinstance(body, dict):
        body = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read(65536))
    except urllib.error.HTTPError as error:
        # Do not surface URLs, request bodies, passwords or tokens in diagnostics.
        try:
            code = json.loads(error.read(65536)).get('error', {})
            code = code.get('message', '') if isinstance(code, dict) else code
        except (ValueError, OSError):
            code = ''
        messages = {
            'INVALID_LOGIN_CREDENTIALS': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
            'INVALID_PASSWORD': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
            'EMAIL_NOT_FOUND': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
            'USER_DISABLED': 'บัญชีถูกปิดใช้งาน กรุณาติดต่อแอดมิน',
            'TOO_MANY_ATTEMPTS_TRY_LATER': 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่',
        }
        if error.code == 401:
            raise SessionError('กรุณาเข้าสู่ระบบอีกครั้ง') from None
        raise SessionError(messages.get(code, 'เชื่อมต่อบัญชีไม่สำเร็จ กรุณาลองใหม่')) from None
    except (OSError, ValueError):
        raise SessionError('เชื่อมต่อระบบสมาชิกไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่') from None


class MemberSession:
    def __init__(self, config_path, transport=request_json, clock=time.monotonic):
        self.api_key = json.loads(Path(config_path).read_text(encoding='utf-8'))['apiKey']
        self.transport, self.clock = transport, clock
        self.lock = threading.RLock()
        self.io_lock = threading.Lock()
        self.generation = 0
        self.id_token = self.refresh_token = self.email = ''
        self.token_until = self.lease_until = 0
        self.access = {'active': False, 'status': 'signed_out'}

    def sign_out(self):
        with self.lock:
            self.generation += 1
            self.id_token = self.refresh_token = self.email = ''
            self.token_until = self.lease_until = 0
            self.access = {'active': False, 'status': 'signed_out'}

    def sign_in(self, email, password):
        self.sign_out()
        with self.lock:
            generation = self.generation
        with self.io_lock:
            response = self.transport(
                'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + self.api_key,
                {'email': email.strip(), 'password': password, 'returnSecureToken': True})
            with self.lock:
                if generation != self.generation:
                    return self.snapshot()
                self.id_token, self.refresh_token = response['idToken'], response['refreshToken']
                self.token_until = self.clock() + min(3600, int(response['expiresIn'])) - 60
            return self._check(generation)

    def check(self):
        with self.io_lock:
            with self.lock:
                generation = self.generation
            return self._check(generation)

    def _check(self, generation):
        with self.lock:
            token, refresh = self.id_token, self.refresh_token
            refresh_needed = self.clock() >= self.token_until
        if not token:
            raise SessionError('กรุณาเข้าสู่ระบบก่อนเปิดเกม')
        if refresh_needed:
            response = self.transport('https://securetoken.googleapis.com/v1/token?key=' + self.api_key,
                urllib.parse.urlencode({'grant_type': 'refresh_token', 'refresh_token': refresh}).encode(),
                {'Content-Type': 'application/x-www-form-urlencoded'})
            with self.lock:
                if generation != self.generation:
                    return self.snapshot()
                token = self.id_token = response['id_token']
                self.refresh_token = response['refresh_token']
                self.token_until = self.clock() + min(3600, int(response['expires_in'])) - 60
        started = self.clock()
        response = self.transport(SITE + '/api/desktop/access', headers={'Authorization': 'Bearer ' + token})
        with self.lock:
            if generation != self.generation:
                return self.snapshot()
            self.email = response['email']
            self.access = response
            seconds = min(90, max(0, float(response.get('leaseSeconds', 0))))
            self.lease_until = started + seconds if response.get('active') is True else 0
            return self.snapshot()

    def allowed(self):
        with self.lock:
            return self.access.get('active') is True and self.clock() < self.lease_until

    def require_access(self):
        if not self.allowed():
            raise SessionError('ยังไม่มีสิทธิ์เปิดเกม กรุณาเข้าสู่ระบบหรือตรวจสิทธิ์อีกครั้ง')

    def snapshot(self):
        with self.lock:
            return {**self.access, 'email': self.email, 'allowed': self.allowed(), 'signedIn': bool(self.id_token)}
