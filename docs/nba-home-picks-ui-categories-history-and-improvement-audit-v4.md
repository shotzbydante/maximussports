# NBA Home Picks — UI Categories, History & Improvement Audit v4

**Date:** 2026-05-04
**Scope:** End-to-end audit of the NBA Home picks surface — UI legibility on the dark hero, market-category visibility (ML / ATS / Totals), pick history persistence, scorecard consumption, and the continuous-improvement loop.

---

## 1. Pipeline map (what's actually wired today)

```
                 ┌──────────────────────────────────┐
                 │ ESPN scoreboard + Odds API enrich │
                 └────────────┬─────────────────────┘
                              ▼
        ┌──────────────────────────────────────────┐
        │ src/features/nba/picks/v2/                │
        │   buildNbaPicksV2.js                      │
        │     • Generates per-market candidates     │
        │       (moneyline, spread, total)          │
        │     • Tiers + coverage pool               │
        │     • Discipline pass                     │
        └────────────┬─────────────────────────────┘
                     ▼
        ┌──────────────────────────────────────────┐
        │ api/_lib/nbaPicksBuilder.js               │
        │     buildNbaPicksBoard()                  │
        │     • runs builder                        │
        │     • caches in KV                        │
        │     • writes picks_runs + picks rows      │
        │       via writePicksRun                   │
        └────────────┬─────────────────────────────┘
                     ▼
        ┌──────────────────────────────────────────┐
        │ Persistence (Supabase)                    │
        │   picks_runs                              │
        │   picks                                   │
        │   pick_results                            │
        │   picks_daily_scorecards                  │
        │   picks_audit_artifacts                   │
        │   picks_tuning_log                        │
        │   picks_config                            │
        └────────────┬─────────────────────────────┘
                     ▼
   ┌────────────────────────────────────────────────────┐
   │ Daily cron @ 8:30 / 8:45 / 9:00 ET                  │
   │   /api/cron/nba/settle-yesterday → upsertPickResults│
   │   /api/cron/nba/build-scorecard  → upsertScorecard  │
   │   /api/cron/nba/run-audit        → analyzePicks +   │
   │                                    writeAuditArtifact│
   │                                    + shadow tuning  │
   └────────────────────────────────────────────────────┘
                     ▼
        ┌──────────────────────────────────────────┐
        │ UI surfaces                               │
        │  /nba           ← MlbMaximusPicksSectionV2│
        │  /nba/insights  ← same component          │
        │                   + NbaScorecardReport    │
        │  /api/nba/picks/scorecard?includePicks=1  │
        │     reads picks ⨝ pick_results            │
        └──────────────────────────────────────────┘
```

Every box on this map is implemented. The core pipeline is real, not aspirational.

## 2. Categories — what's structurally supported vs. what publishes today

### 2.1 Structurally supported

`buildNbaPicksV2.js` iterates per-market candidates for **moneyline**, **spread** (persisted as `runline` for shared shape with MLB), and **total**:

| Market | Generator | Gate today | Output `pick.market.type` |
|---|---|---|---|
| Pick 'Em / ML | per-side `rawEdge = modelProb − implied`, `minUnderdogEdge=0.04` | requires positive edge + ≥ 4% on +odds | `moneyline` |
| ATS / Spread  | `(modelProb − implied) × 0.9`, `minProbSpread=0.05`, `minEdge=0.03` | requires probSpread + per-side edge | `runline` |
| Totals / O-U  | `delta = fairTotal − market.total`, `minExpectedDelta=2.0`, `minConfidence=0.55` | requires `model.fairTotal` distinct from market | `total` |

All three categories flow through the SAME tier+coverage logic and get persisted with the same `picks` table schema. `buildLegacyCategories` further maps them to the legacy `pickEms / ats / leans / totals` keys for any caller that still reads that shape.

### 2.2 What actually publishes

Concretely on production:

