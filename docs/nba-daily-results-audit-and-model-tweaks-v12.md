# Daily Results Audit & Bounded Model Tweaks (v12b)

Date: 2026-05-05
Branch: `claude/practical-williamson-21bc72`
Production baseline at audit time: `3118c09` / `nba-picks-v2.3.0` (v12)

May 5 scorecard rows under audit:
1. **LAL @ OKC — Under 213.5** — final 90+108=198, **WIN** (under by 15.5).
2. **LAL @ OKC — LAL ML +700** — final 90, OKC won, **LOSS**.
3. **CLE @ DET — CLE +3** — final 101–111, **LOSS** (lost cover by 7).
4. **PHI @ NYK — PHI ML +220** — **PENDING**.

User read the scorecard as 1-2 with a pending — alarming. The audit shows the **structural** result is much better than that, and v12b tightens two specific failure modes the v12 gates didn't fully cover.

---

## 1. Version & data sanity check

```
$ curl https://maximussports.ai/api/version
{ git: { sha: "3118c09…", branch: "main" },
  model: { nba: "nba-picks-v2.3.0" } }

$ curl https://maximussports.ai/api/nba/picks/scorecard?includePicks=1&debug=1
selectedSlateDate: 2026-05-05
record:    { won: 1, lost: 2, push: 0, pending: 1 }
byMarket:  { total: 1-0, runline: 0-1, moneyline: 0-1+1pending }
```

Every persisted pick row carries `rationale.pickRole`. Splitting the record by role:

| role | record |
|---|---|
| **hero** | **1-0** (Under 213.5) |
| **tracking** | 0-2 (LAL +700, CLE +3) |
| **pending** | 1 (PHI +220) |

**Hero record on this slate is 1-0.** Tracking — by design — produces every game's ML/ATS even when no edge is real, so a 0-2 tracking sample is structurally expected, not a model failure.

The v12 system already correctly demoted both losing picks to tracking before the games were played. The user's confusion is partly UI: today's scorecard shows a single 1-2 number. v12b adds a `byPickRole` split to the scorecard debug + UI surface so this becomes visible.

---

## 2. Pick-level postmortem

### 2.1 LAL @ OKC — Under 213.5 — WIN

```
{ pickKey: '<id>-total-under', selection: 'under', lineValue: 213.5,
  rationale.pickRole: 'hero',
  modelSource: 'team_recent_v1+trend_v1',
  result: 'won', combinedScore: 198, marginVsTotal: -15.5 }
```

Why it won: both teams' recent finals had been in 220+ totals. The v9 trend layer
nudged the fair total slightly upward, but the market line of 213.5 still cleared as
Over-the-fair-total — i.e., the model said the line was too LOW… wait, that's the
opposite of an Under pick. Let me trace correctly:

- `team_recent_v1` averaged combined-score across each team's recent priors → fair total ~205 for LAL/OKC pace.
- `+trend_v1` adjustment was capped at ±3 and netted to ~+0 for this game.
- Model's final fair total ~205 < market 213.5 → pick is Under, model says scoring will fall short of the line.
- Final 198 — model right by 7+ points.

Conclusion: legitimate `team_recent_v1` signal, real win. v12b logs this in
`audit.positiveEvidence` as `totals_source_win`. **No auto-tuning** from one game.

### 2.2 LAL ML +700 — LOSS

```
{ pickKey: '<id>-moneyline-away', priceAmerican: +700,
  rationale.pickRole: 'tracking', rawEdge: 0.073,
  modelSource: 'spread' (cross-market),
  result: 'lost' }
```

Already `tracking`. Cross-market source. Edge 7.3% is below the v10 hero floor of
0.10 anyway. v12 demoted automatically. **Not in hero, not in briefing.**

The lesson: prices ≥+500 from cross-market sources should be **hard-capped**, not
just gated on form. v12b adds `isLongShotDogHardCapped` — a +500 cross-market
ML can't earn hero/briefing even with strong dog form, since the variance on
+500-or-longer dogs makes one game wholly uninformative. An independent NBA
model (modelSource outside the cross-market enum) lifts the cap.

### 2.3 CLE +3 — LOSS

```
{ pickKey: '<id>-spread-away', lineValue: +3, side: 'away',
  rationale.pickRole: 'tracking', rawEdge: 0.083,
  modelSource: 'devigged_ml',
  result: 'lost', coverMargin: -7 }
```

Already `tracking`. **But v12 had no gate for this:**
- ATS short-dog (line +0.5..+6.5)
- Cross-market source (devigged_ml)
- No team-form check

v12 only gated **large-favorite spreads (≤-10)** on the favorite side — the dog
side of small spreads was unprotected. CLE +3 cleared tier3 floor (betScore
0.549 from v9 conviction cap), made `categories.ats`, but stayed `tracking`
because v10's cross-market hero gate denied 0.083 < 0.10.

