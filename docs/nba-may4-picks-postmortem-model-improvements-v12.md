# May 4 Picks Postmortem & Model Improvements (v12)

Date: 2026-05-04 → 2026-05-05
Branch: `claude/practical-williamson-21bc72`
Production baseline at audit time: `c5fd9f8` / `nba-picks-v2.2.0` (v11 + UI clarity tweaks)

Two losing hero picks on the May 4 slate:
1. **PHI ML +236** vs NYK — PHI lost 98–137 (lost by 39).
2. **SAS -13** vs MIN — SAS lost outright 102–104.

Two winning picks:
3. **NYK -7.5** ATS — covered by 31.5.
4. **PHI @ NYK Over 213** — total 235, over by 22.

This audit determines what generated each pick, why the bad ones were bad, and what model improvements ship in v12.

---

## 1. Production / version sanity check

| field | value |
|---|---|
| `/api/version` | `c5fd9f8`, `nba-picks-v2.2.0` |
| `_cacheStatus.cacheKey` | `nba:picks:built:nba-picks-v2.2.0` |
| `_source` | `fresh` |

Live model is v11. But the **persisted picks for slate 2026-05-04 were generated under earlier code** — proven by `rawEdge: 0.303` on SAS -13. v9+ caps spread `rawEdge` at `RAW_EDGE_CAP=0.20` via `pickSpreadSide.pointsToRawEdge`. A persisted value of 0.303 cannot have come from v9/v10/v11; it must be from v8 ATS:
```js
// pre-v9 ATS (no cap)
rawEdge: (score.homeWinProb - (implHome ?? 0.5)) * 0.9
```

Conclusion: **the May 4 picks were generated under v8 and persisted before v9/v10/v11 reached the persistence path.** They were then graded after the new code was live. This audit doesn't relitigate those picks individually — instead, v12 hardens the going-forward model so the same patterns don't repeat.

---

## 2. Pick-level forensic audit

### 2.1 PHI ML +236 (LOSS by 39)

```
{ pickKey: '401871159-moneyline-away',
  marketType: 'moneyline', selectionSide: 'away',
  priceAmerican: +236, betScore: 0.549, rawEdge: 0.080,
  modelProb: 0.366, impliedProb: 0.286,
  convictionTier: 'tier3', rationale.pickRole: 'hero',
  status: 'lost', finalScore: 'PHI 98 – NYK 137' }
```

- Spread was -7.5 (PHI was a moderate dog, cover edge ATS = 1.4 pt).
- ML implied PHI 28.6% no-vig.
- Spread-derived model said PHI 36.6%.
- 7.6% rawEdge cleared the v10 cross-market hero gate (≥ 0.10? NO — rawEdge was 0.08, *below* the v10 floor of 0.10). The pick still got `rationale.pickRole: 'hero'` because:
  - tier3 floor = 0.45; betScore 0.549 cleared.
  - Pre-v10 hero promotion gated only on `betScore >= HERO_FLOOR (0.50)`, not on `modelSource` or rawEdge.

Why it lost: **NYK swept PHI by 39.** The cross-market signal (spread says PHI tighter than ML implies) was real but small — it never said PHI would *win*. ML edge of 7.6% on a +236 dog has +EV in the long run only if the model is right ~30% of the time; one game variance is enormous, and a 39-point blowout means PHI's true probability was nowhere near 30%.

What v12 changes:
- **Long-shot dog risk flag** — `priceAmerican >= +200` AND `modelSource ∈ {spread, devigged_ml, no_vig_blend}` AND no independent team-form support → `pickRole=tracking`, never hero/briefing.
- **Recent-form prior** — checks NYK margin trend; if NYK is averaging double-digit wins, PHI's ML edge is suppressed.

### 2.2 SAS -13 (LOSS, did not cover by 15)

```
{ pickKey: '401871160-spread-home',
  marketType: 'runline', selectionSide: 'home',
  lineValue: -13, betScore: 0.549, rawEdge: 0.303,
  modelProb: 0.693, convictionTier: 'tier3',
  rationale.pickRole: 'hero',
  status: 'lost', finalScore: 'MIN 104 – SAS 102' }
```

- `rawEdge: 0.303` exceeds v9's RAW_EDGE_CAP (0.20). Confirms pre-v9 generation.
- v9+ would project SAS margin from the de-vigged ML (+0.876 → ~10.5 points), compute `homeCoverEdge = 10.5 + (-13) = -2.5` → **picks MIN** at +13, not SAS at -13.
- Pre-v9 ATS used `(homeWinProb - implHome) * 0.9` against a synthesized `homeWinProb` — broken closed loop that overshot.

Why it lost: SAS lost outright by 2 against a road dog. -13 was a stale or aggressive line; MIN was clearly more competitive than the spread implied. There was no recent-margin support — playoffs typically tighten margins, and double-digit favorites in playoffs cover only ~45% historically.

What v12 changes:
- **Large-favorite spread risk flag** — `lineValue <= -10` AND no recent-margin support → `pickRole=tracking`, never hero/briefing.
- **Recent-margin support** — looks at the favorite's recent average margin and the underdog's recent margin; only a clear margin-vs-spread cushion qualifies.

### 2.3 NYK -7.5 ATS (WON by 31.5)

```
{ pickKey: '401871159-spread-home',
  marketType: 'runline', lineValue: -7.5,
  betScore: 0.549, rawEdge: 0.174,
  rationale.pickRole: 'hero',
  status: 'won', finalScore: 'PHI 98 – NYK 137' }
```

