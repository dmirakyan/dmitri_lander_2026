"""Deterministic monthly signals. This module cannot place brokerage orders."""
import calendar
import math
from datetime import date, datetime, timedelta, timezone
from statistics import mean

UNIVERSE = {'AAPL':'Apple','MSFT':'Microsoft','NVDA':'Nvidia','AMZN':'Amazon',
            'GOOGL':'Alphabet','META':'Meta','TSLA':'Tesla'}
LOOKBACKS = (3, 6, 12)
VERSION = 1

def month_end_before(day):
    return day.replace(day=1) - timedelta(days=1)

def month_end_offset(day, months):
    n = day.year * 12 + day.month - 1 - months
    y, m = divmod(n, 12)
    return date(y, m+1, calendar.monthrange(y, m+1)[1])

def market_calendar():
    import exchange_calendars as xc
    return xc.get_calendar('XNYS', start='2023-01-01', end='2030-12-31')

def session_on_or_before(day):
    return market_calendar().date_to_session(day.isoformat(), direction='previous').date()

def first_session_after(day):
    return market_calendar().date_to_session((day+timedelta(days=1)).isoformat(), direction='next').date()

def parse_chart(payload, ticker, cutoff):
    result = payload['chart']['result'][0]
    if result['meta']['symbol'] != ticker:
        raise ValueError('Provider returned a different ticker')
    times = result['timestamp']
    closes = result['indicators']['quote'][0]['close']
    adjusted = result['indicators']['adjclose'][0]['adjclose']
    if not (len(times) == len(closes) == len(adjusted)):
        raise ValueError('Mismatched provider series')
    rows = {}
    for stamp, close, adj in zip(times, closes, adjusted):
        day = datetime.fromtimestamp(stamp, timezone.utc).date()
        if day > cutoff:
            continue
        if close is None or adj is None:
            continue
        if not all(math.isfinite(v) and v > 0 for v in [close, adj]):
            raise ValueError('Invalid price')
        if day in rows:
            raise ValueError('Duplicate session date')
        rows[day] = {'close':close, 'adjusted_close':adj}
    return rows

def rank_signals(series, signal_month, resolver=session_on_or_before):
    if set(series) != set(UNIVERSE):
        raise ValueError('All seven companies are required; never rank a partial universe')
    anchor = resolver(signal_month)
    dates = {m:resolver(month_end_offset(signal_month,m)) for m in LOOKBACKS}
    rows = []
    for ticker in UNIVERSE:
        prices = series[ticker]
        if any(d not in prices for d in [anchor,*dates.values()]):
            raise ValueError(f'{ticker}: missing exact required trading session')
        returns = {str(m):prices[anchor]['adjusted_close']/prices[d]['adjusted_close']-1 for m,d in dates.items()}
        rows.append({'ticker':ticker,'name':UNIVERSE[ticker],'returns':returns,'ranks':{},
                     'signal_close':prices[anchor]['close'],'signal_adjusted_close':prices[anchor]['adjusted_close'],
                     'anchor_prices':{str(m):{'date':d.isoformat(),**prices[d]} for m,d in dates.items()}})
    for months in LOOKBACKS:
        key = str(months)
        ordered = sorted(rows,key=lambda r:r['returns'][key],reverse=True)
        for row in rows:
            # Average ranks for exact return ties, 1=best and 7=worst.
            row['ranks'][key] = mean(i+1 for i,r in enumerate(ordered) if r['returns'][key] == row['returns'][key])
    for row in rows:
        row['average_rank'] = mean(row['ranks'].values())
    # Worst average wins; ties: worst 12m, then 6m, then 3m, then ticker.
    rows.sort(key=lambda r:(-r['average_rank'],r['returns']['12'],r['returns']['6'],r['returns']['3'],r['ticker']))
    return anchor, rows
