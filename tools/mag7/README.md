# Most hated Mag 7 tracker

Live route: https://dmitri.im/invest/. Static frontend on the existing Cloudflare
Worker; Supabase stores signals, source data, proposals and verified fills.
This is a research and review bot. It contains no brokerage execution API.

## Agreed strategy, updated November 8, 2026

- Reallocate $20,000 initially. The owner selected taxable ARKG plus sufficient FSCSX; private lot details stay in Supabase.
- Add $15,000 fresh funds monthly beginning with the next monthly review.
- Universe: AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA. Alphabet counted once.
- Prior month-end 3/6/12 calendar-month returns using exact NYSE sessions.
- Adjusted closes account for splits and dividends (total-return proxy).
- Rank 1 best, 7 worst; the two highest average ranks are selected. Exact return ties get average
  ranks. Average-rank ties: worst 12-month, 6-month, 3-month, alphabetical ticker.
- Split the initial allocation and fresh monthly contributions equally between the
  selected two. Retain any stock still selected; rotate only strategy-owned
  shares of departing stocks into entering stocks in the same account. Do not
  trim retained holdings merely to restore equal weights; weights may drift.
- No stop-loss or automatic mid-month trading. No leverage or shorts.
- Never count preexisting holdings as strategy shares. No strategy cap chosen.
- Read the current private funding plan and strategy settings before proposing
  initial sales. Superseded funding drafts must not be reused. Fresh $15k/month
  is not assumed to be an IRA contribution. Each account funds its own purchases;
  never pool IRA sale proceeds across accounts.
- Monthly signals/proposals run at 10 a.m. America/New_York on the first NYSE
  session. Initial November 3 setup is explicitly an off-schedule exception.

Source: https://x.com/pitdesi/status/2103189414042271914 and user-supplied screenshot.
The screenshot describes rotating a fixed $100k single-stock sleeve without contributions.
The owner approved our two-stock variation on November 8: $10k GOOGL plus $10k
AMZN from the saved October ranking. This is a reviewed proposal, not a fill.
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

The one-time `basket.sql` migration adds proposal-level target allocations.
It preserves every historical signal and its original single selected ticker;
the proposal records the owner-reviewed pair. New monthly runs snapshot their
own two targets. Keep signal version 1 because ranking mathematics is unchanged.

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
including reviewed same-account sale proceeds), plus `buy_allocations` mapping
each selected ticker to its reviewed dollar cap, and use `record_fill.py --help`.
The initial caps are $10,000 each including fees. Owner agreement alone must not
change a funding entry to execution-ready `reviewed` or record a fill.
Use an execution-specific unique reference (order ID plus execution ID for partial
fills). Record sells before buys. `--complete` is explicit, only after all intended
fills have been verified. The recorder rejects duplicate references with changed
details, buys outside the proposal target pair or above its per-account/per-ticker caps, sales beyond recorded strategy holdings,
unchanged-selection churn, excessive budgets and pre-strategy timestamps.
There is no broker reconciliation or corporate-action ingestion yet; splits,
mergers or corrections must be reconciled before any sell proposal. Never edit a
quantity silently or guess a fill. Benchmarks are stored to support later
cash-flow-matched measurement; no benchmark comparison is reported yet.

## Weekly results

Every Friday at 5 p.m. America/New_York, reconcile actual owner-submitted fills
with Fidelity, then run:

```sh
.local-secrets/mag7-venv/bin/python tools/mag7/weekly.py \
  --env-file /Users/dmitri/Documents/GitHub/creed-api/.env
```

The first setup uses `--migrate` for `weekly.sql`. Snapshots are stored in the
private `mag7_weekly_snapshots` table, with source responses and a ledger hash.
Only an allowlisted summary is exposed by `mag7_public_weekly()` on `/invest`.
The runner uses the last completed NYSE session, allowing an hour after close
for prices; holidays use the previous session. It never records proposed trades.
No fills means no invented performance, and no price fetch is needed.

Weekly price P&L = closing stock value minus cumulative net purchase cost. This
includes trading fees and realized price gains/losses from rotations. Additional
capital is not profit. It excludes dividends, cash interest, cash reserves, and
taxes, so label it **price P&L**, never total return or after-tax return. The
period change subtracts the previous snapshot's price P&L and identifies that
date; missing weeks are not silently treated as weekly changes. A first snapshot
has no period change. No percentage return or benchmark claim is inferred.

Only confirmed fills by the session close enter the calculation. A changed
historical fill ledger, missing exact closing price, insufficient history, or a
split since the first strategy fill blocks valuation pending reconciliation.
No corporate-action adjustments are silently invented. The weekly automation
must also verify positions against the broker; if broker access fails or fills
are missing, report that blocker and do not publish a newly verified snapshot.
Report results in this chat each week, including a pending initial allocation.
Weekly monitoring does not trigger trades. Monthly allocation remains separate.

## Privacy and deployment

Strategy tables have RLS and no anonymous/authenticated CRUD grants. Only the
`mag7_public_tracker()` and `mag7_public_weekly()` functions are publicly executable. They return explicit
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
