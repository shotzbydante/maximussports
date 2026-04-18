# MLB Maximus's Picks — Target Architecture (v2)

**Status:** Design, not yet implemented.
**Pairs with:** [`mlb-picks-audit-v1.md`](./mlb-picks-audit-v1.md), [`mlb-picks-v2-implementation-plan.md`](./mlb-picks-v2-implementation-plan.md)

---

## 1. Design Principles

1. **Conviction over volume.** A smaller number of high-conviction picks beats a filled-out 4×5 board.
2. **One canonical payload.** App, email, and IG consume the exact same object. No defensive aliases.
3. **Every pick is a record.** Every published board is stored durably, attributed to a `model_version` + `config_version`.
4. **The system knows yesterday.** Settlement runs automatically. Scorecard is read, not recomputed.
5. **Self-improvement is bounded.** Tuning deltas are proposals. Nothing mutates itself without sample-size and magnitude guardrails. Shadow first, apply later, always logged and reversible.
6. **NBA-ready.** Schema and endpoints are `sport`-scoped from day one.
7. **No invented precision.** Park factors, weather, pitcher-specific signals are optional extension points — the system produces value with currently available inputs and scales with new ones.

---

## 2. Canonical Payload (v2)

### 2.1 Shape

```jsonc
{
  "sport": "mlb",
  "date": "2026-04-17",                  // slate date (ET)
  "modelVersion": "mlb-picks-v2.0.0",
  "configVersion": "mlb-picks-tuning-2026-04-17a",
  "generatedAt": "2026-04-17T14:00:00Z",

  "topPick": { /* a Pick, or null */ },  // highest bet-score pick across the slate
  "tiers": {
    "tier1": [ /* Picks */ ],             // "Maximus Top Plays" — typically 0–3
    "tier2": [ /* Picks */ ],             // "Strong Plays" — typically 0–5
    "tier3": [ /* Picks */ ]              // "Leans" — typically 0–5
  },

  "scorecardSummary": {
    "date": "2026-04-16",                 // the day being reported
    "overall":  { "won": 3, "lost": 1, "push": 0, "pending": 0 },
    "byMarket": {
      "moneyline": { "won": 1, "lost": 0 },
      "runline":   { "won": 1, "lost": 1 },
      "total":     { "won": 1, "lost": 0 }
    },
    "byTier": {
      "tier1": { "won": 1, "lost": 0 },
      "tier2": { "won": 2, "lost": 1 },
      "tier3": { "won": 0, "lost": 0 }
    },
    "topPlayResult": "won",
    "streak": { "type": "won", "count": 2 },
    "note": "Top Play hit — Yankees ML cashed"
  },

  "meta": {
    "totalCandidates": 14,
    "qualifiedGames": 9,
    "skippedGames": 1,
    "picksPublished": 7,
    "flags": []                           // e.g. ["low_slate", "weather_risk"]
  },

  "legacy": {
    "categories": {                       // ← kept for back-compat; deprecated
      "pickEms": [ /* same picks filtered by marketType */ ],
      "ats":     [],
      "leans":   [],
      "totals":  []
    }
  }
}
```

### 2.2 Pick shape (v2)

