# NBA Home Picks — Badge, Logos, ML/Totals Conviction Audit v5

**Date:** 2026-05-04
**Scope:** Three asks rolled into one PR: (1) gold "Today's Picks · Published N" pill is hard to read on the dark hero, (2) scorecard rows have no team logos, (3) start publishing Moneyline + Totals picks with the same conviction framework ATS uses.

---

## 1. Gold badge — what's wrong, and what to change

### 1.1 What renders the badge

`MlbMaximusPicksSectionV2.jsx` → `<TodaysPicksHeader>` → `<span class={styles.todaysCountPill}>` containing `Published` label + `{totalPicks}` value.

### 1.2 CSS responsible

`MlbMaximusPicksSectionV2.module.css`:

```css
.todaysCountPill {
  background: var(--picks-gold-soft);   /* #eae3cc — beige */
  border: 1px solid rgba(167,138,61,0.25);
}
.todaysCountLabel  { color: var(--picks-gold); }   /* #a78a3d — brass */
.todaysCountValue  { color: var(--picks-gold); }
```

### 1.3 Why it's hard to read on dark

On the white Odds Insights surface this pill renders as `brass-on-cream` — adequate contrast. On the dark NBA Home hero (translucent navy + white-edge glass) the pill keeps the same beige background and the same brass text. The result is a low-luminance pill where the foreground (`#a78a3d`) sits within ~20% lightness of the background (`#eae3cc` ≈ 90% lightness, but the pill blends with the navy backdrop because the beige is opaque on dark) and the small 9 px label is the worst-case glyph.

### 1.4 Fix

A `[data-dark-surface='true'] .todaysCountPill` block that:

* swaps the background to a **gold-on-glass tint** (`rgba(201, 162, 74, 0.18)` over the navy)
* lifts the border to a stronger gold edge (`rgba(201, 162, 74, 0.55)`) for cut-glass definition
* darkens the text to a **light-gold-on-glass** (`#e6c47a` for value, `#c9a24a` for kicker) — both well above 4.5:1 contrast against the glass tint
* adds a soft inner highlight (`inset 0 1px 0 rgba(255,255,255,0.10)`) for premium feel
* keeps the same typography scale + spacing — premium, not flashy

Light Odds Insights styling is unchanged because the rule is scoped under `[data-dark-surface='true']`.

## 2. Team logos in scorecard rows

### 2.1 What renders the rows

`src/components/nba/picks/NbaScorecardReport.jsx` → `<PickRow pick={p}>`. Today the matchup line is `<span>{pick.matchup}</span>` rendering `HOU @ LAL` text only.

### 2.2 What data is available

`api/_lib/annotatePick.js` (already shipped) returns:

```
matchup:  "HOU @ LAL"
awayTeam: "hou"      // slug
homeTeam: "lal"      // slug
```

Both team slugs are present on every row. They flow from the persisted `picks.away_team_slug` / `picks.home_team_slug` columns.

### 2.3 Logo resolver — already shared

`src/utils/teamLogo.js` exports `resolveTeamLogo({ sport, slug })` and `getNbaEspnLogoUrl(slug)`. Both NBA-safe (refuse cross-sport guesses, resolve to ESPN CDN URL or `null`). PickCardV2 already uses `resolveTeamLogo` for picks cards. The same helper plugs cleanly into scorecard rows.

### 2.4 What changes

`PickRow` is upgraded to render `<img>` for both teams alongside the slug text:

```
[hou-logo] HOU @ [lal-logo] LAL
```

Compact (16 px), `loading="lazy"`, accessible `alt=""`, `onError` falls back to text-only. Rendered cleanly on both surfaces — the hero glass scorecard already has a dark container that the white-on-color logos read well against; the page-mode scorecard is white and logos look native.

## 3. ML and Totals — what's actually publishing today

### 3.1 ML — structurally publishing, empirically rare

`buildNbaPicksV2.js` lines 419–444 generate ML candidates for both sides of every game where `pregameEdge` is non-zero:

```js
for (const s of mlSides) {
  const rawEdge = s.modelProb - s.implied;
  if (rawEdge <= 0) continue;
  if (isUnderdog && rawEdge < minDogEdge /* 0.04 */) continue;
  // → makePick + pushDisciplined → all the same conviction framework as ATS
}
```

The same `computeBetScore`, the same `applyDiscipline`, the same `convictionLabel`, the same tier assignment, the same persistence schema. **The conviction framework is already shared.** ML cards already render through `PickCardV2` with the same conviction badge UI.

The reason ML rarely appears in the visible UI:

1. The "model" (`pregameEdge` from moneyline-vs-spread arbitrage) is a weak signal. On most NBA playoff games it's zero or near-zero.
2. When it is non-zero, the ATS side typically has a slightly higher `betScore` than the ML side (the spread market exposes the same edge with less variance).
3. Tier-1 cap is 2, tier-3 cap is 5, and `maxPerGame=2`. Spread candidates win the tie and ML candidates fall into coverage.

