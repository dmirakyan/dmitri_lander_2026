# Date-night board

The public static app lives in `dates/` and is linked from `/admin/`. The 28-card catalog targets September 29–October 1, 2026. Edit `dates/ideas.json` to update dates, actual booking checks, venue links, or image credits. Listed opening hours do not imply ticket or table availability. Morgan After Hours is sold out and excluded; regular daytime Tarot! is a separate candidate.

## Storage

`001_swipes.sql` was applied to the existing Creed Supabase project on September 28, 2026. It adds only `date_night_votes`, `date_night_events`, and the `date_night_sync` RPC. Do not reapply this initial migration blindly. The public `dates/config.js` contains the project URL and **anon** key; it contains no service-role or database credentials.

Both tables use RLS and revoke direct public, anon, and authenticated access. The narrowly scoped security-definer RPC has an empty search path, validates inputs, hashes the 256-bit board capability, and returns only that board's votes. Event UUIDs make retries idempotent; client timestamps prevent delayed offline writes from undoing newer choices. Undo appends a new event and sets the current vote to its previous state or `none`.

This is a capability-link board, not account authentication. A private link confers read/write access to both profiles. Its secret lives in a URL fragment during invitation, then is removed from the address bar and stored in localStorage. Only a digest is stored in Postgres. The UI explains the sharing model. Votes, retry queue, and undo history persist on the device. Reopen the share link on a second device to join the same board. No messages, transcripts, or preference research are uploaded.

The browser uses a durable local outbox, batched RPC writes, visible failure/offline status, and visible-tab polling. Photo sources are external; a labeled fallback appears if a host refuses an image. Referer headers are disabled.

## Validation

- `node tools/dates/check_state.mjs`: offline undo, stale remote merge, profile separation, in-flight queue preservation, and catalog validation.
- Run `check_backend.py --env /path/to/authorized/backend/.env` with a Python environment containing psycopg, requests, and dotenv. It reads credentials without printing them, exercises the public RPC and direct-table denial, and cleans up only its random test board.
- Browser checks: yes/pass/maybe, undo, separate profiles, mutual shortlist, share-link restore from a second origin, day/category filters, phone and desktop layouts.

The `tools/` directory is not staged into the public site. Research and conversation exports are stored outside this repository.
