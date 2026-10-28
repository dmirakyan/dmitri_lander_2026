"""Conservative application spending limits; vendor billing remains authoritative."""
from datetime import datetime, timezone
import math
import time
import httpx
from sqlalchemy import text
from .errors import FlowBlocked

LIMITS = {'openai': 1_500_000, 'captcha': 500_000}  # microdollars/month


def adjust(store, record_id, delta, limit):
    store.once(record_id, {'reserved_microdollars': 0})
    for _ in range(10):
        with store.engine.begin() as connection:
            previous = connection.execute(text('SELECT value FROM state WHERE id=:id'), {'id':record_id}).scalar_one()
            record = store.decode(previous)
            amount = record['reserved_microdollars'] + delta
            if amount > limit:
                raise FlowBlocked('Monthly spending limit reached; waiting for next month')
            record['reserved_microdollars'] = max(0, amount)
            updated = connection.execute(text('UPDATE state SET value=:value,updated=:now WHERE id=:id AND value=:previous'), {'id':record_id,'value':store.encode(record),'now':time.time(),'previous':previous})
            if updated.rowcount == 1:
                return
    raise FlowBlocked('Spending ledger is busy; no new paid request was made')


def reserve(store, service, dollars):
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    record_id = f'budget:{month}:{service}'
    amount = math.ceil(dollars * 1_000_000)
    adjust(store, record_id, amount, LIMITS[service])
    # An interrupted/uncertain charge retains its full reservation.
    return record_id, amount


def settle(store, reservation, dollars):
    record_id, amount = reservation
    adjust(store, record_id, math.ceil(dollars * 1_000_000) - amount, 10**12)


async def browser_allowance(store, config):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get('https://api.browserbase.com/v1/projects/'+config['browserbase_project_id']+'/usage', headers={'X-BB-API-Key':config['browserbase_api_key']})
    if r.status_code != 200:
        raise FlowBlocked('Browser usage could not be checked; no new session was started')
    usage = r.json()
    if not all(isinstance(usage.get(k), (int,float)) for k in ('browserMinutes','proxyBytes')):
        raise FlowBlocked('Browser usage response is incomplete')
    store.put('usage:browserbase', {**usage,'checked_at':time.time()})
    if usage['browserMinutes'] >= 5400 or usage['proxyBytes'] >= 850_000_000:
        raise FlowBlocked('Browser allowance is nearly used; stopped before expected overage')
    return usage