```jsonc
{
  "id": "<gameId>-<marketType>-<selection>",
  "sport": "mlb",
  "gameId": "...",
  "date": "2026-04-17",
  "tier": "tier1|tier2|tier3",
  "conviction": { "label": "Top Play", "score": 0.92 },

  "market": { "type": "moneyline|runline|total", "line": -1.5, "priceAmerican": -135 },
  "selection": { "side": "away|home|over|under", "team": "NYY", "label": "NYY ML" },

  "matchup": {
    "awayTeam": { "slug", "name", "shortName", "logo", "record" },
    "homeTeam": { "slug", "name", "shortName", "logo", "record" },
    "startTime": "ISO",
    "venue": "Yankee Stadium",
    "dayNight": "N"
  },

  "betScore": {
    "total": 0.92,                         // bounded [0, 1]
    "components": {
      "edgeStrength": 0.80,                // |modelProb − impliedProb| normalized
      "modelConfidence": 0.78,             // DQ × signalAgreement
      "situationalEdge": 0.55,             // non-market context (rotation, bullpen, park, home)
      "marketQuality": 0.60                // line stability, book consensus, juice quality
    },
    "weights": { "edge": 0.40, "conf": 0.25, "sit": 0.20, "mkt": 0.15 }
  },

  "rationale": {
    "headline": "NYY price undervalues pitching mismatch",
    "bullets": [
      "Projected wins delta +6 toward away",
      "Rotation quality strong away edge",
      "Market line steamed 4 cents in our direction"
    ]
  },

  "modelProb": 0.612,
  "impliedProb": 0.543,
  "rawEdge": 0.069,

  "result": null,                          // populated post-settlement
  // result shape:
  // { status: "won|lost|push|void|pending", settledAt, finalScore: { away, home },
  //   notes: "game completed 9 innings; total 9" }

  "publish": {
    "modelVersion": "mlb-picks-v2.0.0",
    "configVersion": "mlb-picks-tuning-2026-04-17a",
    "generatedAt": "ISO",
    "runId": "uuid"
  }
}
```

### 2.3 Back-compat strategy

- `legacy.categories` mirrors the v1 shape for the duration of one release cycle so existing consumers (`MlbMaximusPicksSection.jsx`, `mlbPicks.js` email, `buildMlbCaption.js`, `globalBriefing.js`) keep working unchanged.
- Each consumer is migrated to read from `tiers` + `topPick` in sequence; once all are migrated, `legacy` is removed.

---

## 3. Bet Score — Composite Scoring Model

Bet Score is bounded `[0, 1]` and composed of four orthogonal components:

### 3.1 Components

| Component | Symbol | Range | Definition |
|---|---|---|---|
| **Edge Strength** | `E` | [0, 1] | Raw model prob − implied prob, normalized by a market-type-specific soft cap (`mlCap = 0.10`, `rlCap = 0.08`, `totCap = 1.5 runs of expected Δ`). Sigmoid-squashed. |
| **Model Confidence** | `C` | [0, 1] | `dataQuality × signalAgreement`. Penalizes picks where signals disagree or inputs are sparse. |
| **Situational Edge** | `S` | [0, 1] | Linear combination of non-market context: rotation mismatch (`sRot`), bullpen fatigue (`sPen`), park factor for totals (`sPark`), home/day-night (`sHA`), recent-form vs baseline (`sForm`). Each `[0,1]`, averaged. |
| **Market Quality** | `M` | [0, 1] | Is this a good line to bet? Components: bookmaker consensus (`mCons`), line movement vs our direction (`mSteam`), juice symmetry (`mJuice`), no-vig odds sanity (`mNoVig`). |

### 3.2 Combination

```
BetScore = wE·E + wC·C + wS·S + wM·M
```

Default weights (`mlb-picks-tuning-2026-04-17a`):
```
wE = 0.40, wC = 0.25, wS = 0.20, wM = 0.15
```

Weights are stored in the tuning config and tunable (bounded). The system rejects a weight vector that does not sum to 1.0 or that moves any weight by >0.05 in a single tuning cycle.

### 3.3 Tiering (dynamic)

Thresholds are **percentile-based** per slate, so a quiet day still surfaces something and a rich day doesn't over-fire:

```
tier1: betScore ≥ max(0.75, P90 of slate)
tier2: betScore ≥ max(0.60, P70 of slate)
tier3: betScore ≥ max(0.45, P50 of slate)
below: not published
```

Hard caps per slate:
- `maxTier1 = 3` (top-3 by betScore if more qualify)
- `maxTier2 = 5`
- `maxTier3 = 5`

`topPick` = single highest `betScore` across all tier1 candidates.

### 3.4 Market-specific constraints

Totals are additionally gated on `C ≥ 0.55` AND `|expectedTotal − line| ≥ 0.35` to address the "totals are the weakest leg" finding. Below that, totals do not publish.

