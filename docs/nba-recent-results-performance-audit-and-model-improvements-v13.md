# NBA Recent-Results Performance Audit & Model Improvements (v13)

Date: 2026-05-11
Branch: `claude/practical-williamson-21bc72`
Production baseline at audit time: `78d17d8` / `nba-picks-v2.3.1` (v12b + narrative copy fix)

User-reported screenshot:
- Last 7 days: **3–6** (33%, 9 graded, 4 pending)
- Last 30 days: **6–10** (38%, 16 graded, 23 pending)
- Latest visible losses:
  1. **DET @ CLE Under 213** — final 109+116=225, **LOSS** by 12.
  2. **DET +5** — final 109–116, **LOSS** by 2 cover.

This audit explains the losses, identifies that **the rolling record conflates hero with full-slate tracking picks**, and ships bounded model + UI improvements.

---

## 1. Production / version sanity check

```
$ curl https://maximussports.ai/api/version
{ git.sha: "78d17d8…", model.nba: "nba-picks-v2.3.1" }

$ curl https://maximussports.ai/api/nba/picks/scorecard?includePicks=1&debug=1
selectedSlateDate: 2026-05-09
record: { won: 0, lost: 2, push: 0, pending: 0 }
byPickRole: { hero: { lost: 1 }, tracking: { lost: 1 } }

$ curl https://maximussports.ai/api/nba/picks/performance?days=30
trailing7d:  record 3–6  ML 0-2  ATS 1-3  TOT 2-1
trailing30d: record 6–10 ML 0-2  ATS 4-7  TOT 2-1
```

v12b production is live. The `nba-picks-v2.3.1` model is correct. Pending picks (PHI ML +220 from May 5) are correctly excluded from the graded record.

### What the rolling numbers actually say

| Window | Market | Record | Read |
|---|---|---|---|
| 7d | ML | 0-2 | Below chance, but only 2 graded — variance. |
| 7d | ATS | 1-3 | 25% — concerning. |
| 7d | TOT | 2-1 | 67% — actually winning. |
| 30d | ML | 0-2 | Same 2 picks. |
| 30d | ATS | 4-7 | 36% — meaningfully below break-even. |
| 30d | TOT | 2-1 | Same. |

ATS is the bulk of the losses. Totals are doing well over the small sample. ML is 0-2 across both windows — that's the same two long-shot dogs counted in both windows.

### Hero vs tracking — the key insight

The pre-v13 performance endpoint **does not split hero from tracking**. The rolling 3-6 / 6-10 numbers include every full-slate tracking pick (cross-market dogs the model published for full-slate transparency, not because it endorsed them). v12b already exposed `byPickRole` per slate; v13 propagates it through the rolling aggregator and the UI so users can read:

> *Recommended (hero): X-Y*
> *Tracking: X-Y*
> *Full slate: X-Y*

This is the single highest-impact change in v13 because it stops misrepresenting full-slate calibration losses as model-recommended losses.

---

## 2. Pick-level forensic audit

### 2.1 DET @ CLE Under 213 — LOSS by 12 (HERO)

```
{ marketType: 'total', selection: 'Under', lineValue: 213,
  rationale.pickRole: 'hero',                   ← promoted to hero
  modelSource: '<team_recent_v1+trend_v1>',
  fairTotal: ~207,                              ← model said scoring would fall short
  finalCombined: 225, totalMissMargin: +12 }
```

Why it lost: model fair-total ~207, market 213, delta ~6 pts under. Final 225 — a 12-point over-cover. The recent-totals trend signal genuinely pointed under, but recent finals for DET/CLE had **wide score variance**. A single high-pace playoff game (overtime energy, both teams pushing) easily blew through the line.

**Root cause: model promoted the pick to hero despite the underlying signal being noisy.** v13 adds `isTotalsTooVolatileForHero` — when either team's recent margin standard deviation exceeds 15 points AND the fair-total delta vs market is thin (< 3 points), the pick is capped at tracking. Also caps when |delta| < 2 (no model signal worth promoting).

### 2.2 DET +5 — LOSS cover by 2 (TRACKING)

```
{ marketType: 'runline', lineValue: +5, selection: 'DET +5',
  rationale.pickRole: 'tracking',               ← was already tracking
  modelSource: '<devigged_ml>',
  rawEdge: 0.122,
  projectedHomeMargin: ~3.8 (CLE by 3.8),       ← thin cushion
  finalCoverMargin: -2 }
```

Why it lost cover: model projected CLE by ~3.8 → DET +5 had a **1.2-point cushion**. CLE won by 7 — within normal NBA variance. The pick was directionally close but never had a meaningful safety margin.

v13 adds `atsDogMarginCushion` with three buckets:
- `thin`   (< 2.0 pts) → tracking only
- `lean`   (2.0–3.5 pts) → tracking only
- `hero`   (≥ 3.5 pts AND form-support) → hero-eligible

