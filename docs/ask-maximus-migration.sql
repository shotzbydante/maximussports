-- Ask Maximus: the conversation thread.
--
-- One thread per account. Every channel (web today, iMessage and SMS later)
-- writes to the same rows, so there is nothing to sync between them.
--
-- Run once in the Supabase SQL editor. Safe to re-run. Until it has been
-- run, /api/ask/chat answers "not_configured" and the page says so.
--
-- Access: row level security is on with no policies, so the anon and
-- authenticated keys can do nothing here. Only the server (service role)
-- reads and writes, through api/_lib/ask/thread.js.

create table if not exists public.ask_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  channel     text        not null default 'web' check (channel in ('web', 'imessage', 'sms')),
  body        text        not null,
  -- What the answer showed, as built by the server: pick, game and record
  -- cards plus follow-up chips. Rendered as cards on the web, as text
  -- bubbles on a phone, and as plain text in the model's own history.
  cards       jsonb       not null default '[]'::jsonb,
  -- The texting provider's message id. A retried webhook is dropped here.
  external_id text,
  -- "Clear conversation" hides rows instead of deleting them, so clearing
  -- the thread does not reset the daily message count.
  cleared_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists ask_messages_user_id_idx
  on public.ask_messages (user_id, id);

create unique index if not exists ask_messages_external_id_idx
  on public.ask_messages (channel, external_id)
  where external_id is not null;

alter table public.ask_messages enable row level security;

-- Start a turn: drop a duplicate delivery, enforce the daily cap, store the
-- user's message and return the recent thread. One transaction, serialized
-- per account, so two messages sent at once cannot both slip under the cap.
--
-- The day runs midnight to midnight Eastern, the same day the picks use.
create or replace function public.ask_chat_begin(
  p_user        uuid,
  p_channel     text,
  p_body        text,
  p_external_id text,
  p_daily_cap   integer,
  p_history     integer default 24
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
  v_used      integer;
  v_id        bigint;
  v_history   jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ask:' || p_user::text));

  if p_external_id is not null and exists (
    select 1 from public.ask_messages where channel = p_channel and external_id = p_external_id
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select count(*) into v_used
  from public.ask_messages
  where user_id = p_user and role = 'user' and created_at >= v_day_start;

  if v_used >= p_daily_cap then
    return jsonb_build_object('status', 'capped', 'used', v_used);
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) into v_history
  from (
    select id, role, channel, body, cards, created_at
    from public.ask_messages
    where user_id = p_user and cleared_at is null
    order by id desc
    limit greatest(p_history, 0)
  ) m;

  insert into public.ask_messages (user_id, role, channel, body, external_id)
  values (p_user, 'user', p_channel, p_body, p_external_id)
  returning id into v_id;

  return jsonb_build_object('status', 'ok', 'id', v_id, 'used', v_used + 1, 'history', v_history);
end;
$$;

-- Messages sent so far today (Eastern), for the "3 of 5 left" counter.
create or replace function public.ask_chat_used(p_user uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.ask_messages
  where user_id = p_user
    and role = 'user'
    and created_at >= date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
$$;

revoke all on function public.ask_chat_begin(uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.ask_chat_used(uuid) from public, anon, authenticated;
grant execute on function public.ask_chat_begin(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.ask_chat_used(uuid) to service_role;
