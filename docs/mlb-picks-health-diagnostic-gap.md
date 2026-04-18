# MLB Picks — Health Endpoint Diagnostic Gap

**Status:** The `/api/health/picks-persistence` endpoint as shipped in `bc1367b` is **not a reliable source of truth** about whether the tables exist in production Supabase. This must be fixed before any deployment decision is taken based on its output.

**Confirmed by:** A direct `information_schema.tables` query in Supabase SQL Editor returning zero rows, while the endpoint could report `ok: true, missing: []`.

---

## 1. What the endpoint actually checks

The endpoint's existence check (`api/health/picks-persistence.js:62-85`) is:

```js
const { count, error } = await admin
  .from(table)
  .select('*', { count: 'exact', head: true });
if (error) {
  const isMissing =
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message || '') ||
    /Could not find the table/i.test(error.message || '');
  // ...
} else {
  results[table] = { ok: true, count: count ?? 0 };
}
```

In other words: "if PostgREST returns any error that matches one of these patterns, mark missing. Otherwise mark `ok: true`."

This conflates **three distinct failure modes into a single optimistic default**:
1. Table exists and is empty → returns `{ count: 0, error: null }` → marked `ok: true`. ✅ correct.
2. Table does not exist → *usually* returns PGRST205/42P01 → marked `missing`. ✅ correct *when the error arrives*.
3. **Any other response path that returns `{ error: null }` without a real table** → marked `ok: true`. ❌ incorrect.

Path #3 is the bug.

## 2. Why path #3 can silently return `ok: true`

There are several real paths in the supabase-js + PostgREST stack that produce `{ data: null, count: 0, error: null }` or similar non-error responses without a table actually existing in `public`:

### 2a. PostgREST schema-cache desync

PostgREST caches the introspection of the database schema in memory. If a table was created then dropped (or a migration was applied in one project but the PostgREST instance still holds the earlier cache), a client `select … head:true` against that table can return a success shape while `information_schema.tables` says the table is gone.

### 2b. Search-path / schema mismatch

`supabase-js` allows `admin.from('picks_runs')` without an explicit schema. If the database has a `picks_runs` in some schema other than `public` — for example in a dev schema, a backup, a non-prod tenant, or an internal schema PostgREST is configured to expose — the client succeeds, but operators (who correctly check `public`) see nothing.

### 2c. Role / RLS short-circuit on `HEAD … count: exact`

With `head: true` the client doesn't request rows; it requests a `Prefer: count=exact` header. Some PostgREST versions return a success row with `null` count when the response is filtered away by RLS or role before the count aggregator runs. Under RLS read-open policies (as we defined), this shouldn't happen in production — but it's another path that dilutes the ok/missing signal.

### 2d. Stale deploy serving an older build

If the Vercel function `api/health/picks-persistence.js` hasn't been redeployed after migration changes, an older version of the handler (with different `REQUIRED_TABLES` or a different check) can return `ok: true` against a database that doesn't match. This is a deployment-state bug, but the endpoint has no way to surface "I'm stale."

### 2e. Error-code false negatives

The `isMissing` heuristic depends on specific Postgres error codes flowing through PostgREST unchanged. If PostgREST re-wraps the error in a code the heuristic doesn't recognize (e.g., `PGRST116` "no rows", or an auth error that prevents reaching the table at all), the error-is-missing branch is skipped and the *outer* `if (error)` writes `ok: false, error: "…"` to that table. But in my handler's current flow, if the error doesn't match and the outer check marks it `ok: false`, `missing` is NOT populated — the endpoint just records a warning. So the `missing: []` list lies even when individual tables are broken.

**That last point is the concrete bug class we shipped:** an error the heuristic doesn't recognize produces per-table `ok: false` but keeps `missing: []`, and callers who only look at `missing` think the schema is fine.

---

## 3. The root design flaw

The endpoint answers "does the table exist?" by **reading PostgREST errors from the application side**. That is the wrong oracle. The right oracle is:

> **What does `information_schema.tables` say, queried from within the database itself?**

