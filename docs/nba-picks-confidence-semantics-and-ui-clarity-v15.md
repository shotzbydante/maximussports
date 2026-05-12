# NBA Picks Confidence Semantics & UI Clarity (v15)

Date: 2026-05-12
Branch: `claude/practical-williamson-21bc72`
Production baseline at audit time: `fcd07e4` / `nba-picks-v2.4.2` (v14)

User issue:
> *"If we show MIN +10 with 33% confidence and bet score 55, shouldn't that imply we actually have 67% confidence in SAS −10?"*

This is the right question. It exposes a UI label problem, not a model problem.

---

## 1. What "Confidence" currently means

[NbaFullSlateBoard.jsx:130](src/components/nba/picks/NbaFullSlateBoard.jsx) renders:

```jsx
<Metric label="Confidence"
        value={`${Math.round(pick.betScore.components.modelConfidence * 100)}%`} />
```

Trace `modelConfidence`:

```js
// src/features/mlb/picks/v2/components.js:36
export function modelConfidence(score) {
  const dq = isNum(score?.dataQuality) ? score.dataQuality : 0;
  const sa = isNum(score?.signalAgreement) ? score.signalAgreement : 0.5;
  return clamp01(dq * sa);
}
```

**`modelConfidence` is `dataQuality × signalAgreement`.** It is a data-/model-quality signal — *how much of the model's inputs are present and how much they agree* — **not the probability the pick wins**. The "33%" the user sees is just typical signal quality for cross-market-only NBA picks (the model uses spread vs no-vig ML cross-checking and not much else).

So the answer to *"Doesn't 33% on MIN imply 67% on SAS?"* is: **No.** The two sides are not split across a probability axis — both sides would have the same `modelConfidence` because it measures **input quality**, not which side is more likely.

---

## 2. Is the pick-selection logic correct?

Yes. The ATS selection compares cover edge per side and picks whichever has the larger positive (or least negative) cover edge:

```js
// pickSpreadSide
const homeCoverEdge = projectedHomeMargin + homeLine;   // points
const awayCoverEdge = -homeCoverEdge;
side = awayCoverEdge > homeCoverEdge ? 'away' : 'home';
```

For `MIN @ SAS, MIN +10`:
- If the model projects SAS by ~9.5 → `awayCoverEdge = +0.5` (MIN covers by 0.5 pts).
- v13 cushion gate marks this `thin` → `pickRole=tracking`.
- v9 conversion to `rawEdge`: `tanh(0.5/6) * 0.5 ≈ 0.042`. UI shows `Edge: 4.2%`.

This is **correct selection** for the full-slate contract. MIN +10 is the side the model thinks is slightly less wrong than SAS −10. There is no implied 33%/67% split on hit probability.

---

## 3. Vocabulary decision

Mapping to clearer product language:

| Today's label | New label | Meaning |
|---|---|---|
| `Edge` (rawEdge, in %) | **`Edge`** (unchanged for ML; "Cover edge" / "Pts vs line" for ATS / Totals) | how far the model differs from market |
| `Confidence` (modelConfidence) | **`Signal Quality`** | data quality × signal agreement; *not* hit probability |
| `Bet Score` (betScore.total × 100) | **`Bet Score`** (unchanged) | blended 0–100 score used for ranking |
| Conviction tier | **`Conviction`** (unchanged) | UI band derived from Bet Score |
| Tracking pill | **`Tracking`** (unchanged) | full-slate calibration only |

**No `Hit Probability` field is added** because the model does not produce a credible cover/over hit-probability today. The closest credible probability exists for ML (`modelProb` from de-vigged-ML + spread blend), but pre-v15 the UI didn't surface it. v15 surfaces it on ML cards only.

---

## 4. Backend payload — `displayMetrics`

Every pick now carries a `displayMetrics` object the UI can read directly. The shape:

```js
{
  edgeLabel,             // "Edge" / "Cover edge" / "Fair total Δ"
  edgeValue,             // formatted string
  edgeDescription,       // one-liner
  signalQualityLabel,    // "Signal quality"
  signalQualityValue,    // "33%"
  signalQualityDescription,
  hitProbabilityLabel,   // null if not credible
  hitProbabilityValue,
  hitProbabilityDescription,
  betScoreLabel,
  betScoreValue,
  betScoreDescription,
  convictionLabel,
  roleLabel,             // "Recommended" / "Tracking"
  roleDescription,
  oppositeSideLabel,     // "Why not the other side?"
  oppositeSideDescription,
}
```

Computed in a new pure helper, `src/features/nba/picks/v2/displayMetrics.js`. Builder attaches the object onto every pick (`makePick`).

For the `MIN +10` example the object reads:
- `edgeLabel: 'Cover edge'`, `edgeValue: '+0.5 pts'`, `edgeDescription: 'Model projects MIN covers +10 by a thin margin.'`
- `signalQualityLabel: 'Signal quality'`, `signalQualityValue: '33%'`, `signalQualityDescription: 'Data + model agreement — not the probability this pick wins.'`
- `hitProbabilityLabel: null` (not credible for ATS today)
- `roleLabel: 'Tracking'`, `roleDescription: 'Shown for full-slate calibration. Not a recommended play.'`
- `oppositeSideLabel: 'Why not SAS −10?'`, `oppositeSideDescription: 'A 33% Signal Quality on MIN does NOT mean SAS has 67%. The two sides share the same signal quality. The model just sees marginal cover value on MIN +10.'`

For ML picks where `modelProb` is meaningful, `hitProbabilityValue` is set to `${round(modelProb * 100)}%` and a description warns it's a directional estimate, not a guarantee.

---

## 5. UI updates

### Card metrics
- Rename `Confidence` → `Signal Quality`.
- Existing `Edge` metric stays for ML (probability %). For ATS, change to `Cover edge` in points. For Totals, `Fair total Δ` in points.

### Card explainer
- Below the rationale, add a one-line **disclaimer for tracking picks**: *"Signal quality is data/model confidence, not the probability this pick wins."*
- For ATS tracking picks with `atsDogSpreadBucket` populated, append an "opposite side" explainer one-liner.

### Tracking pill
- Existing pill stays. Add an inline tooltip-style helper text below the source line: *"Tracking — shown so every game has ML/ATS/Total coverage."*

### Scorecard explainer
- Add: *"Tracking picks are included for transparency and calibration."*
- Add: *"Signal quality is not the same as hit probability."*
- Add: *"Recommended picks and tracking picks are evaluated separately."*

---

## 6. What v15 does NOT do

- **No selection-logic changes.** The model still picks the same side it picked before.
- **No invented hit probabilities** for ATS or Totals.
- **No new market gates.** v9-v14 caps + buckets unchanged.
- **No layout overhaul.** Existing card chrome and v11.1 tracking visuals stay.
- **No new persistence schema.** `displayMetrics` is added to the pick payload at build time, alongside existing fields.

---

## 7. Tests

- `displayMetrics.test.js` — 14 cases: ML / ATS / Totals shapes, hit probability gating, tracking explainer text, opposite-side phrasing.
- `NbaFullSlateBoard.test.js` (new) — the rendered card uses "Signal Quality" not "Confidence".
- Existing 323 NBA + content-studio + HOU/LAL tests stay green.

---

## 8. Caveats

- Hit probability is shown **only on ML picks** where `modelProb` is a credible no-vig blend. ATS/Totals show projected edge in points instead.
- Tracking picks may still look counterintuitive — the gold standard is hero/recommended picks in NBA Home and the briefing slide.
- Full-slate contract unchanged. Cross-market dog picks will continue to appear; they're correctly classified as tracking and the UI now explains why.
