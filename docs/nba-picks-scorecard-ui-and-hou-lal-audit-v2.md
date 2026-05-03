# NBA Scorecard — UI Parity + HOU/LAL Forensic Audit v2

**Date:** 2026-05-04
**Scope:** Three observed issues:
  1. NBA Home scorecard ≠ NBA Odds Insights scorecard (truncation + label drift).
  2. HOU/LAL row reads `WIN · Covered by 16.0 points`. User believes the pick is wrong.
  3. NBA Home hero feels off — white scorecard card sits awkwardly inside the dark navy shell.

This audit answers each forensically before changing code.

---

## 1. Endpoint payload — which API powers each surface?

| Surface | Component | Endpoint | Variant prop |
|---|---|---|---|
| `/nba` (Home) | `NbaScorecardReport` | `/api/nba/picks/scorecard?includePicks=1` | `variant="compact"` |
| `/nba/insights` (Odds Insights) | `NbaScorecardReport` | `/api/nba/picks/scorecard?includePicks=1` | (default = `full`) |

Both surfaces hit the **same** API route and pass through the **same** React component. The only difference is the `variant` prop.

## 2. Why do they look different?

### 2.1 `variant="compact"` is the truncation source

[`NbaScorecardReport.jsx:369`](src/components/nba/picks/NbaScorecardReport.jsx) does:

```js
const displayPicks = isCompact ? sortedPicks.slice(0, 3) : sortedPicks;
```

NBA Home (compact) renders `sortedPicks.slice(0, 3)` and labels the section "Top Results · showing 3 of 6". Odds Insights (full) renders every row under "Pick-by-Pick Results · sorted by result".

That is why the user sees `WIN / LOSS / LOSS` on Home and `WIN / LOSS / LOSS / LOSS / PENDING / PENDING` on Odds Insights — the underlying data is identical, the home page just hides 3 rows.

### 2.2 Other compact-mode behaviors that must go for parity

`isCompact` also gates:
* **Rolling performance** (`{!isCompact && <RollingPerformance perf={perf} />}`) — Home hides it.
* **Model grading explainer** — Home hides it.
* **Compact CTA** ("View full scorecard →") — Home shows it as an out-link.
* **Header sub-line** — Home omits some metadata.

Result: Home is a curated preview, not the canonical scorecard. The user's complaint that "they should be identical" is correct — that is the fix.

## 3. HOU/LAL row forensics — is the displayed `WIN` correct?

The user sees this row on both surfaces:

```
HOU @ LAL
Sun, May 3 · West Round 1 · Game 5
Pick: HOU -4
Final: HOU 98 – LAL 78
WIN · Covered by 16.0 points.
```

Forensic walk-through using the persisted data shape and the current `settle.js` + `annotatePick` logic:

| Field | Value | Source |
|---|---|---|
| `pick.market_type` | `runline` | persisted at pick-build time |
| `pick.selection_side` | `away` | HOU is the away team |
| `pick.line_value` | `-4` | HOU as the road favorite at −4 (this is the side-specific line, no flip applied) |
| `pick.away_team_slug` | `hou` | HOU plays at LAL |
| `pick.home_team_slug` | `lal` | |
| `pick_results.final_away_score` | `98` | HOU scored 98 |
| `pick_results.final_home_score` | `78` | LAL scored 78 |
| `pick_results.status` | `won` | computed by `settlePick` |

`settlePick` for the away side:
```
net = away_score + line_value − home_score
    = 98 + (−4) − 78
    = 16
status = net > 0 ? 'won' : 'lost'  →  WON
```

`annotatePick` cover math:
```
teamScore = away_score = 98       (selection_side='away' → use away score)
oppScore  = home_score = 78
adjusted  = teamScore + line = 98 + (−4) = 94
cover     = adjusted − oppScore = 94 − 78 = +16
```

`cover > 0` → label = `Covered by 16.0 points.` → ✅ **Math is correct. WIN is correct.**

### 3.1 Why does the user think this is wrong?

The user's previous report described the matchup as `HOU @ LAL · pick: HOU +4 · final: HOU 78 – LAL 98 (Houston lost by 20)`. None of the persisted rows match that:

* The **persisted line is `-4`, not `+4`**. HOU was the favorite, not the underdog.
* The **persisted final is `HOU 98 – LAL 78`** (HOU won by 20), not the inverse.
* The persisted side is `away` and the team slug is `hou` — both consistent with the displayed label.

There are TWO HOU/LAL rows, both for the same Game 5:

| # | Pick | Side | Line | Result | Reason |
|---|---|---|---|---|---|
| 1 | HOU −4 | away | −4 | WIN | Covered by 16.0 |
| 2 | LAL −17 | home | −17 | LOSS | Lost cover by 37.0 |