Everything else is inference. When I built the endpoint I reached for the inference because a generic client cannot easily query `information_schema` through PostgREST (the schema isn't exposed by default). But "inference is harder to set up" is not a good reason to ship a health probe that can't be trusted — the fix is to **create a privileged SQL function inside the migration** that does the authoritative query, and have the endpoint call that function.

If the function itself is missing (because the migration hasn't run), the RPC fails with a distinct error code (`PGRST202` / `42883` undefined_function) that itself serves as an authoritative "migration not deployed" signal. That gives the endpoint a **hard three-state answer**:

| Endpoint observation | Meaning |
|---|---|
| RPC returns table list | Authoritative — tables listed exist in `public`; any not listed are missing. |
| RPC not found (PGRST202 / 42883) | Authoritative — the migration has **not** run; no tables exist. |
| Both the RPC and direct probe fail | Environment problem (bad envs, wrong project, auth broken). |

We can still keep the per-table direct probe as a **secondary, advisory** check to flag cache desync (primary says "exists" but probe fails, or vice versa), but the primary is the RPC.

---

## 4. Secondary issues in the current endpoint

Even before the oracle issue:

- **`ok: true` is computed as `missing.length === 0 && !!activeConfig`**. With the heuristic gap in §2e, `missing.length === 0` can be true while individual tables are `ok: false`. The endpoint can return `ok: false` on the top level but still show an empty `missing` array — contradictory.
- **"empty table" and "missing table" render the same**. `ok: true, count: 0` reads the same regardless of whether the table exists and is empty or the probe succeeded against nothing real.
- **No source-of-truth label**. Nothing tells the operator which signal is authoritative.
- **Cached for 30s**. Fine, but when the migration is first run, the first 30s of reads will show stale state. The cache header should be shorter, or the endpoint should accept `?fresh=1` to bypass cache.
- **No `information_schema` cross-check**. The endpoint never asks the database directly what tables exist in `public`.

---

## 5. How the endpoint should be changed (design for the fix)

The rewritten endpoint should:

1. **Prefer an authoritative RPC call** to a SQL function created by the migration:
   ```sql
   create or replace function public.picks_persistence_inventory()
   returns jsonb
   language plpgsql
   security definer
   set search_path = public, pg_catalog
   as $$
     select jsonb_build_object(
       'tables_in_public',
       coalesce((
         select jsonb_agg(table_name order by table_name)
         from information_schema.tables
         where table_schema = 'public'
           and table_name = any(array[
             'picks_runs','picks','pick_results','picks_daily_scorecards',
             'picks_config','picks_tuning_log','picks_audit_artifacts'
           ])
       ), '[]'::jsonb),
       'active_config',
       (select jsonb_build_object('version', version, 'sport', sport)
        from public.picks_config where sport = 'mlb' and is_active = true limit 1),
       'rows',
       jsonb_build_object(
         'picks_runs',             (select count(*) from public.picks_runs),
         'picks',                  (select count(*) from public.picks),
         'pick_results',           (select count(*) from public.pick_results),
         'picks_daily_scorecards', (select count(*) from public.picks_daily_scorecards),
         'picks_config',           (select count(*) from public.picks_config),
         'picks_tuning_log',       (select count(*) from public.picks_tuning_log),
         'picks_audit_artifacts',  (select count(*) from public.picks_audit_artifacts)
       )
     )
   $$;
   grant execute on function public.picks_persistence_inventory to anon, authenticated, service_role;
   ```
2. **Emit a tri-state per table**: `present` / `missing` / `unknown`. `unknown` is used when the RPC is absent AND the direct probe didn't return an unambiguous answer.
3. **Emit an explicit `source` field** stating whether the answer came from `information_schema` (authoritative) or the direct probe (inferred).
4. **Detect desync**: when RPC and direct probe disagree, flag it as `cache_desync` — a real operator alert.
5. **Distinguish env missing / db missing / cache stale** in the top-level `ok` + a named `rootCause` enum.
6. **No caching** by default. Ground-truth probes on every call. (Operators hit this rarely; the cost is negligible.)
7. **Top-level `ok` gated strictly**: `ok === true` requires `source === 'rpc'`, all 7 tables `present`, an active config, and zero warnings.

The function is the hinge. If an operator is uncertain whether the migration ran, the endpoint can say:

```json
{
  "ok": false,
  "rootCause": "migration_not_run",
  "reason": "picks_persistence_inventory RPC is not defined — migration has not been applied to this database",
  "source": "probe",
  "tables": { ... },
  "missing": [ "all 7 tables presumed missing" ]
}
```

That's the signal the current endpoint cannot produce.

---

## 6. Summary

- The endpoint I shipped in `bc1367b` uses PostgREST error-code heuristics as its oracle for existence. That oracle is unreliable for real, documentable reasons (schema cache desync, schema mismatch, error-code false negatives, stale deploys).
- The endpoint's top-level `ok`/`missing` can disagree with per-table `ok: false`, creating a scenario where the single most important summary field lies.
- The fix is to make the database itself the oracle: a small SQL function created by the migration that reports its own inventory and that is called via RPC. If the function is missing, the migration is not run — a fact the endpoint can assert instead of guess.
- Until this fix is shipped, treat the endpoint's output as advisory only. Run the `information_schema.tables` query in SQL Editor for ground truth.

*End of diagnostic gap analysis.*