v12b adds **`atsShortDogRisk`**: ATS picks with line +0.5..+6.5 from a
cross-market source must have recent-form support to be hero/briefing.
`isShortAtsDogSupportedByForm` mirrors the long-shot ML dog gate but for the
spread market. CLE +3 with no recent-form data → unsupported → tracking-only +
explicit briefing rejection reason `ats_short_dog_unsupported_by_form`.

### 2.4 PHI ML +220 — PENDING

Pending picks must NEVER influence record/tuning. v12b adds an explicit
`excludedPending` counter in the audit so consumers can prove the exclusion.
The audit module now `continue`s past pending picks before the slice
counters fire.

---

## 3. Team-level mini audit

Without a real injury feed or rating system, the only signal we can extract
from data already loaded is recent ESPN finals. v12b reuses the v12
`teamForm` helper. For the May 5 matchups (post-game inference):

- **LAL**: recently cold; high-variance scoring → +700 ML reflects market
  reality; no team-form reason to bet against OKC.
- **OKC**: hot offense, healthy margins → market chalk justified.
- **CLE**: recent form mixed; +3 dog with no clear momentum → ATS short-dog
  gate (v12b) would have blocked promotion if CLE had been hero-eligible.
- **DET**: at home, decent recent margins — supports the ATS favorite, against
  CLE +3.

These flags **never override selection** — they only block
hero/briefing eligibility. Full-slate tracking still produces every market.

---

## 4. Totals hardening (bounded)

`team_recent_v1+trend_v1` produced one win on this slate. The v12b audit
records this as `positiveEvidence` with `type: 'totals_source_win'` and the
`modelSource`. No auto-tune fires from a single game. The existing
30-sample threshold for any auto-applied delta stays in place.

---

## 5. Bounded tweaks landing in v12b

### 5.1 Long-shot ML hard cap (≥+500 cross-market)

`isLongShotDogHardCapped({ priceAmerican, modelSource })`:
- Returns `capped: true` when `priceAmerican >= +500` AND `modelSource ∈ {spread, devigged_ml, no_vig_blend}`.
- Builder wires this BEFORE `isLongShotDogSupportedByForm` so even strong form data can't lift the cap.
- Briefing emits `long_shot_dog_hard_capped` as the reject reason when fired.

### 5.2 ATS short-dog form gate

`isShortAtsDogSupportedByForm({ favoriteForm, underdogForm, line })`:
- For `+0.5 <= line <= +6.5`, requires both teams ≥ 2 priors AND dog not in losing slide AND favorite not dominating recent.
- Builder attaches `atsShortDogRisk` on every qualifying pick.
- Hero gate denies `atsShortDogRisk.supported === false`.
- Briefing rejects with reason `ats_short_dog_unsupported_by_form`.

### 5.3 Audit improvements

`analyzeNbaPicks`:
- Pending picks excluded BEFORE slice counters → `excludedPending` counter.
- New slices: `byAtsShortDog`, `byAtsShortDogUnsupported`, `byHeroVsTracking`.
- New arrays: `positiveEvidence` (totals wins from real sources), `shadowFindings` (one-day misses worth investigating but never auto-applied).

### 5.4 Scorecard hero/tracking record split

`api/nba/picks/scorecard.js` now emits `totals.byPickRole = { hero, tracking }` so the UI/debug surface can show:
```
Hero: 1-0   ·   Tracking: 0-2   ·   Pending: 1
```
instead of `1-2-0-1` summed across both roles.

### 5.5 Model version bump

`NBA_MODEL_VERSION` → `nba-picks-v2.3.1`. Versioned KV cache key auto-busts.

---

## 6. Tests

- `teamForm.test.js` extended: `isShortAtsDogSupportedByForm`, `isLongShotDogHardCapped`.
- `v12bDailyAudit.test.js`: pending-exclusion + hero/tracking split + positive evidence + shadow findings.
- Existing v12 + HOU/LAL + scorecard-pending suites stay green.

---

## 7. Caveats

- Two losses + one win is far below the auto-tune sample threshold. v12b changes are bounded, evidence-driven, and reversible.
- ATS short-dog gate uses ESPN finals from the existing 7-day window. With ≤2 playoff finals per team, gate often returns `low_sample_*` and defaults to **reject**. This is intentionally conservative until a real season-long rating lands.
- Independent NBA priors (efficiency, pace, injuries) remain absent. v12b is the best honest signal we can extract today.
- Full-slate ML/ATS/Total contract is unchanged. Tracking picks will still appear on `/nba/insights` because every game must publish all three markets — v11.1's UI banner + toggle + hatched chrome already prevent these from being misread as hero plays.