ATS requires `|awayModelProb − homeModelProb| ≥ 0.05` (tighter than v1) to avoid coin-flip ATS picks.

### 3.5 Per-game max

A single game cannot contribute >2 picks to the published board and at most 1 to tier1 (diversification).

---

## 4. Persistence Schema (Supabase / Postgres)

All tables are `sport`-scoped. UUIDs for IDs. RLS allows read to anon (picks only), writes only via service role.

### 4.1 `picks_runs` — one row per published board

```sql
create table public.picks_runs (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null,                   -- 'mlb'|'nba'
  slate_date         date not null,                   -- ET date the slate is for
  generated_at       timestamptz not null default now(),
  model_version      text not null,
  config_version     text not null,
  meta               jsonb not null,                  -- counts, flags
  payload            jsonb not null,                  -- full canonical payload (incl. tiers, topPick)
  created_at         timestamptz not null default now()
);
create index on public.picks_runs (sport, slate_date desc, generated_at desc);
create unique index picks_runs_daily on public.picks_runs (sport, slate_date, generated_at);
```

### 4.2 `picks` — one row per published pick

```sql
create table public.picks (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.picks_runs(id) on delete cascade,
  sport              text not null,
  slate_date         date not null,
  game_id            text not null,
  pick_key           text not null,                   -- "${gameId}-${marketType}-${selection}"
  tier               text not null check (tier in ('tier1','tier2','tier3')),
  market_type        text not null check (market_type in ('moneyline','runline','total')),
  selection_side     text not null,                   -- 'away'|'home'|'over'|'under'
  line_value         numeric,
  price_american     integer,
  away_team_slug     text not null,
  home_team_slug     text not null,
  start_time         timestamptz,
  bet_score          numeric not null,
  bet_score_components jsonb not null,                -- { edge, conf, sit, mkt }
  model_prob         numeric,
  implied_prob       numeric,
  raw_edge           numeric,
  data_quality       numeric,
  signal_agreement   numeric,
  rationale          jsonb not null,                  -- { headline, bullets[] }
  model_version      text not null,
  config_version     text not null,
  created_at         timestamptz not null default now()
);
create unique index on public.picks (run_id, pick_key);
create index on public.picks (sport, slate_date, tier);
create index on public.picks (game_id);
```

### 4.3 `pick_results` — settlement

```sql
create table public.pick_results (
  pick_id            uuid primary key references public.picks(id) on delete cascade,
  status             text not null check (status in ('won','lost','push','void','pending')),
  final_away_score   integer,
  final_home_score   integer,
  settled_at         timestamptz not null default now(),
  notes              text
);
create index on public.pick_results (status);
```

### 4.4 `picks_daily_scorecards` — one row per sport per slate

```sql
create table public.picks_daily_scorecards (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null,
  slate_date         date not null,
  record             jsonb not null,                  -- { won, lost, push, pending }
  by_market          jsonb not null,
  by_tier            jsonb not null,
  top_play_result    text,                            -- 'won'|'lost'|'push'|'pending'|null
  streak             jsonb,
  note               text,
  computed_at        timestamptz not null default now(),
  unique (sport, slate_date)
);
```

### 4.5 `picks_tuning_log` — every proposed & applied config delta

```sql
create table public.picks_tuning_log (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null,
  slate_date         date not null,                   -- date audit was run against
  from_config_version text not null,
  to_config_version  text not null,
  delta              jsonb not null,                  -- { field: { before, after } } (ALL fields)
  rationale          jsonb not null,                  -- audit findings that drove the delta
  sample_size        integer not null,
  status             text not null check (status in ('proposed','shadow','applied','rolled_back','rejected')),
  applied_at         timestamptz,
  reverted_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index on public.picks_tuning_log (sport, status, slate_date desc);
```

### 4.6 `picks_config` — active & candidate configs (tunable)

