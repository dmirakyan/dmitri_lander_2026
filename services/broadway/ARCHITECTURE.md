# Broadway runner

The landing page remains on Cloudflare. An API on DigitalOcean owns the schedule, preferences, browser sessions, and entry journal. OpenAI Agents SDK extracts structured lottery inventory from observed provider pages; deterministic adapters enforce authorization and execute the free-entry flow. Browserbase supplies persistent remote browser contexts, proxies, and supported CAPTCHA handling. The existing 2Captcha account is available for supported form challenges. Resend delivers a persisted report after every batch.

```mermaid
flowchart LR
  U[Open dmitri.im/broadway dashboard] --> C[Cloudflare Worker]
  C -->|HTTPS + origin secret| A[DigitalOcean FastAPI service]
  A <--> D[(SQLite on persistent disk\nencrypted state)]
  A --> Q[Durable schedule + execution lease]
  Q --> G[OpenAI Agents SDK\nstructured inventory]
  Q --> P[Deterministic provider adapters]
  P --> B[Browserbase persistent browsers]
  B --> L[Broadway Direct / Telecharge / Lucky Seat]
  P --> X[2Captcha fallback]
  Q --> R[Resend batch report]
  Q --> I[Private calendar feeds]
```

## Boundaries

* Your standing permission includes free entries, required lottery terms, and CAPTCHA completion. No per-show approval is invented. No purchase or claim-to-pay operation exists in the adapter interface.
* The model receives provider inventory, never account passwords or API keys. It cannot operate the browser or override eligibility. Tracing is disabled.
* The form and final submission are separate steps. Immediately before submitting, the runner checks the off switch, execution lease, availability, and a unique entry key. A saved uncertain attempt survives crashes and blocks resubmission until reconciliation.
* A CAPTCHA token is not a completed challenge. A submit click is not a confirmed entry. Status distinguishes pending verification, uncertain response, confirmed, blocked, and already recorded.
* An off toggle stops new submissions. It cannot retract an HTTP request already sent to a provider. Read-only checks can reconcile those entries.
* Scheduled slots are 09:05 and 10:05 America/New_York with a 30-minute catch-up window and one durable key per slot. A 90-second renewable execution lease prevents concurrent batches across deploys. All providers are processed serially.
* The hosted runner stays off during migration. The Codex heartbeat must be paused only after hosted access and entry verification are proven. The migration flag prevents accidentally enabling both schedulers.

## Privacy and access

The website opens without a password. `/public/status` exposes an explicit allowlist of flow status, performance entries, and batch outcomes; it excludes email addresses, private calendar dates/feeds, configuration values, evidence, report bodies, and exception text. Management APIs still require a secure HttpOnly SameSite cookie, an origin check for mutations, and a Worker-to-origin secret. The owner can use a private management link whose fragment is removed before its token is exchanged for a one-year cookie. Only the token hash is stored on the server. The public site never contains this token. Existing server password authentication remains available for deployment tooling, but there is no password form or gate on the website. The database encrypts profile, keys, sessions, private screenshots, and reports with Fernet; its encryption key is in a root-only systemd environment file. Browserbase session recording/logging is disabled. Provider screenshots remain private. The database lives on the dedicated Droplet disk. Consistent SQLite snapshots run daily; weekly DigitalOcean backups retain four weeks. Retain the encryption key separately to make backups recoverable. No key or DOB is returned by the status endpoint.

## Deployment

The production backend runs on a dedicated $6/month 1 GB DigitalOcean Droplet (Ubuntu 24.04), with SQLite on `/var/lib/broadway`. `deploy/broadway.service` runs the API under an unprivileged account, binds only localhost, restarts after failures, and restricts writable paths. Caddy provides a verified public HTTPS origin; Cloudflare continues to serve `dmitri.im/broadway`. `deploy/broadway-backup.timer` creates consistent daily encrypted SQLite snapshots. Weekly whole-server backups are enabled ($1.20/month).

Runtime secrets live in root-only `/etc/broadway.env`: `DATABASE_URL`, `DATA_ENCRYPTION_KEY`, `ORIGIN_SECRET`, `BOOTSTRAP_TOKEN_HASH`. The cloud firewall permits public HTTPS/HTTP and SSH only from the setup Mac. Only SSH keys are used. Browser execution is remote in Browserbase; no local Chromium is installed on production.

Cloudflare secrets: `BROADWAY_ORIGIN` (the verified Caddy HTTPS origin) and `BROADWAY_ORIGIN_SECRET` (same as `ORIGIN_SECRET`). The existing static site allowlist includes only `broadway/`; backend code and secrets are excluded.

Provision the owner-link hash in encrypted state and keep the private management shortcut outside git. Connect OpenAI, Browserbase, calendar feeds, and a verified Resend sender through the owner controls. Import the existing profile and ledger before handing over the scheduler. Telecharge Facebook authentication may require a one-time interactive login in the hosted browser, followed by persisted context reuse.

