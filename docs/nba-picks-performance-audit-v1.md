# NBA Picks — Performance Audit (v1)

## Headline finding

**The "4–11 · 27% win rate" scorecard the user is seeing on `/nba` is MLB data, not NBA data.**

The NBA picks UI is correctly mounted, but three hooks and one component fetched from MLB endpoints with no sport awareness:

| Site of leak | File | Observed behavior |
|---|---|---|
| `usePerformance()` | `src/features/mlb/picks/usePerformance.js:24-25` | Defaults `sport='mlb'`, path hardcoded to `/api/mlb/picks/performance` |
| `useAuditInsights()` | same file :27-29 | Same defaults |
| `<PerformanceLearning />` | calls `usePerformance()` with NO args | Always MLB |
| `<AuditInsights />` | calls `useAuditInsights()` with NO args | Always MLB |
| `<TrackRecord />` | reads `payload.trackRecord` + `scorecard` props — correctly sport-scoped | ✅ fine |

The NBA container (`MlbMaximusPicksSectionV2` with `sport='nba'`) renders these components without passing sport down, so they silently serve MLB.

## Verified via production

```bash
curl 'https://maximussports.ai/api/mlb/picks/performance' | jq '.windows.trailing7d'
```
→ `{ record: "4–11", winRate: 27, sample: 15, pending: 12, ... }`

```bash
curl 'https://maximussports.ai/api/mlb/picks/performance?sport=nba' | jq '.windows'
```
→ `{ trailing7d: null, trailing30d: null }` — NBA has zero scorecards.

```bash
curl 'https://maximussports.ai/api/nba/picks/built' | jq '.topPick.sport'
```
→ `"nba"` — picks are generated correctly, but not persisted (see Finding #2).

## Finding #1 — Cross-sport data leak on NBA UI

Root cause: `usePerformance({ sport = 'mlb' } = {})` defaults. Both `PerformanceLearning` and `AuditInsights` call the hook with no args. NBA page shows MLB record.

**Fix:** thread `sport` from the container down. Hook must read `sport` from prop or context; there is no sport context today, so prop is simplest.

## Finding #2 — NBA picks are generated but NOT persisted

`api/nba/picks/built.js` calls `buildNbaPicksV2` and returns the payload, but **never calls `writePicksRun`**. That means:

- `picks_runs` has 0 NBA rows
- `picks` has 0 NBA rows
- `pick_results` has 0 NBA rows
- `picks_daily_scorecards` has 0 NBA rows

No NBA cron endpoints exist. No NBA schedule in `vercel.json`. NBA has been running as a display-only product for however long it's been live; nothing has ever been graded.

## Finding #3 — Real MLB performance signal (relevant because that's what the user actually saw)

MLB last 7 days (from `/api/mlb/picks/performance`):

| Market | W–L | Win rate | Graded |
|---|---|---|---|
| Moneyline | 4–5 | **44%** | 9 |
| Run Line | **0–6** | **0%** | 6 |
| Total | 0–0 | — | 0 |
| **Overall** | **4–11** | **27%** | 15 |

By tier:
- Tier 1: 1–3
- Tier 2: 1–4
- Tier 3: 2–4
- Top Plays: 1–1 (hit rate over 2 graded — too small to signal)

**The 4–11 is dragged by run-line's 0-for-6.** Moneyline alone would be 44% over 9 (respectable given the random-guess baseline is ~48% factoring vig). The model's spread-line selections are the specific failure mode.

This is not an NBA finding — it's an MLB finding surfaced because the NBA UI was showing MLB data — but it's worth noting for the MLB side since run-line picks now have 6 consecutive losses.

## Finding #4 — If we ever had real NBA data, what would the audit look like?

Can't say yet — there is no persisted NBA data. After Findings #1 and #2 are fixed, the NBA audit doc (v2) can actually report. What we CAN do right now preemptively:

- Apply conservative playoff-aware tuning to `NBA_DEFAULT_CONFIG` (tighter Tier 1, large-spread penalty, stronger signal-agreement requirement).
- Set up the NBA persistence + cron infrastructure so data starts accumulating.
- Frame NBA UI honestly: "Early playoff sample — model is still building its NBA track record."

## Finding #5 — NBA builder is already non-biased but too permissive

Reading `src/features/nba/picks/v2/buildNbaPicksV2.js`:

- Win probs derived from `tanh(pregameEdge × k=0.12)` — symmetric, non-biased. ✅
- Tier cutoffs identical to MLB: `tier1.floor = 0.75`, `tier2.floor = 0.60`, `tier3.floor = 0.45`. Probably too loose for playoffs where the sample is small.
- `COVERAGE_MIN_SCORE = 0.30` — same as MLB. Coverage pool is likely publishing too many low-conviction NBA picks.
- `marketGates.total.minExpectedDelta = 2.0` points — OK, but totals require a `fairTotal` which NBA odds-enricher rarely supplies, so totals rarely publish anyway.

**Suggested conservative adjustments** (config-driven, zero model-code change):
- `tier1.floor` → `0.80` (from 0.75) — playoffs demand higher confidence
- `tier1.slatePercentile` → `0.92` (from 0.90) — stricter relative rank
- `maxPerTier.tier1` → `2` (from 3) — fewer, stronger top plays
- `COVERAGE_MIN_SCORE` → `0.40` (from 0.30) — narrow the coverage pool
- Large-spread penalty: a new `components.edge.spreadLargeCap` rule that DOWN-weights picks where `|line| > 10` unless `|modelEdge| >= +0.06`. Encoded in the betScore composition so high-variance blowouts don't dominate.
- Underdog moneyline requires `rawEdge >= +0.04` (vs +0 today) — don't chase +200 dogs on a 0.5% edge.

These are *preemptive* not evidence-backed — we don't have NBA sample. They encode known playoff-betting priors conservatively.

## What to change in this PR

1. **Fix the cross-sport leak.** Pipe `sport` through `usePerformance` + `useAuditInsights` + the components that call them.
2. **Make the performance + insights endpoints work for any sport** (they already accept `?sport=` but let's verify and add NBA routing).
3. **Wire NBA persistence.** `api/nba/picks/built.js` fires `writePicksRun` non-blocking (parity with MLB).
4. **Add NBA cron endpoints** (settle/build-scorecard/run-audit) — use the existing sport-agnostic shapers.
5. **Schedule NBA crons** in `vercel.json`.
6. **Apply conservative NBA tuning** via the config.
7. **Honest NBA copy** — sample-size note when graded < 10, "Early playoff sample" framing.
8. **Backfill endpoint** already generalizes — just accept `sport=nba`.
9. **Tests.**
10. **No MLB regressions.** MLB copy, tuning, and layout unchanged.

---

*End of audit.*
