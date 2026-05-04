# NBA — Pick 'Em Full Slate + Real-Time Scorecard Audit v8

**Date:** 2026-05-04
**Scope:** Two reported issues:
  1. `/nba/insights` shows **"No qualified pick"** for every Pick 'Em / Moneyline card. ATS + Total cards render. The v7 contract says every playoff game must have ML/ATS/Total — this is a contract violation.
  2. The scorecard / pick-history surface feels stale (May 1 graded results + pending May 2/3) and doesn't reflect today's Game 7 slate.

---

## 1. Pick 'Em / Moneyline missing — root cause

### 1.1 The shape mismatch

`buildNbaPicksV2` reads moneyline odds via `toMatchup(game)`:

```js
moneyline: {
  away: isNum(game?.market?.moneyline?.away) ? game.market.moneyline.away : null,
  home: isNum(game?.market?.moneyline?.home) ? game.market.moneyline.home : null,
},
```

It expects a structured `{ away, home }` object on `game.market.moneyline`.

But the production pipeline writes a **single number** (the home moneyline) at both data sources:

* `api/nba/live/_normalize.js:120` — `moneyline = espnOdds.homeTeamOdds.moneyLine;` (number, not object).
* `api/nba/live/_odds.js:105 + 119` — `parseOddsEvent` collects only `homeOut.price` into `moneylines[]` and the median is returned as `moneyline: <number>`. `enrichGamesWithOdds` writes `market.moneyline = moneyline` (still a number).

