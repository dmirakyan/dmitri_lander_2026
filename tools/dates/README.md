# Date-night board

The public static app lives in `dates/` and is linked from `/admin/`. The curated catalog targets September 29–October 1, 2026. Edit `dates/ideas.json` to update dates, actual booking checks, venue links, or image credits. Listed opening hours do not imply ticket or table availability. The current catalog contains 10 after-work options; unavailable and daytime-only ideas are excluded.

## Storage

`001_swipes.sql` created the date tables in the existing Creed Supabase project on September 28, 2026. `002_shared_board.sql` was applied September 29 to consolidate the app into one shared two-person board. Do not reapply the initial migration. The public `dates/config.js` contains only the project URL and anon key.

The shared migration copies the latest saved response per person/idea into the canonical board, preserves original rows and history, and excludes identified QA data. A private database backup was taken before migration. The old `date_night_sync` RPC routes existing clients to the same canonical board; the current app calls `date_night_shared_sync` without any board token. New and existing devices require no invitation or share link. Existing device caches and pending writes migrate to `date-night-shared-v2`.

Both tables retain RLS and deny direct public, anon, and authenticated access. Security-definer RPCs use an empty search path and validate inputs. Event UUIDs make retries idempotent; client timestamps prevent delayed offline writes from replacing newer choices. Undo appends a new event and restores the previous vote or `none`.

This is a public two-person page, not account authentication. Anyone with the page can read or change either profile's votes. The UI explains this. Only votes and their history go to the database; conversation exports and preference research remain outside the site.

Our picks is the default view and shows both people's responses side by side for every current idea. Mutual yeses sort first; idea titles open the full cards. Visible tabs poll every five seconds, and Refresh fetches immediately. The browser retains a durable offline outbox, local cache, undo history, and visible sync status. At migration, the database contained real Dmitri responses but no real responses labeled Tulin; no votes were relabeled by inference.

## Validation

- `node tools/dates/check_state.mjs`: offline undo, stale remote merge, profile separation, in-flight queue preservation, and catalog validation.
- Run `check_shared_backend.py --env /path/to/authorized/backend/.env` with psycopg, requests, and dotenv. It checks shared reads across unrelated legacy tokens, both profiles, retries, undo, stale writes, and direct-table denial. It cleans up only its unique non-catalog test idea and events. `check_backend.py` forwards to this check.
- Browser checks: mobile comparison table, cross-origin shared reads without invitation links, identity selection, filters, and navigation to full cards. Viewport QA is not a physical-device test.

The `tools/` directory is not staged into the public site. The dated sections below describe historical catalog and UI states, superseded by the current storage model and workweek constraint.

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