## Verification status

Local tests cover encrypted storage, exclusive leases, duplicate schedule slots, restart deduplication, response-loss uncertainty, stopping before final submit, read-only inspection, private endpoint authorization, CSRF, and secret redaction. These are infrastructure tests, not proof of live lottery acceptance.

The first standalone Chromium probe on October 28 encountered Cloudflare verification on Broadway Direct and HTTP 403 on Lucky Seat. Telecharge loaded its embedded application. Browserbase, account login persistence, exact selectors, real CAPTCHA acceptance, calendar fetch, and report delivery must be validated live before calling this unattended system complete. Lucky Seat was subsequently validated through Browserbase's basic browser as described below. New-entry acceptance remains unproven.

## Operating costs

The user approved a $30/month total target. Fixed monthly costs are $6 for the Droplet, $1.20 for weekly backups, and $20 for Browserbase Developer: $27.20 before taxes. Application limits reserve at most $1.50/month for model calls and $0.50/month for paid CAPTCHA requests, leaving $0.80 headroom. Model calls have bounded input/output, no SDK retries, and durable conservative reservations: uncertain charges retain their reservation.

Browserbase has automatic overage billing, not a vendor hard cap. Before each browser session the runner checks project usage; it stops at 90 browser hours or 850 MB of proxy traffic, below the plan's 100 hours/1 GB. Running sessions are monitored; unnecessary images, fonts, and video are blocked while challenge images remain allowed. A single session is stopped around 8 MB. Metering delay, in-flight traffic, user-operated login sessions, other project usage, taxes, and vendor price changes mean these controls cannot promise an exact invoice ceiling. Browserbase Verified is Scale-only; access to these lottery sites must be validated on Developer rather than inferred from vendor claims.

### Paid CAPTCHA test, October 28

The actual `Captcha.solve` implementation was tested against 2Captcha's official reCAPTCHA v2 demo. One paid task returned a token; the runner applied it to the observed response field, clicked Check, and the site's verification response returned `success: true` with hostname `2captcha.com`. This proves the standalone browser's paid-token application path. It does not prove Broadway Direct Cloudflare clearance, Lucky Seat access, or an unattended production lottery entry.


### Provisioned infrastructure

- Dedicated Droplet `dmitri-broadway-runner`, ID `613617146`, NYC1, 1 GB. HTTPS origin `https://159-223-140-215.sslip.io`.
- Cloud firewall `8e0dcd74-d1fa-4a33-927d-95c8f73a7fed`; weekly Sunday backups, 28-day retention, plus daily SQLite snapshots.
- Earlier $5 App Platform service and $15 managed PostgreSQL cluster were removed after verified migration and encrypted local backup, to avoid duplicate recurring charges.
- Migration preserved 39 archived ledgers and 289 confirmed entries. The live API showed 46 upcoming entries after migration. Both recovered OpenAI and personal Browserbase credentials are connected; an actual Agents SDK structured response was verified.
- The hosted scheduler remains off. The existing Codex heartbeat remains active until provider acceptance, calendar/reporting, and a verified handover are complete.

The deployment uses the `codex/broadway-runner` branch during validation. Secrets and recovery material live outside git. The authoritative encryption-key backup is in the original checkout's `.local-secrets/broadway-hosting.json`; loss of this key makes encrypted database backups unreadable. Never paste that file into chat, commit it, or publish it through the static build.


### Lucky Seat hosted read-only validation, October 28

A production-Droplet check using a basic Browserbase session logged in with the saved account, enumerated all four NYC Broadway category cards and 50 performance checkboxes, and found 27 eligible performances after exclusions and availability. All 27 matched both the encrypted ledger and exact show/date/time/quantity rows in Entries & Results. No entries were submitted. The encrypted `probe:luckyseat-readonly` record links the saved evidence. Login persistence survived separate hosted sessions.

The adapter now uses the current city/category filters and show cards, observed performance IDs, the shared plus/minus ticket counter, required review terms, and exact persisted-result reconciliation. Future result years are anchored to the provider's explicit drawing date, including year boundaries. Review and final-confirm controls were checked against the provider's current delivered application source; they still need a fresh eligible live entry to prove acceptance.

Explicitly rendered CAPTCHA widgets expose their key through the Google iframe even when `data-sitekey` is absent. The solver now detects this layout and attempts the normal checkbox before the paid fallback. The site's actual acceptance of a new lottery submission remains the completion criterion. [2Captcha's documentation](https://2captcha.com/2captcha-api#solving_recaptchav2_new) describes response-field and explicit-render handling. Tests cover observed DOM extraction, result mismatches and year boundaries; 13 tests pass locally.

Browserbase's paid proxy/CAPTCHA session request still returns HTTP 402. Basic-session diagnostics do not establish paid-plan readiness. The hosted scheduler remains off while the Browserbase subscription, Telecharge hosted login, report sender, and fresh provider submission checks are unresolved.
