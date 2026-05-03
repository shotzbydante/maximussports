# NBA Home — Reorder, Polish, SEO Audit v6

**Date:** 2026-05-04
**Scope:** Three asks: (1) move Maximus's Picks above the scorecard on `/nba`, (2) bring picks-section polish to scorecard parity, (3) wire SEO metadata for NBA playoff betting picks discoverability.

---

## 1. NBA Home layout — what owns the order today

`src/pages/nba/NbaHome.jsx` renders the main page. Inside the dark hero shell (`<section class={styles.picksHero}>`), the order is currently:

```jsx
<NbaScorecardReport variant="embedded" insightsHref="/nba/insights" />
<MlbMaximusPicksSectionV2 mode="home" sport="nba" homeShowAll darkSurface />
```

So scorecard renders first, picks second. That's the order shipped through v5. The user wants picks first because the picks board is the more engaging entry surface.

### 1.1 Props passed to picks section (NBA)

```
mode="home"
sport="nba"
endpoint="/api/nba/picks/built"
suppressPerformanceBlocks
homeShowAll
darkSurface
```

`homeShowAll` removes the home-mode truncation; `darkSurface` flips dark-hero CSS overrides; `suppressPerformanceBlocks` stops the duplicate trust strip.

### 1.2 CSS files in play

| File | Owns |
|---|---|
| `src/pages/nba/NbaHome.module.css` | Hero shell `.picksHero` + inner padding/glass |
| `src/components/nba/picks/NbaScorecardReport.module.css` | Scorecard chrome + `.sectionEmbedded` overrides |
| `src/components/nba/picks/ByMarketSummary.module.css` | Pick 'Em / ATS / Totals tiles |
| `src/components/mlb/picks/MlbMaximusPicksSectionV2.module.css` | Picks section root + `[data-dark-surface]` overrides |
| `src/components/mlb/picks/TierSection.module.css` | Tier headers + subgroup labels |

## 2. Visual gaps remaining in the picks section vs scorecard

| Element | Status today | What needs to feel more premium |
|---|---|---|
| Picks-section root container | No glass shell of its own — relies on the parent `.picksHero` | Wrap in its own translucent navy gradient + soft inner shadow + 1px gold accent strip so it reads as a peer surface, not a child |
| ByMarketSummary | Already glassy, decent | Stronger active-tile state, clearer count hierarchy |
| Today's Picks gold pill | Polished after v5 | Keep |
| Tier 3 / Leans header | Plain row, low chrome | Lift to a real glass header with the tier-color accent strip + count pill |
| Pick cards (`PickCardV2`) | Premium white glass on dark | Keep — the card chrome inversion is the design |
| About the Model + How It Works | Light gray squares, feel inert | Re-tone for dark hero: translucent surface, gold accent strip, clearer labels |
| Bottom "View full Odds Insights" link | Plain text link | Promote to a polished pill/CTA matching the scorecard's `compactCta` treatment |
| `.homeFollowLine` ("Track performance daily…") | Already light on dark | Keep |

The picks board is currently styled fine internally, but it sits visually "naked" inside the hero with no shell of its own. The scorecard has `.sectionEmbedded` glass; the picks section doesn't. That's the asymmetry the user is pointing at.

## 3. SEO — what exists today on `/nba`

`src/pages/nba/NbaHome.jsx`:

* No `<SEOHead>` import, no Helmet usage.
* No canonical, OG, or Twitter metadata at the route level.
* The page falls back to `index.html` defaults + the global SEO context.

### 3.1 What SEO infrastructure already exists

Verified:
* `react-helmet-async` is installed and `<HelmetProvider>` wraps the app in `src/main.jsx`.
* `src/components/seo/SEOHead.jsx` is the canonical per-route helmet wrapper. It sets title (with site-name suffix), description, canonical, OG (title/description/url/image/type/site_name/locale), Twitter (card/title/description/image/site), and optional JSON-LD.
* Used by `Insights.jsx`, `MarchMadnessHub.jsx`, `Teams.jsx`, `CollegeBasketballPicksToday.jsx`, `GameMatchup.jsx`, `Landing.jsx`. So the pattern is well-established.
* `buildOgImageUrl({ title, subtitle, meta, type })` generates a dynamic `/api/og` image. We can use it without a static asset.

