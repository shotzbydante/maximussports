-- ═════════════════════════════════════════════════════════════════════════════
-- MLB PICKS v2 — POST-DEPLOY VERIFICATION
--
-- Paste this into Supabase SQL Editor AFTER running
-- docs/mlb-picks-persistence-deploy.sql.
--
-- Returns one row per section. Each section has a `status` column that reads
-- OK or FAIL so you can scan quickly.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Table count check ───────────────────────────────────────────────────────
select
  '1. tables'                                                     as section,
  count(*)                                                        as tables_present,
  7                                                               as tables_expected,
  case when count(*) = 7 then 'OK' else 'FAIL' end                as status,
  array_agg(table_name order by table_name)                       as found
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'picks_runs','picks','pick_results','picks_daily_scorecards',
    'picks_config','picks_tuning_log','picks_audit_artifacts'
  );

-- 2. Named unique constraints check ──────────────────────────────────────────
select
  '2. named_unique_constraints'                                   as section,
  count(*)                                                        as present,
  4                                                               as expected,
  case when count(*) >= 4 then 'OK' else 'FAIL' end               as status,
  array_agg(conname order by conname)                             as found
from pg_constraint
where conname in (
  'picks_run_pickkey_unique',
  'picks_daily_scorecards_sport_date_unique',
  'picks_audit_artifacts_sport_date_unique'
);

-- 3. Partial unique index on picks_config (sport) where is_active ────────────
select
  '3. picks_config_partial_unique'                                as section,
  count(*)                                                        as present,
  1                                                               as expected,
  case when count(*) = 1 then 'OK' else 'FAIL' end                as status
from pg_indexes
where schemaname = 'public'
  and indexname = 'picks_config_one_active_per_sport';

-- 4. Row Level Security enabled ──────────────────────────────────────────────
select
  '4. rls_enabled'                                                as section,
  count(*) filter (where relrowsecurity)                          as with_rls,
  7                                                               as expected,
  case when count(*) filter (where relrowsecurity) = 7 then 'OK' else 'FAIL' end as status
from pg_class
where relname in (
  'picks_runs','picks','pick_results','picks_daily_scorecards',
  'picks_config','picks_tuning_log','picks_audit_artifacts'
);

-- 5. Read policies present ───────────────────────────────────────────────────
select
  '5. read_policies'                                              as section,
  count(*)                                                        as present,
  7                                                               as expected,
  case when count(*) = 7 then 'OK' else 'FAIL' end                as status,
  array_agg(tablename order by tablename)                         as tables
from pg_policies
where schemaname = 'public'
  and policyname in (
    'picks_runs_read','picks_read','pick_results_read',
    'picks_daily_scorecards_read','picks_config_read',
    'picks_tuning_log_read','picks_audit_artifacts_read'
  );

-- 6. Active MLB config seed ──────────────────────────────────────────────────
select
  '6. active_mlb_config'                                          as section,
  count(*)                                                        as present,
  1                                                               as expected,
  case when count(*) = 1 then 'OK' else 'FAIL' end                as status,
  (select version from public.picks_config where sport='mlb' and is_active limit 1) as version
from public.picks_config
where sport = 'mlb' and is_active = true;

-- ═════════════════════════════════════════════════════════════════════════════
-- DATA-TABLE SNAPSHOT (for post-deploy health checks; zero rows is expected
-- the first time, but should grow after the first cron cycle)
-- ═════════════════════════════════════════════════════════════════════════════

select 'picks_runs'              as table_name, count(*) as rows, max(generated_at) as newest from public.picks_runs
union all
select 'picks',                    count(*),               max(created_at)                    from public.picks
union all
select 'pick_results',             count(*),               max(settled_at)                    from public.pick_results
union all
select 'picks_daily_scorecards',   count(*),               max(computed_at)                   from public.picks_daily_scorecards
union all
select 'picks_config',             count(*),               max(created_at)                    from public.picks_config
union all
select 'picks_tuning_log',         count(*),               max(created_at)                    from public.picks_tuning_log
union all
select 'picks_audit_artifacts',    count(*),               max(created_at)                    from public.picks_audit_artifacts;

-- ═════════════════════════════════════════════════════════════════════════════
-- RECENT ACTIVITY (safe to run any time post-deploy)
-- ═════════════════════════════════════════════════════════════════════════════

-- Most recent picks runs (last 5)
select slate_date, sport, generated_at, model_version, config_version
from public.picks_runs
order by generated_at desc
limit 5;

-- Tier distribution across latest run per sport
with latest as (
  select sport, max(generated_at) as gen from public.picks_runs group by sport
)
select p.sport, p.tier, count(*) as n
from public.picks p
join latest l on l.sport = p.sport
join public.picks_runs r on r.id = p.run_id and r.generated_at = l.gen
group by p.sport, p.tier
order by p.sport, p.tier;

-- Most recent scorecards (last 5 per sport)
select sport, slate_date, record, top_play_result, note, computed_at
from public.picks_daily_scorecards
order by slate_date desc, sport
limit 10;

-- Most recent audits (last 5)
select sport, slate_date, (summary->>'sampleSize')::int as sample_size, created_at
from public.picks_audit_artifacts
order by slate_date desc
limit 10;

-- All tuning-log activity (last 10)
select sport, slate_date, from_config_version, to_config_version, status, sample_size, created_at
from public.picks_tuning_log
order by created_at desc
limit 10;

-- ═════════════════════════════════════════════════════════════════════════════
-- PASS/FAIL SUMMARY
--   If any row in sections 1–6 reads FAIL, the migration has a gap.
--   If every row in sections 1–6 reads OK, schema is healthy.
--   Data tables at 0 is fine immediately after deploy — confirm they grow over
--   the next 24 hours.
-- ═════════════════════════════════════════════════════════════════════════════
