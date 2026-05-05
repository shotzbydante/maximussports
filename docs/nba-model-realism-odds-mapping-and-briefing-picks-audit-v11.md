# NBA Model Realism, Odds Mapping & Briefing Picks Audit (v11)

Date: 2026-05-04
Branch: `claude/practical-williamson-21bc72`
Production baseline: v10 (`e51d840`, model `nba-picks-v2.1.0`)

User-reported symptoms:
1. Daily NBA Briefing slide 1 surfaces `SAS +405` (San Antonio +405 ML) for `MIN @ SAS` — implausible price for a home favorite.
2. Odds Insights still shows mostly underdog picks (CLE +125 / +3, LAL +700 / +15.5, PHI +220 / +7, MIN +490 / +13, etc.).
3. The model is still producing all-upset boards from weak cross-market disagreement.

---

## 1. Production sanity check

**Verdict: v10 IS live in production.** Captured 2026-05-04T04:23Z:

```
$ curl https://maximussports.ai/api/version
{
  "git": { "sha": "e51d840770412d859c9dce7785c1f01a02f57b37",
           "shortSha": "e51d840", "branch": "main",
           "deploymentId": "dpl_438Wmias1rzGB2fJBtMD5bvG4HW3" },
  "model": { "nba": "nba-picks-v2.1.0", "mlb": "mlb-picks-v2.0.0" }
}

$ curl https://maximussports.ai/api/nba/picks/built?debug=1
modelVersion: nba-picks-v2.1.0
_cacheStatus: { servedFrom: 'fresh', cacheAgeSeconds: 0 }
hero count: 4   tracking count: 14   _debugByGame: present
```

Cache is fresh, v10 model version is honored, debug bypass works. **The remaining symptoms are model/editorial bugs, not deploy or cache issues.**

---

## 2. Root cause of `SAS +405`

### 2.1 Live debug for `MIN @ SAS` (game 401871153)

```json
"moneylineDecision": {
  "awayImplied": 0.815,    // MIN no-vig implied = 81.5%   (≈ ML -440)
  "homeImplied": 0.185,    // SAS no-vig implied = 18.5%   (≈ ML +440)
  "awayModelProb": 0.545,  // spread-derived MIN prob (line -2.5)
  "homeModelProb": 0.455,
  "awayEdge": -0.20,       // capped from -0.27
  "homeEdge":  0.20,       // capped from +0.27
  "selectedSide": "home",
  "selectedTeam": "SAS",
  "priceAmerican": 410,
  "rawEdge": 0.2,
  "modelSource": "spread",
  "betScore": 0.699,
  "conviction": "Solid"
},
"spreadDecision": {
  "projectedHomeMargin": -8.8,  // de-vigged ML projects MIN winning by ~8.8
  "lineValue": -2.5,
  "selectedSide": "away",
  "selectedTeam": "MIN"
}
```

### 2.2 What's happening

Two markets describe wildly different scenarios for the same game:
- **Moneyline** says MIN wins ~81.5% (consistent with ~7-8 point favorite).
- **Spread** says MIN -2.5 (consistent with ~54.5% MIN win prob).

That's a **27-percent disagreement** between the two markets. v10's `pickMoneylineSide` correctly identifies the cross-market gap, caps `rawEdge` at the `RAW_EDGE_CAP` of 0.20, and (because the model probability comes from the spread) selects the home side at +410. The hero gate accepts because `|rawEdge|` clears 0.10 and multi-factor support passes (decent dataQuality + marketQuality).

**This is a market-data anomaly, not a mapping flip.** Audit checks confirm:
- Odds API `home_team` / `away_team` order matches our `homeSlug` / `awaySlug` mapping. ✅
- `pregameSpread` in production (`-2.5`) applied to the home side as a negative line is consistent with MIN being the road favorite. ✅
- `market.moneyline = { away: <large negative>, home: +410 }` lines up with MIN being the favorite ML-wise. ✅

