# MLB Picks v2 — Implementation Plan

**Status:** Plan, not yet executed.
**Pairs with:** [`mlb-picks-audit-v1.md`](./mlb-picks-audit-v1.md), [`mlb-picks-v2-architecture.md`](./mlb-picks-v2-architecture.md)

This plan turns the architecture into ordered, reviewable PRs. Each PR is scoped so it can ship independently and be reverted independently.

---

## PR order & dependencies

```
PR 1  ─ Migration + baseline schema
PR 2  ─ Canonical payload v2 (additive; keeps legacy) + model_version/config_version stamps
PR 3  ─ Bet Score engine + tiering
PR 4  ─ Persist-on-publish (picks_runs, picks) — best-effort writes
PR 5  ─ Settlement cron (picks → pick_results)
PR 6  ─ Scorecard build cron + /api/mlb/picks/scorecard
PR 7  ─ Daily audit cron + picks_audit_artifacts
PR 8  ─ Safe tuning validator + picks_config + shadow-mode builder
PR 9  ─ UI redesign (Top Play + tier hierarchy + scorecard module)
PR 10 ─ Email & IG caption consumers migrated to v2 canonical
PR 11 ─ Backtest rewrite (MLB, not basketball) + admin endpoints
PR 12 ─ Remove legacy.categories after all consumers migrated
```

---

## PR 1 — Schema & migrations

**Adds:** `docs/mlb-picks-v2-migration.sql`

Creates all tables from the architecture doc:
- `picks_runs`
- `picks`
- `pick_results`
- `picks_daily_scorecards`
- `picks_tuning_log`
- `picks_config`
- `picks_audit_artifacts`

Also seeds the initial active config row:
```sql
insert into public.picks_config (version, sport, is_active, config)
values (
  'mlb-picks-tuning-2026-04-17a',
  'mlb',
  true,
  '{ "weights": {"edge":0.40,"conf":0.25,"sit":0.20,"mkt":0.15}, ... }'::jsonb
);
```

RLS: read open on `picks_runs`, `picks`, `pick_results`, `picks_daily_scorecards`. Writes service-role only.

**Tests:** round-trip insert/select via `api/_lib/supabaseAdmin.js` in a smoke test.

---

## PR 2 — Canonical payload v2

**Files:**
- New: `src/features/mlb/picks/v2/canonicalPayload.js`
- Modify: `api/mlb/picks/built.js` — emit `{ sport, date, modelVersion, configVersion, tiers, topPick, scorecardSummary, meta, legacy }`.
- Legacy compat: `legacy.categories` is the existing `{ pickEms, ats, leans, totals }` shape — populated by filtering the new picks by `market.type`.

**Principle:** additive. Existing consumers break only if they stop finding `categories`. They won't — `legacy.categories` is populated identically.

**Tests:**
- Snapshot test of the full canonical payload shape against a fixture.
- Contract test: feed legacy consumers (`mlbPicks.js`, `globalBriefing.js`, `buildMlbCaption.js`) the new payload → assert they still render.

---

## PR 3 — Bet Score engine + tiering

**Files:**
- New: `src/features/mlb/picks/v2/components/edgeStrength.js`
- New: `src/features/mlb/picks/v2/components/modelConfidence.js`
- New: `src/features/mlb/picks/v2/components/situationalEdge.js`
- New: `src/features/mlb/picks/v2/components/marketQuality.js`
- New: `src/features/mlb/picks/v2/betScore.js`
- New: `src/features/mlb/picks/v2/tier.js`
- New: `src/features/mlb/picks/v2/buildMlbPicksV2.js` — orchestrator; reuses existing `normalizeMlbMatchup` + `scoreMlbMatchup` to feed components.
- Modify: `api/mlb/picks/built.js` — call `buildMlbPicksV2` behind env `PICKS_V2=1`.

**Situational edge (launch scope):** since park factors / weather / pitcher lineups aren't present:
- `sRot` = rotation quality delta from `seasonModelInputs` (already available)
- `sPen` = bullpen quality delta from `seasonModelInputs` (already available)
- `sHA`  = 0.05 boost for home team (constant)
- `sForm` = `(current W% − projected W%)` — recent form vs baseline
- Extension points wired but null-safe for `sPark`, `sWeather`, `sPitcher`.

