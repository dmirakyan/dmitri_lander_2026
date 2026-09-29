# Broadway admin dashboard

Static frontend served by GitHub Pages at `/admin/`. The public files contain no profile, calendar data, account credentials, or run records. No analytics or third-party scripts load on this page.

The date-night card links to the public static guide at `/dates/`, independently of the private runner connection. The guide contains outing recommendations and public venue links; message exports and detailed personal research stay outside this repository. The Pages workflow explicitly includes `dates/` in its public-file staging list.

## Private runner

Requires Python 3.11+ on the Mac that holds the lottery workspace:

```sh
python3 tools/lottery_admin.py
```

Open `http://127.0.0.1:18765/admin/` for an automatically authenticated local dashboard. Its “Open this dashboard on dmitri.im” link transfers the connection key in a URL fragment (not sent to the hosting server). The frontend removes that fragment immediately and keeps the key in tab-scoped session storage. The hosted page may require browser permission to access the local network. Use the local page if the browser blocks loopback connections. This is a same-Mac dashboard, not remote/mobile account access.

The process must stay running. It binds only to 127.0.0.1. The bearer key is created with owner-only permissions in `work/private/admin-key` outside this repository. Only the exact hosted origin and local origin are accepted; API requests require the key. The local HTML bootstrap rejects cross-site requests and framing. Disconnect clears the browser session key, but does not rotate the server key. To revoke keys, stop the runner, remove the key file, and restart.

Use `--workspace /path/to/broadway-lotteries` to override the workspace location. Profile changes are validated, version-checked, and written atomically with owner-only permissions. Concurrent stale edits return a conflict rather than overwrite newer settings.

## Scope

- Edit ticket count, budget, attendance rules, calendar filtering, and show priorities/exclusions.
- Read actual ledger history and Codex automation status.
- No account signup, password storage, entry submission, ticket purchase, or email polling happens in this service.
- Schedule controls stay in Codex and use its automation tools. This server never edits automation TOML.
- Refresh retrieves current data; refresh warns before discarding unsaved changes.

## Validation

```sh
python3 -m unittest discover -s tools -p 'test_*.py'
node --check admin/admin.js
```

Live HTTP checks cover missing/wrong keys, untrusted origins, cross-site bootstrap, path traversal, stale profile revisions, and invalid writes. Browser QA covers reading real data, saving existing preferences, and desktop/mobile layouts.
