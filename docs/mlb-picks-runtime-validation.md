# MLB Picks v2 — Runtime Validation Checklist

**Use this after** running `docs/mlb-picks-persistence-deploy.sql` to confirm the full data flow is writing real rows. Gate all product work on this being green.

> I cannot verify production Supabase state from the repo — this document gives you the exact checks to run and the exact outputs to expect.

---

## Stage A — Schema (immediate)

Run `docs/mlb-picks-persistence-verification.sql` in Supabase SQL Editor.

Expected: **every row in sections 1–6 reads `OK`**. Data-table counts may be 0.

If any row is FAIL → stop, re-deploy, re-run.

---

## Stage B — Runtime sees the schema (immediate)

```
GET https://<host>/api/health/picks-persistence
```

Expected JSON fields:

```json
{
  "ok": true,
  "missing": [],
  "warnings": [],
  "activeConfig": { "version": "mlb-picks-tuning-2026-04-17a", "sport": "mlb" },
  "tables": {
    "picks_runs":             { "ok": true, "count": 0 },
    "picks":                  { "ok": true, "count": 0 },
    "pick_results":           { "ok": true, "count": 0 },
    "picks_daily_scorecards": { "ok": true, "count": 0 },
    "picks_config":           { "ok": true, "count": 1 },
    "picks_tuning_log":       { "ok": true, "count": 0 },
    "picks_audit_artifacts":  { "ok": true, "count": 0 }
  }
}
```

Failure modes:

| `ok`=false & … | Likely cause | Fix |
|---|---|---|
| `missing` lists tables | SQL migration didn't land in this Supabase project | Re-run deploy SQL |
| `missing: []`, `activeConfig: null` | Seed config row was deleted | Re-insert the seed or keep the config in source of truth |
| Every table shows `error: "service-role client unavailable"` | Vercel envs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` not set | Set them and redeploy |

---

## Stage C — `/api/mlb/picks/built` writes rows (within 1 min)

Hit the picks endpoint to trigger a fresh build:

```
GET https://<host>/api/mlb/picks/built
```

The HTTP response returns immediately (the DB write is async). **Wait ~5 seconds, then:**

1. **Check Vercel logs for the function.** Look for exactly one of:
   ```
   [picksHistory] persisted run=<uuid> picks=<n>
   ```
   If you see:
   ```
   [picksHistory] ❌ persistence table "<name>" does NOT exist
   ```
   the migration didn't land — stop and re-run the deploy SQL.

2. **Query Supabase:**
   ```sql
   select id, slate_date, model_version, config_version, generated_at
   from public.picks_runs
   where sport = 'mlb'
   order by generated_at desc
   limit 1;

   select count(*) as rows, array_agg(distinct tier) as tiers
   from public.picks
   where run_id = (select id from public.picks_runs where sport='mlb' order by generated_at desc limit 1);
   ```
   Expected:
   - One row for the latest run with a timestamp within the last 60s.
   - `picks.count` equals the published pick count from the build logs.
   - `tiers` is a subset of `{tier1, tier2, tier3}`.

3. **Re-check the health endpoint:** `picks_runs.count ≥ 1`, `picks.count ≥ 0`.

Zero-picks day (`picks.count = 0`) is legitimate — the model can be selective. As long as `picks_runs.count` is growing daily, the persistence loop is alive.

---

## Stage D — Settlement + scorecard (next morning ET, or manual)

Either wait for the 7:30 / 7:45 UTC crons to fire, or trigger them manually:

```
GET /api/cron/mlb/settle-yesterday?date=YYYY-MM-DD
GET /api/cron/mlb/build-scorecard?date=YYYY-MM-DD
```

`YYYY-MM-DD` is yesterday's slate date (ET).

Expected response from settle:
```json
{ "ok": true, "slateDate": "...", "totalPicks": N, "graded": M, "finalsSeen": F }
```

Expected response from scorecard:
```json
{ "ok": true, "slateDate": "...", "scorecard": { "record": { "won": …, "lost": …, "push": …, "pending": … }, ... } }
```

Then verify:

```sql
select status, count(*) from public.pick_results group by status;
select * from public.picks_daily_scorecards
where sport='mlb'
order by slate_date desc limit 3;
```

And the UI endpoint:

```
GET https://<host>/api/mlb/picks/scorecard
```

Should return the most recent row.

Failure modes:

| Symptom | Cause | Fix |
|---|---|---|
| `graded = 0` when games finished | ESPN `gameId` doesn't match the stored one | Inspect one pick: `select game_id, away_team_slug, home_team_slug from public.picks where run_id=… limit 3` and compare with `fetchYesterdayFinals()` shape |
| Settle returns `ok: false` with "no picks_run for date" | Stage C didn't run on that date | Expected if this is the first slate — no fix, wait for real data |
| Scorecard row missing after successful cron | Upsert error | Check Vercel logs for `scorecard upsert returned null` |

---

## Stage E — Audit pipeline (next morning ET, or manual)

```
GET /api/cron/mlb/run-audit?date=YYYY-MM-DD
```

Expected:
```json
{ "ok": true, "slateDate": "...", "sampleSize": N, "proposed": false, "shadowVersion": null, ... }
```

`proposed: true` only happens when the analyzer's rules fire. In the first week, expect `false`.

Verify:

```sql
select slate_date, (summary->>'sampleSize')::int as sample, created_at
from public.picks_audit_artifacts
where sport='mlb'
order by slate_date desc limit 3;

select status, count(*)
from public.picks_tuning_log
where sport='mlb'
group by status;
```

Expected: a fresh audit row per day, tuning log grows only when the analyzer proposes deltas.

---

## Stage F — UI shows the scorecard

Load `https://<host>/mlb/insights`. The **Yesterday's Scorecard** strip renders above the Top Play hero with the record from the most recent `picks_daily_scorecards` row. If the strip is absent, the `/api/mlb/picks/scorecard` endpoint returned no row — check Stage D.

---

## 24-hour compounding check

Run this 24 hours after deploy:

```sql
select slate_date, count(*) as runs
from public.picks_runs
where sport='mlb' and slate_date >= current_date - interval '3 days'
group by slate_date
order by slate_date desc;

select slate_date, record, top_play_result, note
from public.picks_daily_scorecards
where sport='mlb'
order by slate_date desc
limit 5;

select slate_date, (summary->>'sampleSize')::int as sample, (recommended_deltas->'rationale') as proposals
from public.picks_audit_artifacts
where sport='mlb'
order by slate_date desc
limit 5;
```

You should see:
- `picks_runs` growing by at least 1 row per day (often more — the endpoint re-persists on cold starts).
- `picks_daily_scorecards` with a new row per day as games settle.
- `picks_audit_artifacts` with a new row per day.

If any of these stops growing, the pipeline has broken — use the health endpoint and the Vercel logs to localize the break.

---

## Completion criteria

Persistence is ✅ **working in production** when all of the following are true on the same day:

- `/api/health/picks-persistence` returns `ok: true` with `missing: []` and a non-null `activeConfig`.
- `picks_runs` has at least 1 row with `generated_at > now() - 1 hour`.
- After the next settlement cycle, `pick_results` contains rows for the most recent `run_id`.
- `picks_daily_scorecards` has a row for yesterday.
- `picks_audit_artifacts` has a row for yesterday.
- The app's `/mlb/insights` page renders a Yesterday's Scorecard strip with a real record.

Only after these are green is it safe to proceed to product improvements (Phase 6+ of the original brief).

*End of runtime validation.*
