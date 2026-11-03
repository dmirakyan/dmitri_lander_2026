-- Separate strategy records. No access to existing site tables is changed.
begin;
create table if not exists public.mag7_strategy (
  id text primary key check (id = 'most-hated'),
  version integer not null,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.mag7_runs (
  id uuid primary key,
  signal_month date not null,
  strategy_version integer not null,
  created_at timestamptz not null default now(),
  signal_date date not null,
  intended_review_date date not null,
  selected_ticker text not null check (selected_ticker in ('AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA')),
  rankings jsonb not null,
  methodology jsonb not null,
  unique(signal_month, strategy_version)
);
create table if not exists public.mag7_market_sources (
  run_id uuid references public.mag7_runs(id),
  ticker text not null,
  fetched_at timestamptz not null,
  source_url text not null,
  sha256 text not null,
  payload jsonb not null,
  primary key(run_id, ticker)
);
create table if not exists public.mag7_prices (
  run_id uuid references public.mag7_runs(id),
  ticker text not null,
  session_date date not null,
  close numeric not null check (close > 0),
  adjusted_close numeric not null check (adjusted_close > 0),
  primary key(run_id, ticker, session_date)
);
create table if not exists public.mag7_proposals (
  id uuid primary key,
  run_id uuid not null unique references public.mag7_runs(id),
  contribution numeric not null check(contribution > 0),
  kind text not null check(kind in ('initial','monthly')),
  status text not null default 'pending_review' check(status in ('pending_review','approved','partially_filled','filled','skipped','cancelled')),
  public_note text not null,
  private_funding jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create table if not exists public.mag7_fills (
  id uuid primary key,
  proposal_id uuid not null references public.mag7_proposals(id),
  external_reference text not null unique,
  account_alias text not null,
  ticker text not null check(ticker in ('AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA')),
  side text not null check(side in ('buy','sell')),
  quantity numeric not null check(quantity > 0),
  price numeric not null check(price > 0),
  fees numeric not null default 0 check(fees >= 0),
  filled_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table public.mag7_strategy enable row level security;
alter table public.mag7_runs enable row level security;
alter table public.mag7_market_sources enable row level security;
alter table public.mag7_prices enable row level security;
alter table public.mag7_proposals enable row level security;
alter table public.mag7_fills enable row level security;
revoke all on public.mag7_strategy, public.mag7_runs, public.mag7_market_sources, public.mag7_prices, public.mag7_proposals, public.mag7_fills from public, anon, authenticated;

-- Public read projection only. Account aliases, source holdings, order IDs,
-- raw provider payloads, and individual fills are deliberately not returned.
create or replace function public.mag7_public_tracker()
returns jsonb language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'strategy', (select jsonb_build_object(
    'version',version,'name',settings->'name','state',settings->'state',
    'mode',settings->'mode','initial_allocation',settings->'initial_allocation',
    'monthly_allocation',settings->'monthly_allocation',
    'next_review_date',settings->'next_review_date','stop_loss',settings->'stop_loss'
  ) from public.mag7_strategy where id='most-hated'),
  'runs', coalesce((select jsonb_agg(x.data order by x.signal_month desc) from (
    select r.signal_month, jsonb_build_object(
      'id',r.id,'signal_month',r.signal_month,'signal_date',r.signal_date,
      'created_at',r.created_at,'intended_review_date',r.intended_review_date,
      'selected_ticker',r.selected_ticker,'rankings',r.rankings,'methodology',r.methodology,
      'proposal',jsonb_build_object('id',p.id,'contribution',p.contribution,'kind',p.kind,'status',p.status,'note',p.public_note)
    ) data from public.mag7_runs r join public.mag7_proposals p on p.run_id=r.id
    order by r.signal_month desc limit 120
  ) x),'[]'::jsonb),
  'execution',jsonb_build_object(
    'confirmed_fill_count',(select count(*) from public.mag7_fills),
    'net_purchase_cost',coalesce((select sum(case when side='buy' then quantity*price+fees else -(quantity*price-fees) end) from public.mag7_fills),0),
    'holdings',coalesce((select jsonb_agg(to_jsonb(h)) from (
      select ticker,sum(case when side='buy' then quantity else -quantity end) quantity
      from public.mag7_fills group by ticker having sum(case when side='buy' then quantity else -quantity end)>0
    ) h),'[]'::jsonb)
  ),
  'served_at',now()
);
$$;
revoke all on function public.mag7_public_tracker() from public;
grant execute on function public.mag7_public_tracker() to anon, authenticated;
commit;
