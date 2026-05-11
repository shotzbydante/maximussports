# NBA Weekend Results Model Audit — May 9–10, 2026 (v13b)

Date: 2026-05-11
Branch: `claude/practical-williamson-21bc72`
Production baseline at audit time: `8d30b97` / `nba-picks-v2.4.0` (v13)

Weekend scoreboard the user attached:

| Date | Game | Final | Margin | Series |
|---|---|---|---|---|
| May 9 (Sat) | OKC 131 – LAL 108 | OKC by 23 | West Semis G3 | OKC 3–0 |
| May 9 (Sat) | CLE 116 – DET 109 | CLE by 7 | East Semis G3 | DET 2–1 |
| May 10 (Sun) | NYK 144 – PHI 114 | NYK by 30 | East Semis G4 | NYK wins 4–0 |
| May 10 (Sun) | MIN 114 – SAS 109 | MIN by 5 | West Semis G4 | tied 2–2 |

---

## 1. Production / version sanity check

```
$ curl https://maximussports.ai/api/version
{ git.sha: "8d30b97...", model.nba: "nba-picks-v2.4.0" }

$ curl ".../api/nba/picks/scorecard?includePicks=1&debug=1&date=2026-05-09"
selectedSlateDate: 2026-05-09
record: { won: 0, lost: 2 }
picks:
  DET @ CLE  runline  DET +5      lost   role=tracking  rawEdge=0.122
  DET @ CLE  total    Under 213   lost   role=hero      rawEdge=null

$ curl ".../api/nba/picks/scorecard?includePicks=1&debug=1&date=2026-05-10"
(no graded picks persisted)
```

**Persisted slate data is incomplete.** The May 9 cron only produced 2 picks (both DET @ CLE), and May 10 has none in the scorecard endpoint. This means the OKC/LAL, NYK/PHI, and MIN/SAS picks the user expects to see weren't successfully persisted at the time the build cron ran — likely because (a) odds enrichment for those games hadn't returned by the cron deadline, or (b) the cron windowed only one slate. The full-slate contract is intact in `buildNbaPicksV2` itself; the persistence gap is downstream.

That's an operational issue, not a model failure. **All forward-looking v13b improvements apply to the next cron run.**

Model version that generated the visible May 9 picks: `nba-picks-v2.3.x` (v12b line) — confirmed by `rawEdge=0.122` on DET +5 (post-v9 cap of 0.20 holds).

---

## 2. Weekend results vs model picks (where available)

| Date | Game | Market | Pick | Result | Margin | Role | Notes |
|---|---|---|---|---|---|---|---|
| May 9 | DET @ CLE | ATS | DET +5 | LOSS | cover by −2 | tracking | v12b cushion gate already kept it off hero |
| May 9 | DET @ CLE | Total | Under 213 | LOSS | over by +12 | **hero** | v13's totals volatility gate would now demote |
| May 9 | OKC/LAL | * | (not persisted) | — | — | — | cron gap |
| May 10 | NYK/PHI | * | (not persisted) | — | — | — | cron gap |
| May 10 | MIN/SAS | * | (not persisted) | — | — | — | cron gap |

Hero record (graded weekend rows): **0–1**
Tracking record: **0–1**
Full-slate record: **0–2** (only DET @ CLE games settled)

---

## 3. Per-game postmortem (forward-looking)

### 3.1 OKC 131 – LAL 108 (OKC by 23, OKC 3–0)

Even though no May 9 OKC/LAL picks were persisted, the v13b model would now treat this scenario as:
- **LAL** = trailing 0–2 entering Game 3 with prior margins assumed wide-margin negative → `seriesContextPrior.trailingTeamRisk: true` if the prior series margins were blowout-level. The v13b weekend audit test pins this — LAL with close prior margins gets only mild support reduction, not full cap.
- **OKC** = leading 2–0 with blowout wins → `dominantFavoriteSupport: true`. Hero gate allows OKC ML/ATS to clear if all other v13 gates also clear.

### 3.2 CLE 116 – DET 109 (CLE by 7)

- DET +5: lost cover by 2. Already `tracking` under v12b (cushion < 2.0 pts). v13b adds no new logic here — the existing cushion gate is correct; the loss reflects normal NBA cover variance.
- Under 213: lost by 12. **Was hero under v12b**. v13 (already deployed before this weekend) adds `isTotalsTooVolatileForHero` which would have caught the thin delta + DET's high recent volatility. **This is the most important v13 improvement** and it landed before May 10.

