# NBA Maximus's Picks — Last-Mile QA Pass

## Scope
Full parity check between NBA and MLB picks surfaces now that both consume
`MlbMaximusPicksSectionV2` with `sport` + `endpoint` props.

## Issues found and fixed in this PR

### 1. ❌ → ✅ Cross-sport logo leak (critical)
**Symptom:** Celtics card showed the Red Sox logo; 76ers card showed the Phillies logo.
**Cause:** Shared picks components used `getMlbEspnLogoUrl(slug)` which has no
sport context. For every slug that collides between MLB and NBA (`bos`,
`phi`, `cle`, `atl`, `mia`, `det`, `min`, `tor`, `mil`, `hou`), the NBA UI
resolved to `/logos/mlb/{slug}.png`.
**Fix:** New `src/utils/teamLogo.js` with `resolveTeamLogo({ sport, slug, ... })`.
Both `PickCardV2` and `TopPlayHero` now consume the resolver and pass the
pick object so sport flows through. See `cross-sport-logo-resolution-audit-v1.md`
for full details.
**Tests:** `src/utils/teamLogo.test.js` + `PickCardV2.crossSport.test.jsx`
assert the invariant across every colliding slug in both directions.

### 2. ✅ NBA picks page now uses the shared v2 container
**Before:** `NbaPicks.jsx` rendered a legacy component that displayed a flat
list of `NbaLiveGameCard` widgets — no tiering, no Top Play, no trust
strip.
**Now:** Mounts `<MlbMaximusPicksSectionV2 mode="page" sport="nba" endpoint="/api/nba/picks/built" />`.
Full parity with MLB Odds Insights: Top Play hero, Tier 1/2/3, coverage,
trust layer, performance module, audit insights, About the Model, How It
Works at the bottom.

### 3. ✅ NBA home uses the shared home-mode container
`NbaHome.jsx` mounts `<MlbMaximusPicksSectionV2 mode="home" sport="nba" endpoint="/api/nba/picks/built" />`,
same as MLB. Top Play first, horizontal trust strip, Today's Picks header,
tier grids.

### 4. ✅ No legacy NCAAM-style bias remnants in NBA engine
`buildNbaPicksV2` evaluates both sides symmetrically; win probability
derives from `model.pregameEdge` via `tanh`. No favorite/underdog bias.
Bias telemetry: `meta.flags` logs `all_home_bias` / `all_away_bias` when
≥4 ML/spread picks land on one side (see `buildNbaPicksV2.test.js`).

### 5. ✅ Zero picks when model has no signal (no invented confidence)
If `pregameEdge` is absent, `deriveWinProbs` returns nulls and no picks
qualify. The NBA endpoint publishes an empty board rather than filler.
Confirmed by test.

### 6. ✅ No `betScore.total <= 0` reaches the UI
Both builders (MLB and NBA) drop invalid-score candidates before tier
assignment and log `invalidBetScoreDropped` in `meta`. UI resolver
`resolveConviction()` returns null for zero/missing — the badge hides
instead of showing "0".

## Structural / visual consistency with MLB

| Surface | NBA | MLB | Parity |
|---|---|---|---|
| Home page flow (Top Play → trust strip → picks → performance → about → HIW) | ✅ | ✅ | ✅ |
| Top Play hero (conviction badge, recommended bet, metrics, reinforcement line) | ✅ | ✅ | ✅ |
| Tier 1 / 2 / 3 framing + accents | ✅ | ✅ | ✅ |
| Coverage pool (Expanded Coverage section) | ✅ | ✅ | ✅ |
| YesterdayScorecard / TrackRecord / YesterdayContinuity | ✅* | ✅ | ✅* |
| PerformanceLearning + AuditInsights | ✅* | ✅ | ✅* |
| AboutTheModel (compact + full) | ✅ | ✅ | ✅ |
| HowItWorks | ✅ | ✅ | ✅ |
| Conviction tier labels (Elite / Strong / Solid / Lean) | ✅ | ✅ | ✅ |
| Explicit metric labels (Conviction / Edge / Confidence / Bet Score) | ✅ | ✅ | ✅ |
| Premium cool-toned palette, no pink/red | ✅ | ✅ | ✅ |
| 3/2/1 responsive grid for cards | ✅ | ✅ | ✅ |
| Hard dedupe by matchup key | ✅ | ✅ | ✅ |
| Minimum 5 picks when coverage can fill | ✅ | ✅ | ✅ |

`*` NBA scorecard/performance surfaces light up automatically when the
backend settlement/scorecard/audit crons exist for NBA. The UI degrades
gracefully with "Building track record" until then — MLB already has
settlement/scorecard crons in place; NBA will surface performance
surfaces the moment equivalent crons run.

## Things worth improving later (not blocking)

1. **NBA settlement + scorecard crons.** MLB has `settle-yesterday`,
   `build-scorecard`, `run-audit` crons. NBA needs the analogous
   endpoints so TrackRecord and PerformanceLearning begin populating
   with real data. The UI is already wired.
2. **NBA tuning config in Supabase.** MLB seeded a row in
   `picks_config` on migration. NBA's config currently falls back to
   `NBA_DEFAULT_CONFIG` every build. Wire a `picks_config` row for
   sport='nba' whenever ops is ready.
3. **Self-hosted NBA logos.** Currently pulling from `a.espncdn.com` CDN.
   Self-hosting under `/public/logos/nba/` would match the MLB pattern
   and eliminate external CDN latency/availability risk — same reasoning
   that drove the MLB migration. Not blocking; low-risk follow-up.
4. **NBA email template.** MLB has `mlbPicks.js`. NBA doesn't ship a
   picks digest email yet. If the product wants one, the canonical
   payload is already available.
5. **Legacy `NbaMaximusPicksSection` component.** Still in the tree but
   no longer referenced. Safe to delete in a follow-up.

## Manual browser QA checklist (run after deploy)

- [ ] `/mlb` — Top Play first, trust strip is horizontal, all logos are MLB.
- [ ] `/mlb/insights` — same order in page mode, Today's Picks header before tiers.
- [ ] `/nba` — Top Play first, trust strip is horizontal, **all logos are NBA** (spot-check Celtics, 76ers, Cavaliers, Hawks, Heat, Pistons, Timberwolves, Raptors, Bucks, Rockets).
- [ ] `/nba/insights` — page mode renders tier grids; coverage section appears when fewer than 5 picks qualify.
- [ ] DevTools Network tab — all logo URLs for NBA games come from `a.espncdn.com/i/teamlogos/nba/...`; no `/logos/mlb/` requests from `/nba*` routes.
- [ ] Conviction badges never show `0`; unknown score hides the badge entirely.
- [ ] No duplicate matchups on either page.
