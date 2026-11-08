-- Add proposal allocations without rewriting historical signals.
begin;
alter table public.mag7_proposals add column if not exists target_allocations jsonb not null default '[]';
create or replace function public.mag7_public_tracker()
returns jsonb language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'strategy', (select jsonb_build_object(
    'version',version,'name',settings->'name','state',settings->'state',
    'mode',settings->'mode','initial_allocation',settings->'initial_allocation',
    'monthly_allocation',settings->'monthly_allocation','selection_count',settings->'selection_count',
    'next_review_date',settings->'next_review_date','stop_loss',settings->'stop_loss'
  ) from public.mag7_strategy where id='most-hated'),
  'runs', coalesce((select jsonb_agg(x.data order by x.signal_month desc) from (
    select r.signal_month, jsonb_build_object(
      'id',r.id,'signal_month',r.signal_month,'signal_date',r.signal_date,
      'created_at',r.created_at,'intended_review_date',r.intended_review_date,
      'selected_ticker',r.selected_ticker,'rankings',r.rankings,'methodology',r.methodology,
      'proposal',jsonb_build_object('id',p.id,'contribution',p.contribution,'kind',p.kind,'status',p.status,'note',p.public_note,
        'target_allocations',coalesce((select jsonb_agg(jsonb_build_object('ticker',a->>'ticker','weight',a->'weight')) from jsonb_array_elements(p.target_allocations) a),'[]'::jsonb))
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
