# Most hated Mag 7 tracker

Live route: https://dmitri.im/invest/. Static frontend on the existing Cloudflare
Worker; Supabase stores signals, source data, proposals and verified fills.
This is a research and review bot. It contains no brokerage execution API.

## Agreed strategy, November 3, 2026

- Reallocate $50,000 initially, subject to review of the funding positions.
- Add $15,000 fresh funds monthly beginning with the next monthly review.
- Universe: AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA. Alphabet counted once.
- Prior month-end 3/6/12 calendar-month returns using exact NYSE sessions.
- Adjusted closes account for splits and dividends (total-return proxy).
- Rank 1 best, 7 worst; highest average rank wins. Exact return ties get average
  ranks. Average-rank ties: worst 12-month, 6-month, 3-month, alphabetical ticker.
- Rotate only strategy-owned shares when selection changes; hold existing
  strategy shares when unchanged and add only the new contribution.
- No stop-loss or automatic mid-month trading. No leverage or shorts.
- Never count preexisting holdings as strategy shares. No strategy cap chosen.
- Initial funding can come from existing retirement-account holdings without
  withdrawing funds. Fresh $15k/month is not assumed to be an IRA contribution.
  Each account funds its own purchases; never pool IRA sale proceeds across accounts.
- Monthly signals/proposals run at 10 a.m. America/New_York on the first NYSE
  session. Initial November 3 setup is explicitly an off-schedule exception.

Source: https://x.com/pitdesi/status/2103189414042271914 and user-supplied screenshot.
The screenshot describes rotating a fixed $100k sleeve without contributions.
However, when asked when he sells, the author replied "Not sure yet!":
https://x.com/pitdesi/status/2103485916484624761. He says he uses a traditional IRA:
https://x.com/pitdesi/status/2103199490480148690. No stop-loss rule was verified.
Our explicit rotation/contribution and dividend conventions are not a claim to
replicate his live strategy or backtest exactly. Do not publish its performance
claims as verified results. The site shows no returns until actual fills exist.

## Local runner

Python 3.9+; the installed environment is `.local-secrets/mag7-venv` (ignored).
Install `requirements.txt` into an isolated venv if rebuilding. Keep the database
connection outside the repo and frontend. This setup reuses the authorized
Supabase project already used by `/dates`, with dedicated `mag7_*` tables.

```sh
.local-secrets/mag7-venv/bin/python tools/mag7/run.py \
  --env-file /Users/dmitri/Documents/GitHub/creed-api/.env
.local-secrets/mag7-venv/bin/python -m unittest discover -s tools/mag7 -p 'test_*.py' -v
```

`--initial --migrate --mode rotate` is for first setup only. Initial run already
exists; do not repeat with a new version to create a duplicate allocation.
`--date YYYY-MM-DD` exists for deterministic replay/testing; never override the
actual date in a production scheduled run. Version changes need an explicit
migration/review, not retroactive rewriting of an old signal.

The runner gates on the trading calendar, validates all seven complete series,
stores raw Yahoo responses/source URLs/retrieval times/SHA256 and daily prices
(including SPY/MAGS), and commits the signal and proposal atomically. The unique
month/version constraint plus advisory lock prevents duplicate signals. Existing
signals are immutable even if Yahoo later revises adjusted history. Provider is
an unofficial Yahoo chart endpoint; outages fail closed, with no substitute pick.
The SHA256 hashes original response bytes; JSONB stores semantic payloads, not
byte-identical serialization. The NYSE calendar currently covers 2023–2030.

Codex heartbeat `monthly-mag-7-strategy-review` checks weekdays in the first seven
calendar days at 10 a.m. New York. The runner itself gates to the first NYSE day.
No-op checks remain quiet. This is a local Codex automation, not a cloud cron.
If the Mac/app misses the first trading day, no late trade is assumed: surface
an overdue review and obtain a new dated proposal. Do not stack missed deposits.
An existing signal with pending review still needs a review if no review was
previously delivered; a duplicate signal must never become a duplicate order.

## Funding review and fills

Read the private `mag7_proposals.private_funding` plan in the server context.
Funding details stay in that private field, not source control. A funding draft
is not an approved or executed order. Recheck holdings, current quote, open
orders, settlement and available buying power before presenting executable
orders. Mutual funds use the next NAV;
a same-day stock purchase is not assumed to be funded by that sale.

Each review must show all ranks/returns, strategy-owned holdings and current
value, precise proposed sells and buys per account, and taxes/settlement. For
monthly rotations use only quantities from verified fills; same-ticker preexisting
shares stay outside the ledger. Review taxable lots and potential wash sales.
The user submits trades in Fidelity; the agent must not submit them.

Only after actual fills are verified, set account-specific funding entries to
`status: reviewed` with `account_alias` and `buy_dollars` (total purchase budget
including reviewed same-account sale proceeds) and use `record_fill.py --help`.
Use an execution-specific unique reference (order ID plus execution ID for partial
fills). Record sells before buys. `--complete` is explicit, only after all intended
fills have been verified. The recorder rejects duplicate references with changed
details, buys of the wrong ticker, sales beyond recorded strategy holdings,
unchanged-selection churn, excessive budgets and pre-strategy timestamps.
There is no broker reconciliation or corporate-action ingestion yet; splits,
mergers or corrections must be reconciled before any sell proposal. Never edit a
quantity silently or guess a fill. No performance calculation is implemented yet;
benchmarks are stored to support later cash-flow-matched measurement.

## Privacy and deployment

Six tables have RLS and no anonymous/authenticated CRUD grants. Only the
`mag7_public_tracker()` function is publicly executable. It returns an explicit
settings allowlist, rankings, public proposal summaries and aggregate verified
holdings/costs. It excludes account aliases, funding positions, execution
references and provider payloads. Do not store private text in `public_note` or
methodology. The page is unlisted/noindex but PUBLIC, not password protected.

`invest/config.js` contains the same public Supabase anon credential as `/dates`.
Never use a service-role key in it. Backend tools and `.local-secrets` are excluded
from the build allowlist. No brokerage credentials are stored by this project.

```sh
npm run build
npm run dev -- --port 8787
npm run deploy
```

Only `invest/` is added; `/broadway` remains the separate lottery dashboard.
