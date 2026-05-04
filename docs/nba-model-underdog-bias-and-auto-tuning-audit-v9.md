# NBA Model — Underdog-Bias & Auto-Tuning Audit (v9)

Date: 2026-05-03
Branch: `claude/practical-williamson-21bc72`
Symptoms (from `/nba/insights`):
- ML picks: PHI +238, MIN +490, CLE +130, LAL +729 — every underdog.
- ATS picks: PHI +7.5, MIN +13, CLE +3, LAL +16 — every underdog.

Universal underdog selection across multiple slates is **not** a chance-clustering pattern; it is a sign of a systemic mis-calibration between the model probability the engine evaluates and the no-vig market probability it compares against.

---

## 1. Underdog-bias audit

### 1.1 Where the data flows

```
ESPN scoreboard           api/nba/live/_normalize.js
   │
   ▼
Odds-API (h2h+spread+total)  api/nba/live/_odds.js
   │  ── parseOddsEvent: median(spread, total, mlAway, mlHome) per game
   │  ── enrichGamesWithOdds: writes
   │       game.market.moneyline = { away, home }
   │       game.market.pregameSpread = home-side line       (negative ⇒ home favorite)
   │       game.market.pregameTotal  = book total
   │       game.model.fairSpread     = -(probDelta * 16.67) (DERIVED FROM ML)
   │       game.model.pregameEdge    =  fairSpread - spread (DERIVED FROM ML)
   │
   ▼
Fair-total resolver        api/_lib/seriesPaceFairTotal.js
   ├─ tier 1: series-pace prior finals (≥ 2 games same pair)
   ├─ tier 2: team-recent total average (≥ 2 priors either team)
   └─ tier 3: slate baseline (always tracking)
   │
   ▼
buildNbaPicksV2            src/features/nba/picks/v2/buildNbaPicksV2.js
   ├─ deriveWinProbs(game)            ← uses pregameEdge → tanh sigmoid
   ├─ toMatchup(game)                 ← maps spread.awayLine = -pregameSpread
   ├─ moneylineToImplied(price)       ← American → implied (per side, with vig)
   ├─ ML candidate
   │     rawEdge = modelProb − impliedProb        (per side)
   ├─ Spread candidate
   │     rawEdge = (winProb − implied) * 0.9      (per side)
   ├─ Total candidate
   │     totalDelta = expectedTotal − marketTotal
   ├─ computeBetScore + maybePenalize (large spread)
   └─ applyDiscipline (fullSlate mode — never drops)
   │
   ▼
assignTiers + coverage     src/features/mlb/picks/v2/tier.js
   │
   ▼
fullSlatePicks / heroPicks / byGame
   │
   ▼
writePicksRun → Postgres   api/_lib/picksHistory.js
   │
   ▼
GET /api/nba/picks/built   api/nba/picks/built.js  (2-min cache)
   │
   ▼
useCanonicalPicks → NbaFullSlateBoard
```

### 1.2 Moneyline: root cause

The engine has **no independent NBA win-probability model**. `deriveWinProbs` synthesizes `homeWinProb` from `game.model.pregameEdge`, which is itself derived from the **same** moneyline odds the engine then uses as the implied probability — the comparison is a closed loop with a flawed conversion in the middle:

```js
// _odds.js (current)
const impliedProb = ml<0 ? abs(ml)/(abs(ml)+100) : 100/(ml+100);
const probDelta   = impliedProb - 0.5;
fairSpread        = -(probDelta * 16.67);              //  ←  NBA points-per-prob factor is wrong
pregameEdge       = fairSpread - spread;

// buildNbaPicksV2 (current)
const homeProb    = clamp01(0.5 + tanh(pregameEdge * 0.12) * 0.5);
const awayProb    = 1 - homeProb;
```

**The 16.67 coefficient is the problem.** A 1-point NBA spread is worth roughly **3.0–3.5%** of win probability (Massey/Pinnacle calibration). That implies the right conversion for a 25% prob delta is roughly **±7 points**, not ±4.2. The current code's 16.67 is closer to the NFL relationship (Wong's classic *points-per-prob* curve), and it shrinks every spread toward zero.

Concrete failure for a 7-point home favorite priced at -350 / +280:

| step | value | with correct factor |
|---|---|---|
| home implied (raw) | 0.778 | 0.778 |
| probDelta | 0.278 | 0.278 |
| fairSpread (16.67) | -4.6 | (28) → -7.8 |
| market spread | -7.0 | -7.0 |
| pregameEdge | **+2.4 (against home)** | -0.8 (slightly against home) |
| homeWinProb (tanh sigmoid) | **0.638** | 0.452 |
| awayWinProb | 0.362 | 0.548 |
| home edge (model-implied) | 0.638 - 0.778 = **-0.14** | -0.33 |
| away edge | 0.362 - 0.222 = **+0.14** | +0.33 |

