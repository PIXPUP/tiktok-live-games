import json
import tempfile
import threading
import unittest
import urllib.error
import io
from pathlib import Path
from unittest.mock import patch
from member_session import MemberSession, SessionError, request_json
from manager import Manager, GAMES


class MemberSessionTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.active = True
        self.lease = 90
        self.calls = []
        self.config = Path(__file__).with_name('firebase-config.json')
        self.session = MemberSession(self.config, self.transport, lambda: self.now)

    def transport(self, url, body=None, headers=None):
        self.calls.append((url, body, headers))
        if 'signInWithPassword' in url:
            return {'idToken': 'fixture-id', 'refreshToken': 'fixture-refresh', 'expiresIn': '3600'}
        if 'securetoken' in url:
            return {'id_token': 'new-fixture-id', 'refresh_token': 'new-fixture-refresh', 'expires_in': '3600'}
        return {'uid': 'fixture', 'email': 'fixture@example.invalid', 'active': self.active,
                'status': 'approved' if self.active else 'expired', 'leaseSeconds': self.lease}

    def test_sign_in_refresh_expiry_and_no_tokens_in_snapshot(self):
        self.assertFalse(self.session.allowed())
        self.session.sign_in('fixture@example.invalid', 'fixture-password')
        self.assertTrue(self.session.allowed())
        self.assertNotIn('token', json.dumps(self.session.snapshot()).lower())
        self.assertEqual(self.calls[-1][2]['Authorization'], 'Bearer fixture-id')
        self.now += 91
        with self.assertRaises(SessionError):
            self.session.require_access()
        self.session.check()
        self.assertTrue(self.session.allowed())
        self.now += 3600
        self.session.check()
        self.assertEqual(self.calls[-1][2]['Authorization'], 'Bearer new-fixture-id')

    def test_revocation_stops_immediately_and_recheck_after_renewal(self):
        self.session.sign_in('fixture@example.invalid', 'fixture-password')
        self.active = False
        self.session.check()
        self.assertFalse(self.session.allowed())
        self.active = True
        self.session.check()
        self.assertTrue(self.session.allowed())
        self.session.sign_out()
        self.assertFalse(self.session.allowed())
        self.assertFalse(self.session.snapshot()['signedIn'])
        self.assertEqual(self.session.refresh_token, '')

    def test_network_failure_cannot_extend_lease_and_expiry_uses_monotonic_clock(self):
        self.lease = 3
        self.session.sign_in('fixture@example.invalid', 'fixture-password')
        self.session.transport = lambda *a, **kw: (_ for _ in ()).throw(SessionError('offline'))
        with self.assertRaises(SessionError):
            self.session.check()
        with patch('time.time', return_value=0):
            self.now += 4
            self.assertFalse(self.session.allowed())

    def test_delayed_response_cannot_extend_lease(self):
        original = self.transport
        def delayed(url, *a, **kw):
            if '/api/desktop/access' in url:
                self.now += 91
            return original(url, *a, **kw)
        self.session.transport = delayed
        self.session.sign_in('fixture@example.invalid', 'fixture-password')
        self.assertFalse(self.session.allowed())

    def test_inflight_login_cannot_restore_signed_out_session(self):
        entered, resume = threading.Event(), threading.Event()
        original = self.transport
        def blocked(url, *a, **kw):
            entered.set()
            resume.wait(2)
            return original(url, *a, **kw)
        self.session.transport = blocked
        thread = threading.Thread(target=self.session.sign_in, args=('fixture@example.invalid', 'fixture-password'))
        thread.start()
        self.assertTrue(entered.wait(1))
        self.session.sign_out()
        resume.set()
        thread.join(2)
        self.assertFalse(self.session.allowed())
        self.assertFalse(self.session.snapshot()['signedIn'])

    def test_manager_cannot_launch_or_create_tunnel_without_access(self):
        with tempfile.TemporaryDirectory() as temporary:
            manager = Manager(Path(__file__).parent.parent, temporary, authorize=self.session.require_access)
            try:
                with patch.object(manager, 'prepare') as prepare:
                    with self.assertRaises(SessionError):
                        manager.start(GAMES[0])
                    prepare.assert_not_called()
                    with self.assertRaises(SessionError):
                        manager.start_public()
                self.assertEqual(manager.processes, {})
            finally:
                manager.close()

    def test_native_http_headers_and_private_errors(self):
        error = urllib.error.HTTPError('https://test.invalid', 400, 'Bad request', {},
            io.BytesIO(b'{"error":{"message":"PRIVATE_TOKEN_MUST_NOT_APPEAR"}}'))
        with patch('urllib.request.urlopen', side_effect=error) as send:
            with self.assertRaises(SessionError) as raised:
                request_json('https://test.invalid', {'password': 'PRIVATE_PASSWORD'})
        request = send.call_args.args[0]
        self.assertEqual(request.get_header('User-agent'), 'MooHengGameDesk/1.9.0')
        self.assertEqual(request.get_header('Accept'), 'application/json')
        self.assertNotIn('PRIVATE', str(raised.exception))


if __name__ == '__main__':
    unittest.main()