What's wrong: the **moneyline is ~7–8 points worth of favorite while the spread is only 2.5 points worth**. Either (a) the median across books is averaging a stale/illiquid ML against a current spread, (b) one bookmaker priced a star sit-out into ML but not into spread, or (c) Odds API returned a stale ML alongside a current spread. The model has no way to know which, but it does have everything it needs to **detect that the disagreement is implausibly large** and treat the game as a data anomaly.

### 2.3 Fix (v11)

In `pickMoneylineSide`:
- Compute the divergence `|noVigImpliedHome − spreadDerivedHome|`.
- If divergence ≥ `ML_SPREAD_DIVERGENCE_FLAG` (default 0.15 = 15%), flag the game:
  - `lowSignalReason: 'ml_spread_divergence'`
  - `isLowConviction: true`
  - `rawEdge` is **clamped to ≤ 0.04** (collapse to noise floor) so the cross-market hero gate can never accept it.
  - `modelSource: 'ml_spread_anomaly'` so editorial guardrails can specifically reject it from briefing.

For `MIN @ SAS`, this collapses the SAS +410 ML pick to a tracking-only "Lean" with a clear rejection reason.

---

## 3. Root cause of "all-underdog" Odds Insights

### 3.1 What the v10 fix actually fixed vs missed

v10 introduced:
- A **hero gate** that requires `|rawEdge| ≥ 0.10` AND multi-factor support for cross-market sources.
- A **diversification check** that demotes all cross-market hero candidates when every one is on the underdog side.

v10 did **not**:
- Affect `categories.pickEms / ats / leans / totals`. Those are populated from `assigned.published` (the tier1/2/3 picks), independent of `pickRole`.
- Filter the daily-briefing slide. The slide reads `categories` directly through `resolveSlidePicks`.

### 3.2 The slide path

```
nbaEmailData.js (line 339) ─→ picksBoard = built.categories
                                                │
                                                ▼
src/components/dashboard/slides/NbaDailySlide1.jsx
  └─ resolveSlidePicks(data)
        └─ resolveCanonicalNbaPicks: flattens
            categories.pickEms ∪ ats ∪ totals ∪ leans
            sorts by betScore desc, slices top N
```

For the live MIN/SAS slate, `categories` looks like:
```
pickEms: [SAS +410 (0.699)]
ats:     [CLE +3 (0.549), MIN -2.5 (0.549), CLE +3 (0.549)]
totals:  [Over 215 (0.773), Under 213.5 (0.699), Under 213.5 (0.699)]
leans:   [LAL +700 (0.549), PHI +220 (0.549)]
```

Top 2 by score: `Over 215`, `SAS +410`. The slide therefore renders `SAS +410` as Maximus's Pick #2.

**The bug:** the slide reads from a "published" pool that has nothing to do with editorial-realism filters. v10's hero/tracking distinction never reached the slide.

### 3.3 What "all underdogs" actually means right now

Looking at the live `_debugByGame` data:

| game | ML pick | edge | role | ATS | edge | role | TOT | role |
|---|---|---|---|---|---|---|---|---|
| CLE @ DET | CLE +124 | 0.018 | tracking | CLE +3 | 0.083 | tracking | Under 215.5 | tracking |
| LAL @ OKC | LAL +700 | 0.073 | tracking | LAL +15.5 | 0.20 | tracking | Under 213.5 | hero |
| PHI @ NYK | PHI +220 | 0.076 | tracking | PHI +7 | 0.115 | tracking | Over 215 | hero |
| MIN @ SAS | SAS +410 | 0.20 | hero ⚠ | MIN -2.5 | 0.20 | tracking | Under 210.5 | tracking |