Because the synthetic `homeWinProb` is **mathematically guaranteed** to come out lower than the moneyline-implied probability for any home favorite, the **away/underdog edge is mathematically guaranteed positive** — and the builder picks the side with the highest rawEdge.

This explains every screenshot:
- PHI +238: BOS likely -260 home; bug picks PHI.
- MIN +490: OKC -650 home; bug picks MIN.
- CLE +130: IND -150 home; bug picks CLE.
- LAL +729: MIN -1000 home; bug picks LAL.

The same closed-loop bias applies regardless of which side is the home/away favorite — the side with `priceAmerican > 0` (the underdog) always wins the rawEdge race.

#### Answers to the audit questions

1. *How is ML edge calculated?* `modelProb − impliedProb` per side, where `impliedProb` is the **per-side raw American-odds implied probability** (not no-vig).
2. *Where do we convert American odds → implied prob?* `moneylineToImplied()` in `buildNbaPicksV2.js` and a duplicate inside `_odds.js`. Both correct in isolation.
3. *Are away/home odds correctly mapped after Odds API normalization?* Yes — v8 fix tracks the `reversed` flag.
4. *Are ESPN odds and Odds API odds using the same team order?* ESPN provides spreads but no per-team ML; Odds API now provides both with verified ordering. ✅
5. *Is `selectionSide` aligned with `awayTeam`/`homeTeam`?* Yes — `mlSides[].side` drives the `selection.side`. ✅
6. *Is the builder accidentally choosing the worse implied probability?* No, it sorts by edge — but the edges themselves are wrong (root cause).
7. *Is the model selecting positive payout rather than positive expected value?* **Effectively yes** — because the synthetic edge is biased to the underdog, the price-positive side always wins.
8. *Is `rawEdge` signed correctly?* Yes (`modelProb − implied`), but the model side of that subtraction is poisoned.
9. *Is underdog floor logic pushing the model toward underdogs?* `marketGates.moneyline.minUnderdogEdge: 0.04` is a *gate* that filters out weak underdogs in legacy `publish` mode. In v8 fullSlate mode it is **never read** (line ~407 comment). It does not cause the bias, but it also does not stop it.
10. *Is the fallback spread-derived implied probability causing underdog bias?* In games where ML odds are missing (`spread` source), the spread-derived implied prob is correct in direction but the **model probability is still wrong**, so the bias persists.
11. *Are missing ML odds forcing spread fallback too often?* Less than 10% of slates in observed data; bias is universal regardless.
12. *Why are all current ML selections underdogs?* See concrete table above — closed-loop synthesis with a broken `points-per-prob` constant flips edge sign for every favorite.

### 1.3 Spread / ATS: root cause

```js
// buildNbaPicksV2.js, current
{ side: 'away', line: m.spread.awayLine, rawEdge: (score.awayWinProb - (implAway ?? 0.5)) * 0.9 }
{ side: 'home', line: m.spread.homeLine, rawEdge: (score.homeWinProb - (implHome ?? 0.5)) * 0.9 }
```

ATS is **using the same biased win-prob vs. moneyline-implied delta** that ML uses, multiplied by 0.9. That is wrong on two levels:

1. **ATS edge has nothing to do with ML implied probability.** A spread pick is a bet on whether the projected scoring margin clears the line, not on who wins straight up.
2. Because the input is the same biased delta, ATS picks the same side ML does (underdog) every time.

The screenshots confirm: ATS picks (PHI +7.5, MIN +13, CLE +3, LAL +16) are the same side as the ML pick on every game.

#### Answers to the audit questions (ATS)

1. *How is spread edge calculated?* See above — same ML-implied delta * 0.9. Wrong.
2. *Is `line_value` side-specific?* `awayLine = -pregameSpread`, `homeLine = pregameSpread`. Correct.
3. *Is `line_value` already side-specific or being flipped again?* Side-specific. Not double-flipped.
4. *Are favorite and underdog spreads mapped correctly?* Yes (sign is preserved).
5. *Is the model selecting the team with the larger absolute spread value?* No — it selects the side with the higher synthetic rawEdge (underdog).
6. *Is the discipline layer suppressing favorites?* It can cap large spreads ≥ 8 absolute, but does not flip favorite/underdog selection. Not the cause.
7. *Why are all current ATS selections underdogs?* They piggy-back on the broken ML synthesis.

### 1.4 Totals: status

Totals do **not** show the same bias because their math is direction-driven by `expectedTotal − marketTotal`, with `expectedTotal` coming from a real (small-sample) signal: series pace → team-recent → slate baseline.

Caveats observed in fixtures:
- For a 4-team early-round slate the chain often falls back to `slate_baseline_v1` (lowest confidence) — those picks are flagged `lowSignal: true` but display alongside hero picks without a source label in the UI today.
- Historical-closing-total trend is **not yet** part of the chain.
- ESPN historical scores are loaded only in the past-7-day window for playoff-context purposes; they are not folded into a totals trend signal.

---