* **ML and ATS** publish whenever the moneyline-vs-spread arbitrage signal (the only "model" today, see §6) produces a non-zero `pregameEdge`. They DO publish.
* **Totals** **never publish**. The reason is structural and honest: `api/nba/live/_odds.js` sets `model.fairTotal = match.total` (the bookmaker's total). `delta = fairTotal − market.total = 0` → `passDelta` is always false → no totals candidate ever clears the gate.

This isn't a UI bug. The system has no fair-total model, and rather than inventing one, the enricher mirrors the market and the gate honestly suppresses the category. The audit doc explicitly recommends NOT faking this signal and instead surfacing the absence in the UI (see §4).

### 2.3 What the user is currently seeing

A slate that produced only Tier 3 spreads (per the screenshot: SAS −14, NYK −7, OKC −16). Tier 1 + Tier 2 are empty by discipline (correct — these are low-conviction market-only spreads), and Totals is empty by absence-of-model. The UI today renders `LEANS / 3 PICKS / Hide` with a spread subgroup heading that's hard to read on the dark hero (§4).

## 3. History persistence — what's logged

### 3.1 Per-pick (`picks` table) — already comprehensive

`picksHistory.buildPickRow` writes every NBA pick with this shape:

```
run_id, sport, slate_date, game_id, pick_key, tier,
market_type, selection_side, line_value, price_american,
away_team_slug, home_team_slug, start_time,
bet_score, bet_score_components,
model_prob, implied_prob, raw_edge,
data_quality, signal_agreement,
rationale, top_signals,
model_version, config_version
```

Verified in `api/_lib/picksHistory.js:87-123`. **Pick history is comprehensive — no gaps for ML / ATS / Totals.** Every market type writes the same envelope.

### 3.2 Settlement (`pick_results` table)

`api/cron/nba/settle-yesterday.js` resolves each pick to a final via `resolveFinalForPick` (cross-date safe) and writes:

```
pick_id, status (won/lost/push/pending/void),
final_away_score, final_home_score, notes
```

Cover margin / win margin is **derived in `annotatePick`** (the scorecard endpoint reader) rather than persisted. That's a pragmatic choice — the math is deterministic from `(line_value, scores)` so storing it would duplicate. The UI's "Covered by 16.0 points" / "Lost cover by 16.0" string is computed on read.

### 3.3 Daily scorecard (`picks_daily_scorecards` table)

`buildScorecard` (in `src/features/mlb/picks/v2/scorecard.js`) — shared with MLB — produces:

```
sport, slate_date, record (overall counts),
by_market: { moneyline, runline, total },
by_tier:   { tier1, tier2, tier3 },
top_play_result, streak, note, computed_at
```

**By-market and by-tier breakdowns are already persisted daily.** The scorecard endpoint surfaces them via `totals.byMarket` for the UI. Pending picks are kept separately in `record.pending` and excluded from win-rate math.

### 3.4 Audit + tuning loop (`picks_audit_artifacts`, `picks_tuning_log`, `picks_config`)

`api/cron/nba/run-audit.js` runs daily at 9:00 ET:

1. Pulls graded picks for the slate.
2. Calls `analyzePicks` → produces `summary` (overall + by-market + by-tier + by-edge-band + by-home-away + top hits/misses), `signalAttribution`, `recommendedDeltas`.
3. Writes the artifact to `picks_audit_artifacts`.
4. With ≥ 15 graded picks, validates a bounded delta and writes a **shadow** config to `picks_config` + a `picks_tuning_log` entry. **Never auto-applies.**

Verified `vercel.json` lines 91–93 schedule the trio:

```
30 8 * * *   /api/cron/nba/settle-yesterday
45 8 * * *   /api/cron/nba/build-scorecard
0 9 * * *    /api/cron/nba/run-audit
```

So the full **continuous improvement loop is automated** — settle → score → audit → propose tuning. The only explicitly manual step is operator approval of a shadow config (flipping `is_shadow=false, is_active=true`).

## 4. UI — readability + category visibility

### 4.1 Remaining dark-on-dark / low-contrast text on `/nba`

The 2026-05-04 dark-surface fix (commit `0abf037`) covered the V2 section root and the embedded scorecard. **TierSection and PickCardV2 still use light-mode tokens** when nested under `data-dark-surface='true'`:

| Selector (TierSection.module.css) | Variable | Issue on dark |
|---|---|---|
| `.kicker` | `var(--picks-silver)` | mid-grey, low contrast |
| `.title` | `var(--picks-ink)` | near-black, illegible |
| `.sub` | `var(--picks-steel)` | dark grey, illegible |
| `.countPill` text | `var(--picks-slate)` | dark grey |
| `.empty` | `var(--picks-silver)` | mid-grey, weak |
| `.subgroupLabel` | `var(--picks-ink)` | near-black, illegible |
| `.subgroupCount` | `var(--picks-silver)` | mid-grey |
| `.collapseBtn` | `var(--picks-accent)` | navy on navy |
| `.tier1 .header` | white-ish gradient | OK against dark |
| `.tier3 .header` | `var(--picks-fog)` | washes out on dark |

`PickCardV2.module.css` is fine — each card has its own white glass surface, so the card's internal text is always light-on-light. The card chrome is intentionally inverted from the host hero (premium effect).

### 4.2 Category-section visibility

The picks board today renders **tier-first**: Tier 1 → Tier 2 → Tier 3 → Coverage. Inside each tier, picks are grouped by market via `groupByMarketType` — so when populated, the user sees `Pick 'Ems / Spreads / Game Totals / Value Leans` subheaders.

**On a single-tier slate (today's reality), the user only sees the `LEANS / Spreads` subgroup** and never sees the labels for the other two markets. The user's request — "explicit Pick 'Em / ATS / Totals sections" — points at this gap.

### 4.3 Recommended changes

* Scope dark-surface text overrides under `[data-dark-surface='true']` inside `TierSection.module.css` for every selector in §4.1. PickCardV2 needs no change.
* Add a **By Market** summary strip on the picks board (above the tiers) that always shows the three primary categories with their pick counts and a small empty-state caption when zero. This makes ML / ATS / Totals visible regardless of which tier any individual pick lands in.
* Surface a single line of context in the strip when Totals are zero, naming the structural reason: "Totals coverage requires a fair-total model (currently inactive)." That's truthful and avoids the appearance of a UI bug.

## 5. Scorecard consumption — already correct

`/api/nba/picks/scorecard?includePicks=1` reads `picks` ⨝ `pick_results` for the resolved slate, derives totals + per-market + per-tier breakdowns, attaches per-pick playoff context, and returns the full row list. `NbaScorecardReport` renders both `byMarket.{moneyline,spread,total}` chips and the per-pick rows. No change needed for daily history consumption — this was verified end-to-end in v3.

## 6. The honest model picture

The "model" today is **moneyline-vs-spread arbitrage**:

```
impliedProb = ML → implied probability (vig still in)
fairSpread  = -(impliedProb − 0.5) × 16.67
pregameEdge = fairSpread − market.spread
```

This is not a real predictive model — it's a price-mispricing detector. It explains the playoff failure modes documented in `nba-playoff-picks-model-audit-v1.md` (chalk lines drive pregameEdge → edge-driven picks → losing favorites). The discipline layer (`discipline.js`) is what saves the system today: low-confidence cap, single-driver cap, spread discipline, injury guard, Game 7 logic.

The same module produces no fair-total signal at all. The truthful next step is a real Elo / SRS-style team-strength prior plus a pace/efficiency total model. That's out of scope for this PR per the "no model logic" guardrail; the audit names it clearly so a future PR has a starting point.

## 7. What this PR ships

* **TierSection dark-surface readability** — `[data-dark-surface='true']` overrides for kicker, title, sub, countPill, empty, subgroupLabel, subgroupCount, collapseBtn, header backgrounds. Preserves light Odds Insights styling.
* **By-Market summary strip** — new component above the tiers that always renders `Pick 'Em / ATS / Totals` cells with counts (0 when empty) and the "totals model inactive" line when applicable. Renders only on `mode='home'` so Odds Insights keeps its existing layout.
* **Truthful enricher fix** — `api/nba/live/_odds.js` no longer mirrors the market total into `model.fairTotal`. It writes `null` so the totals gate fails for the right reason and the audit/tuning trail records "no fair-total model" rather than silently scoring a 0-edge totals candidate.
* **Tests** — builder by-market parity, persistence schema invariants, dark-surface CSS overrides, scorecard byMarket consumption.

## 8. Caveats — what's NOT in this PR

* No new model (ML/SRS/total-pace) — the system stays honest about predictive capability.
* No persisted cover margin — derived on read in `annotatePick`.
* No automated config promotion — shadow tuning still requires operator approval.
* No ROI / units bookkeeping — the framework supports it (every pick has odds + edge persisted) but a per-unit bankroll model isn't implemented. Naming the gap so a future PR can wire it.