So at runtime `game.market.moneyline === <number>` (or null). When `toMatchup` then reads `game.market.moneyline.away`, JavaScript returns `undefined` (number doesn't have `.away`) → both `m.moneyline.away` and `m.moneyline.home` are null → `implAway` and `implHome` are both null → the ML loop's gate fails → **no Moneyline candidate is generated for any game**.

Tests have been masking the bug because the v7 fixture (`buildNbaPicksV2.test.js`, `fullSlateContract.test.js`) writes the structured shape directly: `moneyline: { away: 130 - i*10, home: -150 + i*8 }`. So the unit tests pass while production silently drops every ML pick.

### 1.2 Why ATS + Total still publish

* **ATS** — depends only on `pregameSpread` (a single number) and the win-prob signal derived from `pregameEdge`. No moneyline-shape requirement.
* **Total** — depends on `model.fairTotal` (now from the v7 fallback chain) and `market.pregameTotal`. No moneyline-shape requirement.

Only ML reads from `game.market.moneyline.{away,home}` — so only ML breaks under the shape mismatch.

### 1.3 The display

`NbaFullSlateBoard` renders `<MarketCard pick={game.picks.moneyline} marketKey="moneyline" />`. When `pick === null`, the card falls through to:

```jsx
{!pick && <span className={styles.empty}>No qualified pick</span>}
```

So the "No qualified pick" copy is correct for the null state — the bug is the null state itself.

### 1.4 Fix path

Three coordinated changes:

1. **`_odds.js`** — parse home AND away `h2h` outcomes, write `market.moneyline = { away, home }`. Backwards-compatible with any existing single-number consumer is left as a separate concern (we audit those next).
2. **`_normalize.js`** — same shape fix from the ESPN scoreboard fallback.
3. **Builder ML fallback** — even when both prices are missing (delayed odds, off-day pre-line), generate a tracking ML pick from the spread-derived implied prob so every game still produces 3 picks. The v7 contract requires it.

### 1.5 Audit other consumers of `market.moneyline`

* The bracketology, briefing, and live-game cards all read the `betting.spreadDisplay` / `betting.totalDisplay` fields, not `market.moneyline` directly.
* Picks UI doesn't render a single `market.moneyline` number anywhere.
* So the shape change is safe — no other callers depend on the legacy single-number shape.

## 2. Scorecard recency — why May 1 still shows

`/api/nba/picks/scorecard` defaults to `requestedSlate = yesterdayET()`. Today's date (per system reminder) is 2026-05-04, so `yesterdayET()` resolves to 2026-05-03.

The selection state machine prefers `yesterday_graded`. If 2026-05-03 has zero graded picks (because settlement runs at 8:30 AM ET tomorrow and today's games are still live or pre-tip), the resolver falls back to:

```
findLatestGradedSlate({ sport: 'nba', lookbackDays: 21 })
```

That returns the most recent slate with `pick_results.status` IN ('won','lost','push'). On a Game 7 day where the most recent settled slate was May 1, the response correctly carries May 1's record + a "Most Recent Graded Slate" banner.

**The current behavior is correct for graded data**. What's missing is a **pending-slate strip** that surfaces today's full-slate picks the model has already generated, even though they aren't graded yet. Today the only pending UI is a tiny banner in the awaiting state — which only renders when there's no graded fallback to show.

### 2.1 Fix path

* Endpoint adds a top-level `pendingSlate` block when picks for `today` or `requestedSlate` are persisted but ungraded. Shape:
  ```jsonc
  {
    pendingSlate: {
      slateDate: '2026-05-04',
      games: [{ gameId, awayTeam, homeTeam, startTime, picks: { moneyline, runline, total } }],
      pickCount, expectedPickCount, missingMarketsByGame
    }
  }
  ```
* Endpoint adds debug fields when `?debug=1`:
  * `todayET`
  * `latestGeneratedSlate` (newest `picks.slate_date`)
  * `latestSettledSlate`
  * `latestPendingSlate`
  * `latestPickRunAt` (newest `picks_runs.created_at`)
  * `currentSlateGameCount`
  * `currentSlateExpectedPickCount` (= games × 3)
  * `currentSlatePersistedPickCount`
  * `currentSlateMissingMarketsByGame`
  * `selectedReason` (already exists; surfaced more loudly)
* `NbaScorecardReport` renders a "Today's Pending Full-Slate Picks" strip when `pendingSlate` is present, ABOVE or alongside the latest-graded block. Counts excluded from win-rate.

## 3. Product contract reaffirmed (v8)

| Surface | Source | What renders |
|---|---|---|
| `/nba` hero board | `heroPicks` | High-conviction subset only |
| `/nba/insights` | `byGame[]` | Every playoff game × ML/ATS/Total — including tracking |
| Scorecard "graded" block | `pick_results` (status IN won/lost/push) | Latest fully-settled slate |
| Scorecard "pending" block (NEW) | `picks` (status='pending') | Today's full-slate picks, not graded |
| Pick history | `picks` (all rows) | Persisted regardless of conviction |

### 3.1 Where v7 violated the contract

* ML never reached `byGame.moneyline` because of the odds-shape mismatch (§1).
* Pending picks weren't surfaced separately from graded results — the scorecard either rendered graded data OR an "awaiting" empty state, never both. Today's Game 7 picks were invisible until graded the next morning.

## 4. What this PR ships

1. **`api/nba/live/_odds.js`** — `parseOddsEvent` now collects both home and away `h2h` outcomes; `enrichGamesWithOdds` writes `market.moneyline = { away, home }`.
2. **`api/nba/live/_normalize.js`** — ESPN scoreboard normalization writes the same `{ away, home }` shape from `homeTeamOdds.moneyLine` + `awayTeamOdds.moneyLine`.
3. **`buildNbaPicksV2.js`** — ML loop now generates a tracking pick even when implied probs are absent, using the spread-derived implied (or a 50/50 fallback) so every game produces 3 picks under the full-slate contract.
4. **Scorecard endpoint** — adds `pendingSlate` block + debug fields enumerating the pipeline state.
5. **`NbaScorecardReport`** — new "Today's Pending Full-Slate Picks" strip renders above the graded block when pending slate exists.
6. **Tests** — every game produces ML even with empty `market.moneyline`; tracking ML carries selection + conviction; scorecard endpoint exposes the new debug fields; pending picks excluded from win-rate.

## 5. Today's two-game slate

If production has live odds for today's two Game 7 games, this PR will:
* Generate 6 picks (2 games × ML + ATS + Total).
* Persist them as full-slate (hero or tracking, depending on conviction).
* Render all 3 markets per game on `/nba/insights`.
* Surface them in a pending strip on `/nba` and `/nba/insights` until tomorrow's settle cron grades them.

If production has scoreboard data but no odds yet, the builder still generates ML tracking picks via the spread-derived fallback. Totals remain dependent on `seriesPaceFairTotal` priors; without prior series finals, totals will fall back to `slate_baseline_v1` (low confidence) — still produces a pick.

## 6. Caveats

* The local Vite preview can't run the Vercel API routes (`/api/nba/picks/scorecard`, `/api/nba/picks/built`), so the live verification of "today's Game 7 picks render" requires production deploy.
* Fixtures in `fullSlateContract.test.js` already exercise the v7 every-game contract; a new fixture-level test verifies ML picks generate even when `market.moneyline` is null/empty/single-number-shaped.
* If the Odds API has rate-limited and no fallback cache exists, the moneyline payload may be entirely empty for some upcoming games. The builder's spread-derived fallback ensures ML picks still publish; the data-quality flag stays low.