```sql
create table public.picks_config (
  version            text primary key,                -- 'mlb-picks-tuning-2026-04-17a'
  sport              text not null,
  is_active          boolean not null default false,  -- exactly one active per sport
  is_shadow          boolean not null default false,
  config             jsonb not null,                  -- full tuning object (see §5.1)
  created_at         timestamptz not null default now(),
  activated_at       timestamptz,
  deactivated_at     timestamptz
);
create unique index picks_config_one_active on public.picks_config (sport) where is_active;
```

### 4.7 `picks_audit_artifacts` — daily audit records

```sql
create table public.picks_audit_artifacts (
  id                 uuid primary key default gen_random_uuid(),
  sport              text not null,
  slate_date         date not null,
  summary            jsonb not null,                  -- overall, byMarket, byTier, byBand, topHits, topMisses
  signal_attribution jsonb not null,                  -- per-signal hit rate
  recommended_deltas jsonb not null,                  -- proposed tuning changes (pre-bounds)
  applied_tuning_id  uuid references public.picks_tuning_log(id),
  created_at         timestamptz not null default now(),
  unique (sport, slate_date)
);
```

---

## 5. Safe Tuning Config Layer

### 5.1 Tuning config object

```jsonc
{
  "version": "mlb-picks-tuning-2026-04-17a",
  "sport": "mlb",
  "weights": { "edge": 0.40, "conf": 0.25, "sit": 0.20, "mkt": 0.15 },
  "tierCutoffs": {
    "tier1": { "floor": 0.75, "slatePercentile": 0.90 },
    "tier2": { "floor": 0.60, "slatePercentile": 0.70 },
    "tier3": { "floor": 0.45, "slatePercentile": 0.50 }
  },
  "maxPerTier": { "tier1": 3, "tier2": 5, "tier3": 5 },
  "maxPerGame": 2,
  "maxTier1PerGame": 1,
  "marketGates": {
    "total": { "minConfidence": 0.55, "minExpectedDelta": 0.35 },
    "runline": { "minProbSpread": 0.05 }
  },
  "components": {
    "edge":  { "mlCap": 0.10, "rlCap": 0.08, "totDeltaCap": 1.5 },
    "mkt":   { "minConsensusBooks": 3 }
  }
}
```

### 5.2 Hard guardrails (enforced in `validateTuningDelta()`)

| Guardrail | Rule |
|---|---|
| Weights sum to 1.0 | `Σ weights = 1.000 ± 0.001` |
| Max weight move per cycle | `|Δw| ≤ 0.05` per component |
| Weight range | Every weight in `[0.05, 0.60]` |
| Tier floor monotonicity | `tier1.floor > tier2.floor > tier3.floor` |
| Tier floor move per cycle | `|Δfloor| ≤ 0.05` |
| Max picks caps | `tier1 ≤ 5`, `tier2 ≤ 10`, `tier3 ≤ 10` |
| Sample-size minimum for ANY auto-apply | `≥ 75 graded picks` across last 14 days for the affected market |
| Shadow period before auto-apply | `≥ 7 days shadow` when moving any weight |
| Revert conditions | Score-weighted ROI proxy drops > 5 pts over 7-day window → auto-rollback |

### 5.3 Flow

```
(daily audit) → proposes delta
(validator)   → bounds-check; out-of-bounds = reject + log
(if safe)     → write new picks_config row as is_shadow=true
(shadow N)    → system also computes "what would v'_shadow have picked" daily
(comparator)  → after 7 days, if shadow ROI proxy > active ROI proxy by > 2 pts AND sample ≥ 75, auto-promote
(promote)     → deactivate old, activate new, log to picks_tuning_log (status='applied')
(rollback)    → manual (button) or auto on degradation → activate previous config
```

Default mode: **shadow only**. Auto-promote is behind an env flag `PICKS_TUNING_AUTO_APPLY=1` that is off by default.

---

