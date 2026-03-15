# Maximus Picks — Internal Model Overview

**Classification:** Internal / Proprietary  
**Last audited:** March 15, 2026  
**Based on:** Live codebase as of audit date  

---

## 1. Executive Summary

### What Maximus Picks Is

Maximus Picks is a proprietary, client-side pick-derivation engine for college basketball. It ingests live game data, market odds, team rankings, championship futures, and ATS (Against the Spread) history, then produces four distinct categories of picks:

1. **Pick 'Ems** — straight-up winner predictions  
2. **Against the Spread (ATS)** — spread-cover recommendations  
3. **Value Leans** — model-vs-market probability gaps  
4. **Game Totals** — over/under directional leans  

### Modeling Philosophy

The model is intentionally **signal-driven, not prediction-maximizing**. It does not attempt to predict every game or guarantee outcomes. Instead, it identifies games where a composite of data signals converges into a *surfaceable edge* — defined as a situation where the model has enough conviction to publicly lean one direction.

Key design choices:

- **Discipline over volume.** The model surfaces at most 5 picks per category and will show fewer (or none) when the board is weak.
- **Market as anchor.** Market lines and moneylines are the heaviest-weighted factor in Pick 'Ems (0.25). The model doesn't try to beat the market from scratch — it looks for cases where other signals (ATS form, rankings, championship odds) create meaningful divergence from what the market implies.
- **Graceful degradation.** When enrichment data is missing, the model doesn't guess — it drops to a lower tier with capped confidence.
- **Explainability built in.** Every surfaced pick carries a natural-language rationale string explaining what drove the lean, what penalties were applied, and what uncertainty exists.
- **No seed worship.** Tournament seed is never a direct model input. A 12-seed that is objectively stronger than a 5-seed will be picked over the 5-seed.

### Discipline vs. Volume Balance

- Up to **5 leans** per category (20 maximum across all four columns).
- If fewer than 4 leans exist in a category, **watch items** are generated as filler (no pick direction, confidence = -1).
- The model uses a **`TARGET_SHOW = 4`** constant to ensure each column has at least 4 items displayed, padding with watches as needed.
- A **`PICKS_PER_SECTION = 5`** hard cap prevents any category from generating more than 5 leans.
- Tournament season applies additional tightening across all categories.

---

## 2. Model Architecture

### Core Files

| File | Role |
|------|------|
| `src/utils/maximusPicksModel.js` | **Primary model.** All pick derivation, scoring, filtering, confidence assignment, rationale generation, and the public `buildMaximusPicks()` API. ~1,455 lines. |
| `src/utils/confidenceSystem.js` | **Display layer.** Confidence tier/label mapping, bar-fill normalization, editorial one-liners, "Maximus Take" top-signal selection, and color theming for slides. |
| `src/utils/bracketMatchupResolver.js` | **Bracket adapter.** Runs bracket matchups through the same signal pipeline as Pick 'Ems, with an additional tournament-history prior layer. |
| `src/utils/tournamentPrior.js` | **Historical upset calibration.** Encodes 13 years of NCAA Tournament upset frequency data (2011–2025) as a lightweight secondary input for bracket predictions. |
| `src/utils/atsCache.js` | **In-memory ATS cache.** 7-minute TTL store for per-team ATS data, used as a fallback when primary ATS sources don't have a team. |
| `src/utils/teamSlug.js` | **Team identity resolver.** Normalizes team names to canonical slugs for data joining. |

### Data Flow

```
Raw Inputs (from API layer)
    ├─ games[]            — ESPN scoreboard + Odds API merged game objects
    ├─ atsLeaders         — { best: [], worst: [] } from ATS pipeline
    ├─ atsBySlug          — slug → { season, last30, last7 } ATS records
    ├─ rankMap            — slug → AP ranking number
    └─ championshipOdds   — slug → { american } championship futures

         │
         ▼

    buildMaximusPicks(opts)      ← single entry point
         │
         ├─ Sort games by start time
         ├─ Deduplicate by team matchup key
         │
         ├─ buildPickEmPicks()   → up to 5 Pick 'Em leans
         ├─ buildSpreadPicks()   → up to 5 ATS leans
         ├─ buildValuePicks()    → up to 5 Value leans
         ├─ buildTotalsPicks()   → up to 5 Totals leans
         │
         ├─ buildXxxWatches()    → fill remaining slots to TARGET_SHOW (4)
         │
         ├─ Tag Top Signal       → single strongest lean across all categories
         │
         └─ Return { pickEmPicks, atsPicks, valuePicks, totalsPicks, mlPicks }
```

### What Is Shared vs. Category-Specific

**Shared globally across all categories:**
- Team slug resolution
- ATS record lookup (3-source fallback: atsBySlug → atsLeaders → atsCache)
- Market line parsing and moneyline-to-implied-probability conversion
- Tournament season detection (`isTournamentSeason()`)
- Confidence label assignment
- Rationale builder pattern
- Top Signal selection
- Pick object shape

**Category-specific:**
- Each category has its own builder function with its own scoring formula, factors, thresholds, and filtering rules
- Rationale builders are category-specific
- Watch item builders are category-specific

**Bracket-only (not used by daily picks):**
- Tournament prior layer (`tournamentPrior.js`)
- Round-by-round dampening
- Seed-band historical upset rates

---

## 3. Pick Categories — Detailed Logic

### 3.1 Pick 'Ems

**Goal:** Predict the straight-up winner of a game.

