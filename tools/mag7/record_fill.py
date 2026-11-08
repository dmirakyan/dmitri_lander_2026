#!/usr/bin/env python3
"""Record a user-verified brokerage fill; does NOT place or approve an order.

Use only after the user submits the trade and its filled status is verified.
External references stay private and prevent duplicate ingestion.
"""
import argparse
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from run import connection
from basket import target_tickers, reviewed_budget

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file',required=True)
    p.add_argument('--proposal',required=True,type=uuid.UUID)
    p.add_argument('--reference',required=True)
    p.add_argument('--account-alias',required=True,help='Private alias, never account number')
    p.add_argument('--ticker',required=True)
    p.add_argument('--side',required=True,choices=['buy','sell'])
    p.add_argument('--quantity',required=True,type=Decimal)
    p.add_argument('--price',required=True,type=Decimal)
    p.add_argument('--fees',type=Decimal,default=Decimal('0'))
    p.add_argument('--filled-at',required=True,type=datetime.fromisoformat)
    p.add_argument('--complete',action='store_true',help='Mark proposal filled only after all intended orders were verified')
    a=p.parse_args()
    if any(not n.is_finite() for n in [a.quantity,a.price,a.fees]) or min(a.quantity,a.price)<=0 or a.fees<0:
        raise ValueError('Invalid fill amounts')
    if not a.filled_at.tzinfo or a.filled_at>datetime.now(timezone.utc):
        raise ValueError('Fill requires an actual past timestamp with timezone')
    con=connection(a.env_file)
    with con:
        with con.cursor() as q:
            q.execute('select pg_advisory_xact_lock(707250003)')
            q.execute('select proposal_id,account_alias,ticker,side,quantity,price,fees,filled_at from public.mag7_fills where external_reference=%s',(a.reference,))
            old=q.fetchone()
            expected=(str(a.proposal),a.account_alias,a.ticker,a.side,a.quantity,a.price,a.fees,a.filled_at)
            if old:
                if tuple(map(str,old[:1]))+old[1:]!=expected:
                    raise ValueError('Existing reference has different fill details')
                print('Already recorded; no duplicate created.');return
            q.execute('select p.contribution,r.selected_ticker,p.status,r.created_at,p.target_allocations from public.mag7_proposals p join public.mag7_runs r on r.id=p.run_id where p.id=%s',(str(a.proposal),))
            proposal=q.fetchone()
            if not proposal or proposal[2] in ('cancelled','skipped','filled'):
                raise ValueError('Proposal unavailable for new fills')
            if a.filled_at<proposal[3]:
                raise ValueError('Pre-strategy purchases must not be attributed to this strategy')
            selected=target_tickers(proposal[4],proposal[1])
            if a.side=='buy' and a.ticker not in selected:
                raise ValueError('Purchase does not match this monthly signal')
            if a.side=='sell':
                if a.ticker in selected:
                    raise ValueError('Do not churn the unchanged monthly selection')
                q.execute("select settings->>'mode' from public.mag7_strategy where id='most-hated'")
                if q.fetchone()[0]!='rotate':raise ValueError('Accumulation mode does not allow strategy sales')
                q.execute("select coalesce(sum(case when side='buy' then quantity else -quantity end),0) from public.mag7_fills where account_alias=%s and ticker=%s",(a.account_alias,a.ticker))
                if a.quantity>q.fetchone()[0]:raise ValueError('Cannot sell preexisting or unrecorded shares')
            q.execute("select coalesce(sum(case when side='buy' then quantity*price+fees else -(quantity*price-fees) end),0) from public.mag7_fills where proposal_id=%s",(str(a.proposal),))
            net=q.fetchone()[0]
            if a.side=='buy' and net+a.quantity*a.price+a.fees>proposal[0]+Decimal('0.01'):
                raise ValueError('Confirmed purchases exceed the reviewed contribution plus recorded sale proceeds')
            if a.side=='buy':
                q.execute('select private_funding from public.mag7_proposals where id=%s',(str(a.proposal),))
                funding=q.fetchone()[0]
                account_budget,stock_budget=reviewed_budget(funding,a.account_alias,a.ticker,len(selected)>1)
                if not account_budget:
                    raise ValueError('Review and record an account-specific purchase budget first')
                q.execute("select coalesce(sum(quantity*price+fees),0) from public.mag7_fills where proposal_id=%s and account_alias=%s and side='buy'",(str(a.proposal),a.account_alias))
                if q.fetchone()[0]+a.quantity*a.price+a.fees>account_budget+Decimal('0.01'):
                    raise ValueError('Purchase exceeds this account’s reviewed budget')
                q.execute("select coalesce(sum(quantity*price+fees),0) from public.mag7_fills where proposal_id=%s and account_alias=%s and ticker=%s and side='buy'",(str(a.proposal),a.account_alias,a.ticker))
                if not stock_budget or q.fetchone()[0]+a.quantity*a.price+a.fees>stock_budget+Decimal('0.01'):
                    raise ValueError('Purchase exceeds this ticker’s reviewed budget')
            q.execute('insert into public.mag7_fills(id,proposal_id,external_reference,account_alias,ticker,side,quantity,price,fees,filled_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(str(uuid.uuid4()),str(a.proposal),a.reference,a.account_alias,a.ticker,a.side,a.quantity,a.price,a.fees,a.filled_at))
            q.execute('update public.mag7_proposals set status=%s where id=%s',('filled' if a.complete else 'partially_filled',str(a.proposal)))
    print('Verified fill recorded. No brokerage order was submitted by this tool.')

if __name__=='__main__':
    try: main()
    except Exception as e:
        print(f'Fill not recorded ({type(e).__name__}); inspect inputs and existing records privately.')
        raise SystemExit(1)
