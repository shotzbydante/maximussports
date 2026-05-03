# NBA Playoff Picks — Model Audit v1

**Date:** 2026-05-02
**Engine under review:** `src/features/nba/picks/v2/buildNbaPicksV2.js`
**Active config:** `nba-picks-tuning-2026-04-24a` (default) / DB‑override via `getActiveConfig`
**Surface affected:** `/api/nba/picks/built`, `/nba` (NbaHome), `/nba/picks` (NbaPicks)

---

## 1. Slate snapshot — picks vs. results

| Pick (UI) | Conviction | Edge | Confidence | Driver | Result |
|---|---|---|---|---|---|
| SAS −14 vs MIN | 74 | +31.7% | 33% | market mispricing | **LOSS** (SAS won inside the number, model push/loss vs −14 ATS — covered margin uncertain in spec but flagged) |
| CLE −3.5 vs TOR | 73 | +21.8% | 33% | market mispricing | **LOSS** — TOR 112, CLE 110 (OT) |
| BOS −8 vs PHI | 73 | +19.6% | n/a | market mispricing | **LOSS** — PHI 109, BOS 100 (Game 7, Tatum out, 3‑1 comeback) |
| ORL −15.5 vs DET | 73 | +44.7% | n/a | market mispricing | **LOSS** — DET 93, ORL 79 |
| HOU −3.5 vs LAL | 72 | +26.4% | n/a | market mispricing | **LOSS** — LAL 98, HOU 78 |

Five picks, five losses. Every pick is a favorite, every pick is a spread, every primary driver is "market mispricing", every confidence reading is in the low‑30s while every conviction sits 72–74.

The slate is too small to "tune to" — but the failure pattern is structural, not stochastic.

---

## 2. Engine architecture (today)

### 2.1 Inputs

* **ESPN scoreboard** → game schedule, teams, status (`api/_lib/nbaPicksBuilder.js`).
* **Odds API** (`api/nba/live/_odds.js`) → moneyline + spread + total, plus a derived `pregameEdge` and `confidence`.
* **No injury feed.** No availability data flows into the picks engine.
* **No playoff series state.** `src/data/nba/playoffContext.js` derives `isElimination`, `isGameSeven`, `isCloseoutGame` for the daily briefing — but the picks engine never reads it.

### 2.2 The "model"

`api/nba/live/_odds.js` (`enrichGamesWithOdds`):

```
impliedProb  = moneyline → implied probability (vig still in)
fairSpread   = -(impliedProb - 0.5) × 16.67
pregameEdge  = fairSpread - market_spread
confidence   = booksCount / 8
```

Two consequential properties of this "model":

1. `pregameEdge` is **not a prediction**. It is purely a moneyline‑vs‑spread arbitrage signal: it asks "does the moneyline imply a different spread than the market posted?" In NBA playoff slates that almost always resolves to "the chalk is even chalkier on the ML than the spread implies" — so the signal points to the favorite, repeatedly. There is no team‑strength model, no rotation/injury intelligence, no playoff context.
2. `confidence` is **bookmaker liquidity**, not model trust. With 3/8 books reporting you get `0.375` regardless of the model's actual certainty. This is exactly the "confidence ~33%" signal the user observed — three‑book slates light up that field even when nothing about the prediction is uncertain.

### 2.3 Bet score composition

`computeBetScore` (`src/features/mlb/picks/v2/betScore.js`) — shared with MLB:

```
betScore = 0.40·E + 0.25·C + 0.20·S + 0.15·M
```

* **E (edgeStrength)** — soft-squashed `|rawEdge|` against `mlCap=0.10` / `spreadCap=0.08`. With `rawEdge ≈ 0.30` (e.g. SAS −14), the squash saturates at ~1.0.
* **C (modelConfidence)** — `dataQuality × signalAgreement`. `dataQuality` heavily weights `book confidence` which is the books/8 metric. So C also moves with liquidity, not certainty.
* **S (situationalEdge)** — `components.js#situationalEdge` reads MLB‑specific fields (`frontlineRotation`, `bullpenQuality`, `record`+`projectedWins`). For NBA, almost none of those exist on the matchup, so S collapses to ≈ 0.55 (home tilt) for every NBA pick.
* **M (marketQuality)** — line presence + book consensus. ≈ 0.85 anytime three books reported.

For SAS −14 the score adds up to roughly:

```
0.40 × 1.00 (E saturated) +
0.25 × 0.30 (C: 33% liquidity)  ≈ 0.075
0.20 × 0.55 (S: home tilt only) = 0.11
0.15 × 0.85 (M: line present)   ≈ 0.13
─────────────────────────────────
                                 ≈ 0.71  →  conviction "Strong" (≥0.70)
```

That's the source of **conviction 73 with confidence 33** — `E` does almost all the work, the other components are nearly constant.

### 2.4 Tiering and coverage

* `assignTiers` uses dynamic slate percentiles + hard floors. NBA tier‑1 floor is `0.80` (vs MLB 0.75) and tier‑1 cap is `2`. ✅
* Large‑spread penalty fires when `|spread| > 10` AND `|modelEdge| < 0.06`. Because rawEdge in this engine is the implied‑prob delta (≈ 0.3 in chalk lines), the penalty's `requiredModelEdge` gate is **trivially passed** and it never bites. ❌
* Coverage pool floor is `0.40` (vs MLB 0.30). ✅
* Underdog ML floor is `0.04`. ✅
* Spread minEdge floor is `0.03`. ✅ — but in playoff chalk lines this is also trivially passed.

### 2.5 Persistence

* Picks board cached in KV (`nba:picks:built:latest`, `nba:picks:built:lastknown`).
* Picks rows + scorecards persist via `picksHistory.writePicksRun` → Supabase.
* Audit artifacts (`picks_audit_artifacts`) feed `/api/nba/picks/insights` for editorial copy.

---

## 3. Failure analysis by dimension

### 3.1 By spread size

| Spread bucket | Picks | Hits |
|---|---|---|
| `−3.5 to −5` | 2 (CLE, HOU) | 0 |
| `−6 to −10` | 1 (BOS −8) | 0 |
| `> 10` | 2 (SAS −14, ORL −15.5) | 0 |

The two huge favorites (`> 10`) are exactly the spots the existing large‑spread penalty was designed for, but the gating condition (`requiredModelEdge < 0.06`) is the wrong dimension — the rawEdge for those picks is enormous, so the penalty exempts them. **The penalty needs to invert: when the spread is huge AND raw edge is huge, that's exactly when to be more skeptical, not less.**

### 3.2 By favorite vs underdog

100% of picks were favorites. The model's "market mispricing" signal is a one‑way ratchet because of how the moneyline‑vs‑spread arbitrage resolves on chalk slates. There is no exposure to underdog signal at all.

### 3.3 By home vs away

Of 5 picks: SAS home, CLE away, BOS home, ORL home, HOU away. Three home, two road. Geography wasn't the failure mode.

### 3.4 By conviction tier

All five picks landed in `conviction.label = "Strong"` (0.70–0.85). `conviction.score` 72–74 is exactly the "Strong" floor, indicating they barely cleared. **None were classified Top Play (≥0.85).** That's correct behavior — no Top Play was published from this slate. The visible failure is users seeing five "Strong" badges on a 0–5 night.

### 3.5 By primary driver

Every pick's primary signal is **market mispricing** — i.e. the only model input. There are no concurring signals. **The model has no multi‑factor agreement filter.** A single‑driver pick can publish at conviction 73 today.

### 3.6 BOS −8 vs PHI, Game 7

This is the most informative miss because the structural failures are simultaneous:

1. **Game 7 elimination** — the game was Game 7 of a series Boston had led 3‑1. The picks engine never reads `playoffContext.isGameSeven`. ESPN's `signals.importanceScore` is the only proxy and it's a generic 0–100 number — it doesn't change behavior, just labels.
2. **Star unavailability** — Tatum was out. The picks engine has no injury feed. No availability flag exists on the matchup object. The model literally couldn't see this.
3. **Closeout reflex** — historically, home teams up 3‑1 going into Game 7 against road comeback artists are a noisy bucket; books juice ML chalk to compensate. That's exactly the moneyline‑vs‑spread dislocation the engine reads as "edge" and amplifies into Strong conviction.
4. **Spread size 8** — *just below* the existing `penaltyAbove: 10` gate. Even if the penalty worked correctly, it wouldn't have fired on BOS −8.

The result: a pick with high "edge" but no concurring evidence, surfaced at "Strong" conviction in the worst possible playoff spot.

---

## 4. Root causes (ranked)