**Three-tier fallback system:**

| Tier | Trigger | Min Edge | Max Confidence |
|------|---------|----------|----------------|
| Tier 1 (Full model) | ≥ 3 of 4 enrichment categories present | 0.05 | HIGH |
| Tier 2 (Reduced model) | ≥ 1 enrichment category present | 0.04 | MEDIUM |
| Tier 3 (Minimum viable) | Market data only | 0.05 | LOW |

**Enrichment categories counted:** Rankings, Championship Odds, ATS Records, Market Data. At least one team in a pair having the signal counts as "present."

#### Tier 1 Scoring Formula

Each team gets a weighted composite score. The pick goes to the team with the higher score.

```
homeScore = rankSignal       × 0.12   (PE_W_RANKING)
          + champOddsSignal  × 0.18   (PE_W_CHAMP_ODDS)
          + seasonRecSignal  × 0.12   (PE_W_SEASON_REC)
          + last10Signal     × 0.15   (PE_W_LAST10)
          + sosSignal        × 0.08   (PE_W_SOS)
          + atsSignal        × 0.10   (PE_W_ATS)
          + marketSignal     × 0.25   (PE_W_MARKET)
          + homeBump                   (0.03 regular / 0.015 tournament)
```

Weights sum to 1.00 before the home bump. Away team gets the same formula without the home bump, and with `marketSignal` inverted (1 - homeMarketProb).

#### Tier 2 Scoring Formula

Reweighted to rely more heavily on market data when enrichments are sparse:

```
homeScore = market × 0.40 + seasonRec × 0.15 + ats × 0.10
          + rank × 0.10 + champOdds × 0.10 + last30Form × 0.10
          + homeBump
```

#### Tier 3 Scoring Formula

Market signal only:

```
homeScore = marketProb × 0.85 + homeBump + 0.50 × 0.15
```

#### Signal Transform Functions

- **`rankSignal(rank)`**: `clamp(1 - (rank - 1) / 50, 0.20, 0.95)` — Rank 1 → 0.95, Rank 25 → 0.52, Rank 50 → 0.20. Unranked → null (defaults to 0.5).
- **`champOddsSignal(americanOdds)`**: Converts American odds to implied probability, then scales by 2.5x and clamps to [0.10, 0.95]. Championship favorites get stronger signals.
- **`recordSignal(ats)`**: `clamp(coverPct / 100, 0.20, 0.80)` — A team covering 70% → 0.70, covering 40% → 0.40.
- **`marketWinSignal(game)`**: Derives home-team win probability from moneylines (preferred) or spread (fallback via `spreadToWinProb`). Spread conversion: `0.5 - spread × 0.03`, clamped to [0.15, 0.85].
- **SOS proxy**: If a team is ranked ≤ 25, their SOS signal is 0.65; otherwise 0.50. This is a rough proxy — not a true strength-of-schedule metric.

#### Filtering and Suppression

- **Suppress ML ≤ -700**: Extremely lopsided games are excluded entirely — no analytical value.
- **Chalk deflation (ML < -500)**: The sort-ranking edge is multiplied by a chalk factor: `max(0.35, 1 - (|pickML| - 500) / 3000)`. This pushes heavy favorites lower in the sort order so more competitive games rank higher, without removing them entirely.
- **Minimum edge gate**: Must exceed 0.05 (Tier 1), 0.04 (Tier 2), or 0.05 (Tier 3) to be surfaced.

#### Sort Order

Picks are sorted by: Tier (ascending, so Tier 1 first) → then by deflated sort edge (descending). Top 5 are returned.

---

### 3.2 Against the Spread (ATS)

**Goal:** Identify games where one team's ATS cover rate is meaningfully better than the opponent's, adjusted for spread magnitude and public-team bias.

**Three-tier system:**

| Tier | Trigger | Logic |
|------|---------|-------|
| Tier 1 | Both teams have ATS records | Cover-rate differential with spread discount |
| Tier 2 | One team has ATS records | Single-side lean if cover ≥ 53% and sample ≥ 5 |
| Tier 3 | No ATS data | Market spread + ranking heuristic, confidence = LOW |

#### Tier 1 Scoring

```
rawEdge = |homeCoverPct - awayCoverPct|

spreadDiscount = 1.0  (if spreadMag ≤ 7)
               = max(0.50, 1 - (spreadMag - 7) × 0.05)  (if spreadMag > 7)

adjustedEdge = rawEdge × spreadDiscount
```

The pick goes to the team with the higher cover rate.

#### Thresholds

| Threshold | Value | Effect |
|-----------|-------|--------|
| `ATS_EDGE_MIN` | 0.10 (0.12 in tournament) | Minimum adjusted edge to surface |
| `ATS_EDGE_MED` | 0.12 | Medium confidence threshold |
| `ATS_EDGE_HIGH` | 0.18 | High confidence threshold |
| `ATS_SPREAD_SOFT_CAP` | 7 | Spread-discount penalty begins |
| `ATS_SPREAD_PENALTY_RATE` | 0.05 | Per-point penalty above soft cap |
| `ATS_LARGE_SPREAD_GATE` | 10 | Spreads ≥ 10 require HIGH-tier edge (0.18) |

#### Penalties and Gates

