# Date-night board

The public static app lives in `dates/` and is linked from `/admin/`. The curated catalog targets September 29–October 1, 2026. Edit `dates/ideas.json` to update dates, actual booking checks, venue links, or image credits. Listed opening hours do not imply ticket or table availability. Morgan After Hours is sold out and excluded; regular daytime Tarot! is a separate candidate.

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

## September 28 evening availability and mobile recheck

The catalog now distinguishes ticket selectors, reservation slots, published hours/entry policy, weather-dependent plans, and unverified inventory. `checkedLabel` summarizes the evidence and `availability` records its limits. `verifiedDays` prevents a check made only for Tuesday from qualifying as a checked Thursday option. No purchase or reservation was submitted.

Observed booking results: two Birdland table tickets ($91.52 plus $40 food/drink minimum), Hudson Table quantity up to five, two NYFF tickets ($186), two Iris van Herpen tickets at 4 pm on Wednesday and Thursday ($60 before any checkout extras), two Tuesday MoMA admissions ($60), and two Tuesday Morgan daytime admissions at 3 pm ($57 listed). MoMA and Morgan also list the other requested dates, with quantity-check limits stated on their cards. Iris uses the current museum page and its December 6 closing date, replacing the stale archive link.

Resy offered Rule of Thirds tables for two at 6, 7 and 8 pm all three evenings, and Shukette only from 9:30 pm in the observed results. Comedy Cellar offered specific sets through the contact step; final party size was not confirmed. Pottery offered Tuesday/Wednesday slots for groups of 1–2; Thursday inventory remains unverified. Oh, Mary! showtimes were verified, but an adjacent seat pair was not; Atithi dinner tables were not confirmed. The checked filter excludes these unverified candidates and respects the pottery/Morgan day limits. Morgan After Hours stays excluded.

Mobile QA used 320×667, 375×667, 390×844 and 430×932 browser viewports. Verified no horizontal overflow, fixed reachable decision buttons, readable expanded details, a contained share dialog, Yes/Undo and cloud sync on an isolated test board, and Thursday checked-option filtering. This is browser viewport testing, not a physical-device Safari test. JavaScript syntax, state/catalog checks, and the public-site build passed. The swipe handler preserves vertical scrolling and cancels interrupted gestures; no claim of a physical touch-device gesture test.


## Catalog pruning

The user requested viable choices without notices about rejected events. Removed the public Morgan After Hours notice, Oh, Mary!, Atithi, Comedy Cellar (party size unconfirmed), and the rejected High Line telescope idea. The catalog has 24 cards. Morgan daytime and MoMA now appear only on Tuesday, and pottery only on Tuesday/Wednesday, matching the strongest booking checks. Removed the Checked options filter; unverified/unavailable status records are excluded at catalog load. Existing votes are preserved. UI copy no longer hardcodes the catalog count.

## September 29 profile selection and Tribeca galleries

Added an explicit first-visit name picker (remembered per board/device), prominent profile switching on phones, and a Both like view for mutual Yes votes. The existing private share link joins the same board across devices; a visible reminder explains this. Existing votes and board tokens are retained. Added a Tribeca filter and three nearby cards: Christine Safa at Bortolami, Hew Locke at P·P·O·W, and Soumya Netrabile / Alannah Farrell at Anat Ebgi. The catalog now has 27 cards. Official exhibition dates, addresses, and weekday hours checked September 29; all three are daytime visits ending before 6 pm.

Validated separate profile votes, mutual-match inclusion and removal by undo, remembered identity after reload, shared-board recovery on a separate localhost origin, Tribeca filtering, and all three gallery images loading. Phone layout checked at 390×844 with no horizontal overflow; desktop gallery grid also inspected. State/catalog checks, JavaScript syntax, and the public-site build passed. Test likes were undone on the isolated local QA board.

## Workweek schedule constraint

Both people work until at least 5–6 pm. Removed 17 daytime/too-early ideas, including galleries closing at 6 and the daylight-dependent Central Park plan. The 10 remaining cards suggest starts from 6:30 pm; Rule of Thirds starts at 7 or 8. Walks no longer assume arrival before work ends. Removed redundant evening and empty Tribeca filters. Each current card has a structured startTime; catalog loading and validation reject daytime or pre-6 pm starts. The smaller catalog deliberately supersedes the original quantity target. No stored votes or history were deleted. Browser checks confirmed all 10 cards and the seven Thursday options render, and cloud sync still succeeds.
