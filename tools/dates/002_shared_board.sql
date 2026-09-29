begin;
-- Consolidate only this date app. Preserve all original board rows and history.
lock table public.date_night_votes, public.date_night_events in access exclusive mode;
insert into public.date_night_votes(board_hash,actor,idea_id,choice,client_at,updated_at)
select sha256(convert_to('dmitri-tulin-shared-v1','UTF8')),actor,idea_id,choice,client_at,updated_at
from (
 select distinct on (actor,idea_id) actor,idea_id,choice,client_at,updated_at
 from public.date_night_votes
 where board_hash <> decode('e4c82d91e5b95e0ca774ec0e1fa4410bbf59f83ad73767654b66822651697085','hex')
 and idea_id not like 'test-%'
 order by actor,idea_id,client_at desc,updated_at desc
) latest
on conflict(board_hash,actor,idea_id) do update
set choice=excluded.choice,client_at=excluded.client_at,updated_at=excluded.updated_at
where excluded.client_at > public.date_night_votes.client_at;

insert into public.date_night_events(board_hash,event_id,actor,idea_id,choice,client_at,created_at)
select sha256(convert_to('dmitri-tulin-shared-v1','UTF8')),event_id,actor,idea_id,choice,client_at,created_at
from public.date_night_events
where board_hash <> decode('e4c82d91e5b95e0ca774ec0e1fa4410bbf59f83ad73767654b66822651697085','hex')
and idea_id not like 'test-%'
on conflict do nothing;

create or replace function public.date_night_sync(p_token text, p_actions jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  board bytea;
  a jsonb;
  actor_name text;
  idea text;
  vote text;
  stamp timestamptz;
  inserted integer;
  votes jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid board key' using errcode = '22023';
  end if;
  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'Actions must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_actions) > 64 then
    raise exception 'Too many actions' using errcode = '22023';
  end if;
  board := sha256(convert_to('dmitri-tulin-shared-v1', 'UTF8'));
  -- Serialize a board's writes so retries, undo, and two-person updates stay coherent.
  perform pg_advisory_xact_lock(hashtextextended('dmitri-tulin-shared-v1', 0));
  for a in select value from jsonb_array_elements(p_actions) loop
    actor_name := a->>'actor';
    idea := a->>'idea_id';
    vote := a->>'choice';
    if actor_name is null or actor_name not in ('dmitri','tulin')
      or idea is null or idea !~ '^[a-z0-9-]{1,64}$'
      or vote is null or vote not in ('yes','maybe','pass','none')
      or a->>'event_id' is null or a->>'client_at' is null then
      raise exception 'Invalid vote' using errcode = '22023';
    end if;
    stamp := (a->>'client_at')::timestamptz;
    if stamp > now() + interval '5 minutes' or stamp < timestamptz '2026-01-01' then
      raise exception 'Invalid vote time' using errcode = '22023';
    end if;
    if not exists (select 1 from public.date_night_votes v where v.board_hash=board and v.actor=actor_name and v.idea_id=idea)
      and (select count(*) from public.date_night_votes v where v.board_hash=board) >= 200 then
      raise exception 'Board is full' using errcode = '22023';
    end if;
    insert into public.date_night_events(board_hash,event_id,actor,idea_id,choice,client_at)
      values(board,(a->>'event_id')::uuid,actor_name,idea,vote,stamp)
      on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted > 0 then
      insert into public.date_night_votes(board_hash,actor,idea_id,choice,client_at)
        values(board,actor_name,idea,vote,stamp)
        on conflict(board_hash,actor,idea_id) do update
        set choice=excluded.choice,client_at=excluded.client_at,updated_at=now()
        where excluded.client_at >= public.date_night_votes.client_at;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'actor',v.actor,'idea_id',v.idea_id,'choice',v.choice,
    'client_at',v.client_at,'updated_at',v.updated_at
  )), '[]'::jsonb) into votes from public.date_night_votes v where v.board_hash=board;
  return jsonb_build_object('votes',votes,'server_time',now());
end;
$$;

revoke all on function public.date_night_sync(text,jsonb) from public;
grant execute on function public.date_night_sync(text,jsonb) to anon, authenticated;

-- Old clients also reach the shared board, even before refreshing the page.
comment on function public.date_night_sync(text,jsonb) is 'Legacy client compatibility: all valid board keys now read/write the same two-person date board.';
create or replace function public.date_night_shared_sync(p_actions jsonb default '[]'::jsonb)
returns jsonb language sql security definer set search_path = '' as $$
 select public.date_night_sync(repeat('0',64),p_actions);
$$;
revoke all on function public.date_night_shared_sync(jsonb) from public;
grant execute on function public.date_night_shared_sync(jsonb) to anon, authenticated;
comment on function public.date_night_shared_sync(jsonb) is 'Single shared date board for Dmitri and Tulin; name selection is not authentication. Direct table access remains denied.';
notify pgrst, 'reload schema';
commit;