- **Public-team penalty**: If the picked team is a favorite AND is on the `PUBLIC_TEAMS` list (Duke, Kentucky, Kansas, UNC, UCLA, Michigan, Arizona), the adjusted edge is reduced by **0.015** before re-checking against the minimum. This accounts for sportsbooks inflating spreads on heavily-bet teams.
- **Big-favorite gate**: If spread ≥ 10 and the pick is on the favorite, the edge must reach HIGH (0.18) to surface.
- **Very-large-spread gate**: If spread ≥ 10 regardless of side, the edge must reach HIGH (0.18).
- **Tournament confidence cap**: During March/April, spreads ≥ 8 have confidence capped at MEDIUM.

#### Tier 3 Heuristic

When no ATS data exists, the model applies a simple heuristic:
- Lean underdog for moderate spreads (3–8 points)
- Lean favorite for large spreads (> 8 points)
- Ranking override: if only one team is ranked, lean the ranked team unless the spread already reflects it
- Confidence is always LOW; edge magnitude is `spreadMag × 0.005`

#### Sort Order

Tier (ascending) → partial flag (full data first) → edge magnitude (descending). Top 5 returned.

---

### 3.3 Value Leans

**Goal:** Identify games where the model's estimated win probability meaningfully exceeds the market-implied probability, creating a theoretical "value" edge.

#### Model Probability Construction

```
atsDiff = homeCoverPct - awayCoverPct

champAdj = (homeChampImplied - awayChampImplied) × 0.15

formBoost = ±0.03  (if lean-side team has last30 ATS ≥ 58%)

homeModelProb = clamp(
    0.5 + atsDiff × 0.40 + 0.015 + champAdj + formBoost,
    0.35, 0.75
)
```

The model probability is then compared to the market-implied probability:

```
value = modelProb - marketImplied
```

#### Thresholds

| Threshold | Value | Effect |
|-----------|-------|--------|
| `VL_VALUE_MIN` | 0.04 (0.05 in tournament) | Minimum value gap to surface |
| `VL_VALUE_MED` | 0.05 | Medium confidence |
| `VL_VALUE_HIGH` | 0.08 | High confidence |
| `VL_AVOID_PRICE` | -350 | Heavy favorites (ML ≤ -350) excluded |
| `VL_ATS_WEIGHT` | 0.40 | ATS cover-rate differential weight in model probability |
| `VL_HOME_BUMP` | 0.015 | Home-team probability nudge |
| `VL_FORM_BONUS` | 0.03 | Bonus when last-30 ATS form aligns (≥ 58%) |

#### Corroboration Gate

Large underdogs (**ML ≥ +300**) must have corroborating data — either a ranking in `rankMap` or championship odds in `championshipOdds` — unless the value gap already reaches HIGH tier (≥ 0.08). This prevents noisy ATS-only signals from surfacing weak underdogs as "value" plays.

#### Sort Order

Picks sorted by value gap descending. Top 5 returned.

---

### 3.4 Game Totals

**Goal:** Detect whether both teams' ATS cover trends agree directionally on an over or under lean.

#### Scoring

```
homeCoverTrend = (homeCoverPct - 50) / 100
awayCoverTrend = (awayCoverPct - 50) / 100
combinedTrend = (homeCoverTrend + awayCoverTrend) / 2
trendMag = |combinedTrend|
```

If `combinedTrend > 0`, lean OVER; if < 0, lean UNDER.

#### Conflict Suppression

If one team trends over (> +0.01) while the other trends under (< -0.01), a **conflict flag** is set. Conflicting totals are suppressed unless `trendMag ≥ 0.12` (the MEDIUM threshold).

#### Thresholds

| Threshold | Value | Effect |
|-----------|-------|--------|
| `TOT_OU_MIN_EDGE` | 0.08 (0.10 in tournament) | Minimum trend magnitude to generate a lean label |
| `TOT_OU_MED_EDGE` | 0.12 | Medium confidence |
| `TOT_OU_HIGH_EDGE` | 0.16 | High confidence |
| Conflict detection | ±0.01 | Threshold for directional disagreement |

#### Important Note on Signal Source

The totals model uses **ATS cover rate as a proxy for scoring pace**. It does not have access to actual pace, offensive efficiency, defensive efficiency, or tempo data. The ATS cover rate reflects whether a team tends to outperform its spread — which has an indirect correlation with scoring environments but is not a direct pace metric. This is a known limitation.

#### Sort Order

Picks sorted by trend magnitude descending. Top 5 returned.

---

## 4. Factor Inventory

### Complete Signal and Input List

