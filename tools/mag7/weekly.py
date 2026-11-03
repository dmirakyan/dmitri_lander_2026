#!/usr/bin/env python3
"""Weekly closing valuation of verified strategy fills. Never submits trades.

Price P&L includes realized and unrealized price changes and trading fees.
It excludes dividends, cash interest and taxes; it is not total return.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from psycopg2.extras import Json
from run import connection, fetch_series
from strategy import market_calendar, session_on_or_before

ZERO = Decimal('0')


def valuation(fills, prices):
    quantities = defaultdict(lambda: ZERO)
    account_quantities = defaultdict(lambda: ZERO)
    net_cost = ZERO
    for f in fills:
        quantity, price, fees = (Decimal(str(f[k])) for k in ('quantity', 'price', 'fees'))
        if not all(v.is_finite() for v in (quantity, price, fees)) or min(quantity, price) <= 0 or fees < 0:
            raise ValueError('Invalid recorded fill')
        if f['side'] not in ('buy', 'sell'):
            raise ValueError('Unknown fill side')
        signed = quantity if f['side'] == 'buy' else -quantity
        key = (f['account_alias'], f['ticker'])
        account_quantities[key] += signed
        if account_quantities[key] < 0:
            raise ValueError('Strategy shares missing or unreconciled in an account')
        quantities[f['ticker']] += signed
        net_cost += signed * price + fees
    holdings = []
    market_value = ZERO
    for ticker, quantity in sorted(quantities.items()):
        if not quantity:
            continue
        price = Decimal(str(prices[ticker]))
        if not price.is_finite() or price <= 0:
            raise ValueError('Missing or invalid closing price')
        value = quantity * price
        market_value += value
        holdings.append({'ticker': ticker, 'quantity': float(quantity),
                         'close': float(price), 'market_value': float(value)})
    return {'holdings': holdings, 'market_value': float(market_value),
            'net_purchase_cost': float(net_cost), 'price_pnl': float(market_value-net_cost)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file', required=True)
    p.add_argument('--migrate', action='store_true')
    a = p.parse_args()
    now = datetime.now(timezone.utc)
    ny = now.astimezone(ZoneInfo('America/New_York'))
    session = session_on_or_before(ny.date())
    cal = market_calendar()
    # Give the unofficial closing-price feed an hour to settle, including early closes.
    if now < cal.session_close(session.isoformat()).to_pydatetime() + timedelta(hours=1):
        session = session_on_or_before(session-timedelta(days=1))
    close_time = cal.session_close(session.isoformat()).to_pydatetime()
    con = connection(a.env_file)
    if a.migrate:
        with con.cursor() as q:
            q.execute(Path(__file__).with_name('weekly.sql').read_text())
        con.commit()
    with con:
        with con.cursor() as q:
            q.execute('select pg_advisory_xact_lock(707250004)')
            q.execute('select account_alias,ticker,side,quantity,price,fees,filled_at,external_reference from public.mag7_fills where filled_at<=%s order by filled_at,recorded_at,id', (close_time,))
            names = [c.name for c in q.description]
            fills = [dict(zip(names, r)) for r in q.fetchall()]
            if not fills:
                print(json.dumps({'status':'awaiting_fills','session_date':session.isoformat(),
                                  'message':'No confirmed fills by this close; no return is inferred.'}))
                return
            ledger_hash = hashlib.sha256(json.dumps(fills,sort_keys=True,default=str).encode()).hexdigest()
            q.execute('select ledger_sha256 from public.mag7_weekly_snapshots where session_date=%s',(session,))
            old = q.fetchone()
            if old:
                if old[0] != ledger_hash:
                    raise ValueError('Snapshot ledger changed; reconcile before replacing historical results')
                print(json.dumps({'status':'already_recorded','session_date':session.isoformat()}))
                return
            tickers = sorted(set(f['ticker'] for f in fills))
            prices, sources = {}, {}
            for ticker in tickers:
                series, source = fetch_series(ticker, session)
                if session not in series:
                    raise ValueError('Missing exact closing session; no stale-price fallback')
                first_fill = min(f['filled_at'] for f in fills if f['ticker']==ticker)
                if first_fill.date() < min(series):
                    raise ValueError('Source history does not cover the strategy; extend and audit history first')
                splits = source['payload']['chart']['result'][0].get('events',{}).get('splits',{})
                if any(first_fill.timestamp() <= event['date'] <= close_time.timestamp() for event in splits.values()):
                    raise ValueError('Corporate action requires verified quantity reconciliation')
                prices[ticker] = series[session]['close']
                source['fetched_at'] = source['fetched_at'].isoformat()
                sources[ticker] = source
            report = valuation(fills, prices)
            q.execute('select session_date,report,ledger_sha256 from public.mag7_weekly_snapshots where session_date<%s order by session_date desc limit 1',(session,))
            previous = q.fetchone()
            report.update(previous_session=None, period_price_pnl=None,
                          method='Closing market value minus net purchase cost; fees included, dividends/interest/taxes excluded.')
            if previous:
                previous_close = cal.session_close(previous[0].isoformat()).to_pydatetime()
                prior_fills = [f for f in fills if f['filled_at']<=previous_close]
                prior_hash = hashlib.sha256(json.dumps(prior_fills,sort_keys=True,default=str).encode()).hexdigest()
                if prior_hash != previous[2]:
                    raise ValueError('Earlier fills changed; reconcile the previous snapshot first')
                report['previous_session'] = previous[0].isoformat()
                report['period_price_pnl'] = float(Decimal(str(report['price_pnl']))-Decimal(str(previous[1]['price_pnl'])))
            q.execute('insert into public.mag7_weekly_snapshots(session_date,ledger_sha256,report,sources) values (%s,%s,%s,%s)',
                      (session,ledger_hash,Json(report),Json(sources)))
            print(json.dumps({'status':'recorded','session_date':session.isoformat(),**report}))


if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print(f'Weekly valuation blocked ({type(e).__name__}); inspect data and reconcile privately. No trades submitted.')
        raise SystemExit(1)