### 3.2 Visible H1/H2

`NbaHome.jsx` currently has no `<h1>`. Inside the hero shell there's an `<h2>` for "NBA Playoff Intelligence". Within the scorecard there's another `<h2>` for "How Maximus's Picks Are Performing". Two h2s, no h1 → SEO penalty + accessibility concern.

### 3.3 Crawlable copy

The hero subhead reads "Model-graded picks, daily scorecard, and rolling performance — one surface, fully transparent." That's reasonable but doesn't include the keywords that drive discovery: "NBA playoff betting picks", "moneyline picks", "spread picks", "over/under picks".

### 3.4 SEO compliance copy

"For entertainment only. Please bet responsibly." appears at the bottom of the picks section in page mode. Home mode currently includes "Track performance daily. Picks are graded and refined over time." — neither version has explicit responsible-gaming language. Worth adding in a non-shouty way.

### 3.5 Risks

* No "best NBA picks", "guaranteed wins", or other unsubstantiated claims should appear in copy.
* Compliance language (entertainment only, bet responsibly) should be visible.

## 4. Recommended changes (shipped in this PR)

### 4.1 Layout reorder

Swap `<NbaScorecardReport>` and `<MlbMaximusPicksSectionV2>` inside `.picksHero`. Adjust `.picksHeroInner` gap so the transition between picks and scorecard reads as intentional (not crowded).

### 4.2 Picks-section polish

* New `.modeHome` glass shell scoped to `[data-dark-surface='true']`: translucent navy fill, soft white edge, 1 px gold top accent, soft drop shadow. Renders the picks block as a peer surface to the scorecard.
* TierSection tier-3 / coverage headers get a stronger glass treatment on dark surface (better border, mild backdrop, lifted gold/silver accent).
* `AboutTheModel` + `HowItWorks` cards get `[data-dark-surface]` overrides — translucent navy fill instead of flat fog gray, gold accent strip, light-on-glass body text.
* Bottom `View full Odds Insights →` link upgraded to a pill CTA on dark surface (subtle gold border + gold text, hover state).

### 4.3 SEO

* Add `<SEOHead>` to `NbaHome.jsx` with:
  * `title: "NBA Playoff Betting Picks, Predictions, Spreads & Totals"`
  * `description: "Get model-graded NBA playoff betting picks, moneyline predictions, spread picks, and over/under insights with daily scorecards and transparent performance tracking from Maximus Sports."`
  * `canonicalPath: "/nba"`
  * `ogImage` via `buildOgImageUrl({ title: "NBA Playoff Picks", subtitle: "Model-graded predictions, ATS, ML, and totals", type: "Sports Intelligence" })`
  * `jsonLd` — minimal `WebPage` schema with name + description + url
* Add a hidden visually-but-crawlable lead paragraph above the page hero (or inside the existing intro block) that names: NBA playoff betting picks, moneyline predictions, spread picks, over/under picks, model-graded predictions, daily scorecard.
* Add an `<h1>` to the page (currently missing) that reads "NBA Playoff Intelligence" — keeping the existing visual hierarchy by reusing the page intro slot.
* Add a small responsible-gaming line near the bottom of the picks shell: "For entertainment only. Please bet responsibly. 21+."

## 5. What this PR does NOT change

* No new pick logic, no enricher changes, no model changes.
* No structured-data (rich-snippet) markup beyond the minimal `WebPage` JSON-LD — `SportsApplication` would be a stretch and not aligned with what the app actually is.
* No social image asset — we use `buildOgImageUrl` to render a dynamic image consistent with the rest of the app.
* `/nba/insights` is untouched (the SEOHead lives on the NBA Home route only; scorecard component is unchanged).

## 6. Tests added

* `NbaHome.layout.test.jsx` — source-level invariant: in the JSX the `MlbMaximusPicksSectionV2` block precedes `NbaScorecardReport`. Ships before the cosmetic change so a future re-shuffle would fail.
* `NbaHome.seo.test.jsx` — confirms SEOHead is rendered with NBA-playoff-betting-picks title + canonical `/nba` + description that names moneyline/spread/totals/model-graded.