| Factor | Source | Used In | Weight/Influence | Notes |
|--------|--------|---------|-----------------|-------|
| **Market moneyline** | Odds API merged game objects | Pick 'Ems, Value Leans | 0.25 in PE Tier 1; used to derive implied probability for value leans | Strongest single signal in Pick 'Ems. Cross-validated against spread for data-quality. |
| **Championship odds** (futures) | `championshipOdds` param | Pick 'Ems, Value Leans, Bracket | 0.18 in PE Tier 1; 0.15× differential in Value Lean champAdj | Converted to implied probability then scaled 2.5×. |
| **ATS cover rate** (last30/season/last7) | `atsBySlug`, `atsLeaders`, `atsCache` | All 4 categories + Bracket | 0.10 in PE Tier 1; primary input for ATS; 0.40 weight in Value probability; sole input for Totals | Fallback priority: last30 → season → last7. Most impactful single data source across the model. |
| **AP ranking** | `rankMap` param | Pick 'Ems, ATS Tier 3, Value corroboration, Bracket | 0.12 in PE Tier 1 | Converted via `rankSignal()`: rank 1 → 0.95, rank 25 → 0.52. |
| **Season record** (via ATS) | Derived from ATS record object | Pick 'Ems | 0.12 in PE Tier 1 | Uses the same `recordSignal()` as ATS cover rate. |
| **Last-10/Last-30 form** | ATS record with `window === 'last30'` | Pick 'Ems, Value Leans | 0.15 in PE Tier 1; triggers VL_FORM_BONUS | Only activates when the ATS window is `last30`. |
| **Strength of schedule (proxy)** | Derived from ranking (≤ 25 → 0.65, else 0.50) | Pick 'Ems, Bracket | 0.08 in PE Tier 1 | Rough proxy, not a true SOS metric. |
| **Point spread** | Game object (homeSpread/awaySpread) | ATS, Pick 'Em Tier 3, market signal fallback | Used for spread discount, spread gates, and as ML fallback | Converted to win probability via `spreadToWinProb()` when ML unavailable. |
| **Market total (O/U line)** | Game object | Totals | Used as the display value and contextual line | Not modeled against — the lean is about direction, not magnitude. |
| **Home court** | Implicit from game structure | Pick 'Ems, Value Leans | 0.03 (regular) / 0.015 (tournament) in PE; 0.015 fixed in Value | Reduced during tournament season to account for neutral courts. |
| **Public-team identity** | Hardcoded team slug list | ATS | -0.015 penalty | 7 teams: Duke, Kentucky, Kansas, UNC, UCLA, Michigan, Arizona. |
| **Tournament season flag** | Calendar-based (March/April) | All 4 categories | Various small tightenings | Not a factor per se, but a modifier on multiple thresholds. |
| **Tournament seed** | Bracket matchup metadata | Bracket only | NOT a direct input; used to look up historical priors | Explicitly excluded from primary scoring. |
| **Historical upset rates** (2011–2025) | Hardcoded in `tournamentPrior.js` | Bracket only | Max adjustment 0.025 (2.5pp) | Per seed-matchup type (1v16 through 8v9). |

---

## 5. Weights and Thresholds — Complete Reference

### 5.1 Pick 'Em Tier 1 Weights

| Constant | Value | Meaning |
|----------|-------|---------|
| `PE_W_MARKET` | **0.25** | Market-implied win probability |
| `PE_W_CHAMP_ODDS` | **0.18** | Championship futures signal |
| `PE_W_LAST10` | **0.15** | Recent form (last 30 ATS window) |
| `PE_W_RANKING` | **0.12** | AP ranking signal |
| `PE_W_SEASON_REC` | **0.12** | Season ATS record signal |
| `PE_W_ATS` | **0.10** | ATS cover rate signal |
| `PE_W_SOS` | **0.08** | Strength-of-schedule proxy |
| `PE_HOME_BUMP` | **0.03** (regular) / **0.015** (tournament) | Home-court additive bonus |

### 5.2 Pick 'Em Edge Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `PE_MIN_EDGE_T1` | 0.05 | Tier 1 minimum edge |
| `PE_MIN_EDGE_T2` | 0.04 | Tier 2 minimum edge |
| `PE_MIN_EDGE_T3` | 0.05 | Tier 3 minimum edge |
| `PE_HIGH_EDGE` | 0.14 | HIGH confidence threshold |
| `PE_MED_EDGE` | 0.07 | MEDIUM confidence threshold |

### 5.3 Pick 'Em Chalk Control

| Constant | Value | Meaning |
|----------|-------|---------|
| `PE_CHALK_ML` | -500 | ML threshold where sort deflation begins |
| `PE_CHALK_FLOOR` | 0.35 | Minimum deflation factor (65% reduction) |
| `PE_SUPPRESS_ML` | -700 | ML threshold where picks are fully suppressed |

### 5.4 ATS Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `ATS_EDGE_MIN` | 0.10 (0.12 in tournament) | Minimum adjusted edge |
| `ATS_EDGE_MED` | 0.12 | MEDIUM confidence threshold |
| `ATS_EDGE_HIGH` | 0.18 | HIGH confidence threshold |
| `ATS_PUBLIC_PENALTY` | 0.015 | Edge reduction for public-team favorites |
| `ATS_SPREAD_SOFT_CAP` | 7 | Spread-magnitude penalty begins |
| `ATS_SPREAD_PENALTY_RATE` | 0.05 | Per-point penalty above soft cap |
| `ATS_LARGE_SPREAD_GATE` | 10 | Spread ≥ 10 requires HIGH edge |
| `ATS_PARTIAL_COVER_MIN` | 0.53 (53%) | Tier 2: min cover rate for single-side lean |
| `ATS_PARTIAL_SAMPLE_MIN` | 5 | Tier 2: min sample size |

### 5.5 Value Lean Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `VL_VALUE_MIN` | 0.04 (0.05 in tournament) | Minimum value gap |
| `VL_VALUE_MED` | 0.05 | MEDIUM confidence |
| `VL_VALUE_HIGH` | 0.08 | HIGH confidence |
| `VL_AVOID_PRICE` | -350 | Exclude heavy favorites |
| `VL_ATS_WEIGHT` | 0.40 | ATS differential weight in model probability |
| `VL_HOME_BUMP` | 0.015 | Home probability nudge |
| `VL_FORM_BONUS` | 0.03 | Bonus for aligned last-30 ATS ≥ 58% |
| `VL_LONGSHOT_ML` | +300 | Corroboration gate trigger for large underdogs |

