# MLB Picks v2 — Persistence Layer Root-Cause Analysis

**Status:** Open. The v2 persistence tables do NOT exist in the production Supabase database. Writes are silently failing. Nothing is being logged.

**Affected:** All v2 functionality that depends on persistence — pick history, settlement, scorecard, audit artifacts, tuning log, config store.

---

## 1. What happened

The commit that shipped v2 (`fb2d7a2 → 972360d`) added:

- The JS engine and tuning layer (`src/features/.../v2/**`, `src/features/picks/tuning/**`)
- Endpoints (`api/mlb/picks/built.js` modifications, `api/mlb/picks/scorecard.js`, `api/cron/mlb/**`, `api/admin/picks/**`)
- The `api/_lib/picksHistory.js` client that reads/writes to the tables
- The SQL migration file at `docs/mlb-picks-v2-migration.sql`

It did **not** ship any automation that actually creates the tables. Verified in Supabase: none of the v2 tables exist (`picks_runs`, `picks`, `pick_results`, `picks_daily_scorecards`, `picks_config`, `picks_tuning_log`, `picks_audit_artifacts`).

The code runs; writes silently fail; the system is stateless in production.

---

## 2. Why this happened — exact cause

This repository **has no migration automation**. Every prior SQL file under `docs/` is applied by hand in the Supabase SQL Editor:

| File | Applied how |
|---|---|
| `docs/email-job-runs-migration.sql` | header: *"Run this migration once in the Supabase SQL editor"* |
| `docs/notifications-migration.sql` | header: *"Apply via: Supabase Dashboard → SQL Editor → paste + run"* |
| `docs/subscription-migration.sql` | header: *"Apply via: Supabase Dashboard → SQL Editor → paste + run"* |
| `docs/supabase-rls.sql` | header: *"Apply via: Supabase Dashboard → SQL Editor → paste + run / Or via Supabase CLI: supabase db push"* |
| `docs/social-posts-migration.sql` | header: *"Run once in the Supabase SQL editor"* |

There is **no `supabase/migrations/` directory**, **no CI step**, **no `npm run migrate` script**, **no CLI wiring**. `package.json` only has `dev/build/test/lint/preview/fetch-logos`. Migrations are a purely manual dashboard step.

The v2 migration I added (`docs/mlb-picks-v2-migration.sql`) does **not** carry the "Run this in SQL editor" convention other files have. Its header only says:

```
-- MLB Picks v2 — persistent history, settlement, scorecard, audit, tuning
-- Applies to Supabase/Postgres. sport-scoped for future NBA reuse.
```

The implementation plan (`docs/mlb-picks-v2-implementation-plan.md`) lists "PR 1 — Schema & migrations" with "Adds: docs/mlb-picks-v2-migration.sql" but has no operator step saying "paste into Supabase SQL editor before deploying code."

The result: the file became a **docs artifact, not an operational task**, and was skipped during deploy.

### Contributing factors

1. **No ordering guard.** Nothing in the JS code or the CI pipeline checks whether the tables exist before accepting traffic. Nothing aborts, nothing alerts.
2. **Silent failure in `picksHistory.js`.** Every function catches errors, `console.warn`s, and returns `null`/`false`. The hot path keeps working. No operator signal anywhere.
3. **No startup health check.** No `/health/picks-persistence` endpoint. No way for a monitor to notice that the tables are missing.
4. **No "first write failed" alarm.** The first cron run — which would have found the tables missing — logged a warning to Vercel logs and returned `{ok:false}` silently. If nobody read the logs, nobody noticed.
5. **Runbook gap.** No step-by-step deployment instructions for picks v2. The expectation of "paste the SQL into Supabase" was in the architecture doc as a bullet point, not in an operator checklist.

---

## 3. Why the SQL itself would have worked (it's not a file bug)

I inspected `docs/mlb-picks-v2-migration.sql` in detail. It is **valid** and **idempotent** as written:

- `create extension if not exists pgcrypto;`
- `create table if not exists` for every table
- `create index if not exists` for every index
- Partial unique index on `picks_config (sport) where is_active` (Postgres-valid)
- `alter table … enable row level security;` before policies
- `drop policy if exists … create policy` pattern (idempotent on re-run)
- `insert ... on conflict (version) do nothing` for the seed config

There are no syntax errors, no out-of-order references, no circular FKs. Running it in the Supabase SQL Editor against the production project would succeed.

The file's problem is **not correctness** — it's that **it was never executed**.

Two minor improvements I will make anyway (in Phase 1) for operator-friendliness, not because they fix a bug:

1. Wrap the whole thing in an explicit `BEGIN; … COMMIT;` so either the whole migration lands or none of it does.
2. Name the `unique (sport, slate_date)` constraints explicitly so Supabase's PostgREST `.upsert(..., { onConflict: 'sport,slate_date' })` has a named constraint to target (the unnamed inline constraint works today because Postgres auto-generates a name, but named is safer across Supabase versions).
3. Attach a big operator header that other migrations in this repo carry.

---

## 4. Correct deployment flow (how it should work from here forward)

For every future migration in this repo:

1. Author SQL under `docs/*.sql` using the repo's canonical header convention:
   ```
   -- <subject> — Supabase migration
   -- Apply via: Supabase Dashboard → SQL Editor → paste + run
   ```
2. In the same PR:
   - Add the new migration to the deployment checklist in the PR description.
   - Add a verification SQL file (or a section in the main file) that confirms the expected tables/indexes/rows exist.
   - Add a startup or first-use health check in code that logs a visible error when the tables are missing.
3. Before merging code that depends on the migration:
   - Paste the SQL into Supabase Production SQL Editor.
   - Run the verification SQL. Confirm.
   - Then deploy code.
4. After deploy, hit the health endpoint and confirm it's green.

For the current hole, the plan is:

1. Produce a clean, transactional, copy-paste deploy SQL (`docs/mlb-picks-persistence-deploy.sql`).
2. Produce a verification SQL (`docs/mlb-picks-persistence-verification.sql`).
3. Add a runtime health endpoint (`/api/health/picks-persistence`).
4. Loud-log persistence failures in `picksHistory.js` and the cron jobs so the next silent failure becomes a loud one.
5. Produce a runbook (`docs/mlb-picks-persistence-runbook.md`) the operator runs once.
6. Ship it. Next steps on the product are gated on the green health check.

---

## 5. What "fixed" means

Fixed = all of the following are true at the same time:

- [ ] Every v2 table exists in `public` in the production Supabase project.
- [ ] Exactly one row in `picks_config` where `sport='mlb' AND is_active=true`.
- [ ] Verification SQL returns the expected table count and row count.
- [ ] `/api/health/picks-persistence` returns `{ ok: true, tables: [...], missing: [] }`.
- [ ] After the next scheduled `/api/mlb/picks/built` cycle, `picks_runs` has ≥1 new row and `picks` has ≥N new rows.
- [ ] After the next settle/scorecard/audit cycles, `pick_results`, `picks_daily_scorecards`, and `picks_audit_artifacts` have fresh rows.
- [ ] Runtime logs show no `picksHistory` warnings.

Anything short of that is not fixed.

---

*End of root-cause analysis.*