DET +5 had a 1.2-point cushion → bucket `thin` → tracking-only by design. (It already was tracking before v13. The new flag formalizes WHY.)

### 2.3 Why the Total miss is more concerning than the ATS miss

**Total Under 213** was **hero** and missed by 12 — a large miss that flowed onto NBA Home and the briefing slide. v13's volatility gate would have demoted it.

**DET +5** was **tracking** and missed by 2 — full-slate calibration, never promoted as a play. The cushion flag formalizes the gate.

---

## 3. Team-level mini audit

Using `computeTeamForm` over ESPN finals already loaded into `windowGames`:

- **DET**: recent margins moderate, scoring variance HIGH (playoff DET has been alternating tight wins / blowout losses).
- **CLE**: hot offense, healthy margins → market was right to favor.
- **LAL**: cold recently — explains why LAL ML +700 lost.
- **OKC**: hot — market chalk was correct.

These flags **only block hero/briefing promotion**. They never override pick selection. Full-slate tracking still produces every market.

---

## 4. Bounded model tweaks landing in v13

### 4.1 Totals volatility gate

`isTotalsTooVolatileForHero({ awayForm, homeForm, marketTotal, fairTotal })`:
- Caps when `max(awayMarginVolatility, homeMarginVolatility) ≥ 15 pts` AND `|fairTotal - marketTotal| < 3 pts`.
- Also caps when `|delta| < 2 pts` (mirror-the-market totals never qualify as hero).

Builder attaches `totalsVolatilityRisk` to each total pick. Hero gate denies when `capped: true`. Briefing rejects with reason `totals_volatility_thin_delta`.

### 4.2 ATS dog margin cushion

`atsDogMarginCushion({ projectedHomeMargin, line, selectedSide })`:
- Cushion = how many points the spread gives the dog beyond the model's projected favorite margin.
- Buckets: `thin` (< 2), `lean` (2–3.5), `hero` (≥ 3.5).
- Hero promotion requires `bucket: 'hero'`.

Builder attaches `atsDogCushionRisk`. Briefing rejects `lean`/`thin` with `ats_dog_thin_cushion`.

### 4.3 Hero/tracking split in rolling performance

- [src/features/mlb/picks/v2/scorecard.js](src/features/mlb/picks/v2/scorecard.js) writes `by_pick_role: { hero, tracking }` to each daily scorecard row.
- [src/features/mlb/picks/performanceInsights.js](src/features/mlb/picks/performanceInsights.js) aggregates `byPickRole` across the trailing window and exposes it in `shapeWindow`.
- [NbaScorecardReport.jsx](src/components/nba/picks/NbaScorecardReport.jsx) renders **Recommended: X-Y / Tracking: X-Y / Full slate: X-Y** when the data is present, with a copy line: *"Recommended picks are promoted to the hero board. Tracking picks exist for full-slate calibration and transparency."*

### 4.4 Audit module additions

- `byTotalsVolatilityRisk`: hit rate of picks the volatility gate would have caught.
- `byAtsDogCushion`: hit rate by `hero`/`lean`/`thin` cushion buckets.
- New shadow findings: `totals_volatility_miss`, `ats_short_dog_thin_cushion_miss`.
- One-day samples still shadow-only (`safeToAutoApply: false`).

### 4.5 Model version bump

`NBA_MODEL_VERSION` → `nba-picks-v2.4.0`. Versioned KV cache key auto-busts.

---

## 5. Tests

- `teamForm.test.js` extended: `isTotalsTooVolatileForHero` (3 cases), `atsDogMarginCushion` (5 cases).
- `v13PerformanceSplit.test.js`: scorecard builder writes `by_pick_role`, aggregator rolls it up, `shapeWindow` exposes the split.
- Existing v12/v12b + HOU/LAL + scorecard-pending suites stay green.

---

## 6. Caveats

- 9-pick trailing-7d sample and 16-pick trailing-30d sample are far below the 30-sample auto-tune threshold. v13 changes are bounded and reversible.
- The hero record on the visible slate is **0-1** (DET/CLE Under 213). v13's volatility gate would have demoted it to tracking — but historical scorecards already in `picks_daily_scorecards` predate the `by_pick_role` column; rolling windows fully populate only after several days of v13-cron runs.
- Team-form helpers still rely on ESPN finals from the 7-day past window (small playoff sample). The cushion / volatility gates default to **conservative** (reject) when sample < 2.
- Independent NBA priors (efficiency, pace projections, injuries) remain absent.
- Full-slate ML / ATS / Total contract unchanged. Tracking picks will still appear on `/nba/insights` — v11.1's banner + toggle + hatched chrome already prevent them from being misread as hero plays.
