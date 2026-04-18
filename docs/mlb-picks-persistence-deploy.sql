-- ═════════════════════════════════════════════════════════════════════════════
-- MLB PICKS v2 — PRODUCTION DEPLOY SQL (copy / paste into Supabase SQL Editor)
--
-- Run ONCE against the production Supabase project. Idempotent — safe to re-run.
-- Wrapped in a transaction; either the whole schema lands or nothing does.
--
-- After running, paste docs/mlb-picks-persistence-verification.sql to confirm.
--
-- DO NOT run this against the wrong environment. Confirm the Supabase project
-- name at the top of the SQL editor before you click Run.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- 1. Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- 2. Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.picks_runs (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null,
  slate_date         date not null,
  generated_at       timestamptz not null default now(),
  model_version      text not null,
  config_version     text not null,
  meta               jsonb not null default '{}'::jsonb,
  payload            jsonb not null,
  created_at         timestamptz not null default now()
);
create index if not exists picks_runs_sport_slate_idx
  on public.picks_runs (sport, slate_date desc, generated_at desc);

create table if not exists public.picks (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references public.picks_runs(id) on delete cascade,
  sport                text not null,
  slate_date           date not null,
  game_id              text not null,
  pick_key             text not null,
  tier                 text not null check (tier in ('tier1','tier2','tier3')),
  market_type          text not null check (market_type in ('moneyline','runline','total')),
  selection_side       text not null,
  line_value           numeric,
  price_american       integer,
  away_team_slug       text not null,
  home_team_slug       text not null,
  start_time           timestamptz,
  bet_score            numeric not null,
  bet_score_components jsonb not null default '{}'::jsonb,
  model_prob           numeric,
  implied_prob         numeric,
  raw_edge             numeric,
  data_quality         numeric,
  signal_agreement     numeric,
  rationale            jsonb not null default '{}'::jsonb,
  top_signals          jsonb,
  model_version        text not null,
  config_version       text not null,
  created_at           timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'picks_run_pickkey_unique') then
    alter table public.picks
      add constraint picks_run_pickkey_unique unique (run_id, pick_key);
  end if;
end$$;
create index if not exists picks_sport_slate_tier_idx
  on public.picks (sport, slate_date desc, tier);
create index if not exists picks_gameid_idx
  on public.picks (game_id);
create index if not exists picks_sport_slate_mkt_idx
  on public.picks (sport, slate_date desc, market_type);

create table if not exists public.pick_results (
  pick_id            uuid primary key references public.picks(id) on delete cascade,
  status             text not null check (status in ('won','lost','push','void','pending')),
  final_away_score   integer,
  final_home_score   integer,
  settled_at         timestamptz not null default now(),
  notes              text
);
create index if not exists pick_results_status_idx on public.pick_results (status);

create table if not exists public.picks_daily_scorecards (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null,
  slate_date         date not null,
  record             jsonb not null,
  by_market          jsonb not null default '{}'::jsonb,
  by_tier            jsonb not null default '{}'::jsonb,
  top_play_result    text,
  streak             jsonb,
  note               text,
  computed_at        timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'picks_daily_scorecards_sport_date_unique') then
    alter table public.picks_daily_scorecards
      add constraint picks_daily_scorecards_sport_date_unique unique (sport, slate_date);
  end if;
end$$;

create table if not exists public.picks_config (
  version            text primary key,
  sport              text not null,
  is_active          boolean not null default false,
  is_shadow          boolean not null default false,
  config             jsonb not null,
  created_at         timestamptz not null default now(),
  activated_at       timestamptz,
  deactivated_at     timestamptz
);
create unique index if not exists picks_config_one_active_per_sport
  on public.picks_config (sport) where is_active;

