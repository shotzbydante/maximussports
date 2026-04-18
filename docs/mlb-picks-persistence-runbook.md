# MLB Picks v2 — Persistence Deploy Runbook

The tables do not exist in production Supabase. This runbook brings them online and verifies the deployment with ground-truth checks.

**Duration:** 5–10 minutes to deploy; full validation completes after the next cron cycle.

**You will need:**
- Access to the **production** Supabase project (not staging, not dev).
- The Vercel deployment with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set.

---

## Step 1 — Copy the deploy SQL

> **Important: the file you paste must be the `.sql`. Do not paste this runbook.**

1. In this repo, open the file:
   ```
   docs/mlb-picks-persistence-deploy.sql
   ```
2. Put your cursor in that file. **Select all** (Cmd+A / Ctrl+A).
3. **Copy** (Cmd+C / Ctrl+C).

You should have copied ~250 lines of SQL. If you copied fewer, you copied the wrong file.

## Step 2 — Paste into the Supabase SQL Editor

1. Open:
   ```
   https://supabase.com/dashboard/project/<YOUR-PROJECT>/sql/new
   ```
2. **Confirm the project name** shown in the top-left bar is the production project. This is irreversible if you run it in the wrong project (well, reversible via the rollback at the end of this doc, but still).
3. Click inside the query editor and **paste** (Cmd+V / Ctrl+V).
4. Click **Run**.

## Step 3 — Read the verification row

The last statement in the SQL is a `SELECT` that runs *after* the transaction commits. You should see a single result row containing:

| column | expected value |
|---|---|
| `label` | `deploy verification` |
| `tables_created` | **7** |
| `rpc_created` | **true** |
| `active_mlb_config_present` | **true** |
| `inventory` | a JSONB object whose `tables_in_public` array lists all 7 table names |

If `tables_created` is anything less than 7, the deploy did not complete. Read the error in the editor output pane, fix, re-run. The SQL is idempotent, so a re-run is safe.

## Step 4 — Detailed verification (separate tab)

Open `docs/mlb-picks-persistence-verification.sql`, paste its full contents into a new SQL Editor tab, and **Run**.

Expected: every row in sections 1–6 ends with `status = 'OK'`. Data-table counts can be 0 at this point.

## Step 5 — Verify from the runtime

```
curl -s "https://<your-vercel-host>/api/health/picks-persistence"
```

Expected response shape:

```json
{
  "ok": true,
  "source": "rpc",
  "rootCause": "none",
  "sport": "mlb",
  "schema": {
    "picks_runs":             { "state": "present", "rows": 0 },
    "picks":                  { "state": "present", "rows": 0 },
    "pick_results":           { "state": "present", "rows": 0 },
    "picks_daily_scorecards": { "state": "present", "rows": 0 },
    "picks_config":           { "state": "present", "rows": 1 },
    "picks_tuning_log":       { "state": "present", "rows": 0 },
    "picks_audit_artifacts":  { "state": "present", "rows": 0 }
  },
  "activeConfig": {
    "version": "mlb-picks-tuning-2026-04-17a",
    "sport": "mlb"
  },
  "missing": [],
  "warnings": [],
  "probeCrosscheck": { "disagreements": [] }
}
```

The critical fields to check:

- `source: "rpc"` — means the answer came from the authoritative SQL function, not an inference.
- `rootCause: "none"` — means nothing is wrong.
- every `schema.<table>.state: "present"` — the table exists in `public` per `information_schema`.
- `missing: []`
- `probeCrosscheck.disagreements: []` — the advisory PostgREST probe agrees with the authoritative RPC.

If `source` is `probe` or `rootCause` is anything other than `none`, see the Troubleshooting section.

## Step 6 — Trigger a real picks build

```
curl -s "https://<your-vercel-host>/api/mlb/picks/built" > /dev/null
```

Wait ~5 seconds. Then either:

- Hit `/api/health/picks-persistence` again and confirm `schema.picks_runs.rows ≥ 1`, OR
- Run in SQL Editor:
  ```sql
  select count(*) from public.picks_runs where sport='mlb';
  select count(*) from public.picks      where sport='mlb';
  ```

In Vercel logs for the `/api/mlb/picks/built` function, look for:
```
[picksHistory] persisted run=<uuid> picks=<n>
```

If you see:
```
[picksHistory] ❌ persistence table "..." does NOT exist
```
the migration was applied to a different database than the one the runtime is configured for. Reconcile `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel.

## Step 7 — Wait one day, or trigger the crons manually

The three daily crons populate the remaining tables. Either wait for:

- `07:30 UTC`: `/api/cron/mlb/settle-yesterday` → `pick_results`
- `07:45 UTC`: `/api/cron/mlb/build-scorecard` → `picks_daily_scorecards`
- `08:00 UTC`: `/api/cron/mlb/run-audit` → `picks_audit_artifacts`

Or trigger them manually today:

```
curl -s "https://<host>/api/cron/mlb/settle-yesterday?date=YYYY-MM-DD"
curl -s "https://<host>/api/cron/mlb/build-scorecard?date=YYYY-MM-DD"
curl -s "https://<host>/api/cron/mlb/run-audit?date=YYYY-MM-DD"
```

Each returns JSON with `ok:true` and details. After they've all run:

```
curl -s "https://<host>/api/health/picks-persistence"
```

The latest row counts in `schema` should reflect real data.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Step 3 returns `tables_created < 7` | Paste was partial, or a syntax error in the middle | Re-select-all, re-copy, re-paste the entire `.sql` file |
| Health returns `source: "probe"` and `rootCause: "migration_not_run"` | The RPC function isn't present — migration didn't complete | Re-run the deploy SQL |
| Health returns `rootCause: "env_missing"` | Vercel missing `SUPABASE_SERVICE_ROLE_KEY` | Set env and redeploy |
| Health returns `rootCause: "wrong_project"` | Runtime is pointed at a different Supabase project | Fix `SUPABASE_URL` and redeploy |
| Health returns `rootCause: "cache_desync"` | PostgREST cache stale | Re-run the deploy SQL (it contains `notify pgrst, 'reload schema'`) or wait 5 min |
| Health returns `ok: true` but runtime logs show `table does not exist` | Mismatched envs between health endpoint and picks endpoint | Audit Vercel envs |

---

## Rollback (destructive — only if truly needed)

```sql
drop function if exists public.picks_persistence_inventory();
drop table if exists public.picks_audit_artifacts cascade;
drop table if exists public.picks_tuning_log cascade;
drop table if exists public.picks_config cascade;
drop table if exists public.picks_daily_scorecards cascade;
drop table if exists public.pick_results cascade;
drop table if exists public.picks cascade;
drop table if exists public.picks_runs cascade;
notify pgrst, 'reload schema';
```

Prefer flipping `PICKS_V2=0` in Vercel env instead — falls back to the legacy engine without touching the database.

---

## Sign-off

Fill in after deploy:

- Deployed by: ______________
- Deployed at: ______________
- Supabase project name: ______________
- Deploy verification row: `tables_created=___, rpc_created=___, active_mlb_config_present=___`
- First `picks_runs.generated_at`: ______________

*End of runbook.*