## 6. Endpoints (new / modified)

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/mlb/picks/built` | GET | **Modified.** Returns canonical v2 payload with `legacy.categories` for back-compat. Also writes to `picks_runs` + `picks` async. |
| `GET /api/mlb/picks/scorecard?date=YYYY-MM-DD` | GET | Returns `picks_daily_scorecards` row for the date (default: yesterday ET). |
| `GET /api/mlb/picks/history?from=…&to=…&tier=…` | GET | Paginated historical picks with results. |
| `POST /api/cron/mlb/settle-yesterday` | POST (cron) | Pulls yesterday's finals from ESPN, writes `pick_results`. |
| `POST /api/cron/mlb/build-scorecard` | POST (cron) | After settlement, computes & upserts `picks_daily_scorecards`. |
| `POST /api/cron/mlb/run-audit` | POST (cron) | Produces `picks_audit_artifacts` row + proposes tuning delta. |
| `GET /api/admin/picks/tuning/:sport` | GET | Admin: current active + shadow config + pending proposals. |
| `POST /api/admin/picks/tuning/:sport/apply` | POST | Admin: promote a shadow config. |
| `POST /api/admin/picks/tuning/:sport/rollback` | POST | Admin: revert to previous active. |

All endpoints are `sport`-scoped, so NBA mounts at `/api/nba/picks/…` with the same handler + sport param.

---

## 7. Daily Audit Pipeline

A single cron (`/api/cron/mlb/run-audit`, scheduled ~4 AM ET) performs:

1. **Load** yesterday's `picks` + `pick_results`.
2. **Aggregate** performance by: tier, market, edge band (0–2% / 2–5% / 5%+), home/away, favorite/dog, short odds (< −150) vs plus, recent-form vs baseline, presence/absence of each situational signal.
3. **Signal attribution**: for each scoring signal present in winning vs losing picks, compute hit-rate delta. Flag signals whose presence correlates with wins (positive attribution) and those that don't (neutral/negative).
4. **Top hits / top misses**: 3 biggest bet-score-weighted wins and losses.
5. **Suggest deltas**: rules-based proposer consumes the attribution; examples:
   - If tier1 hit rate < 55% over 14-day window, propose `+0.02` to all tier floors.
   - If `edgeStrength` attribution > `modelConfidence` attribution by > 10 pts, propose `+0.03` to `wE` and `−0.03` to `wC`.
   - If totals hit rate < 45%, propose `+0.05` to `marketGates.total.minExpectedDelta`.
6. **Validate deltas** against §5.2 guardrails.
7. **Write** `picks_audit_artifacts` row; if safe, create a shadow `picks_config`; log to `picks_tuning_log`.

All changes are **proposals** until the promotion criteria (§5.3) are met. A human can always accept/reject via the admin endpoint.

---

## 8. Settlement Pipeline

Cron (`/api/cron/mlb/settle-yesterday`, ~3 AM ET):

1. Fetch yesterday's ESPN finals (`fetchYesterdayFinals()` already exists in `api/mlb/live/_normalize.js`).
2. For each `pick` where no `pick_results` row exists AND game was scheduled for that date:
   - Map game final → pick outcome using market-specific rules:
     - **Moneyline**: side won/lost on final; pushes only on voided games.
     - **Runline**: apply `line_value` to final margin; push if net margin equals line exactly.
     - **Total**: final total vs `line_value`; push if equal.
3. Handle edge cases: postponed → `pending` (re-settled next run), voided → `void`, suspended → `pending`.
4. Write `pick_results` rows.

Idempotent: safe to re-run. Primary key is `pick_id` on `pick_results`.

---

## 9. UI Hierarchy (app)

New layout for `/mlb/picks` (component replaces or wraps `MlbMaximusPicksSection.jsx`):

```
┌─────────────────────────────────────────────────┐
│  📊 YESTERDAY'S SCORECARD                       │
│  3-1 overall • Top Play hit                      │
│  ML 1-0 · RL 1-1 · Tot 1-0                       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  🏆 TODAY'S TOP PLAY                            │
│  NYY ML −135                                    │
│  "Rotation mismatch + market steam our way"     │
│  Conviction 92 · Edge 6.9% · Confidence 78%     │
└─────────────────────────────────────────────────┘