1. **`rawEdge` dominates `betScore` in chalk lines.** Edge weight is 40% and the squash saturates well below the values typical NBA playoff chalk produces. Single‑driver picks can clear `0.70` without any other component moving.
2. **`confidence` is liquidity, not certainty.** Three‑book reads light up `confidence ≈ 0.33` while `conviction ≈ 0.70+`. This is exactly the mismatch the user observed.
3. **No availability / injury awareness.** A star‑out on a favorite is the single highest‑leverage NBA spot and the model is completely blind to it.
4. **No playoff state awareness.** `playoffContext` is derived for the daily briefing but never reaches the picks engine. Game 7s, closeout games, and elimination spots fire identically to a regular‑season Tuesday.
5. **Large‑spread penalty inverted.** The current gate exempts blowouts when `rawEdge` is high — exactly the wrong condition. The correct rule is: huge spread + chalk edge from a single driver = **less** trust, not more.
6. **Single‑driver picks can publish at "Strong".** No multi‑factor agreement requirement.
7. **Situational component is dead weight for NBA.** All MLB‑specific reads (`bullpenQuality`, `frontlineRotation`, …) collapse to a constant.

---

## 5. Recommended fixes — sequenced

### 5.1 Ship now (this audit)

* **R1. Conviction calibration.** Cap `conviction.label` to ≤ "Lean" when `bookConfidence ≤ 0.35` unless multi‑factor support exists. Cap `conviction.score` proportionally so the badge and number agree.
* **R2. Single‑driver cap.** When the only signal is `market mispricing` (i.e. `rawEdge` is the sole positive component), cap conviction below "Top Play" and label as "market‑only lean".
* **R3. Spread discipline.**
  * Inverted large‑spread rule: when `|spread| ≥ 8`, require **multi‑factor support OR strong (≥0.55) confidence** before publishing. When `|spread| ≥ 12`, hard‑cap at "Lean" tier unless multi‑factor agreement exists.
  * Spread picks require `(rawEdge ≥ minEdge) AND (confidence ≥ confFloor OR situationalEdge ≥ sitFloor)` — not edge alone.
* **R4. Coverage quality.** Don't pad to a target count. Allow "Top Play empty / Strong empty" days. Bump coverage min score to `0.45`.
* **R5. UI honesty.** Map low‑confidence picks to "Lean" in the UI regardless of betScore, label market‑only picks explicitly, and never label a low‑confidence pick "Solid" or "Strong".
* **R6. Injury‑data‑missing guard.** Add an explicit `injuryDataAvailable: false` flag at build time. When `false`:
  * cap conviction below "Top Play" for favorites,
  * apply a small confidence haircut to all favorite spread picks,
  * pass the flag through to the UI so the disclaimer is honest.
* **R7. Playoff/Game‑7 awareness.** Pull `playoffContext` into `nbaPicksBuilder` and pass relevant flags onto each game. When the matchup is `isGameSeven` or `isElimination` for a home favorite ≥ 5, suppress Top‑Play eligibility and require multi‑factor support to publish at all.

### 5.2 Defer (needs data)

* A real NBA team‑strength prior (Elo / SRS‑style) so `pregameEdge` becomes an actual prediction.
* An injury feed (NBA injury report API or news‑digest derived) so the availability haircut becomes data‑driven.
* Closing‑line value backtesting once we have ~30 days of graded picks.

---

## 6. BOS −8 — what would change after R1–R7

* **R7** flags Game 7 → home‑favorite (BOS) suppression of Top Play AND requires multi‑factor support to publish. With only "market mispricing" as a driver → **suppressed entirely**.
* **R6** flags `injuryDataAvailable: false` → no Top Play, confidence haircut for favorites.
* **R3** spread‑validation rule: `BOS −8` spread ≥ 8 requires multi‑factor or confidence ≥ 0.55. Confidence is 0.33. **Fails the gate.**
* **R2** single‑driver cap: only `market mispricing` → caps conviction below Top Play, label "market‑only lean".

After the change set, BOS −8 would not be published as a pick at all. ORL −15.5 and SAS −14 would either be suppressed or downgraded to "Lean" with explicit market‑only labeling.

---

## 7. Caveats

* Do not over‑interpret one slate. R1–R7 are corrections to identified structural weaknesses — they are not a re‑tune to make these five picks disappear. The same rules will silently remove a similar set of bad picks across many slates.
* The "model" is still moneyline‑vs‑spread arbitrage. None of these changes give the engine a real basketball brain. They make it more honest about what it doesn't know.
* The injury/availability guards are conservative because the data isn't there yet. When a feed lands they should be replaced with a real availability adjustment, not just a haircut.
