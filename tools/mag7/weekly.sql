begin;
create table if not exists public.mag7_weekly_snapshots (
  session_date date primary key,
  created_at timestamptz not null default now(),
  ledger_sha256 text not null,
  report jsonb not null,
  sources jsonb not null
);
alter table public.mag7_weekly_snapshots enable row level security;
revoke all on public.mag7_weekly_snapshots from public, anon, authenticated;
create or replace function public.mag7_public_weekly()
returns jsonb language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(x.summary order by x.session_date desc),'[]'::jsonb)
from (
 select session_date, jsonb_build_object(
   'session_date',session_date,'recorded_at',created_at,
   'market_value',report->'market_value',
   'net_purchase_cost',report->'net_purchase_cost',
   'price_pnl',report->'price_pnl',
   'period_price_pnl',report->'period_price_pnl',
   'previous_session',report->'previous_session',
   'holdings',report->'holdings'
 ) summary from public.mag7_weekly_snapshots order by session_date desc limit 104
) x;
$$;
revoke all on function public.mag7_public_weekly() from public;
grant execute on function public.mag7_public_weekly() to anon, authenticated;
commit;