- 11/12 ML+ATS picks are dogs (the only fav is MIN -2.5 ATS, and it's tracking).
- Of those, 11 are sourced from cross-market arb only.
- Only one ML/ATS pick (SAS +410) leaks to hero — and it's the data anomaly.

**The pattern is genuine cross-market disagreement** in production, plus the SAS+410 anomaly. The fix is not to flip pick selection (v9's math is correct). The fix is to refuse to **promote** these picks editorially.

---

## 4. v11 fix plan

### 4.1 Detect ML-spread divergence anomaly

`pickMoneylineSide` returns a `divergence` field; when it crosses 0.15 the rawEdge is collapsed and `lowSignalReason='ml_spread_divergence'`, `modelSource='ml_spread_anomaly'`. This kills the SAS +410 hero promotion at the source.

### 4.2 New `briefingPicks` array — editorial-safe layer

Builder now emits `briefingPicks` after applying `selectBriefingPicks(fullSlatePicks)`:

Acceptance rules (must pass ALL):
1. `pickRole === 'hero'`.
2. `modelSource` is **not** in `{spread, devigged_ml, no_vig_blend, ml_spread_anomaly}` — OR if it is cross-market, `|rawEdge| ≥ 0.12` AND multi-factor support AND not on the underdog side.
3. ML picks where `|priceAmerican| > 300` are rejected unless modelSource is independent (today: only `ml_spread_anomaly` is excluded, but the underlying gate also blocks long-shot dogs).
4. ATS picks where `|line| ≥ 7` and the side is the underdog and modelSource is cross-market are rejected.
5. Total picks pass when `modelSource` starts with `series_pace_v1` or `team_recent_v1` (real signal). `slate_baseline_v1` totals are tracking-only.

Each rejection emits `briefingRejectReason` + the candidate stays in `rejectedBriefingCandidates` for transparency.

When the briefing pool is empty, the slide renders an honest "No high-conviction edges today" treatment instead of forcing weak picks.

### 4.3 Slide 1 source

`resolveSlidePicks` now prefers `data.nbaPicks.briefingPicks` when present. Falls back to `categories` for legacy callers.

### 4.4 Debug surface

`/api/nba/picks/built?debug=1` now exposes:
- `briefingPicks` — the curated editorial subset.
- `rejectedBriefingCandidates` — picks with `{ id, label, modelSource, rejectReason }`.
- `oddsMappingDiagnostics[gameId]` — `{ awayMl, homeMl, awaySpreadLine, homeSpreadLine, noVigAway, noVigHome, spreadDerivedHome, divergence }`.
- `editorialFlags` — propagated from `meta.flags` (e.g. `ml_spread_anomaly:401871153`).

---

## 5. What remains "tracking" by design

Full-slate picks remain unchanged — every game still produces ML / ATS / Total. Cross-market underdog picks still appear on `/nba/insights` as tracking, with the v10 source pills (`Tracking pick · cross-market signal only`, `Low conviction · market disagreement`). v11 only restricts what gets **promoted** to hero / briefing.

---

## 6. Tests added

- `nbaModelEdge.divergence.test.js` — `MIN @ SAS` fixture (ML implies 81% / spread implies 54.5%) collapses to `ml_spread_anomaly` with `rawEdge` ≤ 0.04.
- `briefingPicks.test.js`:
  - long-shot ML dog (+300+) from cross-market source rejected.
  - large-spread ATS dog (+7 or larger) from cross-market source rejected.
  - non-cross-market totals (series_pace_v1, team_recent_v1) accepted.
  - empty-eligible-set returns empty briefing.
  - production fixture (PHI/MIN/CLE/LAL) yields zero ML/ATS briefing picks; only totals heroes survive.
- `resolveSlidePicks.briefing.test.js` — slide prefers `briefingPicks` when present.
- Existing: HOU/LAL regression, fullSlate contract, hero curation — all green.

---

## 7. Caveats

- The model still has no independent signal (efficiency, pace, injuries). `briefingPicks` therefore tends to favor totals where the trend signal is real. Hero/briefing for ML/ATS will be sparse on most slates until a real signal lands. That's the honest state.
- The `ml_spread_anomaly` flag is conservative (0.15 divergence threshold). Real-life NBA cross-market disagreements can hit 0.10–0.12 organically; we only flag clearly-broken pairs.
- The fix preserves full-slate transparency. /nba/insights still surfaces every game — tracking pills make the editorial classification visible.
