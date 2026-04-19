# MLB Picks — Performance & Audit UI Availability Audit (v1)

**Intent:** Before surfacing performance/audit-grade trust signals in the UI, inventory what real persisted data actually exists today and what should only ship with graceful "accumulating" fallbacks. No invented stats. No decorative numbers.

---

## 1. What the canonical payload `/api/mlb/picks/built` emits today

`payload.scorecardSummary` (populated from yesterday's `picks_daily_scorecards` row on each build, see `api/mlb/picks/built.js`):

```jsonc
{
  "date": "YYYY-MM-DD",                          // prior slate
  "overall":   { "won", "lost", "push", "pending" },
  "byMarket":  { "moneyline": {...}, "runline": {...}, "total": {...} },
  "byTier":    { "tier1": {...}, "tier2": {...}, "tier3": {...} },
  "topPlayResult": "won|lost|push|pending|null",
  "streak":    { "type", "count" },
  "note":      "Top Play hit" // editorial
}
```

What's **trustworthy now**: one-day record, by-market split, by-tier split, Top Play outcome, short streak. Everything derives from `pick_results` + `picks` in the production DB.

What's **not in the payload** (would need to be added or fetched separately):
- Trailing 3/7/30-day aggregates
- Season record
- Top Play trailing hit rate
- Audit artifacts (`picks_audit_artifacts` rows) — not exposed by any API yet
- Signal attribution, recommended tuning deltas

The `TrackRecord` component we already shipped reads `payload.trackRecord.season / trailing30d / trailing7d / topPlayWinRate30d` — **none of these are currently emitted**. The component already degrades to a "Tracking — results accumulate daily" scaffold, which is the correct behavior until the data exists.

## 2. What the database already contains

From the MLB Picks v2 migration + `api/cron/mlb/*` jobs:

| Table | Populated by | Contains |
|---|---|---|
| `picks_runs` | `/api/mlb/picks/built` on every publish | One row per slate build with full payload jsonb + model/config version |
| `picks` | same | One row per published pick, fully columnar |
| `pick_results` | `cron/mlb/settle-yesterday` | Per-pick outcome: won/lost/push/void/pending + final scores |
| `picks_daily_scorecards` | `cron/mlb/build-scorecard` | One row per sport per slate_date with `record`, `by_market`, `by_tier`, `top_play_result`, `streak`, `note`, `computed_at` |
| `picks_audit_artifacts` | `cron/mlb/run-audit` | One row per sport per slate with `summary` (sampleSize, overall, byMarket, byTier, byEdgeBand, byHomeAway, topHits, topMisses), `signal_attribution`, `recommended_deltas` |
| `picks_tuning_log` | audit + admin apply/rollback | Proposed / applied / rolled_back config changes |
| `picks_config` | seed + admin | Active + shadow tuning configs, one active per sport |

All rows are readable from the service-role client (`api/_lib/picksHistory.js`). No additional backend changes are strictly required to surface performance + audit views — we just need small, thin endpoints that aggregate from these tables.

## 3. What's production-ready to surface now

✅ **Yesterday's by-tier view.** Already in payload. Current `YesterdayScorecard` shows by-market chips but not by-tier — an easy upgrade.

✅ **Trailing records from `picks_daily_scorecards`.** A simple `SELECT … WHERE slate_date >= today - N` aggregation is trustworthy once ≥1 graded row exists. Exposed via a new `GET /api/mlb/picks/performance` endpoint returning `{ trailing7d, trailing30d, byMarket, byTier }`.

✅ **Editorial "learning" insight from the latest audit artifact.** The audit's `summary.byMarket`, `summary.byTier`, and `signal_attribution` are enough to say *"Moneyline edges have been strongest over the last 7 days"* when `mlHitRate > totHitRate` over a minimum sample. Exposed via a new `GET /api/mlb/picks/insights`.

✅ **Top Play trailing hit rate.** Aggregable from `picks` joined to `pick_results` where `tier = 'tier1'`. Needs a small helper.

## 4. What should remain hidden until more data accumulates

- **Season record.** Not useful until we have ≥14 days of graded slates.
- **Units ± anything.** No unit-sizing currently persisted. Don't fake it — drop the `units` surface entirely until the backend emits it.
- **Audit "the model is learning X"** callouts — only render when `signal_attribution` has ≥ 5 graded picks per signal **and** the delta between markets/tiers is ≥ 8 percentage points. Otherwise fall back to quiet.
- **Self-improvement language** (e.g., "the model just tuned itself"). Only say this when there's a corresponding `picks_tuning_log` row with `status='applied'` in the last 7 days. Anything else is overclaim.

## 5. Data-sparsity fallback states (required)

Every performance/audit surface must answer: what if we have 0 days, 1 day, 3 days, etc.?

| Signal | < 1 day | 1–2 days | 3–6 days | ≥ 7 days |
|---|---|---|---|---|
| Yesterday's scorecard | hide | show | show | show |
| 7-day trailing | hide or "Building" | hide or "Building" | show "Last N days · partial window" | show normal |
| 30-day trailing | "Building" | "Building" | "Building" | show normal |
| By-market insight | hide | hide | hide | show if sample ≥ 5 |
| Audit "learning X" line | hide | hide | hide | show if minimum sample + delta |

We should never render a record of `0-0` as a headline. Always degrade to a small editorial fallback or hide the surface entirely.

## 6. Plan of modules to ship this phase

1. **`YesterdayScorecard` upgrade** — add a by-tier row when `byTier` has data. Tightens with a compact variant.
2. **`TrackRecord` is already shipped** — no schema changes; its data-cascade fallback now hits the new performance endpoint.
3. **`PerformanceLearning`** — new component. Reads `GET /api/mlb/picks/performance` → `{ trailing7d, trailing30d, byMarket, byTier, topPlay }`. Shows:
   - 7d record + win rate
   - 30d record + win rate
   - Best-performing market (if sample qualifies)
   - Editorial one-liner (helper)
   Gracefully degrades to "Building track record" when not enough data.
4. **`AuditInsights`** — new component. Reads `GET /api/mlb/picks/insights` → `{ latest: <audit>, insights: [ … ] }`. Shows 1–3 short editorial insights derived from audit data. Hidden entirely if no qualifying insights.
5. **`AboutTheModel`** — compact, editorial explainer. Static copy: conviction 0–100, graded daily, results feed tuning. Glass micro-panel near the trust surfaces.
6. **New endpoints** — `api/mlb/picks/performance.js` + `api/mlb/picks/insights.js`. Thin; aggregate from existing tables.
7. **Helpers** — `src/features/mlb/picks/performanceInsights.js`:
   - `summarizeRecentPerformance(scorecards)`
   - `summarizeByMarket(scorecards)` / `summarizeByTier(scorecards)`
   - `summarizeTopPlayTrackRecord(pickResultRows)`
   - `summarizeAuditInsights(latestArtifacts, scorecardHistory)`

## 7. Layout plan (keeping dashboard feel, avoiding wall-of-stats)

**Odds Insights (`/mlb/insights`)**:
```
Header
TrackRecord (compact glass strip)
YesterdayScorecard (upgraded, shows by-tier row)
TopPlayHero (featured)
[PerformanceLearning · AuditInsights]   ← 2-column on desktop, stacked on mobile
AboutTheModel (compact one-liner)
HowItWorks (full)
Tier 1 / Tier 2 / Tier 3
Footer
```

**MLB Home** (`/mlb`):
```
Header
TrackRecord (compact)
[YesterdayScorecard (compact) | TopPlayHero]
PerformanceLearning (compact teaser: single insight + see-more)
AboutTheModel (compact)
HowItWorks (home variant)
Tier 1 + Tier 2 preview
Footer
```

Top Play stays the page's primary visual. Performance/audit surfaces are **secondary** — they reinforce trust without competing with decision-making content.

## 8. Guardrails that must hold

- No fabricated stats. Period.
- Every number must come from a real aggregate of persisted rows.
- Every component must have a graceful "Building track record" state.
- Copy must stay calm and editorial. No victory lap.
- Never claim the model is "learning" unless there's a `picks_tuning_log` row with `status='applied'` in the recent window.

---

*Implementation follows in the subsequent commit.*
