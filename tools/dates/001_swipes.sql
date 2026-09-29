begin;

-- A private board is addressed by a 256-bit capability. Only its digest is stored.
create table public.date_night_votes (
  board_hash bytea not null,
  actor text not null check (actor in ('dmitri', 'tulin')),
  idea_id text not null check (idea_id ~ '^[a-z0-9-]{1,64}$'),
  choice text not null check (choice in ('yes', 'maybe', 'pass', 'none')),
  client_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (board_hash, actor, idea_id)
);

create table public.date_night_events (
  board_hash bytea not null,
  event_id uuid not null,
  actor text not null check (actor in ('dmitri', 'tulin')),
  idea_id text not null,
  choice text not null check (choice in ('yes', 'maybe', 'pass', 'none')),
  client_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (board_hash, event_id)
);

alter table public.date_night_votes enable row level security;
alter table public.date_night_events enable row level security;
revoke all on public.date_night_votes, public.date_night_events from public, anon, authenticated;

create function public.date_night_sync(p_token text, p_actions jsonb default '[]'::jsonb)
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
  board := sha256(convert_to(p_token, 'UTF8'));
  -- Serialize a board's writes so retries, undo, and two-person updates stay coherent.
  perform pg_advisory_xact_lock(hashtextextended(p_token, 0));
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
comment on function public.date_night_sync(text,jsonb) is 'Date-night app only. Bearer board capability; never returns rows for another board.';
notify pgrst, 'reload schema';
commit;