create table if not exists public.picks_tuning_log (
  id                  uuid primary key default gen_random_uuid(),
  sport               text not null,
  slate_date          date not null,
  from_config_version text not null,
  to_config_version   text not null,
  delta               jsonb not null default '{}'::jsonb,
  rationale           jsonb not null default '{}'::jsonb,
  sample_size         integer not null default 0,
  status              text not null check (status in ('proposed','shadow','applied','rolled_back','rejected')),
  applied_at          timestamptz,
  reverted_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists picks_tuning_log_sport_status_idx
  on public.picks_tuning_log (sport, status, slate_date desc);

create table if not exists public.picks_audit_artifacts (
  id                   uuid primary key default gen_random_uuid(),
  sport                text not null,
  slate_date           date not null,
  summary              jsonb not null default '{}'::jsonb,
  signal_attribution   jsonb not null default '{}'::jsonb,
  recommended_deltas   jsonb not null default '{}'::jsonb,
  applied_tuning_id    uuid references public.picks_tuning_log(id),
  created_at           timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'picks_audit_artifacts_sport_date_unique') then
    alter table public.picks_audit_artifacts
      add constraint picks_audit_artifacts_sport_date_unique unique (sport, slate_date);
  end if;
end$$;

-- 3. Row Level Security ──────────────────────────────────────────────────────
-- Read-open for anon; writes require service-role (which bypasses RLS).
alter table public.picks_runs              enable row level security;
alter table public.picks                   enable row level security;
alter table public.pick_results            enable row level security;
alter table public.picks_daily_scorecards  enable row level security;
alter table public.picks_config            enable row level security;
alter table public.picks_tuning_log        enable row level security;
alter table public.picks_audit_artifacts   enable row level security;

drop policy if exists picks_runs_read             on public.picks_runs;
create policy       picks_runs_read             on public.picks_runs             for select using (true);

drop policy if exists picks_read                  on public.picks;
create policy       picks_read                  on public.picks                  for select using (true);

drop policy if exists pick_results_read           on public.pick_results;
create policy       pick_results_read           on public.pick_results           for select using (true);

drop policy if exists picks_daily_scorecards_read on public.picks_daily_scorecards;
create policy       picks_daily_scorecards_read on public.picks_daily_scorecards for select using (true);

drop policy if exists picks_config_read           on public.picks_config;
create policy       picks_config_read           on public.picks_config           for select using (true);

drop policy if exists picks_tuning_log_read       on public.picks_tuning_log;
create policy       picks_tuning_log_read       on public.picks_tuning_log       for select using (true);

drop policy if exists picks_audit_artifacts_read  on public.picks_audit_artifacts;
create policy       picks_audit_artifacts_read  on public.picks_audit_artifacts  for select using (true);

-- 4. Seed initial MLB tuning config ──────────────────────────────────────────
insert into public.picks_config (version, sport, is_active, is_shadow, config, activated_at)
values (
  'mlb-picks-tuning-2026-04-17a',
  'mlb',
  true,
  false,
  '{
    "weights": { "edge": 0.40, "conf": 0.25, "sit": 0.20, "mkt": 0.15 },
    "tierCutoffs": {
      "tier1": { "floor": 0.75, "slatePercentile": 0.90 },
      "tier2": { "floor": 0.60, "slatePercentile": 0.70 },
      "tier3": { "floor": 0.45, "slatePercentile": 0.50 }
    },
    "maxPerTier": { "tier1": 3, "tier2": 5, "tier3": 5 },
    "maxPerGame": 2,
    "maxTier1PerGame": 1,
    "marketGates": {
      "total":   { "minConfidence": 0.55, "minExpectedDelta": 0.35 },
      "runline": { "minProbSpread": 0.05 }
    },
    "components": {
      "edge": { "mlCap": 0.10, "rlCap": 0.08, "totDeltaCap": 1.5 },
      "mkt":  { "minConsensusBooks": 3 }
    }
  }'::jsonb,
  now()
)
on conflict (version) do nothing;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- QUICK CONFIRMATION (copy/paste this block into a separate SQL Editor tab).
-- Run this AFTER the transaction commits. Should return 7 tables and 1 config.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- select count(*) as tables_present
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'picks_runs','picks','pick_results','picks_daily_scorecards',
--     'picks_config','picks_tuning_log','picks_audit_artifacts'
--   );
--
-- select version, sport, is_active from public.picks_config
-- where sport = 'mlb' and is_active = true;
--
-- ═════════════════════════════════════════════════════════════════════════════