The ATS pick that *did* win was on the **opposite side of the same game** as PHI ML. Same model run produced both PHI ML (loss) and NYK -7.5 (win). The market correctly priced NYK as the favorite; the spread cover edge was real. This is healthy: when ML and ATS markets disagree, the richer market (spread) is generally more accurate, so v9+ rightly prefers cover edge over ML edge.

### 2.4 OVER 213 (WON by 22)

```
{ marketType: 'total', selectionSide: 'over', lineValue: 213,
  rationale.pickRole: 'hero', status: 'won' }
```

Final 235 vs 213 — *huge* over-cover. The fair-total signal came from `team_recent_v1+trend_v1`, blending NYK's recent scoring environment + PHI's recent scoring + a trend nudge. Both teams had been playing in 220+ totals lately. Real signal, real win.

---

## 3. Team-specific lessons

Without a true rating system we use ESPN finals already loaded into `windowGames`. v12 derives:

| field | source |
|---|---|
| `recentScoringAvg` | mean of team's last finals points-for |
| `recentAllowedAvg` | mean of points-against |
| `recentMarginAvg` | mean of (PF − PA) signed by side |
| `recentTotalAvg` | mean of (PF + PA) |
| `sample` | number of priors used |
| `confidence` | `min(sample / 6, 1.0)` |

For the May 4 slate (post-game inference):
- **NYK**: hot offense, large positive margins → would have flagged PHI ML edge as weak.
- **PHI**: cold and trending toward losses → would have downgraded PHI ML.
- **SAS**: erratic, narrow margins → would have flagged SAS -13 as risky.
- **MIN**: tighter margins, strong defense → would have countered SAS large-favorite spread.

These flags are **bounded** — small additive penalties, never overrides. One day's pattern alone never auto-tunes the config; the audit cron logs these as shadow recommendations.

---

## 4. Totals postmortem

The Over 213 pick worked because `team_recent_v1+trend_v1` had real evidence: both teams' recent combined-score averages were elevated, and the trend layer added a small upward adjustment. The fair total (~225) cleared the 213 line by 12 points → hero-eligible per v11 briefing rules, and the over hit by 22.

v12 adds:
- `totalsTrendAgreement` flag — fires when both teams' recent totals trend point the same direction as the model's pick.
- Confidence boost when both teams agree; cap when they conflict.
- Audit slice: hit rate by `totalsTrendAgreement`.

This is a small additive layer, not an overhaul. The existing chain (series_pace → team_recent → slate_baseline) is unchanged.

---

## 5. Model improvements landing in v12

### 5.1 New helper `src/features/nba/picks/v2/teamForm.js`
Computes per-team recent margin / scoring / volatility from `windowGames`. Pure function. Sample-size confidence cap at 6 priors.

### 5.2 `applyTeamFormGuardrail` in `selectBriefingPicks` and the hero gate
- **Long-shot ML dog**: `price ≥ +200` AND cross-market AND `recentMarginSupport` is null/negative → reject from briefing AND demote from hero.
- **Large favorite spread**: `lineValue ≤ -10` AND `recentMarginSupport` < spread magnitude → reject from briefing AND demote from hero.

`recentMarginSupport` is the favorite's recent margin average minus the underdog's. Strong support means it materially exceeds the spread.

### 5.3 Totals trend agreement
`recentScoringTrend` already exists. v12 adds `totalsTrendAgreement` to the totals pick metadata so the audit and UI can use it.

### 5.4 Bounded — does not change full-slate contract
Every game still produces ML / ATS / Total. v12 only changes which picks are eligible for hero or briefing.

---

## 6. Audit / learning loop additions

`analyzeNbaPicks` (NBA audit) gains:
- `byLongShotDog`: hit rate of `priceAmerican >= +200` ML picks.
- `byLargeFavoriteSpread`: hit rate of `|lineValue| >= 10` spread picks.
- `byTotalsTrendAgreement`: hit rate when both teams' recent trend agreed.
- New regime flags: `long_shot_dog_miss_streak`, `large_favorite_spread_miss_streak`.

Single-day picks (≤ 4 picks, the May 4 slate) generate **shadow recommendations only** — never auto-applied. Sample threshold for any auto-tuning stays at 30+.

---

## 7. UI / debug surfaces

- Scorecard rows already render `Long-shot ML dog`, `Large spread risk`, `Tracking` flags via the v9/v10 source pills. v12 doesn't add UI clutter — same pills, more accurate now that more picks are tracking.
- `/api/nba/picks/built?debug=1` already returns `_debugByGame` and `_debugBriefing`; v12 picks now include `teamFormDebug` per pick when relevant.

---

## 8. Caveats

- Two-pick sample is far below the 30-sample threshold for auto-tuning; v12 changes are bounded, evidence-based, and reversible. The audit logs the May 4 misses as shadow recommendations.
- `recentMarginSupport` uses ESPN finals from the existing 7-day past window. Larger context windows would tighten the signal but require new fetch logic.
- Independent NBA priors (efficiency, pace, injuries) remain absent. v12 is the best honest signal we can extract from data already loaded — not a real model.
- Some bad tracking picks will still appear on `/nba/insights` because the full-slate contract requires every game to produce ML/ATS/Total. The v11.1 banner + toggle + hatched chrome already prevent these from being misread as hero plays.
