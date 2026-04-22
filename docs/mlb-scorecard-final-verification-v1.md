# MLB Scorecard — Final Production Verification

## Current production state (live `/api/mlb/picks/scorecard-debug` at 2026-04-22 06:02 UTC)

```json
{
  "now":        { "etDate": "2026-04-22", "etYesterday": "2026-04-21" },
  "runs":       { "latestSlateDate": "2026-04-21", "countLast7d": 34,
                  "byDate": { "2026-04-21": 4, "2026-04-20": 2, "2026-04-19": 8, "2026-04-18": 20 } },
  "picks":      { "countForLatestSlate": 16, "countForYesterday": 16,
                  "uniquePickKeysForYesterday": 13,
                  "runsWithPicksForYesterday": 2, "runsWithoutPicksForYesterday": 2 },
  "results":    { "gradedLast7d": 0, "pendingLast7d": 0,
                  "latestGradedSlateDate": null, "latestResultWrittenAt": null },
  "scorecards": { "latestSlateDate": "2026-04-20",
                  "rows": [
                    { "slate_date": "2026-04-20", "record": {0,0,0,0}, "note": "No picks yesterday" },
                    { "slate_date": "2026-04-19", "record": {0,0,0,0}, "note": "No picks yesterday" },
                    { "slate_date": "2026-04-18", "record": {0,0,0,0}, "note": "No picks yesterday" },
                    { "slate_date": "2026-04-17", "record": {0,0,0,0}, "note": "No picks for this date" }
                  ] },
  "audit":      { "latestSlateDate": "2026-04-20" },
  "consistency":{ "yesterdayScorecardPresent": false, "multiRunRaceDetected": true, ... }
}
```

## What this proves

1. **The PR #11 code fix is deployed** — the enhanced debug fields (`runs.byDate`, `picks.runsWithPicksForYesterday`, `multiRunRaceDetected`) are present in the response.
2. **Yesterday scorecard row: NOT present for 2026-04-21.** The pre-fix cron for 2026-04-21 would fire next at 07:45 UTC April 22 (roughly 1.5 hours from the debug snapshot).
3. **`pick_results` is still empty** — `gradedLast7d = 0, pendingLast7d = 0`. Settle never wrote anything because of the race.
4. **The old scorecard rows (04-18 / 04-19 / 04-20) are all placeholder rows** with zero record and "No picks yesterday" — they were written by the pre-fix cron under the race bug.
5. **`multiRunRaceDetected: true`** — 2 runs for 2026-04-21 have picks, 2 don't. The fix code would now read the right ones.

## Exact current break point

The code fix shipped in PR #11 is correct but **has not yet been invoked against the production data**. The data from 2026-04-21 (and the broken placeholder rows for 04-18/04-19/04-20) needs to be replayed through the fixed crons. That requires a manual call to the backfill admin endpoint (or waiting for the natural 07:30 / 07:45 / 08:00 UTC cron to fire for 2026-04-21 — which repairs only *that* day).

## Additional bugs found in this pass

1. **UI suppression:** `MlbMaximusPicksSectionV2` rendered `<YesterdayScorecard>` conditionally on `scorecardSummary` being truthy. If `/built` has a stale 2-minute cache after backfill, the component would be suppressed entirely instead of self-fetching. **Fixed** — always mounts; component self-fetches from `/api/mlb/picks/scorecard` when `summary` is null.
2. **Scorecard empty-state:** `YesterdayScorecard` returned `null` (invisible) when no row existed. **Fixed** — renders a tasteful "Pending · Yesterday's scorecard is not yet generated" placeholder so the home grid doesn't collapse.
3. **Cache invalidation on backfill:** the admin backfill endpoint didn't clear `mlb:picks:built:latest` KV after writing. **Fixed** — now expires the KV snapshot so `/built` re-embeds the fresh `scorecardSummary` on the next request.
4. **Range backfill:** the endpoint only accepted single `?date=`. **Extended** to support `?from=...&to=...` and `?dates=a,b,c` so the operator can repair all four broken days (04-18 → 04-21) in one call.

## Exact manual steps to populate today

### Step 1 — Force backfill the range (04-18 through 04-21) with fresh code

```bash
curl "https://maximussports.ai/api/admin/picks/backfill?sport=mlb&from=2026-04-18&to=2026-04-21&key=$ADMIN_API_KEY" | jq .
```

Expected top-level shape:

```json
{
  "ok": true,
  "sport": "mlb",
  "datesRequested": ["2026-04-18", "2026-04-19", "2026-04-20", "2026-04-21"],
  "datesProcessed": 4,
  "results": [
    { "date": "2026-04-18", "ok": true, "stages": { "settle": {...}, "scorecard": {...}, "audit": {...} } },
    ...
  ]
}
```

Look inside each `settle` stage for `matched`, `unmatched`, `graded`. If `matched === 0` for a day, that day had a game-id format mismatch — next investigation is `?includeFinals=1` on the debug endpoint.

### Step 2 — Re-run the debug endpoint with match telemetry

```bash
curl "https://maximussports.ai/api/mlb/picks/scorecard-debug?includeFinals=1" | jq .
```

Expected after successful backfill:

- `consistency.yesterdayScorecardPresent: true`
- `consistency.gradedCount > 0`
- `results.latestGradedSlateDate === "2026-04-21"`
- `scorecards.rows[0].slate_date === "2026-04-21"` with a real record
- `match.matchedToFinals === match.uniquePickGameIds` (or very close)

### Step 3 — Confirm `/built` embed

```bash
curl 'https://maximussports.ai/api/mlb/picks/built' | jq '.scorecardSummary'
```

Expected: a populated object with `overall.won + lost > 0`, not `null`.

### Step 4 — Hard UI verification

Load both `https://maximussports.ai/mlb` and `https://maximussports.ai/mlb/insights`.

Expected:
- Yesterday's Scorecard strip shows the real record (e.g. "9-7 · 56% win rate").
- `YesterdayContinuity` pill shows "Top Play cashed yesterday" / "Top Play missed yesterday".
- `TrackRecord` shows the rolling record from `scorecard.trailing7d/30d` as data accumulates.
- `PerformanceLearning` — with only a few days of graded data, the "Last 30 days" window will show `partial` state ("N graded · building"). This is the correct, truthful state, not "Building".

## If after backfill `matched = 0`

The backfill will still write pick_results rows (with status='pending'), but the scorecard will show `{ pending: N, won: 0, lost: 0 }`. If this happens:

1. `?includeFinals=1` on the debug endpoint → look at `sampleUnmatchedGameIds` and compare to `finalsForYesterday.sampleGameIds`.
2. If the formats differ (e.g. picks store `"401234567"` while ESPN returns `401234567` as a number, or there's a leading/trailing character difference) — that's the next bug layer.
3. Normalize both sides to strings before `.set()` / `.get()` — already done in `settle-yesterday.js` line 35 but worth confirming.

## Summary checklist

| Item | Current | After Step 1 |
|---|---|---|
| yesterday scorecard row exists | ❌ | ✅ |
| graded picks exist | ❌ (0) | ✅ (expected: 16 for 2026-04-21) |
| `/api/mlb/picks/built` embeds scorecardSummary | ❌ (null) | ✅ (after Step 1 KV invalidation) |
| `/mlb` renders yesterday's scorecard | ❌ | ✅ |
| `/mlb/insights` renders yesterday's scorecard | ❌ | ✅ |
| PerformanceLearning window populated | ❌ (`none`) | ⚠ (`partial` — correct for early data volume) |

*End of verification.*