**Market quality (launch scope):**
- `mCons` from `model.confidence` (book-count proxy already emitted by `_odds.js`)
- Others null-safe until line-movement storage exists.

**Tests:** each component + `betScore` (bounds, weights, zero-out on missing inputs), `tier` (percentile, floor, max-per-tier, max-per-game, tier1-per-game).

---

## PR 4 — Persist on publish

**Files:**
- New: `api/_lib/picksHistory.js` — `writePicksRun(payload)`, `writePicks(runId, picks)`.
- Modify: `api/mlb/picks/built.js` — after building, `Promise.resolve().then(() => writePicksRun(...))`. Non-blocking; errors logged.

Pick key construction is deterministic so duplicate writes dedupe on `(run_id, pick_key)`.

**Tests:**
- History writer with a mock Supabase client.
- Failure-is-silent test: writer error does not affect HTTP response.

---

## PR 5 — Settlement cron

**Files:**
- New: `api/cron/mlb/settle-yesterday.js`
- New: `src/features/mlb/picks/v2/settle.js` — `settlePick(pick, finalGame)` returns `{ status, notes }`.
- Modify: `vercel.json` — add `{"path":"/api/cron/mlb/settle-yesterday","schedule":"30 7 * * *"}` (3:30 AM ET).

Uses existing `fetchYesterdayFinals()` from `api/mlb/live/_normalize.js`.

**Tests:** settlement table per market type × outcome class (won/lost/push/voided/postponed/future); idempotency test.

---

## PR 6 — Scorecard cron + endpoint

**Files:**
- New: `api/cron/mlb/build-scorecard.js` — reads settled picks + results, upserts `picks_daily_scorecards`.
- New: `api/mlb/picks/scorecard.js` — `GET ?date=YYYY-MM-DD` (default yesterday ET).
- New: `src/features/mlb/picks/v2/buildScorecard.js` — pure function; reusable by cron + ad-hoc.
- Modify: `vercel.json` — `{"path":"/api/cron/mlb/build-scorecard","schedule":"45 7 * * *"}`.

**Tests:** builder with fixtures covering: full slate, no-picks day, postponed-only day, all-pushes day.

---

## PR 7 — Audit pipeline

**Files:**
- New: `api/cron/mlb/run-audit.js`
- New: `src/features/mlb/picks/v2/audit.js` — pure analyzer; emits the artifact shape from §7 of architecture.
- New: `src/features/mlb/picks/v2/proposer.js` — rules-based delta proposer.
- Modify: `vercel.json` — `{"path":"/api/cron/mlb/run-audit","schedule":"0 8 * * *"}`.

**Tests:** analyzer on fixture of 30 days of synthetic picks; proposer outputs deterministic deltas.

---

## PR 8 — Safe tuning system

**Files:**
- New: `src/features/picks/tuning/validator.js` — **sport-agnostic**. Implements every guardrail from architecture §5.2 with exported constants.
- New: `src/features/picks/tuning/applyProposal.js` — `{ status: 'shadow'|'applied'|'rejected', reason }`.
- New: `api/admin/picks/tuning/[sport].js` (list + current)
- New: `api/admin/picks/tuning/[sport]/apply.js`
- New: `api/admin/picks/tuning/[sport]/rollback.js`
- New: `src/features/picks/tuning/shadowScore.js` — when `PICKS_TUNING_SHADOW=1`, the builder also computes what a shadow config *would* have selected. Stored in `picks_runs.payload.shadow`.

**Tests:** every guardrail boundary; shadow comparator; auto-promote criteria; rollback.

---

## PR 9 — UI redesign