### 5.6 Totals Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `TOT_OU_MIN_EDGE` | 0.08 (0.10 in tournament) | Minimum trend magnitude for lean label |
| `TOT_OU_MED_EDGE` | 0.12 | MEDIUM confidence |
| `TOT_OU_HIGH_EDGE` | 0.16 | HIGH confidence |
| Conflict threshold | ±0.01 | Directional disagreement detection |

### 5.7 Tournament Season Adjustments

| Constant | Value | Applied To |
|----------|-------|-----------|
| `PE_HOME_BUMP_TOURN` | 0.015 | Pick 'Ems — halved neutral-court bump |
| `ATS_TOURN_EDGE_BUMP` | +0.02 | ATS — raises min edge from 0.10 → 0.12 |
| `VL_TOURN_VALUE_BUMP` | +0.01 | Value — raises min from 0.04 → 0.05 |
| `TOT_TOURN_EDGE_BUMP` | +0.02 | Totals — raises min from 0.08 → 0.10 |
| `ATS_TOURN_CONF_SPREAD` | 8 | ATS — cap confidence at MEDIUM for spreads ≥ 8 |

### 5.8 Bracket Resolver Weights

The bracket resolver duplicates the core Pick 'Em signal weights:

| Weight | Value |
|--------|-------|
| `W_RANKING` | 0.12 |
| `W_CHAMP_ODDS` | 0.18 |
| `W_SEASON_REC` | 0.12 |
| `W_LAST10` | 0.15 |
| `W_SOS` | 0.08 |
| `W_ATS` | 0.10 |
| `W_MARKET` | 0.25 |

No home bump in bracket matchups (assumed neutral court).

### 5.9 Tournament Prior Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `MAX_PRIOR_ADJUSTMENT` | 0.025 | Maximum upset-prior score adjustment (~2.5pp win probability) |
| `PRIOR_SCALE` | 0.06 | Scaling factor for raw excess rate |
| Round dampening (Rd 1) | 1.00 | Full prior activation |
| Round dampening (Rd 2) | 0.60 | 60% prior strength |
| Round dampening (Rd 3) | 0.35 | 35% |
| Round dampening (Rd 4) | 0.20 | 20% |
| Round dampening (Rd 5) | 0.10 | 10% |
| Round dampening (Rd 6) | 0.05 | Championship game — near-zero prior |

### 5.10 Historical Upset Rates (Round of 64)

| Matchup | Historical Rate | Baseline Model Rate | Excess (prior driver) |
|---------|----------------|--------------------|-----------------------|
| 1 vs 16 | 2% | 2% | 0% |
| 2 vs 15 | 8% | 7% | 1% |
| 3 vs 14 | 15% | 12% | 3% |
| 4 vs 13 | 22% | 17% | 5% |
| 5 vs 12 | 36% | 28% | **8%** |
| 6 vs 11 | 37% | 30% | **7%** |
| 7 vs 10 | 40% | 33% | **7%** |
| 8 vs 9 | 49% | 45% | 4% |

The 5/12, 6/11, and 7/10 matchups have the largest excess rates — these are where the tournament prior has the most influence.

---

## 6. Confidence System

### Assignment Logic

Confidence is a 3-level integer: **0** (LOW), **1** (MEDIUM), **2** (HIGH).

Each category uses its own edge thresholds:

| Category | HIGH (≥) | MEDIUM (≥) | LOW (<) |
|----------|----------|------------|---------|
| Pick 'Em | 0.14 | 0.07 | 0.07 |
| ATS | 0.18 | 0.12 | 0.12 |
| Value | 0.08 | 0.05 | 0.05 |
| Totals | 0.16 | 0.12 | 0.12 |

### Confidence Caps and Overrides