TIER 1 — MAXIMUS TOP PLAYS
 • Pick card · Pick card

TIER 2 — STRONG PLAYS
 • Pick card · Pick card · Pick card

TIER 3 — LEANS    (collapsed on mobile by default)
 • Pick card · Pick card
```

Pick card contents (mobile-first):
- Matchup (away @ home) with logos
- Pick label + line (large)
- One-line rationale (headline)
- Conviction pill (0–99)
- Tap-to-expand: bet-score components bar chart + bullets + top signals + result badge (won/lost/push) when historical

### 9.1 When a bet-type category is empty

Rather than empty columns, render a single inline note:
> No strong **Total** edges today — models didn't flag any with > 0.35-run expected delta.

---

## 10. Email & IG Alignment

- **Email (`mlbPicks.js` + `globalBriefing.js`):** switch to reading `tiers` + `topPick` + `scorecardSummary`. Render Top Play as a hero block, then Tier 1/2 as cards. Yesterday's record appears in the header.
- **IG caption (`buildMlbCaption.js`):** select `topPick` + 2 of tier1 for the carousel. Caption template ties conviction score into the narrative ("Tier 1 play — 92 conviction — NYY ML").

Both paths read the same canonical payload; `legacy.categories` only exists during the transition.

---

## 11. Testing Strategy

### 11.1 Unit

- `scoreMlbMatchupV2` — golden-data tests for each signal independently; full composite against fixtures.
- `computeBetScore` — bounds `[0,1]`, weight-sum validation, component independence.
- `pickTier` — cutoff logic, percentile behavior, `maxTier1PerGame`, `maxPerGame`.
- `validateTuningDelta` — every guardrail in §5.2 has a test both at the boundary and past it.
- `settlePick` — each market type × (won | lost | push | postponed | voided | future).

### 11.2 Contract / snapshot

- Canonical payload snapshot test — freezes the shape consumed by app/email/IG. Any change requires intentional snapshot update.
- Migration round-trip test — insert pick → fetch → deserialize → equal.

### 11.3 Edge cases

- No games today → empty `tiers`, `topPick = null`, `scorecardSummary` populated.
- No picks yesterday → `scorecardSummary.overall = { won:0, lost:0, push:0, pending:0 }`, `note = "No picks yesterday"`.
- Postponed game settlement → `status = 'pending'`, retried next run.
- Push on runline / total — explicit tests.
- Missing odds on a game → game dropped from candidates, logged in `meta.skippedGames`.

### 11.4 Backtest (rebuilt)

`scripts/backtestMaximusPicks.js` is rewritten to:
- Target MLB endpoints (not basketball).
- Replay historical `picks_runs` against historical finals from ESPN.
- Produce a per-config report: record, ROI proxy, tier-calibration, signal attribution.
- Used to validate a shadow config before promotion.

---

## 12. NBA Extensibility

The architecture assumes `sport` is a first-class dimension everywhere:

- Every table has `sport` column + indexes.
- Every endpoint accepts sport via path.
- Scoring module lives at `src/features/<sport>/picks/` with the same interface:
  `normalizeMatchup`, `computeComponents`, `betScore`, `settlement adapter`.
- Tuning configs are `sport`-scoped. A weight change for MLB does not touch NBA.

To add NBA, create the sport-specific `normalize/score/settle` and reuse the entire `picks/tiering/scorecard/audit/tuning` spine.

---

## 13. Operational Principles

- **Writes to `picks_runs`/`picks` are best-effort** from the main `/built` hot path (non-blocking Promise with failure log). The pick is served regardless.
- **Idempotency** everywhere: re-running any cron in the pipeline is safe.
- **Version stamps** on every pick; never mutate a past pick's record.
- **Reversibility**: `picks_config` always retains historical versions; reverting is "activate an earlier version."
- **Observability**: each cron writes a structured log event (`{ sport, date, counts, error }`). Surface these as a /health/picks-pipeline endpoint.

---

*End of target architecture.*
