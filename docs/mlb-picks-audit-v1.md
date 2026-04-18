# MLB Maximus's Picks — System Audit (v1)

**Audit date:** 2026-04-17
**Scope:** MLB picks pipeline (generation → distribution → storage), consumer surfaces (app, email, IG), and the gaps between current state and a premium, self-improving betting intelligence layer.

---

## 1. Executive Summary

The MLB picks system is a **stateless, signal-driven edge detector**. It ingests ESPN scoreboard data, enriches with The-Odds-API consensus lines, runs a 9-signal weighted scorecard, and emits four static categories (Pick 'Ems, ATS, Leans, Totals). One canonical payload (`{ categories: { pickEms, ats, leans, totals } }`) feeds the app, 2 email templates, IG captions, and Content Studio.

It is **competent** at producing a daily board and **consistent** across surfaces. It is **not** a premium intelligence layer. The critical gaps:

- **No persistence.** Picks are generated on demand, cached in Vercel KV for 15 min, never written to Postgres. Nothing can be evaluated against outcomes.
- **No settlement/scorecard.** There is no job that reads yesterday's picks, fetches final scores, and computes a record. The product cannot show "3-1 yesterday" because it does not know.
- **No audit/tuning loop.** Thresholds are hard-coded in `mlbPickThresholds.js` and calibrated to stubbed pitcher data with a comment acknowledging the calibration is not principled.
- **Bet-type hierarchy.** The board is organized by market (ML/ATS/Lean/Total), not by conviction. A tier-1 Over is rendered identically to a low-conviction ATS lean. There is no "Top Play."
- **Silent failures.** Backtest script targets `basketball/mens-college-basketball` — the script has been copy-pasted from the NCAA system and is **not exercising MLB**.

This audit maps the exact current state with file:line references, identifies the ten failure points that matter, and is paired with:
- [`mlb-picks-v2-architecture.md`](./mlb-picks-v2-architecture.md) — target architecture
- [`mlb-picks-v2-implementation-plan.md`](./mlb-picks-v2-implementation-plan.md) — ordered build plan with migrations, endpoints, tests

---

## 2. Current Architecture

### 2.1 Data flow

```
ESPN scoreboard (baseball/mlb)
        │  fetchScoreboardForDate()           api/mlb/live/_normalize.js
        ▼
Normalized games (status, teams, gameState)
        │  enrichGamesWithOdds()              api/mlb/live/_odds.js
        ▼                                     ── The-Odds-API h2h/spreads/totals
Enriched games (+ market.moneyline, market.pregameSpread, market.pregameTotal,
                model.pregameEdge, model.confidence)
        │
        │  buildMlbPicks({ games })           src/features/mlb/picks/buildMlbPicks.js
        ▼
  ┌───────────────────────────────────────────────────────┐
  │  For each candidate game (today > tomorrow > later):  │
  │    normalizeMlbMatchup  → canonical matchup           │
  │    scoreMlbMatchup      → probs, edges, DQ, signals   │
  │    classifyMlbPick      → 0–4 pick cards per game     │
  │  Then board-level diversity fill → 5 per column       │
  └───────────────────────────────────────────────────────┘
        │
        ▼
{ categories: { pickEms[], ats[], leans[], totals[] },
  meta: { totalCandidates, qualifiedGames, skippedGames },
  generatedAt }
        │
        ├─── GET /api/mlb/picks/built (cache: 2 min memory, 15 min KV)
        │        ├─ src/components/mlb/MlbMaximusPicksSection.jsx     (app)
        │        ├─ src/emails/templates/mlbPicks.js                  (email)
        │        ├─ src/emails/templates/globalBriefing.js            (email)
        │        └─ src/features/mlb/contentStudio/buildMlbCaption.js (IG/CS)
        │
        └─── selectFeaturedQuadrants() → top-2 per category (for slide / caption)
```

### 2.2 Key files and responsibilities

| File | Responsibility | LOC |
|---|---|---|
| `api/mlb/picks/built.js` | HTTP orchestrator; fetches ESPN + odds, calls builder, caches to KV | 109 |
| `api/mlb/picks/board.js` | Legacy-ish wrapper also used by the app | 104 |
| `src/features/mlb/picks/buildMlbPicks.js` | Top-level board assembly, diversity fill | 194 |
| `src/features/mlb/picks/normalizeMlbMatchup.js` | Shape games → canonical matchup | 109 |
| `src/features/mlb/picks/scoreMlbMatchup.js` | 9-signal weighted scorecard, sigmoid → probs | 204 |
| `src/features/mlb/picks/classifyMlbPick.js` | Emit 0–4 picks per game per threshold | 216 |
| `src/features/mlb/picks/mlbPickThresholds.js` | Hard-coded thresholds constants | 52 |
| `src/features/mlb/picks/selectFeaturedQuadrants.js` | Top-2-per-column featured selection | 114 |
| `api/mlb/live/_odds.js` | The-Odds-API enrichment, team alias map | ~250 |
| `api/_lib/supabaseAdmin.js` | Service-role + anon clients | — |
| `vercel.json` | Cron schedule | 84 |

### 2.3 Scoring model (current)

`scoreMlbMatchup.js` computes a weighted net advantage from up to 9 signals:

| # | Signal | Weight | DQ contribution | Source |
|---|---|---|---|---|
| 1 | Projected wins delta | 0.28 | +0.20 | `seasonModelInputs.js` (static) |
| 2 | Current record (W%) | 0.14 | +0.12 | ESPN team record string |
| 3 | Offense composite | 0.12 | +0.10 | `seasonModelInputs.js` (static 1–10) |
| 4 | Run prevention composite | 0.16 | +0.12 | `seasonModelInputs.js` (static 1–10) |
| 5 | Bullpen quality | 0.08 | +0.06 | `seasonModelInputs.js` (static 1–10) |
| 6 | Home field advantage | 0.06 | +0.04 | constant +0.06 to home |
| 7 | Market dislocation | 0.10 | +0.10 | `model.pregameEdge` from odds enricher (~null in practice) |
| 8 | Season confidence | — | +0.06 | `seasonModelInputs.confidenceScore` |
| 9 | Frontline rotation | 0.06 | +0.06 | `seasonModelInputs.js` (static 1–10) |

Sigmoid: `winProb = 1 / (1 + e^(-3.5 * netAdv))`.
Implied probabilities from moneyline; raw edge = model prob − implied prob.
Data quality is differentiation-modulated: `dataQuality = clamp(sum + bonus, 0.15, 1)`.
Top-3 signals are selected by `|delta|` and annotated as strong/moderate/slight toward away/home.

### 2.4 Classification & thresholds

```
minDataQuality: 0.20

moneyline (adjusted edge):   low=0.015  medium=0.035  high=0.060
runLine   (adjusted edge):   low=0.020  medium=0.040  high=0.065
lean      (raw edge):        low=0.005  medium=0.015  high=0.035
total     (raw edge):        low=0.008  medium=0.020  high=0.045
```

Adjusted edge multiplier: `raw * (0.7 + 0.2 * dataQuality + 0.1 * signalAgreement)` — range `[0.7, 1.0]`.

Categories:
- **Pick'Em** (adjusted edge vs `moneyline` thresholds)
- **Lean** (raw edge vs `lean` thresholds; always fires if edge > 0 & above `lean.low`)
- **ATS** (raw edge × 0.90 vs `runLine` thresholds; additionally requires `|awayWinProb − homeWinProb| ≥ 0.03`)
- **Total** (raw edge = `|expectedTotal − line| * 0.22` vs `total` thresholds)

Max 4 picks per game, 20 candidate games, 36-hour forward window. Each column is filled to 5 with board-level diversity (same matchup avoided across columns first).

### 2.5 Canonical pick shape (current)

```jsonc
{
  "id": "<gameId>-<category>",
  "gameId": "<espn-id>",
  "category": "pickEms|ats|leans|totals",
  "confidence": "high|medium|low",
  "confidenceScore": 0.82,
  "matchup": {
    "gameId": "...",
    "startTime": "ISO",
    "awayTeam": { "slug", "name", "shortName", "logo", "record" },
    "homeTeam": { "slug", "name", "shortName", "logo", "record" },
    "market": { "moneyline": { "away", "home" }, "runLine": { "awayLine", "homeLine" }, "total": { "points" } }
  },
  "market": { /* full market payload */ },
  "pick": {
    "label": "NYY -135",
    "side": "away|home|over|under",
    "value": -135,
    "marketType": "moneyline|runline|total",
    "explanation": "...",
    "topSignals": ["Rotation quality (moderate home edge)", ...]
  },
  "model": {
    "awayWinProb": 0.58, "homeWinProb": 0.42,
    "impliedAwayWinProb": 0.52, "impliedHomeWinProb": 0.48,
    "edge": 0.06, "dataQuality": 0.76, "signalAgreement": 0.80
  }
}
```

### 2.6 Consumers (field-path level)

- **App:** `src/components/mlb/MlbMaximusPicksSection.jsx` (4-column layout, CSS modules). Reads: `categories.*[].confidence`, `.confidenceScore`, `.matchup.*`, `.pick.label/side/value/marketType/explanation/topSignals`, `.model.edge/dataQuality/signalAgreement`. Loads from `/api/mlb/picks/board` with fallback to `/api/mlb/live/games`.
- **Email – mlbPicks.js** (`src/emails/templates/mlbPicks.js`): same fields; defensively normalizes aliases (`pickEm`, `spreads`, `valueLeans`, `gameTotals`).
- **Email – globalBriefing.js** (`src/emails/templates/globalBriefing.js:236-309`): picks top 4 by `confidenceScore`, injects `.type`.
- **Content Studio / IG** (`src/features/mlb/contentStudio/buildMlbCaption.js`): resolves picks from `data.mlbPicks.categories || data.canonicalPicks.categories`, selects best ATS + top-2.
- **Email pipeline:** `api/_lib/mlbEmailData.js` → `api/email/run-daily.js:483` sets `emailData.picksBoard` from `/api/mlb/picks/built`.

### 2.7 Persistence and config

- **Vercel KV:** only ephemeral. `mlb:picks:built:latest` with 900 s TTL (written from `api/mlb/picks/built.js:94`). No persistence beyond that.
- **Supabase:** `api/_lib/supabaseAdmin.js` exposes anon + service clients, env-gated. No tables exist for picks, results, scorecards, or tuning (checked all `docs/*.sql`).
- **Config:** No runtime config; thresholds live inline in `mlbPickThresholds.js`. No feature flags. No `picks_config` table.

### 2.8 Cron schedule (`vercel.json`)

| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/home/slow` | `*/5 * * * *` | Home feed refresh |
| `/api/ats/warm` | `*/7 * * * *` | ATS cache |
| `/api/ats/warmAll` | `*/10 * * * *` | ATS cache |
| `/api/ats/warmFull` | `*/30 * * * *` | ATS cache |
| `/api/email/run-daily?type=mlb_briefing` | `30 16 * * *` | Daily briefing email |
| `/api/email/run-daily?type=mlb_picks` | `15 19 * * *` | Daily picks email |
| `/api/email/run-daily?type=mlb_team_digest` | `30 2 * * *` | Team digests |
| `/api/social/instagram/autopost-mlb-daily?mode=live` | `0 13 * * *` | Daily IG autopost |

There is **no settlement cron, no scorecard cron, no audit cron**.

---

## 3. Weaknesses, Risks, and Gaps

### 3.1 Critical

1. **No persisted pick history.** Picks exist only in 15-minute KV. No table of what we advised, no outcomes, no record. We cannot truthfully say "48-52 last week," let alone drive a scorecard UI.
2. **Scoring signals are static season inputs.** Offense/pitching/bullpen scores come from `seasonModelInputs.js`, a hand-curated static 1–10 table. Nothing updates intra-season. Injuries, IL moves, trade deadline, hot/cold streaks — all invisible.
3. **DQ is structurally capped by stubbed pitcher data.** Comment in `mlbPickThresholds.js:8` confirms the thresholds are calibrated to a DQ ceiling of ~0.54 caused by missing live pitcher inputs. Real data will shift the distribution under the current thresholds.
4. **Fair-spread derivation is heuristic.** `api/mlb/live/_odds.js` derives `fairSpread` from moneyline via a linear 16.67-point factor, which is wrong at the tails. `model.pregameEdge` feeds signal #7 of the scorecard; the signal is rarely present in practice.
5. **No settlement path.** No job reads yesterday's `mlb:picks:built` snapshot and settles it against final scores. Even if we persisted picks, nothing grades them.

### 3.2 High

6. **Bet-type organization, not conviction organization.** The UI and email both sort-by-category. A Tier-1 total reads visually like a low-conviction ATS lean. There is no "Top Play" concept.
7. **Confidence tiering is discrete and not calibrated.** `high/medium/low` is a thresholded bucket with no calibration against realized hit rate. A "high" pick has never been measured.
8. **Leans are a filler category.** `classifyMlbPick.js:33-41` fires a Lean for every game with any positive edge above `lean.low`. It is structurally guaranteed to populate rather than gated on quality. The product communicates "moderate value signal" for output that is effectively "there was a ≥0.5% edge."
9. **Totals are the weakest leg.** `expectedTotal` is a simple league-average ± composite adjustment. No park factor, no weather, no starter ERA, no bullpen load. The `* 0.22` multiplier is a hand-tuned fudge factor.
10. **Backtest harness is broken.** `scripts/backtestMaximusPicks.js` calls `site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`. It is not validating MLB thresholds.

### 3.3 Medium

11. **No versioning.** Every pick is anonymous re: which model / which threshold config produced it. We cannot attribute performance to specific changes.
12. **`/api/mlb/picks/board` vs `/built` drift risk.** Two endpoints can diverge; the app uses `board`, the email uses `built`. If they don't share the exact same builder output they will drift.
13. **IG caption path defensively accepts both `data.mlbPicks` and `data.canonicalPicks`.** A clear symptom of a schema that has already drifted once.
14. **No observability.** Beyond `console.log` at build time, there is no counter for "picks published today," "picks graded," "hit rate by tier." PostHog is installed but unused for picks.
15. **No compliance trail.** Premium betting products need a reproducible record of what was published, when, and why. Today there is none.

---

## 4. Summary of What's Missing to Meet the Brief

| Brief requirement | Status |
|---|---|
| Fewer, better picks organized by conviction | ❌ — organized by market |
| Top Play hero | ❌ — not modeled |
| Bet Score composite (edge × confidence × situational × market quality) | ❌ — single adjusted edge only |
| Dynamic thresholds | ❌ — hard-coded constants |
| Persistent pick history | ❌ — 15-min KV only |
| Daily scorecard (yesterday's record in-product) | ❌ — no data, no UI |
| Automated settlement | ❌ — no job |
| Daily audit artifact | ❌ — no job |
| Safe, bounded self-tuning | ❌ — no config layer |
| Canonical payload powering app/email/IG without drift | ⚠️ partial (already drifted once) |
| NBA-ready extension | ⚠️ partial (shared libs exist, no picks tables) |

---

## 5. Deliverables Produced by This Audit

- **This document** — current-state reference.
- **[`mlb-picks-v2-architecture.md`](./mlb-picks-v2-architecture.md)** — target architecture (Bet Score, tiers, schema, endpoints, scorecard, audit loop, safe tuning).
- **[`mlb-picks-v2-implementation-plan.md`](./mlb-picks-v2-implementation-plan.md)** — ordered, PR-sized implementation steps with migrations, endpoints, UI components, and tests.

---

## 6. Immediate Recommendations (No-Regret Work)

Regardless of model redesign, these are safe wins that should land first:

1. **Fix `scripts/backtestMaximusPicks.js`** to call the MLB ESPN endpoint. It currently validates nothing useful.
2. **Persist every published board** to Supabase on each `/api/mlb/picks/built` generation (async write, best-effort). This unlocks everything downstream even before schema is fully mature.
3. **Add a `model_version` + `config_version` stamp** to every pick so future attribution works.
4. **Align `/api/mlb/picks/board` and `/built`** to call the exact same `buildMlbPicks` output, removing drift risk.
5. **Stop surfacing Leans by default on mobile.** They are high-volume, low-conviction — keep them in a collapsed section until calibration proves otherwise.

---

*End of audit v1.*
