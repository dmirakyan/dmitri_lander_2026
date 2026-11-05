"""Exercise browser navigation and auth using a disposable lottery workspace."""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest


class DashboardHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory()
        private = Path(cls.workspace.name) / 'work/private'
        private.mkdir(parents=True)
        (private / 'profile.json').write_text(json.dumps({
            'attendance_preferences': {'weekdays': {}, 'weekends': {}},
            'calendar': {}, 'show_preferences': {},
        }))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.process = subprocess.Popen([
            sys.executable, str(Path(__file__).with_name('lottery_admin.py')),
            '--workspace', cls.workspace.name, '--port', str(cls.port),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.addClassCleanup(cls.stop_server)
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', cls.port), timeout=.1):
                    break
            except OSError:
                time.sleep(.05)
        else:
            raise RuntimeError('Dashboard did not start')
        cls.key = (private / 'admin-key').read_text().strip()

    @classmethod
    def stop_server(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)

    def request(self, method='GET', path='/admin/', headers=None, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, response.read(), dict(response.getheaders())
        connection.close()
        return result

    def test_link_from_public_admin_opens_authenticated_local_dashboard(self):
        status, body, headers = self.request(headers={
            'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document',
        })
        self.assertEqual(status, 200)
        self.assertIn(b'name="local-runner-key"', body)
        self.assertNotIn(b'connect-form', body)
        self.assertEqual(headers['X-Frame-Options'], 'DENY')
        self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_cross_site_fetch_and_frame_cannot_bootstrap_key(self):
        for mode, destination in [('cors', 'empty'), ('navigate', 'iframe')]:
            with self.subTest(mode=mode, destination=destination):
                status, body, _ = self.request(headers={
                    'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': mode,
                    'Sec-Fetch-Dest': destination,
                })
                self.assertEqual(status, 403)
                self.assertNotIn(self.key.encode(), body)

    def test_api_still_requires_key_and_local_origin(self):
        self.assertEqual(self.request(path='/api/state')[0], 401)
        self.assertEqual(self.request(path='/api/state', headers={
            'Authorization': 'Bearer incorrect',
        })[0], 401)
        headers = {'Authorization': 'Bearer ' + self.key}
        self.assertEqual(self.request(path='/api/state', headers=headers)[0], 200)
        for origin in ['https://dmitri.im', 'https://untrusted.example']:
            self.assertEqual(self.request(path='/api/state', headers={
                **headers, 'Origin': origin,
            })[0], 403)
        self.assertEqual(self.request(headers={'Host': 'untrusted.example'})[0], 403)

    def test_preferences_save_and_stale_revision_rejected(self):
        headers = {'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'}
        _, raw, _ = self.request(path='/api/state', headers=headers)
        values = dict(revision=json.loads(raw)['revision'], ticket_count=2,
                      max_price_per_ticket_usd=75, weekday_start='18:00',
                      weekend_matinees=True, weekend_evenings=True, next_day_allowed=True,
                      skip_trips_away=True, skip_ordinary_conflicts=False,
                      prioritized=['Wicked'], excluded=['Hamilton'])
        body = json.dumps(values)
        self.assertEqual(self.request('POST', '/api/preferences', headers, body)[0], 200)
        self.assertEqual(self.request('POST', '/api/preferences', headers, body)[0], 409)
        _, raw, _ = self.request(path='/api/state', headers=headers)
        self.assertEqual(json.loads(raw)['profile']['show_preferences']['excluded'], ['Hamilton'])


if __name__ == '__main__':
    unittest.main()