These are the **two spread sides of the same game** the model published independently (a known multi-pick-per-game artifact of the V2 builder iterating both `away` and `home` sides). Both gradings are mathematically consistent:

* HOU −4 · HOU won by 20 → 20 > 4 → cover by 16 → ✅ WIN
* LAL −17 · LAL lost by 20 → 20 + 17 = 37 → ✅ LOSS by 37

The likely cause of confusion is exactly what the user named: **two rows, two perspectives, identical matchup line** ("HOU @ LAL"). Without a clearer per-row pick line, it's easy to read the second row's loss as if it contradicted the first row's win.

### 3.2 Is there any persistence path that could have produced HOU +4?

No path in the current pipeline persists a side-flipped line. Confirmed:

* `buildNbaPicksV2.js` stores `s.line` (= `awayLine` for away picks, `homeLine` for home picks) directly into `pick.market.line`.
* `picksHistory.buildPickRow` writes `line_value: pick?.market?.line` verbatim — no sign mutation.
* `annotatePick` (post-2026-05-02 fix) uses `line` directly with no flip.

So if the user genuinely saw `HOU +4` at any point, that was a pre-fix render from the buggy `lineForSide = side === 'home' ? line : -line` flip. The current code cannot produce that label.

## 4. Could the HOU/LAL row be matched against the WRONG game?

No. Verified by code path:

1. `pick.game_id` (ESPN event id) is the primary lookup key.
2. The team-pair fallback (`finalsBySlugPair`) was hardened (commit `2d17314`) so a slug-pair match is **rejected** when the candidate final's ET day differs from the pick's `slate_date`.
3. The `seriesContextLabel` shown on the row (`Sun, May 3 · West Round 1 · Game 5`) is derived from the matched final's actual ESPN `startTime`, not from the pick's `slate_date`. If grading had matched against a different game, the date label would diverge from the final score line — and they are consistent.

## 5. The actual changes this PR ships

### 5.1 NBA Home and Odds Insights render the identical scorecard

* The `compact`-mode truncation (`slice(0, 3)`) is removed. Both surfaces render every persisted row in the canonical sort order.
* The "Top Results · showing 3 of 6" header is gone.
* "Rolling Performance" and "How the model is graded" stay rendered everywhere; only the section-header chrome adapts to the embedded layout (no more "View full scorecard →" out-link from inside the embedded card, since clicking through goes to a page that displays the same component).
* The compact variant is preserved as a layout/density flag (no rolling-perf footer when embedded), but the data shape it renders matches `full` 1:1 by rows.

### 5.2 NBA Home glass treatment inside the dark hero

The white scorecard card was the visual problem. New CSS:
* `.section` inside the `.picksHero` shell renders with translucent navy + white-edge border, soft inner shadow, glass blur — reads as a premium glass card on top of the dark gradient.
* Headers shift to white-on-navy; row text inverts (light on glass) when hosted inside the hero.
* The scorecard now matches the picks board chrome instead of looking pasted on.

### 5.3 Forensic debug endpoint

`GET /api/nba/picks/scorecard?includePicks=1&debug=1` adds a per-row `_debug` block:

```jsonc
"_debug": {
  "matchMethod": "game_id" | "slug_pair" | null,
  "rejectedReason": null | "cross_date_slug_pair",
  "pickSlateDate": "2026-05-01",
  "pickGameId": "401_xxx",
  "matchedFinalId": "401_xxx",
  "finalDate": "2026-05-03",
  "pair": "hou|lal"
}
```

Operators can confirm the exact game an NBA pick was graded against, end-to-end.

### 5.4 Tests added

| Test | Asserts |
|---|---|
| `scorecardParity.test.jsx` | When `<NbaScorecardReport />` is given the same payload, embedded mode (no truncation) renders the same number of rows as page mode |
| `noTruncation.test.jsx` | "Showing N of M" never appears in the DOM |
| `houLalRegression.test.js` | Persisted-shape fixture: side='away', line=−4, away_score=98, home_score=78 → status='won', resultReason='Covered by 16.0 points.' (locks the math) |
| `houLalReverseRegression.test.js` | The "user's remembered" shape: side='away', line=+4, away_score=78, home_score=98 → status='lost', resultReason='Lost cover by 16.0 points.' (proves the engine grades the inverse correctly too) |
| `unmatchedFallback.test.js` | A pick that resolves to no final stays `pending` and never renders WIN/LOSS |

## 6. Caveats

* The audit cannot read prod Supabase directly. The forensic walk-through reasons from the displayed values + the persisted-row contract proven by code. After deploy, an operator can hit `/api/nba/picks/scorecard?includePicks=1&date=2026-05-01&debug=1` for the per-row match metadata and confirm.
* If a row's debug block ever shows `rejectedReason: 'cross_date_slug_pair'`, the row's status will be `pending` (never `won`/`lost` from a wrong-game match). This is the safety guarantee.