**Files:**
- New: `src/components/mlb/picks/YesterdayScorecard.jsx` + `.module.css`
- New: `src/components/mlb/picks/TopPlayHero.jsx` + `.module.css`
- New: `src/components/mlb/picks/TierSection.jsx` + `.module.css`
- New: `src/components/mlb/picks/PickCardV2.jsx` + `.module.css`
- New: `src/components/mlb/picks/BetScoreBar.jsx` (component composition bar)
- Modify: `src/components/mlb/MlbMaximusPicksSection.jsx` to mount the above and feature-gate on `tiers` existence.
- Data: read `tiers` + `topPick` + `scorecardSummary` from `/api/mlb/picks/built`. For the scorecard, also support `/api/mlb/picks/scorecard?date=` so the UI can refresh independently.

**Mobile-first:** stacked, large pick label, conviction pill in top-right, expandable rationale. Tier 3 collapsed by default.

**Tests:** component tests (render, conditional states: no-picks-today, no-picks-yesterday, pending settlement).

---

## PR 10 — Email & IG migration

**Files:**
- Modify: `src/emails/templates/mlbPicks.js` — hero Top Play + Tier 1/2 sections + scorecard header; remove defensive alias normalization once `legacy.categories` is still present.
- Modify: `src/emails/templates/globalBriefing.js` — use `topPick` + tier1 instead of `confidenceScore` sort.
- Modify: `src/features/mlb/contentStudio/buildMlbCaption.js` — select `topPick` + `tier1[0..1]` instead of best-ATS-then-top-2.
- Modify: `api/_lib/mlbEmailData.js` — pass canonical payload as-is; stop massaging `picksBoard`.

**Tests:** snapshot of rendered email HTML + snapshot of generated IG caption.

---

## PR 11 — Backtest rewrite + admin

**Files:**
- Rewrite: `scripts/backtestMaximusPicks.js` — targets MLB ESPN + replays `picks_runs` against finals.
- New: admin UI route (optional; endpoints already exist from PR 8).

**Tests:** run backtest against the last 30 days (after a few days of `picks_runs` have accumulated).

---

## PR 12 — Remove legacy.categories

Only after every consumer (app, emails, IG) has shipped its migration AND the canonical `tiers` has been in place for ≥ 7 days.

- Remove `legacy.categories` from `canonicalPayload.js`.
- Update snapshot tests.
- Delete any remaining defensive alias code.

---

## Rollback story per PR

| PR | Rollback |
|---|---|
| 1 | Drop tables; no consumers yet. |
| 2 | `PICKS_V2=0` env flag reverts to v1 shape. |
| 3 | Same env flag; v1 builder still compiled. |
| 4 | Disable writer flag; no data correctness impact. |
| 5 | Remove cron entry; no user-facing change until PR 6. |
| 6 | Scorecard endpoint returns 204 if no row exists. |
| 7 | Remove cron; prior audits retained. |
| 8 | `PICKS_TUNING_AUTO_APPLY=0` + `PICKS_TUNING_SHADOW=0`. |
| 9 | Feature flag `PICKS_UI_V2=0` renders v1 columns. |
| 10 | Revert commit; legacy fallback path in templates still works. |
| 11 | Script change; no prod impact. |
| 12 | Revert commit; additive field returns. |

---

## Acceptance checklist (project-level)

- [ ] Every published pick appears in `picks` within 2 s of publish.
- [ ] `/api/mlb/picks/scorecard?date=yesterday` returns real data.
- [ ] App renders Yesterday's Scorecard above Top Play.
- [ ] No pick appears in both tier1 and tier2.
- [ ] `maxTier1PerGame` is enforced.
- [ ] A manually-forced out-of-bounds tuning delta is rejected by validator tests.
- [ ] Email render pixel-diff is minimal or intentional for the new Top Play hero.
- [ ] IG caption includes a conviction score.
- [ ] Backtest runs against MLB, not basketball.
- [ ] `model_version` and `config_version` appear on every `picks` row.

---

## Non-goals (explicit)

- No scraping of weather or pitcher confirmation feeds in the first cycle.
- No ML model training in-app — the scoring is still signal-weighted, not learned.
- No auto-promotion of tuning configs by default; shadow-only until confidence is earned.
- No changes to NCAA basketball picks in this track.

---

*End of implementation plan.*
