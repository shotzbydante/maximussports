# MLB Picks v2 — Runtime Validation

**Status:** The persistence schema is NOT yet deployed to production. This document describes the exact checks to run after the operator executes `docs/mlb-picks-persistence-deploy.sql` in Supabase, and what genuine confirmation looks like.

I cannot hit the production database from the repo; this is the checklist for the operator and for future sessions inheriting this work.

---

## What was broken

1. **Persistence tables did not exist.** Direct `information_schema.tables` query returned no rows. The migration SQL had been written but never executed in the SQL Editor.
2. **Health endpoint was unreliable.** It relied on PostgREST error codes to infer "table missing" and could return `ok: true` in several failure modes (schema-cache desync, schema-path mismatch, error-code false negatives, stale deploy). It had no database-side oracle.
3. **Silent failures throughout.** `picksHistory.js` swallowed write errors. No loud signal when persistence was off.

## What was fixed

| Layer | Change |
|---|---|
| Migration | Wrapped in `begin/commit`, added named unique constraints, added `public.picks_persistence_inventory()` RPC, added `notify pgrst, 'reload schema'` outside the transaction, added an inline post-commit verification SELECT. |
| Deploy SQL | Copy-paste-ready with unambiguous operator banner. Final SELECT returns `tables_created=7, rpc_created=true, active_mlb_config_present=true` on success. |
| Runbook | Explicit step: "open this `.sql` file, select all, copy, paste into Supabase SQL Editor." Expected outputs at each step. |
| Verification SQL | Sections 1–7 now validate tables + constraints + RLS + seed + RPC. |
| Health endpoint | Rebuilt to call the authoritative RPC first; falls back to advisory probe only if RPC is missing. Cross-checks RPC vs. probe to detect cache desync. Distinguishes seven distinct `rootCause` values. `ok:true` now *requires* `source:'rpc'`. |
| Persistence client | Loud one-time logs on missing tables, structured return objects, zero-row detection. |
| Cron jobs | Fail loud when no source run found or when write returns null. |

---

## How to verify first writes after deploy

### Stage A — Schema exists (immediate, in SQL Editor)

Ground truth — run as a new query in SQL Editor:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'picks_runs','picks','pick_results','picks_daily_scorecards',
    'picks_config','picks_tuning_log','picks_audit_artifacts'
  )
order by table_name;
```

Expected: **7 rows**, one per required table. Any fewer and the migration did not complete.

Also:
```sql
select public.picks_persistence_inventory();
```

Expected: JSON containing `tables_in_public` array of 7 entries, `active_config` object with `version` and `sport='mlb'`, `rows` object, `latest` object.

### Stage B — Runtime agrees (from Vercel deployment)

```
curl -s https://<host>/api/health/picks-persistence | jq .
```

Expected response fields:
```json
{
  "ok": true,
  "rootCause": "none",
  "source": "rpc",
  "schema": {
    "picks_runs": { "state": "present", "rows": 0 },
    ...all 7 with state:"present"
  },
  "activeConfig": { "version": "mlb-picks-tuning-2026-04-17a", "sport": "mlb" },
  "missing": [],
  "probeCrosscheck": { "disagreements": [] }
}
```

**Critical:** `source` must be `rpc`. If it says `probe`, the RPC isn't visible to the runtime yet (either migration incomplete or PostgREST cache stale).

### Stage C — `/api/mlb/picks/built` writes rows

```
curl -s https://<host>/api/mlb/picks/built > /dev/null
sleep 5
curl -s "https://<host>/api/health/picks-persistence" | jq .schema.picks_runs
```

Expected: `{ state: "present", rows: ≥1 }`.

In Vercel logs for the `/api/mlb/picks/built` function:
```
[picksHistory] persisted run=<uuid> picks=<n>
```

If you see:
```
[picksHistory] ❌ persistence table "..." does NOT exist
```
then the runtime is pointed at a different Supabase project than the migration was applied to, or the PostgREST cache hasn't refreshed (wait 60s and re-hit).

### Stage D — Settlement + scorecard (next morning ET, or manual)

Manual trigger today (adjust date):
```
curl -s "https://<host>/api/cron/mlb/settle-yesterday?date=YYYY-MM-DD" | jq .
curl -s "https://<host>/api/cron/mlb/build-scorecard?date=YYYY-MM-DD" | jq .
curl -s "https://<host>/api/cron/mlb/run-audit?date=YYYY-MM-DD" | jq .
```

Each should return `{ ok: true, ... }`.

Then:
```
curl -s "https://<host>/api/health/picks-persistence" | jq '.schema | with_entries(.value |= .rows)'
```

Expected: `pick_results`, `picks_daily_scorecards`, `picks_audit_artifacts` row counts all ≥ 1.

And `/mlb/insights` in a browser renders the Yesterday's Scorecard strip with a real record.

### Stage E — 24-hour compounding check

A day later:
```sql
select slate_date, count(*)
from public.picks_runs
where sport = 'mlb'
  and slate_date >= current_date - interval '3 days'
group by slate_date
order by slate_date desc;

select slate_date, record, top_play_result, note
from public.picks_daily_scorecards
where sport = 'mlb'
order by slate_date desc
limit 5;
```

`picks_runs` should have at least one row per active slate date. `picks_daily_scorecards` should have a fresh row per day.

---

## Is persistence genuinely confirmed?

**Not yet** — I can't run Supabase from the repo. Persistence is confirmed when **all of the following** are observed simultaneously:

1. `information_schema.tables` query returns 7 rows in `public`.
2. `select public.picks_persistence_inventory();` returns a JSON with `tables_in_public` containing all 7 names.
3. `/api/health/picks-persistence` returns `ok:true`, `source:"rpc"`, `rootCause:"none"`.
4. `/api/mlb/picks/built` triggers a write → `picks_runs.rows` grows by at least 1 within 10 s.
5. The next daily cron cycle produces rows in `pick_results`, `picks_daily_scorecards`, `picks_audit_artifacts`.

Until check 3 is green in production, nothing downstream is trustworthy.

---

## Exact next steps for the operator

1. Open `docs/mlb-picks-persistence-deploy.sql`. Select all, copy.
2. Open Supabase dashboard → SQL Editor → New Query. Paste. Run.
3. Confirm final row shows `tables_created = 7`, `rpc_created = true`, `active_mlb_config_present = true`.
4. Hit `GET https://<host>/api/health/picks-persistence`. Confirm `ok:true`, `source:"rpc"`.
5. Hit `GET https://<host>/api/mlb/picks/built`. Wait 5 s. Re-check health; `picks_runs.rows` should be ≥1.
6. Report the outputs of steps 3–5 to confirm we can proceed to product work.

If any step returns an unexpected value, stop and consult the runbook's Troubleshooting table.
