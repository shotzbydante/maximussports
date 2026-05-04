# NBA Playoffs — Every Game, Three Market Picks Audit v7

**Date:** 2026-05-04
**Scope:** Move from "publish only what clears thresholds" to **"every playoff game gets exactly one Moneyline, one ATS, and one Total pick — graded daily"** while keeping NBA Home curated to the highest-conviction subset and surfacing the full slate on Odds Insights.

---

## 1. Current generation behavior

`src/features/nba/picks/v2/buildNbaPicksV2.js` runs three loops per game:

| Loop | When does a candidate fire? | When is it dropped? |
|---|---|---|
| Moneyline | `rawEdge = modelProb − implied`, requires `rawEdge > 0`; underdog (+) requires `rawEdge ≥ minUnderdogEdge` (4%) | Negative or zero raw edge → `continue` |
| Spread | `(modelProb − implied) × 0.9`, requires `rawEdge ≥ minSpreadEdge` (3%); also requires `probSpread ≥ 0.05` | Below either threshold → `continue` |
| Totals | Requires `model.fairTotal != null` AND `passConf` AND `Math.abs(delta) ≥ minExpectedDelta` (2.0) | Any miss → `continue` |

After candidate generation, every pick flows through:
* `applyDiscipline` — can return `null` (suppress entirely) for elimination + huge-spread + low-confidence single-driver combinations.
* `assignTiers` — caps tier1=2, tier2=5, tier3=5; coverage cap 10. Picks that don't clear `tier3.floor` (0.45) are dropped from `published`.

**Net effect today:** a typical playoff slate publishes 0–3 picks (mostly Tier 3 spreads). ML and Totals frequently never produce a candidate at all because their per-side gates fail. Only "high-confidence-enough" picks ever reach persistence.

## 2. Current persistence behavior

`api/_lib/nbaPicksBuilder.js` calls `writePicksRun(payload)` with the builder's published output. Only `tiers.tier1 ∪ tier2 ∪ tier3` and `coverage` write rows. Filtered candidates are NOT persisted.

The `picks` table schema:

```
id, run_id, sport, slate_date, game_id, pick_key, tier,
market_type, selection_side, line_value, price_american,
away_team_slug, home_team_slug, start_time,
bet_score, bet_score_components (jsonb),
model_prob, implied_prob, raw_edge, data_quality,
signal_agreement, rationale (jsonb), top_signals (jsonb),
model_version, config_version
```

* No `is_hero` / `pick_role` column today.
* `rationale` is a free-shape jsonb — we can stash `rationale.pickRole = 'hero' | 'tracking'` without a migration.
* `pick_key` already encodes `gameId-marketType-side` so 3 picks per game are uniquely keyed without changes.

## 3. Current scorecard behavior

`api/nba/picks/scorecard.js` reads `picks ⨝ pick_results` for the slate. Counts by market into `byMarket: { moneyline, runline, total }` and by tier into `byTier`. **It already grades every persisted pick** — so once we persist all 3 markets per game, the scorecard automatically reflects them.

Pending picks are split into `record.pending` and excluded from win-rate.

## 4. Current UI behavior

| Surface | Source | What renders |
|---|---|---|
| `/nba` (Home) | `MlbMaximusPicksSectionV2` mode=home, NBA endpoint, `homeShowAll` | All published tiers + coverage in tier-grouped subgroups (market subheaders inside each tier) |
| `/nba/insights` | Same component, mode=page | Same data, grouped by tier with market subgroups |
| Scorecard rows | `NbaScorecardReport` | Per-pick rows for whatever's persisted on the resolved slate |

There is **no game-by-game breakdown view today**. Tier subgroups are the only "per-market" hierarchy.

## 5. Model behavior by market

* **Moneyline** — `pregameEdge` from moneyline-vs-spread arbitrage drives per-side `modelProb`. The picked side wins when `modelProb > implied` (typically the underdog side under chalk lines).
* **Spread** — same `pregameEdge` mapped to per-side spread edge via `(modelProb − implied) × 0.9`.
* **Totals** — only fires when `model.fairTotal` is supplied. Today the `seriesPaceFairTotal` MVP populates it for any matchup with ≥ 2 prior finals between the same teams in the 7-day window. Otherwise null.

**For the new contract** every playoff game must produce a pick in every market. Three behavioral changes are required:

1. **Never drop candidates by edge sign.** Always pick the side with the better metric, mark conviction honestly (Strong / Solid / Lean / Low Conviction).
2. **Discipline must NEVER suppress full-slate picks.** Caps + flags only. `Suppress → Cap to "Low Conviction" + flag.tracking = true`.
3. **Totals must always produce a candidate.** When `seriesPaceFairTotal` returns null, fall back to a `teamRecentTotalAverage` signal computed from the same 7-day window's finals (each team's average combined-score across their last finals). When that's also unavailable, use the slate-pace baseline (mean of all finals in the window) as a last-resort prior. Each fallback step lowers `dataQuality`.

## 6. Product contract (v7)

