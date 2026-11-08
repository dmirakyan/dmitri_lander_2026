"""Proposal targets and purchase limits. No brokerage execution capability."""
from decimal import Decimal
from strategy import UNIVERSE


def select_targets(rankings, count):
    if type(count) is not int or count not in (1, 2):
        raise ValueError('Only reviewed one- or two-stock selections are supported')
    if len(rankings) != 7 or {r['ticker'] for r in rankings} != set(UNIVERSE):
        raise ValueError('A complete seven-company ranking is required')
    return [{'ticker': r['ticker'], 'weight': 1 / count} for r in rankings[:count]]


def target_tickers(allocations, legacy_ticker):
    if not allocations:
        allocations = [{'ticker': legacy_ticker, 'weight': 1}]
    tickers = [a['ticker'] for a in allocations]
    weights = [Decimal(str(a['weight'])) for a in allocations]
    if (len(tickers) not in (1, 2) or len(set(tickers)) != len(tickers)
            or not set(tickers) <= set(UNIVERSE)
            or any(not w.is_finite() or w <= 0 for w in weights)
            or sum(weights) != 1):
        raise ValueError('Invalid proposal allocation')
    return set(tickers)


def reviewed_budget(funding, account, ticker, multi_stock):
    """Return total account and ticker caps; missing multi-stock caps fail closed."""
    entries = [f for f in funding if f.get('account_alias') == account and f.get('status') == 'reviewed']
    total = Decimal(0)
    stock = Decimal(0)
    for entry in entries:
        budget = Decimal(str(entry['buy_dollars']))
        if not budget.is_finite() or budget <= 0:
            raise ValueError('Invalid account budget')
        allocations = entry.get('buy_allocations', {})
        if multi_stock and not allocations:
            raise ValueError('Review per-stock budgets before recording basket purchases')
        amounts = [Decimal(str(v)) for v in allocations.values()]
        if amounts and (any(not v.is_finite() or v < 0 for v in amounts) or sum(amounts) > budget):
            raise ValueError('Invalid per-stock budgets')
        total += budget
        stock += Decimal(str(allocations.get(ticker, 0))) if allocations else budget
    return total, stock