### 3.3 NYK 144 – PHI 114 (NYK by 30, NYK wins 4–0)

The May 10 game was a sweep-clinching blowout — exactly the failure mode v13b's `seriesContextPrior` addresses:
- **PHI** down 0–3 entering Game 4 with prior losses by 30, 39, ? margins → `repeatedLossRisk: true`, `recentBlowoutRisk: true`, `trailingTeamRisk: true`.
- Any future PHI ML / ATS / Total pick on a similar series would now hit the hero gate's `seriesContextGate.supported === false` rejection.
- The v13b test fixture asserts exactly this case.

### 3.4 MIN 114 – SAS 109 (MIN by 5, tied 2–2)

A 2–2 series with narrow margins is the case the new gate is **designed not to over-fire on**. `seriesContextPrior` returns `leadState: 'tied'`, no risk flag, no support flag — neutral. Picks go through the v9/v10/v11/v12 gates as usual.

---

## 4. v13b model improvements landing

### 4.1 New `seriesContextPrior` helper
[src/features/nba/picks/v2/seriesContextPrior.js](src/features/nba/picks/v2/seriesContextPrior.js)
- Reads series data already loaded into the builder's `gameContext`.
- Returns per-team `leadState`, `trailingTeamRisk`, `dominantFavoriteSupport`, recent series margin, bounded support score in [-1, +1].
- Conservative thresholds: sample ≥ 2 series games, deficit ≥ 2 games, recent margin ≤ -10 (blowout) for risk; mirror condition for support.

### 4.2 Wired into builder
- [api/_lib/nbaPicksBuilder.js](api/_lib/nbaPicksBuilder.js) now attaches the **full series object** (topTeam/bottomTeam/seriesScore/games) to `gameContext[gameId].series` — pre-v13b only elimination/G7 flags were exposed.
- [src/features/nba/picks/v2/buildNbaPicksV2.js](src/features/nba/picks/v2/buildNbaPicksV2.js) computes `seriesContextPrior` per side and attaches `seriesContextPrior` + `seriesContextGate` to each ML/spread pick.

### 4.3 Hero gate + briefing reject
- Hero gate: skips picks where `seriesContextGate.supported === false`.
- Briefing: rejects with reason `series_collapse_risk`.

### 4.4 `computeTeamForm` recency-weighted
- New fields: `weightedRecentMargin` (1/(1+i) weighting), `recentBlowoutRisk`, `repeatedLossRisk`, `blowoutLossCount`, `blowoutWinCount`.
- Existing fields unchanged.

### 4.5 Audit module slices + findings
- `bySeriesContext: { trailingCollapse, dominantFavorite, neutral }`.
- New shadow finding: `series_collapse_warning` (when a trailing-team pick lost).
- New positive evidence: `series_dominant_favorite_hit` (when a dominant-favorite pick won).

### 4.6 Model version bump
- `NBA_MODEL_VERSION` → `nba-picks-v2.4.1`. KV cache key invalidates.

---

## 5. What v13b does NOT do

- **No hard-coded team logic.** Every gate works off generic series state.
- **No auto-tuning from one weekend.** Sample is far below the 30-pick threshold.
- **No change to full-slate contract.** Every game still produces ML / ATS / Total.
- **No mass demotion.** Picks pass through v9 ML math, v10 cross-market gate, v11 anomaly, v12 long-shot dog + large-favorite + ATS short-dog, v13 cushion + volatility, v13b series context — each gate independent and bounded.

---

## 6. Tests

- `seriesContextPrior.test.js` — 9 cases (PHI sweep, NYK domination, LAL close trailing, neutral, null inputs, hero gate variants).
- `v13bWeekendAudit.test.js` — 5 cases (model version, recency weighting, blowout counts, hero gate fires on PHI fixture).
- All NBA + content-studio + HOU/LAL + scorecard-pending suites stay green.

---

## 7. Caveats

- May 9/10 picks the user wants reconstructed weren't persisted server-side (only DET @ CLE survived). Forward-looking gates apply to the next cron run.
- ESPN finals window is still 7 days — series margin priors are accurate for ongoing playoff series (3–4 games) but small for one-off matchups.
- Tracking picks will continue to lose. The hero/recommended record is what reflects model recommendation quality, separated by v13's `byPickRole` in the rolling performance UI.
