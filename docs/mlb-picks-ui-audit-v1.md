# MLB Maximus's Picks — UI/UX Audit (v1)

**Surfaces audited:**
- `/mlb/insights` — full Odds Insights page (via `src/pages/mlb/MlbPicks.jsx`)
- MLB Home — daily briefing (via `src/pages/mlb/MlbHome.jsx:208`)

**Canonical source:** `GET /api/mlb/picks/built` returns v2 payload with `tiers`, `topPick`, `scorecardSummary`, `categories` (legacy mirror).

---

## 1. Component tree today

```
/mlb/insights (MlbPicks.jsx)
  └─ MlbMaximusPicksSectionV2 (mode="page")        ← v2 tier-based
       ├─ YesterdayScorecard                        ← fetches /api/mlb/picks/scorecard
       ├─ TopPlayHero
       └─ TierSection × 3
             └─ PickCardV2

MLB Home (MlbHome.jsx)
  └─ MlbMaximusPicksSection                         ← v1 4-column grid (pickEms/ats/leans/totals)
       └─ PickCard (v1)
       (fetches /api/mlb/picks/board, re-runs buildMlbPicks client-side)
```

## 2. Drift risks

- **MLB Home uses the legacy v1 component**, which fetches `/api/mlb/picks/board` (raw games) and re-runs the OLD `buildMlbPicks` client-side. It never sees the v2 `tiers`, `topPick`, `scorecardSummary`, or the tuning-config-driven scoring. This is the primary drift source.
- **Two fetch sites** (`/built` on Insights, `/board` on Home) can disagree on cadence and cache.
- **No shared data hook** — every surface fetches independently. There is nowhere to enforce "use the canonical v2 payload."

## 3. Numbers without labels

- `TopPlayHero.jsx:40-46` renders a `convictionPill` with raw `CONVICTION ${conv}` — the 0–99 scale has no scale reference in-view. `Edge`, `Confidence`, `Bet Score` are rendered as bare numeric values with small uppercase micro-labels but no unit (%, no numeric ceiling shown).
- `PickCardV2.jsx:57` renders `<span className={styles.conviction}>{conv}</span>` — the number is *only* accompanied by a visual pill, not a label word. A "93" badge with no "Conviction" prefix is ambiguous.
- `PickCardV2.jsx` tier-tinted pill: `.conviction { color:#b8293d; background:#fee2e2 }` — that's the loud pink/red the brief flags.
- `YesterdayScorecard.jsx` chip row uses `ML/RL/Tot` labels but the record like `"3-1"` isn't prefixed with "Record" anywhere, and the top "record value" at 28px has no label — just an eyebrow on the header.

## 4. Conviction styling (currently red/pink)

| File | Line | Issue |
|---|---|---|
| `PickCardV2.module.css` | `.conviction` | `color:#b8293d; background:#fee2e2` — pink. Tier2 overrides to blue, tier3 to gray — inconsistent visual story. |
| `TopPlayHero.module.css` | `.convictionPill` | `background:#b8293d; color:#fff` — saturated sportsbook red. |
| `YesterdayScorecard.module.css` | `.scorecard` | `border-left: 3px solid #b8293d` — red accent. |
| `TierSection.jsx` | `TIER_META.tier1.accent` | `#b8293d` — red tier-1 bar. |
| `MlbMaximusPicksSectionV2.module.css` | `.eyebrow` | `color: #b8293d`. |

The brief explicitly rules this out. Replace with cool navy/steel/slate with restrained gradients and glass treatment.

## 5. Cards default-collapsed (wrong default)

`PickCardV2.jsx:10` — `const [expanded, setExpanded] = useState(false)`. Component bar and bullets are hidden until the user clicks "See why". The brief requires default expanded with a collapse action available.

## 6. Hierarchy weak spots

- The section header on Insights is a plain `h2` — "MLB Odds Insights" — without a premium frame. Reads like a dashboard title, not an editorial product.
- Tier headings are chunky but visually homogeneous with the scorecard header above them. Nothing guides the eye to "top play is the most important thing on screen."
- Tier 3 is rendered at the same visual weight as Tier 1 except for a small accent bar. The brief wants Tier 3 clearly subdued.

## 7. Duplication / repetition

- Same matchup can surface in Top Play hero + Tier 1 card + Tier 2 card (when a game has multiple qualifying markets). Currently no visual differentiation in the hero's matchup line vs the tier card. Readers see "NYY @ BOS" three times.
- No in-card signal that "this pick is the same matchup as the Top Play" — trust-killing redundancy.

## 8. Fetching behavior today

- `MlbMaximusPicksSectionV2.jsx:22` hits `/api/mlb/picks/built` once; state held inside the component.
- `YesterdayScorecard.jsx:22` independently hits `/api/mlb/picks/scorecard`. Two roundtrips for data that /built already embeds under `scorecardSummary`.
- `MlbMaximusPicksSection.jsx` (v1) hits `/api/mlb/picks/board` — a third endpoint.

## 9. Styling-system issues

- Accent color is `#b8293d` (red) everywhere. Cool-toned direction is not represented.
- No glass surfaces — all cards are opaque white on `#f9fafb`.
- Section spacing is ad-hoc per component; no shared vertical rhythm.
- Typography relies on `'DM Sans'` everywhere but sizes aren't systematized (28px / 22px / 17px / 15px appear with no tokenized hierarchy).

## 10. Top priorities for the redesign

1. **Unify the canonical data source.** Create `useMlbPicks()` returning `{ payload, loading, error }` and use it on both `/mlb/insights` AND MLB Home. Derive scorecard from `payload.scorecardSummary` (drop the secondary scorecard fetch from hero when payload provides it).
2. **Kill the pink/red.** New design tokens — deep navy → slate → steel cool gradient; glass-white surfaces with soft blue shadows; silver/cool-silver conviction badges with restrained glow.
3. **Cards default expanded.** Toggle to collapse. Animation via `max-height` or `grid-template-rows: 1fr/0fr`.
4. **Every number gets a word.** `Conviction 93`, `Edge +6.9%`, `Confidence 78%`, `Bet Score 93`. No naked integers.
5. **Hero hierarchy.** Scorecard becomes a refined glass strip. Top Play becomes the largest visual unit on screen with editorial treatment.
6. **Tier differentiation.** Tier 1 cards get the premium glass treatment; Tier 2 muted neutral; Tier 3 low-density summary row.
7. **MLB Home uses the same component.** `MlbMaximusPicksSectionV2 mode="home"` replaces the v1 four-column section.
8. **Top Play cross-reference.** When a tier-1 card is the Top Play, show a "⭐ Top Play" annotation instead of re-rendering as a separate card.

---

Implementation plan and component changes follow in the subsequent PR commit.