Today's PR adds **no model logic** to ML — it stays honest. The structural capability is verified by a new test that exercises ML candidate generation under realistic inputs and proves the conviction badge / tier metadata flows identically to ATS.

### 3.2 Totals — structurally blocked until v5

The v4 honesty fix set `model.fairTotal = null` in the odds enricher (no fair-total model ⇒ no fake mirror of the market). That meant `score.expectedTotal = null` and the totals gate always failed `passDelta`. **No totals candidate ever cleared.**

To enable Totals honestly, this PR adds a **minimum-viable fair-total signal** without inventing data:

#### MVP signal: series-pace prior

`api/_lib/nbaPicksBuilder.js` already loads a 7-day past-window of finals via `windowGames`. We compute a per-matchup `seriesAvgTotal` from prior **finals between the exact same two teams** in that window:

```
seriesAvgTotal = mean(pastGame.away.score + pastGame.home.score)
```

Requirements before publishing a totals candidate from this signal:

* **At least 2 prior finals** between these two teams in the window (small-sample guard).
* `Math.abs(seriesAvgTotal − market.total) >= minExpectedDelta (2.0)` — the existing gate.
* Discipline layer continues to apply: a low-confidence single-driver totals pick caps at "Lean".

The signal is honest because it's **observed scoring in this exact matchup**, not invented. In a 7-game playoff series with 3+ games already played, this is a real signal. In games without that history (regular season, first two games of a series), `fairTotal` remains null and **no totals candidate is generated** — the gate fails for the right reason.

#### Limitations (named, not faked)

* Sample bound at 2+ — first game and game 2 of any series produce no totals signal.
* No pace/efficiency adjustment for injuries (e.g., a star out who'd been driving high pace).
* No regular-season vs. playoff baseline reweighting.
* Data quality reflects sample size only (`min(games / 4, 1)` on the totals confidence component).

A future PR can layer a true offensive/defensive efficiency model on top of this floor.

### 3.3 Conviction reporting — already identical for all three

Every published pick — moneyline / runline / total — flows through:

* `computeBetScore` → `{ total, components: { edgeStrength, modelConfidence, situationalEdge, marketQuality } }`
* `applyDiscipline` → caps + flags
* `assignTiers` → `tier1 / tier2 / tier3 / coverage`
* `convictionLabel` → `Top Play / Strong / Solid / Lean`

`PickCardV2` reads `conviction.score` and `conviction.label` regardless of `market.type` and renders the same conviction badge. **No special-casing in the UI.** The ByMarketSummary strip will start showing non-zero counts for ML/Totals as soon as the signals justify them.

## 4. Persistence + scorecards — already covered

Verified by inspection of `api/_lib/picksHistory.js` `buildPickRow` (line 87). The persisted shape is market-type-agnostic — `line_value` holds spreads / totals; `price_american` holds moneyline; `market_type` selects the column. Settlement (`settle.js`) already grades all three:

```js
case 'moneyline': … winner-take-all
case 'runline':   … (away|home_score + line) vs opponent
case 'total':     … total vs line, over/under selection
```

The daily scorecard (`buildScorecard`) already keeps `by_market: { moneyline, runline, total }`. The audit pipeline (`analyzePicks`) already records per-market hit rates, edge bands, and home/away splits.

**No schema changes are needed.** ML and Totals will start filling those buckets the moment the builder publishes them.

## 5. What this PR ships

1. **Gold badge polish.** `[data-dark-surface='true']` overrides on `.todaysCountPill` + `.todaysCountLabel` + `.todaysCountValue` lifting contrast on the dark hero. Light Odds Insights surface unchanged.
2. **Team logos in scorecard rows.** `PickRow` renders both away and home logos via `resolveTeamLogo`. Compact 16 px, lazy-loaded, accessible, with text-only fallback when a slug doesn't resolve.
3. **Series-pace fair-total MVP.** New `api/_lib/seriesPaceFairTotal.js` derives a per-matchup `seriesAvgTotal` from window finals. `nbaPicksBuilder.js` injects it into `game.model.fairTotal` only when ≥2 prior finals between the same teams exist in the window — `null` otherwise.
4. **`PickCardV2` market-aware copy.** Confirmed (no change needed) that `pickLabel` already encodes market type (`HOU -4` vs `BOS ML -160` vs `OVER 220.5`). Tests pin this so a future regression on the rationale text path can't drop the market identifier.
5. **Tests** — gold badge contrast invariant, scorecard logos rendered, ML conviction parity, totals MVP gate behavior, persistence ML/totals smoke test.

## 6. What's NOT in this PR (named, not faked)

* No new ML "model" — current arbitrage signal is what it is. Discipline layer protects against its known failure modes.
* No pace/efficiency totals model — the series-pace MVP is intentionally lightweight. Future work can layer Elo/pace priors on top.
* No automated tuning promotion — shadow configs still require operator approval.
* No ROI/units bookkeeping — every pick has odds + edge persisted, the layer to compute units is one PR away.
