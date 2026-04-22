# MLB Scorecard + Performance Population — Root-Cause Audit

## Observed symptom
Production `/mlb` and `/mlb/insights` render:
- `YesterdayScorecard` → empty / "Awaiting settlement"
- `PerformanceLearning` → "Last 7 days —  Building", "Last 30 days —  Building"
- `TrackRecord` → "Tracking · Results accumulate daily"

Even though picks have been persisting for a few days.

## Exact current breakpoints

### Bug #1 — UTC vs ET in `mlbPicksBuilder.js` (affects `payload.scorecardSummary`)

`api/_lib/mlbPicksBuilder.js:122–123`:
```js
const y = new Date(); y.setDate(y.getDate() - 1);
const ymd = y.toISOString().slice(0, 10);     // ← UTC date, not ET
const card = await getScorecard({ sport: 'mlb', slateDate: ymd });
```

But `picks_daily_scorecards.slate_date` is written by `api/cron/mlb/build-scorecard.js` using `yesterdayET()`, which formats in `America/New_York`. For most of the UTC day the two agree — but any time the UTC date is one calendar day AHEAD of ET (i.e., 00:00–04:00 ET, or midnight-to-8pm PT in real terms), `ymd` resolves to the ET-today value and the lookup misses yesterday's row entirely.

**Impact:** `payload.scorecardSummary` is null during any window where UTC is ahead of ET. When that happens, MLB Home's embedded scorecard goes empty; `YesterdayScorecard` falls back to self-fetching `/api/mlb/picks/scorecard` (which correctly uses ET), but that second request is racy and adds flicker.

### Bug #2 — `fetchYesterdayFinals()` also uses UTC (affects settle cron)

`api/mlb/live/_normalize.js:165–166`:
```js
const d = new Date();
d.setDate(d.getDate() - 1);
const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
```

The settle cron runs at 07:30 UTC = 03:30 ET. At that moment, UTC-yesterday and ET-yesterday happen to align, so the production cron schedule is *accidentally* correct. But any manual trigger during 00:00–20:00 UTC on other days would fetch the wrong date. Also: this function is used in contexts beyond the cron; it should be ET-consistent.

### Bug #3 — Sparsity gate on `PerformanceLearning` is too strict for early product life

`src/features/mlb/picks/performanceInsights.js:22`:
```js
const MIN_WINDOW_SAMPLE = 14;
```

`aggregateScorecards.sparse = graded < 14`, and `shapeWindow.sparse = agg.sparse || graded < 5`. `WindowStat` renders "—  Building" when `sparse && !record`. With 2–4 days of early production data and maybe 1–2 graded picks per day, we land at `graded < 5` → record=null → "Building". Technically correct behavior per the strict guardrail, but the UI doesn't distinguish "no data" from "data exists but below threshold" from "backend down".

### Bug #4 — UI empty states are indistinct

`YesterdayScorecard`, `TrackRecord`, `PerformanceLearning` all collapse several distinct failure modes into the same "Building"/"—" state:

| Actual state | What should render | What renders today |
|---|---|---|
| Scorecard row exists, all picks graded | Full record | ✅ |
| Scorecard row exists, all picks pending | "Awaiting settlement · N picks pending" | "Awaiting settlement" (correct but generic) |
| Scorecard row exists, partial graded | `3-1 · 4 graded` | ✅ |
| No scorecard row for yesterday | "Scorecard not yet generated" | empty card (no render) |
| Backend down / RPC fails | "Performance data unavailable" | "Building" |
| Fewer than 14 total graded picks | "Building toward 7-day window (N graded)" | "Building" (no explanation) |

### Bug #5 — No observability

No way to quickly inspect from the deployment what the DB actually contains. Operator has to `supabase select` directly to diagnose.

## What data likely exists vs. is missing

Based on the symptoms + code audit (cannot hit the DB from this environment):

- **Likely exists:** `picks_runs` rows (picks have been generated) and `picks` rows.
- **May be missing or sparse:** `pick_results` — if settle cron ran but returned 0 graded (e.g., ESPN date mismatch, gameId mismatch, or game-in-progress bleeds).
- **May exist but empty:** `picks_daily_scorecards` rows exist because `build-scorecard` always upserts a row even when `pick_results` is empty (writes `{ won: 0, lost: 0, push: 0, pending: N }`). Front end then treats that as "sparse/pending" → "Building".

## Exact root cause

**Two compounding issues:**

1. **Pipeline:** the `/built` endpoint's `scorecardSummary` lookup uses UTC date instead of ET date. When they disagree, MLB Home shows no scorecard even though the row exists.
2. **Product:** when yesterday's scorecard row HAS data but no picks have been graded yet (all pending), the UI says "Building" instead of the truthful "Awaiting settlement · N pending". Users see "Building" and assume there's no data, when in fact the cron ran but found no settled picks.

## Fixes applied in this PR

1. **mlbPicksBuilder.js** — switched to an ET-aware helper so the scorecard lookup always matches the write date.
2. **`fetchYesterdayFinals()` in _normalize.js** — switched to the same ET formatter so ad-hoc triggers don't silently miss games.
3. **performanceInsights.js** — split the sparsity signal into two states: `partialWindow` (have some data, below full window) vs `noData` (truly zero). `shapeWindow` now returns `{ state: 'full' | 'partial' | 'none' }` in addition to the existing `sparse` boolean.
4. **UI empty states** — `YesterdayScorecard`, `PerformanceLearning`, `TrackRecord` now render distinct copy per state: "Awaiting settlement", "Building toward N-day window", "Data unavailable", etc.
5. **New debug endpoint** `GET /api/mlb/picks/scorecard-debug` returns a compact summary of what the DB currently holds for operator inspection.
6. **Tests** for date-boundary correctness, state mapping, and the ET-aware helpers.

See `docs/mlb-scorecard-population-audit-v1.md` next to the code changes.