## 2. Data-flow audit

Confirmed by reading the source (no live debug yet — will add `?debug=1` in §6 of the fix):

| stage | file | issue |
|---|---|---|
| odds parse | `api/nba/live/_odds.js` | `fairSpread = -(probDelta * 16.67)` — **WRONG NBA constant** |
| pregameEdge | `_odds.js` | derived from same ML, then re-used as model input — **closed loop** |
| deriveWinProbs | `buildNbaPicksV2.js` | tanh sigmoid is fine — but its input is poisoned |
| ML candidate | `buildNbaPicksV2.js` | uses raw (vigged) implied prob — **no de-vig** |
| ATS candidate | `buildNbaPicksV2.js` | uses ML delta as cover-edge proxy — **wrong market** |
| Totals candidate | `buildNbaPicksV2.js` | OK direction; missing historical-totals signal |
| persistence | `picksHistory.js` | persists `raw_edge`, `selection_side` — auditable ✅ |
| run-audit | `cron/nba/run-audit.js` | calls `analyzePicks` from MLB; no underdog/favorite slice ❌ |
| UI | `NbaFullSlateBoard.jsx` | no source label for spread-derived ML or low-signal totals |

---

## 3. Auto-tuning / daily learning audit

| capability | current state | gap |
|---|---|---|
| `picks_runs` | written by `writePicksRun` ✅ | — |
| `picks` | written + graded ✅ | — |
| `pick_results` | settled by cron ✅ | — |
| `picks_daily_scorecards` | built daily ✅ | — |
| `picks_config` | active config in DB if present, otherwise `NBA_DEFAULT_CONFIG` | — |
| `picks_tuning_log` | written by run-audit (sample ≥ 15) ✅ | — |
| `picks_audit_artifacts` | written by run-audit ✅ | — |
| run-audit reads yesterday's results | yes (`getPicksForSlate`) ✅ | — |
| analyzes by market | yes ✅ | — |
| analyzes by side **(home/away)** | yes ✅ | does not slice **fav vs dog** |
| analyzes by spread bucket | no ❌ | needed by P4 |
| analyzes by totals source | no ❌ | needed by P4 |
| produces tuning suggestions | yes (rule-of-thumb) | misses the underdog-bias regime |
| writes shadow config | yes (sample ≥ 15) | works |
| auto-applies | **no** — strict shadow-only ✅ | safe |
| guardrails against single-day overfit | implicit (shadow only) ✅ | will keep |

The auto-tuning loop **structurally exists** but its `analyzePicks` is the MLB module and has **no concept of favorite-vs-underdog or of an "all-underdog" regime**. So even with weeks of underdog losses it would not flag the systemic bias.

---

## 4. Plan (delta vs current)

The fix is mechanical and self-contained. We will:

1. **Replace the closed-loop ML synthesis** with an honest no-vig comparison plus a *spread-derived* model probability that is independent of the moneyline. This lets us still pick a side per game without inventing confidence we don't have.
2. **Fix ATS** to use *projected margin vs. line* (cover edge), where the projected margin comes from the de-vigged moneyline (the only honest signal we have today). The two markets cross-check rather than collude.
3. **Add a real Totals history helper** (`api/_lib/nbaTotalsHistory.js`) using ESPN finals scores and (when available) Odds API closing totals; weave its output into `resolveFairTotalForGame` as a new tier above slate-baseline.
4. **Replace `analyzePicks` with NBA-aware version** that slices by favorite/underdog, spread bucket, and totals source — so `run-audit` can detect "all-underdog" or "all-under" regimes and propose **safe** shadow-config deltas.
5. **Add `?debug=1` mode to `/api/nba/picks/built`** that surfaces the per-game model/market/decision blob requested in the prompt.
6. **UI transparency**: source pills (`Spread fallback`, `Series pace`, `Slate baseline`) on tracking-mode market cards.

Every change is additive and bounded. Hero promotion remains gated on positive edge; tracking picks remain visible and graded.

---

## 5. Tests added

- `nbaModelEdge.test.js` — pure ML/ATS edge math (de-vig, no-vig, projected-margin, cover-edge, all-underdog regression).
- `nbaTotalsHistory.test.js` — ESPN finals → recent-total trend, closing-total trend, low-sample tracking.
- `nbaAudit.test.js` — analyzer detects all-underdog bias, all-under bias, and totals-source underperformance.
- `buildNbaPicksV2.test.js` — favorite is selectable; full-slate contract preserved; HOU/LAL regression preserved.

---

## 6. What remains shadow / out of scope

- The ML-derived projected margin is the only **non-market** signal we have today. A real efficiency/pace model is still the right next step but is beyond the scope of this fix.
- Live Odds API historical totals are only used when present in the in-process cache or supplied by tests. The helper degrades gracefully to ESPN-only.
- `picks_config` shadow rows are **never** auto-promoted; the `is_active` flag must be flipped manually after eyeballing the artifact.
