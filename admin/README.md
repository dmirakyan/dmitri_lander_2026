# Broadway admin dashboard

Static tool directory served by Cloudflare at `/admin/`. The public files contain no profile, calendar data, account credentials, or run records. No analytics or third-party scripts load on this page.

The date-night card links to the public static guide at `/dates/`, independently of the private runner connection. The guide contains 28 photo cards, swipe voting, per-person shortlists, and a private share-link board backed by dedicated Creed Supabase tables. See `tools/dates/README.md` for storage and validation. It contains outing recommendations and public venue links; message exports and detailed personal research stay outside this repository. The Pages workflow explicitly includes `dates/` in its public-file staging list.

## Private runner

Requires Python 3.11+ on the Mac that holds the lottery workspace:

```sh
python3 tools/lottery_admin.py
```

Click **Open Broadway** on the admin page, or visit `http://127.0.0.1:18765/admin/`. The local server authenticates the page automatically. No connection form, pasted key, browser storage, or cross-origin API calls are needed. The public admin page is a directory of tools and never fetches private lottery data. Broadway is available on this Mac.

The server binds only to 127.0.0.1. Its private bearer key stays in `work/private/admin-key` outside this repository and is bootstrapped only into the local page. API requests require the key and the local origin. Top-level navigation from the public directory is allowed; cross-site fetches and frames are rejected. To rotate the key, stop the server, remove the key file, and restart.

On this Mac, `im.dmitri.broadway-admin` is a LaunchAgent that starts the dashboard at login and restarts it if it exits. It serves the dashboard only; lottery entries and their schedule remain managed by Codex.

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

## Writing room

The admin also links to a separate local writing workspace at
`http://127.0.0.1:18766/admin/twitter/`. Start it with
`python3 tools/twitter/server.py`. It supports source-tweet research, draft
approval/rejection, and scheduling. Approved posts are published by the separately
authorized local Chrome heartbeat; the web server does not publish them.
See `tools/twitter/README.md`. No writing data is included in the public build.