- **Tier cap (Pick 'Ems):** Tier 2 → max MEDIUM. Tier 3 → max LOW.
- **Tournament ATS cap:** Spreads ≥ 8 during March/April → max MEDIUM.
- **Bracket enrichment cap:** 0 enrichments → forced LOW. ≤ 1 enrichment → max MEDIUM.
- **ATS Tier 2:** Cover ≥ 65% → MEDIUM, otherwise LOW.
- **ATS Tier 3:** Always LOW.

### Display Layer (`confidenceSystem.js`)

The display layer maps integer confidence to:

- **Labels:** `getConfidenceLabel()` → 'HIGH', 'MEDIUM', 'LOW'
- **Color tiers:** Green (high), gold (medium), steel-blue (low)
- **Bar fill:** Normalized 0–100 scale within tier-specific bands (LOW: 10–33, MEDIUM: 34–66, HIGH: 67–100)
- **Editorial lines:** Category-specific one-liners that describe the edge in natural language
- **Edge text:** Formatted as `+X%` or `+Xpp`

### Maximus Take (Top Signal Selection)

The `getMaximusTake()` function selects the single most editorially interesting pick across all categories using a scoring formula:

```
editorialScore = confidence × 2 + edgeMag + typeBoost
```

Where `typeBoost` is: value (+0.25), total (+0.15), ats (+0.05), pickem (0). This means value and total picks get a slight editorial preference when scores are close, because they tell a more compelling "story of the board."

Only picks with confidence ≥ 1 (MEDIUM+) are eligible.

### Top Signal Flag

Separately, `buildMaximusPicks` tags one pick as `isTopSignal = true` using a simpler formula: `confidence × 10 + edgeMag`. This is a raw-strength measure rather than an editorial one.

---

## 7. Tournament / March Madness Logic

### Tournament Season Detection

```javascript
function isTournamentSeason() {
  const m = new Date().getMonth();
  return m === 2 || m === 3; // March, April
}
```

This is a calendar-based flag. It activates for all games during March and April, covering conference tournaments (early-mid March), NCAA Tournament (mid-March through early April), and the Final Four / Championship.

### What Changes in Tournament Season

1. **Home bump halved** (0.03 → 0.015) — most tournament games are at neutral sites
2. **ATS minimum edge raised** (+0.02) — regular-season cover rates are less predictive in postseason
3. **Value minimum raised** (+0.01) — tighter bar for value gap qualification
4. **Totals minimum raised** (+0.02) — scoring patterns can shift in tournament environments
5. **ATS confidence capped** at MEDIUM for spreads ≥ 8 — large spreads in tournament rarely hold
6. **Rationale strings** explicitly note tournament context

### Tournament Prior Layer (Bracket Only)

The tournament prior is a **secondary calibration layer** that only activates within the bracket resolver. It is NOT used by daily picks.

**How it works:**

1. Look up the seed matchup (e.g., 5 vs 12) in the historical upset rate table
2. Compute the "excess rate" = historical rate minus what a quality-based model would imply
3. Apply dampening by round (full in Round 1, near-zero by Championship)
4. Apply edge gating — the prior only matters when the main model edge is small:
   - Main edge < 0.06 → full prior (1.0×)
   - Main edge < 0.10 → partial prior (0.6×)
   - Main edge < 0.14 → minimal prior (0.25×)
   - Main edge ≥ 0.14 → **zero prior** (strong model edges are never overridden)
5. Cap the adjustment at 0.025 (2.5pp maximum win-probability shift)
6. Always adjust in the underdog's direction

**Key design principle:** The prior can nudge close calls but can never override the main model. A strong model opinion always wins.

### Seed as a Non-Input

Seed number is explicitly not used as a model input for determining the winner. The code comments state: *"Seed is explicitly NOT used as a model input — it is display/context only. A 12-seed that is objectively stronger will be picked over a 5-seed."*

Seed is only used to:
1. Look up the historical upset rate table
2. Determine `isUpset` flag (display/reporting only)
3. Determine which team is the "underdog" for the prior adjustment direction

---

## 8. Pick Surfacing / Ranking Logic

### Per-Category Cap

Each category returns at most **`PICKS_PER_SECTION = 5`** lean items.

### Watch Item Padding

If a category produces fewer than **`TARGET_SHOW = 4`** leans, watch items fill the gap. Watch items have `itemType: 'watch'`, `confidence: -1`, and a `watchReason` string like "Monitoring — edge below threshold."

### How Picks Are Ranked (Sort Order)

| Category | Primary Sort | Secondary Sort | Tertiary Sort |
|----------|-------------|----------------|---------------|
| Pick 'Ems | Tier (ascending) | Deflated sort edge (descending) | — |
| ATS | Tier (ascending) | Partial flag (full first) | Edge magnitude (descending) |
| Value | Value gap (descending) | — | — |
| Totals | Trend magnitude (descending) | — | — |

### Top Signal Selection

After all categories are built, the system selects a single **Top Signal** across all categories. The scoring formula is `confidence × 10 + edgeMag`. The highest-scoring lean gets `isTopSignal = true`.

### Category Quota Behavior

There is no cross-category prioritization in the model itself. Each category independently selects its top 5. A board could theoretically show 5 Pick 'Ems, 5 ATS, 5 Value, and 5 Totals (20 leans) if the data supports it, or it could show mostly watch items if the board is weak.

### Board Briefing

The `buildBoardBriefing()` function analyzes the composition of leans across categories to generate a natural-language board summary:

- Detects whether the board is **spread-heavy**, **value-heavy**, **totals-heavy**, **pickem-heavy**, or **mixed** (using a weighted scoring formula with a 45% concentration threshold)
- Rotates headline templates daily based on day-of-year
- Appends tone modifiers: "favorites heavy", "underdog value active", "light signals", "sharp board"
- Assigns board strength: **Strong** (4+ HIGH leans or 12+ total), **Moderate** (default), **Light** (≤ 4 leans, 0 HIGH)

---

## 9. Explainability / Rationale Layer

### Rationale Generation

Each pick category has a dedicated rationale builder that constructs a multi-sentence natural-language explanation:

- **Pick 'Ems** (`buildPickEmRationale`): Explains tier level, edge magnitude, ranking advantage, ATS form, home-court context, favorite/underdog framing, and tournament environment.
- **ATS** (`buildAtsRationale`): Explains cover-rate differential, public-team penalty, spread-magnitude penalty, close-line advantage, confidence tier, and tournament context.
- **Value** (`buildValueRationale`): Explains model-vs-market probability gap, underdog pricing, form bonus, confidence tier, and tournament uncertainty for longshots.
- **Totals** (`buildTotalsRationale`): Explains combined trend direction, conflict status, confidence tier, and tournament pace caveat.

### Rationale Examples

Pick 'Em: *"Full-model composite edge of 12pp favors Duke. Ranking advantage: #5 vs unranked. Strong recent form — 68% ATS cover rate. Moderate favorite — line already prices in most of the edge. Tournament environment increases variance."*

ATS: *"ATS differential: 65% vs 42% (18pp adjusted edge). Public-team spread discount applied — overbet favorite adjustment. Large spread (12) — spread-magnitude penalty applied. Edge exceeds HIGH threshold after spread-discount adjustment. Tournament environment — regular-season cover rates carry more variance."*

Value: *"Model win probability (42%) exceeds market implied (33%) by 9pp. Underdog pricing suggests the market may be undervaluing this matchup. Recent form (last 30 ATS) aligns with model lean — form bonus applied. Value gap exceeds HIGH threshold — strongest model-vs-market divergence."*

### Signal Arrays

Each pick also carries a `signals[]` array with shorter bullet-point items (e.g., "Top 25 ranking edge (#3)", "Market implied 71% win probability", "Home court advantage"). These are used for compact display in UI cards.

### Editorial One-Liners

`confidenceSystem.js` provides `getEditorialLine(pick)` — a single sentence summary that varies by category and confidence tier. Examples:

- HIGH ATS: *"ATS form differential and spread-adjusted edge both exceed top tier"*
- MEDIUM Value: *"Meaningful model-vs-market probability gap detected"*
- LOW Total (under): *"Marginal lean toward the under — proceed with caution"*

### Caption Layer

The caption builder (`buildCaption.js`) generates Instagram-ready text from pick objects. It uses:
- `getConfidenceLabel()` for tier labels
- `getMaximusTake()` for top-signal editorial summaries
- Phrase variation via hash-based rotation for non-repetitive captions
- Compliant language: "leans", "value edge", "data-driven" — never "lock", "guarantee", "free money"

---

## 10. Surface Propagation

### Single Shared Pipeline

All surfaces consume the same `buildMaximusPicks()` output. There is no surface-specific model logic. The same pick objects, confidence values, and rationale strings are used everywhere:

| Surface | Entry Point | What It Uses |
|---------|-------------|-------------|
| **Home page** | `Home.jsx` → `MaximusPicks.jsx` | Full picks output, `buildPicksSummary()`, `buildBoardBriefing()` |
| **College Basketball Picks Today** (SEO page) | `CollegeBasketballPicksToday.jsx` | Full picks output via `buildMaximusPicks()` |
| **Odds Insights** | `Insights.jsx` | Full picks output |
| **Content Studio / Dashboard** | `Dashboard.jsx` | Picks output used for template generation |
| **IG Maximus Picks slides** | `MaxPicksHeroSlide`, `MaxPicksPickemsSlide`, `MaxPicksATSSlide`, `MaxPicksValueSlide`, `MaxPicksTotalsSlide`, `MaxPicksUpsetsSlide` | Individual category arrays from picks output |
| **IG Odds Insights slides** | `OddsInsightsSlide1–4` | Same picks output |
| **Team Intel slides** | `TeamIntelSlide3`, `TeamIntelSlide4` | Picks filtered to specific team matchup |
| **Game Preview slides** | `GamePreviewSlide2`, `GamePreviewSlide3` | Picks filtered to specific game |
| **5-Game Insights slide** | `GameInsights5GamesSlide` | `atsPicks` and `mlPicks` arrays |
| **Captions** | `buildCaption.js` | `getConfidenceLabel()`, `getMaximusTake()` from confidenceSystem |
| **Home stats widget** | `DynamicStats.jsx` | Pick counts from `buildMaximusPicks()` |
| **Chat summary** | `buildPicksSummary()` | Top lean from each category |
| **Shared take card** | `MaximusTakeCard.jsx` | `getMaximusTake()`, `getSlideColors()`, `getConfidenceLabel()` |

### Bracketology (Separate Pipeline)

Bracketology uses `bracketMatchupResolver.js`, which shares the same **signal weights** as Pick 'Ems but has its own architecture:
- No home bump (neutral court)
- Tournament prior layer integrated
- Resolves entire bracket iteratively (round by round)
- Returns `{ winner, loser, confidence, rationale, isUpset, winProbability, tournamentPrior }`

The bracket resolver does NOT call `buildMaximusPicks()`. It is a parallel pipeline that shares philosophy and weights but operates independently.

### What Is Universal vs. Surface-Specific

**Universal (identical everywhere):**
- Pick objects and their properties
- Confidence values
- Edge magnitudes
- Rationale strings
- Signals arrays
- Top Signal tagging

**Surface-specific (presentation only):**
- Colors and bar fills (via `confidenceSystem.js`)
- Slide layouts and typography
- Caption phrasing and hashtags
- Which category arrays are rendered (some slides show only ATS, etc.)

---

## 11. Model Strengths

### Where the Model Is Strongest

1. **Market-anchored architecture.** By giving market lines 25% weight and using them as the probability backbone for value leans, the model avoids the common trap of thinking it can outsmart the market from scratch. It looks for *divergence*, not replacement.

2. **Graceful degradation.** The three-tier fallback system means the model always has an opinion, but honestly labels how confident it can be. A Tier 3 pick is never labeled HIGH.

3. **ATS as a systematic edge detector.** The ATS category has the most disciplined filtering pipeline: spread-magnitude penalties, public-team adjustments, large-spread gates, and tournament caps. The layered penalties create a strong noise filter.

4. **Chalk suppression.** Automatically deflating heavy favorites in sort order ensures the card surfaces analytically interesting picks rather than just obvious outcomes.

5. **Explainability is first-class.** Every pick carries a human-readable rationale that traces the logic. This makes the product feel credible and trustworthy — users can see *why*, not just *what*.

6. **Tournament prior discipline.** The historical upset prior is carefully gated: it never overrides strong model opinions, it dampens by round, and its maximum effect is capped at 2.5pp. This avoids the common trap of over-weighting seed-based expectations.

7. **Corroboration requirement for value underdogs.** Requiring ranking or championship-odds data for large underdog value plays prevents false-positive signals driven by noisy ATS data alone.

### Design Choices That Build Trust

- The model will show an empty or mostly-watch column rather than surfacing thin edges
- Rationale strings openly acknowledge uncertainty ("Tournament environment increases variance")
- Confidence labels are conservative (HIGH requires substantial edge)
- Public-team bias is explicitly modeled and disclosed

---

## 12. Model Weaknesses / Risk Areas

### Known Limitations

1. **ATS cover rate as universal proxy.** The model relies heavily on ATS cover rate for multiple purposes: ATS picks (directly), Value Lean probability estimation (40% weight), and Totals direction. ATS cover rate is a useful signal but is noisy for teams with small sample sizes, and it conflates multiple causal factors (team quality, schedule, line movement, public betting).

2. **No true pace/efficiency data for Totals.** The Totals model uses ATS cover trends as a proxy for scoring environment. It does not have access to actual offensive/defensive efficiency, pace, or tempo statistics. This means a team that covers spreads by playing good defense (suppressing totals) is treated the same as one that covers by scoring more.

3. **SOS is a rough proxy.** Strength of schedule is approximated as "ranked ≤ 25 → 0.65, else 0.50." This captures only the coarsest signal. A team ranked 26th with a brutal schedule gets the same SOS signal as an unranked mid-major with a weak schedule.

4. **No injury / lineup awareness.** The model has no access to injury data, lineup changes, or rest patterns. A star player being out can dramatically change a game's outlook without affecting any of the model's inputs.

5. **Tournament season detection is calendar-based.** The `isTournamentSeason()` function uses month-of-year (March/April), not actual game metadata. Early-season games in March (if any existed) would get tournament treatment, and late-February conference tournament games would not.

6. **Value Lean model probability is clamped to [0.35, 0.75].** This prevents the model from ever estimating a team's win probability above 75% or below 35%, which may be too conservative for extreme matchups.

7. **ATS data availability is variable.** Some teams (especially mid-majors) may not appear in the ATS leaders data. The model falls back to Tier 2 or Tier 3, but these tiers have fundamentally less signal.

8. **Championship odds can be stale.** Futures markets update slowly and may not reflect recent performance changes. A team that's been on a 10-game losing streak might still carry favorable championship odds from early-season expectations.

9. **No cross-game correlation.** Each game is evaluated independently. The model doesn't account for correlated outcomes (e.g., two teams from the same conference tournament playing on the same day with shared fatigue/rest patterns).

### Areas Where Future Iteration Would Help Most

- Integrating actual pace/efficiency data (e.g., KenPom) for Totals and as a secondary signal for Pick 'Ems
- Adding a true SOS metric from team schedule data
- Injury/lineup integration
- Game-specific context detection (tournament vs. regular season vs. rivalry) rather than calendar-based
- More sophisticated value probability model that incorporates ranking and futures directly rather than relying primarily on ATS differential

---

## 13. Glossary / Plain-English Summary

### How Maximus Picks Works (Non-Technical)

**What it does:** Maximus Picks is an analytics engine that scans every college basketball game on the daily board and identifies the ones where the data says there's a meaningful lean. It produces four types of picks: straight-up winner predictions, against-the-spread recommendations, market-value opportunities, and over/under totals leans.

**How it decides:** For each game, the model combines up to seven data signals — market odds, championship futures, team rankings, recent performance trends (ATS cover rates), season records, and strength-of-schedule estimates. Each signal is weighted, with market odds carrying the most influence (25%) because the market is usually efficient. The model looks for spots where these other signals *disagree* with the market enough to suggest an edge.

**What makes it disciplined:** The model has multiple layers of filtering to prevent bad picks from surfacing. Heavy favorites are automatically deprioritized. Large-spread picks face extra scrutiny. Teams that the public bets heavily on (Duke, Kentucky, etc.) have their edges discounted. During March Madness, all thresholds are tightened because tournament environments are more volatile than regular season. And underdogs can only surface as value plays if they have corroborating data beyond just their ATS record.

**What makes it credible:** Every pick includes a plain-English explanation of why the model leans that direction. If there's uncertainty, the rationale says so. If data is missing, the pick is labeled as lower confidence. The model would rather show fewer picks than surface weak ones.

**What makes it proprietary:** The specific combination of signal weights, threshold tuning, tier-based fallback logic, public-team penalties, chalk suppression mechanics, tournament-season calibration, and historical upset priors creates a system that is unique to Maximus Sports. No other platform combines these exact signals in this exact architecture with this explainability layer.

**How it handles March Madness:** During tournament season, the model gets more conservative: home-court advantage is reduced (neutral courts), ATS and value thresholds are tightened, and large-spread picks have their confidence capped. For bracketology specifically, a historical upset-probability layer nudges close matchups toward the underdog in seed bands that historically produce upsets (5v12, 6v11, 7v10, 8v9) — but this nudge is small and is never allowed to override a strong model opinion.

**The bottom line:** Maximus Picks is designed to surface *true edge, not just obvious outcomes*. It balances signal strength, risk awareness, and transparency in a way that makes the product feel smart, honest, and trustworthy.

---

*This document reflects the model as implemented in the codebase at audit time. It should be updated when significant model changes are made.*
