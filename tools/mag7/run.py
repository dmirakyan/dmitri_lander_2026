#!/usr/bin/env python3
"""Fetch, audit, and store a proposed allocation. Never sends brokerage orders."""
import argparse
import hashlib
import json
import os
import sys
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import Json, execute_values
import requests
from dotenv import dotenv_values
from strategy import (UNIVERSE, VERSION, month_end_before, first_session_after,
                      parse_chart, rank_signals)

ROOT = Path(__file__).resolve().parents[2]

def connection(env_file):
    config = {**dotenv_values(env_file), **os.environ}
    return psycopg2.connect(config['POSTGRES_URL'], connect_timeout=15)

def fetch_series(ticker, cutoff):
    # Provider endpoint is unofficial; fail closed on missing/stale data.
    start = int(datetime(cutoff.year-2,cutoff.month,1,tzinfo=timezone.utc).timestamp())
    end = int(datetime.combine(cutoff,datetime.max.time(),tzinfo=timezone.utc).timestamp())+1
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?period1={start}&period2={end}&interval=1d&events=div%2Csplits'
    r = requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=30)
    r.raise_for_status()
    payload = r.json()
    return parse_chart(payload,ticker,cutoff), {'url':url,'payload':payload,
        'sha256':hashlib.sha256(r.content).hexdigest(),'fetched_at':datetime.now(timezone.utc)}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file',required=True,help='Authorized existing Supabase backend env; never copied to the site')
    p.add_argument('--migrate',action='store_true')
    p.add_argument('--initial',action='store_true')
    p.add_argument('--mode',choices=['accumulate','rotate'],default='rotate')
    p.add_argument('--date',type=date.fromisoformat,default=datetime.now(ZoneInfo('America/New_York')).date())
    args=p.parse_args()
    signal_month=month_end_before(args.date)
    review_day=first_session_after(signal_month)
    if not args.initial and args.date != review_day:
        print(json.dumps({'status':'not_due','review_date':review_day.isoformat()})); return
    con=connection(args.env_file)
    if args.migrate:
        with con.cursor() as q: q.execute((Path(__file__).with_name('schema.sql')).read_text())
        con.commit()
    with con.cursor() as q:
        q.execute('select id from public.mag7_runs where signal_month=%s and strategy_version=%s',(signal_month,VERSION))
        old=q.fetchone()
        if old:
            print(json.dumps({'status':'already_recorded','run_id':str(old[0])})); return
        q.execute("select settings from public.mag7_strategy where id='most-hated'")
        config=q.fetchone()
        q.execute('select count(*) from public.mag7_runs')
        count=q.fetchone()[0]
        if args.initial and count:
            raise ValueError('An initial signal already exists; use a monthly review')
        if not args.initial and not config:
            raise ValueError('Initialize and review the strategy before monthly runs')
        settings=config[0] if config else {
            'name':'Most hated Mag 7','state':'active_research','mode':args.mode,
            'initial_allocation':50000,'monthly_allocation':15000,
            'universe':list(UNIVERSE),'rank_direction':'1 = best; 7 = worst',
            'signal_rule':'Highest average rank across 3-, 6-, and 12-month adjusted returns',
            'review_rule':'First US equity trading day of each month, 10:00 a.m. New York',
            'execution_rule':'Research and proposals only. Owner submits trades; record verified fills separately.',
            'funding_rule':'Initial $50,000 from reviewed existing investments. Monthly $15,000 fresh funding, subject to confirmed availability. Keep proceeds inside each originating account; no IRA withdrawals or assumed IRA contributions.',
            'stop_loss':None,
            'strategy_cap':None,'next_review_date':first_session_after(date(args.date.year,args.date.month,__import__('calendar').monthrange(args.date.year,args.date.month)[1])).isoformat()
        }
    series,sources={},{}
    for ticker in [*UNIVERSE,'SPY','MAGS']:
        series[ticker],sources[ticker]=fetch_series(ticker,signal_month)
    anchor,rankings=rank_signals({t:series[t] for t in UNIVERSE},signal_month)
    for ticker in ['SPY','MAGS']:
        if anchor not in series[ticker]: raise ValueError(f'{ticker}: benchmark missing signal date')
    now=datetime.now(timezone.utc)
    run_id=str(uuid.uuid4()); proposal_id=str(uuid.uuid4())
    amount=settings['initial_allocation'] if args.initial else settings['monthly_allocation']
    public_note='Initial allocation proposed; no purchases recorded.' if args.initial else 'Monthly allocation proposed; review funding and existing exposure before submitting orders.'
    method={'version':VERSION,'price_basis':'Split- and dividend-adjusted close (total-return proxy)',
            'provider':'Yahoo Finance chart data (unofficial endpoint)',
            'lookbacks_months':[3,6,12],'anchors':'Last NYSE session on or before each calendar month-end',
            'tie_break':'Worst 12-month return, then 6-month, then 3-month, then ticker',
            'retrieved_at':now.isoformat(),'initial_off_schedule':args.initial and args.date!=review_day,
            'data_note':'Monthly signal, not a live quote. Historical adjustments can be revised by the provider. Raw responses and retrieval times are retained.'}
    with con:
        with con.cursor() as q:
            q.execute('select pg_advisory_xact_lock(707250003)')
            q.execute('select id from public.mag7_runs where signal_month=%s and strategy_version=%s',(signal_month,VERSION))
            if q.fetchone(): print(json.dumps({'status':'already_recorded'})); return
            q.execute('insert into public.mag7_strategy(id,version,settings) values (%s,%s,%s) on conflict(id) do nothing',('most-hated',VERSION,Json(settings)))
            q.execute('insert into public.mag7_runs(id,signal_month,strategy_version,signal_date,intended_review_date,selected_ticker,rankings,methodology) values (%s,%s,%s,%s,%s,%s,%s,%s)',(run_id,signal_month,VERSION,anchor,review_day,rankings[0]['ticker'],Json(rankings),Json(method)))
            for ticker,source in sources.items():
                q.execute('insert into public.mag7_market_sources(run_id,ticker,fetched_at,source_url,sha256,payload) values (%s,%s,%s,%s,%s,%s)',(run_id,ticker,source['fetched_at'],source['url'],source['sha256'],Json(source['payload'])))
                execute_values(q,'insert into public.mag7_prices(run_id,ticker,session_date,close,adjusted_close) values %s',[(run_id,ticker,d,r['close'],r['adjusted_close']) for d,r in series[ticker].items()])
            q.execute('insert into public.mag7_proposals(id,run_id,contribution,kind,public_note) values (%s,%s,%s,%s,%s)',(proposal_id,run_id,amount,'initial' if args.initial else 'monthly',public_note))
            next_month_end=date(args.date.year,args.date.month,__import__('calendar').monthrange(args.date.year,args.date.month)[1])
            q.execute("update public.mag7_strategy set settings=jsonb_set(settings,'{next_review_date}',%s),updated_at=now() where id='most-hated'",(Json(first_session_after(next_month_end).isoformat()),))
    print(json.dumps({'status':'proposal_saved','run_id':run_id,'signal_date':anchor.isoformat(),
                      'selected':rankings[0]['ticker'],'amount':amount,'rankings':rankings},indent=2))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        # Avoid leaking connection strings or provider responses into scheduled logs.
        print(f'Signal run failed ({type(exc).__name__}); no allocation should be submitted.',file=sys.stderr)
        sys.exit(1)
