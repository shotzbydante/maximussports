-- NFL picks: schema check
--
-- The NFL workspace reuses the existing picks tables unchanged
-- (picks_runs, picks, pick_results, picks_daily_scorecards,
-- picks_tuning_log) with sport = 'nfl'. No new tables are needed.
--
-- One thing to confirm. The original table definition in
-- docs/mlb-picks-v2-migration.sql restricts picks.tier to
-- ('tier1','tier2','tier3'). api/_lib/picksHistory.js has accepted
-- 'coverage' and 'tracking' since the NBA full-slate work, so production
-- has most likely been widened already. NFL writes 'tracking' rows for
-- every full-slate pick that does not clear a tier, so if the old
-- constraint is still in place those inserts fail (hero picks still save).
--
-- This script is idempotent and safe to run either way: it replaces the
-- tier check with the set the application code validates against.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'picks'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%tier%'
      and pg_get_constraintdef(con.oid) not ilike '%plan_tier%'
  loop
    execute format('alter table public.picks drop constraint %I', c.conname);
  end loop;

  alter table public.picks
    add constraint picks_tier_check
    check (tier in ('tier1', 'tier2', 'tier3', 'coverage', 'tracking'));
end $$;

-- Verification: expect one row, listing all five tiers.
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'picks' and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%tier%';

-- Optional: seed an NFL tuning config row so the model reads its config
-- from the database instead of the in-code default. Without it the
-- builder falls back to NFL_DEFAULT_CONFIG, which is the same content.
-- (Left as a comment on purpose: column names for the config table differ
-- between the v2 migration and the persistence deploy script, so copy the
-- shape of an existing 'nba' row rather than trusting this file.)
