# NBA Scorecard — Readability + Daily Refresh Audit v3

**Date:** 2026-05-04
**Surfaces audited:** `/nba` (embedded scorecard inside the dark hero), `/nba/insights` (page-mode scorecard on light background), `/api/nba/picks/scorecard` (default-date resolution + cache headers).

---

## 1. Dark-on-dark text inside the embedded scorecard

The `.sectionEmbedded` overrides shipped on 2026-05-04 cover the top-level surfaces (eyebrow, title, slateDate, takeaway, category chips, badges, row text), but **descendant selectors that set their own `color` win the cascade and stay light-mode**. The audit found these illegible-on-dark elements on `/nba`:

| Selector | Color rule | Light-mode value |
|---|---|---|
| `.explainerList li` | `color: var(--color-text-secondary)` | dark grey |
| `.explainerList li::before` | `color: var(--color-text-muted)` | mid grey |
| `.explainerList strong` | `color: var(--color-text)` | near-black |
| `.rollingCardRate` | `color: var(--color-text-secondary)` | dark grey |
| `.rollingCardSample` | `color: var(--color-text-muted)` | mid grey |
| `.rollingCardEmpty` | `color: var(--color-text-muted)` | mid grey |
| `.compactCta` | `color: #1d428a` (NBA navy) | navy on navy = invisible |
| `.pendingNote` | `color: #5a6172` | dark grey, weak contrast |
| `.takeawayKicker` (when ancestor `.sectionEmbedded` already overrides it but only when scoped via `.sectionEmbedded .takeawayKicker`) | needs explicit override | weak on glass |
| `.headerStats > .statLabel` (in awaiting state) | `color: var(--color-text-muted)` | weak |
| `.gameContext` (row metadata) | `color: var(--color-text-muted)` | weak on glass |
| `.gameContextFlag` | `color: #b34a4a` | dim on glass |
| `.cat`, `.tier` chips inside `.sectionEmbedded` (already overridden) | OK | already fixed |
| `.row` separator borders (`rgba(0,0,0,0.04)`) | invisible on dark | low contrast |
| `.row_won/lost/push` gradients (`rgba(22,163,74,0.04)`) | barely visible on dark | low contrast |

The fix is to scope each leaf selector under `.sectionEmbedded` so the embedded variant becomes a true colour scheme, not just a background swap. Light Odds Insights styling is unaffected because the overrides apply only when `.sectionEmbedded` is present.

The `MlbMaximusPicksSectionV2` (picks board below the scorecard) renders its own heading copy ("MODEL-DRIVEN NBA BETTING INTELLIGENCE"). Inside the dark `.picksHero` shell it uses `var(--color-text)` (near-black) which is also unreadable. We add a one-time hero-scoped override that lifts those headings to white-on-glass without changing the shared component's defaults.

## 2. Glass quality

Today's `.sectionEmbedded` already has translucent navy fill, soft white edge, gold accent strip, blur-saturate. The audit identifies two upgrades:

* **Inner highlight** — a 1 px top-edge `inset 0 1px 0 rgba(255,255,255,0.06)` reads as cut-glass; current rule has it but the borders below the takeaway/category strip lack a matching divider, so the visual rhythm feels flat. Fix: a translucent white separator above the picks list and the rolling-perf block.
* **Row tints** — the won/lost/push gradient stops are tuned for a white card. On glass they vanish. Fix: stronger tints scoped under `.sectionEmbedded`.

## 3. Daily refresh — does the scorecard always show yesterday's settled picks?

### 3.1 Default-date resolution

`api/nba/picks/scorecard.js` has a multi-step resolver. With NO `?date=`:

1. `targetPrior = yesterdayET()` (ET-aware, no hard-coded date).
2. Inspect that target slate's picks + pick_results join.
3. If `picks > 0` and `gradedCount === 0` and ESPN has finals for that day, run `autoHealSlate({ forceRegrade: false })` inline — heals the slate live so the next page load is graded. This is the daily-refresh hot path.
4. After heal (or if already graded), pick the most-recent surface between `findLatestGradedSlate` (per-pick rows) and `getLatestGradedScorecard` (aggregate). Prefer rows.
5. Return:
   * `selectedReason: 'yesterday_graded'` — yesterday is settled.
   * `selectedReason: 'awaiting_settlement'` — yesterday has picks + finals but no graded rows (heal in progress / failed).
   * `selectedReason: 'awaiting_finals'` — yesterday has picks but games still in flight.
   * `selectedReason: 'latest_graded_fallback'` — yesterday had no picks; render the most recent prior settled slate with `usedFallback: true`.
   * `selectedReason: 'no_graded_slate'` — first-day case, no graded history anywhere.

