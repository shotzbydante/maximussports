-- NFL picks engine v2: pick locking, closing-line value, units.
-- Additive only. Safe to run more than once. No existing row is changed.
--
-- Also adds picks_daily_scorecards.by_pick_role, which the shared scorecard
-- builder has been writing since the hero/tracking split. The column was
-- never created, so every scorecard that carried it was rejected (MLB, NBA
-- and NFL alike); only empty "no picks" rows were being saved.

alter table public.picks
  add column if not exists book text,
  add column if not exists locked_at timestamptz,
  add column if not exists expected_value numeric,
  add column if not exists payload jsonb,
  add column if not exists closing_line numeric,
  add column if not exists clv_points numeric,
  add column if not exists clv_ev numeric;

comment on column public.picks.locked_at is 'Set once when a pick is published. A locked row is never rewritten; it is the ticket that gets graded.';
comment on column public.picks.expected_value is 'Expected profit per unit staked at lock, at price_american, against the consensus fair number.';
comment on column public.picks.clv_ev is 'Expected value of the locked ticket against the last consensus snapshot before kickoff.';
comment on column public.picks.clv_points is 'Points better (+) or worse (-) than the closing line. Null for moneylines.';

-- One locked recommended pick, and one locked tracking pick, per game and market.
create unique index if not exists picks_nfl_locked_hero_uniq
  on public.picks (game_id, market_type)
  where sport = 'nfl' and locked_at is not null and tier <> 'tracking';
create unique index if not exists picks_nfl_locked_tracking_uniq
  on public.picks (game_id, market_type)
  where sport = 'nfl' and locked_at is not null and tier = 'tracking';
create index if not exists picks_locked_lookup_idx
  on public.picks (sport, game_id) where locked_at is not null;

alter table public.pick_results
  add column if not exists units numeric;
comment on column public.pick_results.units is 'Units won or lost on a one-unit stake at the pick''s stored price (-110 when none).';

alter table public.picks_daily_scorecards
  add column if not exists by_pick_role jsonb,
  add column if not exists performance jsonb;

create table if not exists public.nfl_line_snapshots (
  game_id        text primary key,
  start_time     timestamptz,
  captured_at    timestamptz not null default now(),
  season         integer,
  week           integer,
  spread_home    numeric,
  total          numeric,
  fair_margin    numeric,
  fair_total     numeric,
  fair_home_win  numeric,
  books          integer
);
comment on table public.nfl_line_snapshots is 'Latest multi-book consensus per NFL game, overwritten on each build until kickoff. The last row before kickoff is the closing line.';

-- Server-side only: the service role bypasses RLS; no policy means no client access.
alter table public.nfl_line_snapshots enable row level security;
