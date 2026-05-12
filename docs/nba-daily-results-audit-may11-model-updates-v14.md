# NBA Daily Results Audit — May 11, 2026 (v14)

Date: 2026-05-11 → 2026-05-12
Branch: `claude/practical-williamson-21bc72`
Production at audit time: `04bcd98` / `nba-picks-v2.4.1` (v13b)

User-provided picks + results:

| Game | Market | Pick | Final | Margin | Role | Source |
|---|---|---|---|---|---|---|
| DET @ CLE | ML | DET +138 | CLE by 9 | LOSS −9 | tracking | cross-market |
| DET @ CLE | ATS | DET +3.5 | CLE by 9 | LOSS cover by −5.5 | tracking | market disagreement |
| DET @ CLE | Total | Over 212.5 | 215 | **WIN +2.5** | tracking | series pace prior |
| OKC @ LAL | ML | LAL +450 | OKC by 5 | LOSS −5 | tracking | large spread / no-vig blend |
| OKC @ LAL | ATS | LAL +12.5 | OKC by 5 | **WIN cover by +7.5** | tracking | market disagreement |
| OKC @ LAL | Total | Over 214.5 | 225 | **WIN +10.5** | tracking | series pace prior |

**Overall: 3–3 full-slate, 0 hero (all picks were tracking-only — v13b gates fired correctly).**

---

## 1. Production / version + persistence

```
$ curl https://maximussports.ai/api/version
{ git.sha: "04bcd98...", model.nba: "nba-picks-v2.4.1" }

$ curl ".../api/nba/picks/scorecard?includePicks=1&debug=1&date=2026-05-11"
selectedSlateDate: 2026-05-11
diagnostics: { picksFound: 0, resultsFound: 0, joinedRows: 0 }
```

**The May 11 picks were never persisted to the picks DB.** This is the same operational/cron gap flagged in the v13b weekend audit — the live `/api/nba/picks/built` endpoint serves picks (via KV), the UI renders them, but the build-scorecard cron + write-run cron didn't fan out to the picks table. So the forward-looking audit slices (`byMarket`, `byPickRole`, etc.) will continue to show small samples until the persistence path is fixed.

That's a deployment/cron concern outside the model. v14 ships forward-looking model gates and adds explicit slices to the audit module so the next persisted batch is more informative.

Model version that generated today's picks: **`nba-picks-v2.4.1`** (v13b — series-context prior + recency-weighted team form + v13 totals volatility + v13 ATS cushion + v12 long-shot caps).

---

## 2. Pick-level postmortem

### 2.1 DET +138 ML — LOSS

The pick was already `tracking` (correct under v12b). The model picked DET because cross-market signal (spread −3.5 implies DET ~46%, no-vig ML implied ~42%, edge ~+4%) said the spread was slightly tighter than ML.

**Why it lost:** small cross-market disagreements don't predict outright wins — they predict the side the spread is over-weighting. In playoff games against a hot home favorite (CLE coming off a Game 2 win), the 4% edge is far below the variance of one game.

What v14 changes: tighter ML dog cap. Even moderate dogs (+100..+199) with cross-market-only signal should have betScore capped below the v12 ceiling so they can't sneak toward hero on a high-importance/market-quality day. New `mlDogPriceBucket` + `mlDogIndependentSupportCount` track which dogs had any support beyond cross-market.

### 2.2 DET +3.5 ATS — LOSS

Cover edge under v13's `atsDogMarginCushion`: projected home margin ~+2.6 → cushion 0.9 (thin). Already `tracking`. v14 doesn't add a new gate here — the existing one correctly classified.

### 2.3 DET @ CLE Over 212.5 — WIN (+2.5)

`series_pace_v1+trend_v1` said over. Narrow margin (+2.5) means we were right but barely. v14 logs this as `totals_narrow_positive_evidence` (separate from the strong-margin variant) so the audit doesn't credit weak wins as much as strong wins.

### 2.4 LAL +450 ML — LOSS

Cross-market source via `no_vig_blend` because spread −12.5 is in the large-spread guard band. Already `tracking`. v14 lowers the long-shot dog betScore cap further (so it can never even approach the hero ceiling), and adds `mlDogPriceBucket: '400_plus'` so the audit can track these specifically.

### 2.5 LAL +12.5 ATS — **WIN** (+7.5 cover)

OKC won by 5 → LAL +12.5 covered with 7.5 cushion. The model projected OKC by ~12 (cross-market via `devigged_ml`), spread at 12.5 → cushion of ~0.5 (thin) → already `tracking`. v14 introduces `atsDogSpreadBucket` ('short' / 'medium' / 'large') to track these. Large dog (+9 or more) covers are real edge sources when the favorite is priced too aggressively after a blowout streak; we surface this as `ats_large_dog_cover_evidence` for the audit but **don't auto-promote** off one game.

