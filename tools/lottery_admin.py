#!/usr/bin/env python3
"""Private loopback API for the static /admin dashboard. Python 3.11+."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
import tomllib

REPO = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE = Path.home() / 'Documents/Codex/2026-09-10/broadway-lotteries'
LOCK = Lock()


def revision(raw):
    return hashlib.sha256(raw).hexdigest()


def update_profile(profile, values):
    if type(values.get('ticket_count')) is not int or values['ticket_count'] not in (1, 2):
        raise ValueError('Choose one or two tickets.')
    price = values.get('max_price_per_ticket_usd')
    if type(price) not in (int, float) or not 0 < price <= 1000:
        raise ValueError('Price must be between $0.01 and $1,000.')
    if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', str(values.get('weekday_start', ''))):
        raise ValueError('Use a valid weekday start time.')
    for key in ('weekend_matinees', 'weekend_evenings', 'next_day_allowed', 'skip_trips_away', 'skip_ordinary_conflicts'):
        if type(values.get(key)) is not bool:
            raise ValueError('Invalid availability setting.')
    for key in ('prioritized', 'excluded'):
        items = values.get(key)
        if not isinstance(items, list) or len(items) > 100 or any(not isinstance(s, str) or not s.strip() or len(s) > 150 for s in items):
            raise ValueError('Enter up to 100 show names, one per line.')
    if set(s.casefold() for s in values['prioritized']) & set(s.casefold() for s in values['excluded']):
        raise ValueError('A show cannot be both prioritized and excluded.')
    profile['ticket_count'] = values['ticket_count']
    profile['max_price_per_ticket_usd'] = price
    a = profile['attendance_preferences']
    a['weekdays']['earliest_start'] = values['weekday_start']
    a['weekends'] = dict(matinees=values['weekend_matinees'], evenings=values['weekend_evenings'])
    a['next_day_allowed'] = values['next_day_allowed']
    for key in ('skip_trips_away', 'skip_ordinary_conflicts'):
        profile['calendar'][key] = values[key]
    for key in ('prioritized', 'excluded'):
        profile['show_preferences'][key] = list(dict.fromkeys(s.strip() for s in values[key]))
    return profile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=DEFAULT_WORKSPACE)
    args = parser.parse_args()
    private = args.workspace / 'work/private'
    if not (private / 'profile.json').is_file():
        parser.error('Lottery profile not found; pass --workspace.')
    secret_file = private / 'admin-key'
    if not secret_file.exists():
        fd = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(secrets.token_urlsafe(32))
    token = secret_file.read_text().strip()
    automation_file = Path.home() / '.codex/automations/daily-broadway-lotteries/automation.toml'
    allowed = {'http://127.0.0.1:18765', 'https://dmitri.im'}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log credentials or private request data.

        def send(self, status, data, content_type='application/json'):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Referrer-Policy', 'no-referrer')
            origin = self.headers.get('Origin')
            if origin in allowed:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.end_headers()
            self.wfile.write(data if isinstance(data, bytes) else json.dumps(data).encode())

        def permitted(self):
            return self.headers.get('Host') == '127.0.0.1:18765' and self.headers.get('Origin', 'http://127.0.0.1:18765') in allowed

        def authorized(self):
            return self.permitted() and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)

        def do_OPTIONS(self):
            if not self.permitted():
                return self.send(403, {'error': 'Origin not permitted.'})
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', 'http://127.0.0.1:18765'))
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.end_headers()

        def do_GET(self):
            if not self.permitted():
                return self.send(403, {'error': 'Host or origin not permitted.'})
            if self.path == '/api/state':
                if not self.authorized():
                    return self.send(401, {'error': 'Invalid connection key.'})
                try:
                    raw = (private / 'profile.json').read_bytes()
                    auto = tomllib.loads(automation_file.read_text()) if automation_file.exists() else {}
                    rule = auto.get('rrule', '')
                    label = '9:05 & 10:05 a.m. · daily · Eastern' if rule == 'FREQ=DAILY;BYHOUR=9,10;BYMINUTE=5;BYSECOND=0' else 'See Codex for current schedule'
                    runs = [json.loads(p.read_text()) for p in sorted((private / 'ledger').glob('*.json'), reverse=True)]
                    return self.send(200, dict(profile=json.loads(raw), revision=revision(raw), automation=dict(status=auto.get('status', 'NOT_CONFIGURED'), schedule_label=label), runs=runs))
                except (OSError, ValueError):
                    return self.send(500, {'error': 'Could not read runner data. Check local files.'})
            files = {'/admin/': 'index.html', '/admin': 'index.html', '/admin/admin.css': 'admin.css', '/admin/admin.js': 'admin.js'}
            if self.path not in files:
                return self.send(404, {'error': 'Not found.'})
            name = files[self.path]
            content = (REPO / 'admin' / name).read_bytes()
            if name == 'index.html':
                if self.headers.get('Sec-Fetch-Site') not in (None, 'none', 'same-origin'):
                    return self.send(403, {'error': 'Open the local dashboard directly.'})
                content = content.replace(b'<head>', ('<head><meta name="local-runner-key" content="' + token + '">').encode())
            self.send(200, content, {'html': 'text/html; charset=utf-8', 'css': 'text/css', 'js': 'text/javascript'}[name.rsplit('.', 1)[1]])

        def do_POST(self):
            if not self.authorized():
                return self.send(401, {'error': 'Invalid connection key or origin.'})
            if self.path != '/api/preferences':
                return self.send(404, {'error': 'Not found.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 32768 or self.headers.get('Content-Type') != 'application/json':
                    raise ValueError('Invalid request.')
                values = json.loads(self.rfile.read(length))
                if not isinstance(values, dict):
                    raise ValueError('Invalid request.')
                with LOCK:
                    path = private / 'profile.json'
                    raw = path.read_bytes()
                    if values.get('revision') != revision(raw):
                        return self.send(409, {'error': 'Preferences changed elsewhere. Refresh before saving.'})
                    profile = update_profile(json.loads(raw), values)
                    temporary = path.with_suffix('.tmp')
                    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                    with os.fdopen(fd, 'w') as f:
                        json.dump(profile, f, indent=2)
                        f.write('\n')
                    os.replace(temporary, path)
                self.send(200, {'saved': True})
            except (ValueError, KeyError, TypeError) as e:
                self.send(400, {'error': str(e)})
            except OSError:
                self.send(500, {'error': 'Could not save preferences.'})

    print('Private dashboard: http://127.0.0.1:18765/admin/ (keep this process running)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18765), Handler).serve_forever()


if __name__ == '__main__':
    main()
