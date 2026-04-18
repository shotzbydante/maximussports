# MLB Picks v2 — Persistence Deploy Runbook

**Purpose:** Bring the MLB Picks v2 persistence layer fully online in production Supabase and confirm every stage of the pipeline is writing real data.

**Duration:** ~10 minutes end-to-end. Settlement/audit verification requires waiting for the next cron cycle (next morning ET).

**You will need:** Production Supabase project access, Vercel deployment of this repo with `SUPABASE_SERVICE_ROLE_KEY` set, and an admin API key (`ADMIN_API_KEY`) if you plan to test the tuning endpoints.

---

## Step 1 — Create the tables (one-time)

1. Open Supabase Dashboard → your **production** project → SQL Editor.
2. **Double-check the project name in the top bar.** Do not run this against staging or another tenant.
3. Open the file `docs/mlb-picks-persistence-deploy.sql` in this repo.
4. Copy its entire contents into a new SQL Editor tab.
5. Click **Run**.

Expected: the query completes without errors. The SQL is wrapped in a transaction — either everything lands or nothing does.

---

## Step 2 — Verify schema & seed config

1. Open `docs/mlb-picks-persistence-verification.sql`.
2. Paste into a fresh SQL Editor tab, click **Run**.

Expected output:

- `tables_present = 7`
- `indexes_present ≥ 10`
- `constraints_present ≥ 4` (the named unique constraints we added)
- A row in `picks_config` with `sport='mlb'`, `is_active=true`, `version='mlb-picks-tuning-2026-04-17a'`.
- Row counts for data tables all `0` at this point.

If `tables_present < 7`, **stop**. The migration did not complete. Re-run step 1 and investigate — look for an error in the first SQL Editor tab's output pane.

---

## Step 3 — Confirm the runtime can see the tables

After the migration lands:

```
GET https://<your-vercel-host>/api/health/picks-persistence
```

Expected response:

```json
{
  "ok": true,
  "sport": "mlb",
  "tables": {
    "picks_runs": { "ok": true, "count": 0 },
    "picks": { "ok": true, "count": 0 },
    "pick_results": { "ok": true, "count": 0 },
    "picks_daily_scorecards": { "ok": true, "count": 0 },
    "picks_config": { "ok": true, "count": 1 },
    "picks_tuning_log": { "ok": true, "count": 0 },
    "picks_audit_artifacts": { "ok": true, "count": 0 }
  },
  "activeConfig": {
    "version": "mlb-picks-tuning-2026-04-17a",
    "sport": "mlb"
  },
  "missing": [],
  "warnings": []
}
```

If any table shows `ok: false`, the runtime cannot read it — most likely because the Supabase URL/key envs aren't set on the deployment, or RLS is blocking. Fix and re-run.

If `missing` is non-empty, step 1 didn't land those tables. Re-deploy.

---

## Step 4 — Trigger a picks build and confirm writes

Warm the endpoint:

```
GET https://<your-vercel-host>/api/mlb/picks/built
```

Wait ~5 seconds (the DB write is non-blocking), then back in Supabase SQL Editor:

```sql
select count(*) as runs, max(generated_at) as newest
from public.picks_runs where sport = 'mlb';

select count(*) as picks, max(created_at) as newest
from public.picks where sport = 'mlb';
```

Expected: `runs ≥ 1`, `picks ≥ 0` (0 is legitimate when no games qualify). `newest` is within the last minute.

Also check Vercel logs for `/api/mlb/picks/built`. You should see lines like:

```
[mlb/picks/built] V2 tiers: t1=… t2=… t3=… qualified=… published=…
[picksHistory] persisted run=<uuid> picks=<n>
```

If you see a `[picksHistory] persist failed:` warning, the writes aren't happening — capture the error and address.

---

## Step 5 — Wait for the settlement cycle (next morning ET)

The three crons run daily in sequence:

| UTC time | Endpoint | What it writes |
|---|---|---|
| 07:30 | `/api/cron/mlb/settle-yesterday` | `pick_results` |
| 07:45 | `/api/cron/mlb/build-scorecard` | `picks_daily_scorecards` |
| 08:00 | `/api/cron/mlb/run-audit` | `picks_audit_artifacts` (and optionally a shadow `picks_config`) |

If you want to exercise them ad hoc today, you can hit each endpoint directly (they accept GET):

```
GET /api/cron/mlb/settle-yesterday?date=YYYY-MM-DD
GET /api/cron/mlb/build-scorecard?date=YYYY-MM-DD
GET /api/cron/mlb/run-audit?date=YYYY-MM-DD
```

Each returns JSON describing what it did. Look for:

- `settle-yesterday`: `{ ok: true, graded: <n> }`
- `build-scorecard`: `{ ok: true, scorecard: { ... } }`
- `run-audit`: `{ ok: true, sampleSize: <n>, proposed: true|false }`

Then verify in SQL Editor:

```sql
select status, count(*) from public.pick_results group by status;
select * from public.picks_daily_scorecards order by slate_date desc limit 3;
select * from public.picks_audit_artifacts order by slate_date desc limit 3;
```

---

## Step 6 — Verify the in-product scorecard

After step 5 has produced at least one scorecard row:

```
GET https://<your-vercel-host>/api/mlb/picks/scorecard
```

Should return the latest row. Then load `/mlb/insights` in a browser — the Yesterday's Scorecard strip should render above the Top Play hero.

---

## Step 7 — Confirm the loop (next day)

24 hours after step 1, verify the compounding effect:

```sql
select slate_date, count(*)
from public.picks_runs
where sport = 'mlb' and slate_date >= current_date - interval '3 days'
group by slate_date
order by slate_date desc;
```

You should see at least one row per active slate day.

```sql
select slate_date, record
from public.picks_daily_scorecards
where sport = 'mlb'
order by slate_date desc
limit 5;
```

You should see a growing history with real `won/lost/push/pending` counts as games settle.

---

## Troubleshooting

| Symptom | Probable cause | Fix |
|---|---|---|
| Step 1 errors out | Wrong Supabase project, permission issue, or pre-existing type mismatch | Confirm project; re-run; check error line and fix |
| `/health/picks-persistence` returns `ok: false` | Service-role env missing in Vercel | Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel project env |
| All tables exist but `picks_runs` stays 0 | Vercel deployment is older than this commit | Redeploy |
| `pick_results` stays 0 after settlement cron | ESPN finals didn't match pick's `game_id` | Check a sample `gameId` in `picks` vs ESPN's scoreboard date-formatted URL |
| `picks_daily_scorecards` stays 0 | `build-scorecard` ran before `settle-yesterday` | Re-run `build-scorecard` manually |
| `picks_audit_artifacts` stays 0 | `run-audit` ran before picks were persisted | Re-run `run-audit` manually |

---

## Rollback

If you need to completely remove the v2 schema (destructive):

```sql
-- IRREVERSIBLE — wipes all pick history.
drop table if exists public.picks_audit_artifacts cascade;
drop table if exists public.picks_tuning_log cascade;
drop table if exists public.picks_config cascade;
drop table if exists public.picks_daily_scorecards cascade;
drop table if exists public.pick_results cascade;
drop table if exists public.picks cascade;
drop table if exists public.picks_runs cascade;
```

Prefer toggling the `PICKS_V2=0` Vercel env flag instead — it falls back to the legacy engine without touching data.

---

## Ownership

After successful deploy, update this section with who ran it and when:

- Deployed by: ______________
- Deployed at: ______________
- Supabase project: ______________

*End of runbook.*