### 2.6 OKC @ LAL Over 214.5 — WIN (+10.5)

`series_pace_v1+trend_v1` again. Strong margin (+10.5). v14 logs as `totals_strong_positive_evidence`.

---

## 3. Pattern findings (with audit caveats)

### ML
- 0–2 on the day. v12b's hard cap already keeps these tracking. v14 adds price-bucket telemetry so we can prove (over sample) which dog price bands lose at which rate.
- **No model change to selection.** Full-slate still picks a dog when the cross-market signal points there. We just cap promotion harder.

### ATS
- 1–1 today. Pattern across the week:
  - **Short dogs** (+1..+6.5) lose disproportionately.
  - **Large dogs** (+9+) covered today, but small sample.
- v14 adds `atsDogSpreadBucket` ('short' / 'medium' / 'large') as a structured field. Hero gates remain the v13 cushion-based logic — v14 only adds telemetry.

### Totals
- 2–0 today, both from `series_pace_v1+trend_v1`. Combined recent record 4–2 (per user note).
- v14 adds `totalsSupportScore` that reinforces confidence when source is `series_pace_v1+trend_v1` AND `totalsTrendAgreement === 'agree'` AND volatility is bounded. Bumps `betScore` slightly upward (capped at +0.05).

---

## 4. v14 changes

### 4.1 ML dog price buckets + tighter cross-market cap
- New `mlDogPriceBucket`: `favorite` / `pickem` / `dog_100_199` / `dog_200_399` / `dog_400_plus`.
- New `mlDogIndependentSupportCount`: counts non-cross-market support signals (team-form positive, series-dominant-favorite for the dog, etc.).
- Cap: when `priceAmerican >= +200` AND `mlDogIndependentSupportCount < 2` AND source is cross-market, **betScore is hard-capped at 0.40** (below hero floor 0.50). Tightens the v12 0.549 Lean cap to 0.40 for these specifically.

### 4.2 ATS dog spread buckets
- New `atsDogSpreadBucket`: `short` (+0.5..+6.5) / `medium` (+7..+8.5) / `large` (+9+) for underdogs; `null` for favorites.
- New `atsDogIndependentSupportCount` — same idea as ML.
- No new hero gate; existing v13 cushion + v12b short-dog gates cover the cases.

### 4.3 Totals support score
- New `totalsSupportScore` ∈ [0, 0.05] — bumps betScore upward (capped at 0.05) when ALL of:
  - source is `series_pace_v1+trend_v1` or `team_recent_v1+trend_v1`,
  - `totalsTrendAgreement === 'agree'`,
  - both teams' `recentTotalSample` ≥ 2,
  - `marginVolatility` is not above 18 (else volatility gate already capped).
- Net effect: real-signal totals can now clear the hero floor more reliably without inflating weak-signal totals.

### 4.4 Audit module additions
- `byMlDogPriceBucket`: hit rate per price bucket.
- `byAtsDogSpreadBucket`: hit rate per spread bucket.
- `byTotalsMarginBucket`: { narrow ≤5, medium 5–10, strong >10 } record.
- `positiveEvidence`: new types `totals_narrow_positive_evidence`, `totals_strong_positive_evidence`, `ats_large_dog_cover_evidence`.
- `negativeEvidence`: new array, populated with `ml_dog_loss` entries (single-day, never auto-applied).
- All recommendations gated at sample ≥ 10 for ML dogs and ≥ 8 for totals strong-evidence promotion.

### 4.5 Model version bump
- `NBA_MODEL_VERSION` → `nba-picks-v2.4.2`. KV cache key invalidates.

---

## 5. What v14 does NOT do

- **No full-slate change.** Every game still produces ML / ATS / Total.
- **No auto-tuning from one day.** All v14 evidence logs `safeToAutoApply: false`.
- **No hard-coded team logic.** Generic price/spread/source-based gates only.
- **No selection flips.** Picks selected the same way; v14 only changes which can earn higher betScore.

---

## 6. Caveats

- **Persistence gap unresolved.** The May 11 picks weren't in the picks DB. v14's new audit slices will only fire on slates the cron successfully fans out.
- **Sample sizes still small.** One 3–3 day doesn't justify aggressive shadow recommendations; v14 keeps everything additive and bounded.
- **Tracking picks will continue to lose.** That's the calibration cost of full-slate coverage. v13's Recommended vs Tracking rolling split in the UI already makes this distinction visible.
- **Totals are doing well.** Don't overstate — the totals bump is +0.05 max, capped, and only fires when trend AND source AND volatility all align.