```js
{
  // Every playoff game × 3 markets. Always populated.
  fullSlatePicks: [{ gameId, marketType, ..., pickRole, isHeroPick, isLowConviction, ... }],

  // Subset of fullSlatePicks meeting hero thresholds — drives /nba.
  heroPicks: [...],

  // Game-by-game grouping — drives /nba/insights breakdown.
  byGame: [{
    gameId, awayTeam, homeTeam, startTime, contextLabel,
    picks: { moneyline, runline, total }
  }],

  // Back-compat: existing tier1/2/3 + coverage shape preserved for
  // surfaces that already consume them.
  tiers: { tier1, tier2, tier3 },
  coverage,
  categories: { pickEms, ats, leans, totals },

  // Counts surfaced for ByMarketSummary + scorecard headers.
  meta: {
    totalCandidates,
    fullSlatePickCount,    // games × 3
    heroPickCount,
    trackingPickCount,
    ...
  }
}
```

**Terminology:**
* **Full-slate picks** = every ML/ATS/Total picked for every playoff game; persisted + graded.
* **Hero picks** = high-conviction subset surfaced on NBA Home.
* **"Published"** is now reserved to mean **persisted** (i.e. all full-slate picks). The visible NBA Home subset is referred to as **hero**, not "published".

## 7. Implementation plan

### 7.1 Builder

* New helper `pickBestSide(modelProbA, modelProbB, impliedA, impliedB)` — always returns the side with better edge (positive or negative). Preserves the rawEdge value so downstream metrics stay honest.
* Generate one ML + one ATS + one Total per game. Stop short-circuiting on `rawEdge ≤ 0`.
* `applyDiscipline` invoked with `mode: 'fullSlate'` returns `{ pick, suppressed: bool }` instead of null. When suppressed, pick is kept but `pickRole = 'tracking'`, `convictionLabel = 'Low Conviction'`, `betScore.total` capped.
* `heroPicks` = picks where (a) tier ∈ {tier1, tier2}, OR (b) tier3 with conviction.score ≥ 70. Remaining are tracking-only.

### 7.2 Discipline

* `applyDiscipline` adds a `mode` arg. In `fullSlate` mode it never returns null; instead returns the pick with capped score + flag set.

### 7.3 Totals fallback

`seriesPaceFairTotal` extended (or sibling helper added) to fall back to:
1. `teamRecentTotalAverage(awaySlug, homeSlug, windowGames)` when ≥ 2 finals exist for either team in the window — per-team average combined score, blended.
2. `slatePaceBaseline(windowGames)` last-resort — mean total of the last N finals in the window, to ensure totals always produce a directional pick.

Each step lowers `confidence`. The pick gets a `lowSignal: true` flag when below sample.

### 7.4 Persistence

`picksHistory.buildPickRow` writes `rationale.pickRole` automatically by reading `pick.rationale.pickRole`. We set the field in the builder. No schema migration.

### 7.5 Settlement & scorecard

No changes — `settlePick` already grades all three markets, `buildScorecard` already counts by market, scorecard endpoint already reads ALL persisted picks for the slate.

### 7.6 UI

* New `NbaFullSlateBoard` component on `/nba/insights`. Game-by-game cards: away/home + start time + 3 sub-cards (ML / ATS / Total) with conviction reporting on each.
* NBA Home stays hero-curated. Add a "See every game pick →" CTA pointing to `/nba/insights`.
* `ByMarketSummary` gains `notes.fullSlateMessage`: "Full slate coverage: ML, ATS, and Totals on every playoff game" + the hero-shown vs. full-slate counts.
* Tracking picks render with a slightly muted card chrome + a `Tracking` flag pill so they're visually distinct.

## 8. What this PR ships

1. Builder rewritten to produce `byGame[].picks.{moneyline, runline, total}` for every playoff game.
2. Discipline `mode: 'fullSlate'` keeps low-conviction picks instead of suppressing.
3. Totals fallback chain (series-pace → team-recent → slate baseline). Honest `dataQuality` ramp.
4. Hero subset computed post-discipline.
5. Persistence stashes `pickRole` in `rationale.pickRole`. Scorecard naturally counts everything.
6. `NbaFullSlateBoard` for `/nba/insights`.
7. NBA Home CTA + ByMarketSummary "Full slate coverage" copy.
8. Tests pinning the contract: every playoff game in fixtures produces 3 picks; hero ⊆ full-slate; persistence shape; settle math; scorecard grades all.

## 9. Caveats — what's MVP vs full

* **Totals fallback chain is honest, not great.** `teamRecentTotalAverage` is a pace-of-recent-games proxy, not a real efficiency model. `slatePaceBaseline` is the safety net, not a signal. Tracking-pick conviction labels make the limitation explicit. A future PR can layer Elo / pace / efficiency on top.
* **ML signal stays the moneyline-vs-spread arbitrage.** Always-pick changes the funnel, not the model. Discipline + Tracking flag protect against over-confidence.
* **No automated config promotion.** Shadow tuning still needs operator approval.
* **No persisted cover margin / units.** Both derived on read.