### 3.2 What the UI shows in each case

`NbaScorecardReport.jsx` already produces the right copy:

* `usedFallback === true` → header reads "Most Recent Graded Slate · Friday, May 1".
* `awaitingSettlement` / `awaitingFinals` → dated banner: "May 2 slate awaiting settlement (4 picks). Showing last settled results." or "May 2 slate in progress …".
* `no_graded_slate` → "Awaiting first graded slate" + "Today's picks are listed in the picks board below; results post here once games go final."

This is correct. **No date is hard-coded.** The only thing the daily refresh depends on is `yesterdayET()` rolling forward as time passes — proven in `dateWindows.test.js`.

### 3.3 Cache-safety for daily refresh

Today's headers on `/api/nba/picks/scorecard`:

```
Cache-Control: public, max-age=0, s-maxage=30, must-revalidate
```

* `max-age=0` — browsers always revalidate on visit.
* `s-maxage=30` — Vercel edge serves the cached response for 30 s.
* `must-revalidate` — once stale, the edge MUST go to origin.

For a daily-refresh surface this is correct. The 30-second edge bucket smooths burst traffic without holding stale-yesterday content for more than half a minute. `NbaScorecardReport.jsx` also adds a 60-second client-side cache-buster bucket (`?t={Math.floor(Date.now() / 60000)}`), which combined with `cache: 'no-store'` guarantees the browser never reuses a stale response across the day boundary.

### 3.4 Pending picks vs graded record

The endpoint splits totals into `record: { won, lost, push, pending }` plus `byMarket: { moneyline, spread, total }`. The graded percentage is computed in the UI (`NbaScorecardReport#winRate`) as `won / (won + lost)`. Pending picks are surfaced separately with a "N pending" suffix and never bias the rate. Verified by inspection.

### 3.5 Findings

* **No date-resolution bug found.** The pipeline is correct.
* **No cache bug found.** Headers + client cache-buster are appropriate for a daily surface.
* **One edge case worth a small hardening**: when `autoHealSlate` is mid-run and heals partially, the post-heal recheck is bounded by a 4.5 s timeout; if it times out the response still falls through to the most-recent-graded slate selection. That fallback is already in place.

## 4. Recommended changes (shipped in this PR)

* New embedded-scoped overrides for `.explainerList li`, `.explainerList li::before`, `.explainerList strong`, `.rollingCardRate`, `.rollingCardSample`, `.rollingCardEmpty`, `.compactCta`, `.pendingNote`, `.takeawayKicker`, `.gameContext`, `.gameContextFlag`, row dividers, and won/lost/push tints — all wrapped in `.sectionEmbedded` so light Odds Insights renders unchanged.
* `.picksHero` scoped overrides for the shared `MlbMaximusPicksSectionV2` headings (eyebrow + title + sub) so the "MODEL-DRIVEN NBA BETTING INTELLIGENCE" heading and surrounding metadata are readable on the dark hero. MLB Home untouched (its picks section is not nested inside `.picksHero`).
* New mid-section divider rule (`.sectionEmbedded .picksList::before` / `.sectionEmbedded .rolling::before`) to give the glass surface a coherent rhythm.
* New tests:
  * `dailyRefresh.test.js` — proves `yesterdayET()` + slate selection produce the expected `selectedReason` for each input shape (yesterday-graded / awaiting / fallback / no-history). No hard-coded date in the assertions; the test patches `Date.now()` via `vi.useFakeTimers`.
  * `embeddedReadability.test.jsx` — source-level invariant: every CSS rule that sets a foreground colour for explainer / rolling / compactCta / pendingNote / gameContext has a matching `.sectionEmbedded`-scoped override. A regression on this test means a future PR added a new dark text rule without an embedded counterpart.

## 5. Caveats

* The audit verifies the structural correctness of the daily-refresh path. Live verification against prod requires hitting `/api/nba/picks/scorecard?includePicks=1&debug=1` after deploy and inspecting `selectedReason` + `selectedSlateDate` over consecutive days.
* The `.picksHero` shared-component overrides target only the headings + sub-copy that ship dark by default; the picks card chrome (white tier cards) intentionally stays light — they're already designed for inversion.
