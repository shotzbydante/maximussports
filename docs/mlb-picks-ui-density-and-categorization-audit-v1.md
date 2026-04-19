# MLB Picks — Density, Categorization & Duplicate Audit (v1)

**Scope:** MLB Odds Insights (`/mlb/insights`) and the MLB Home preview module, after the premium-UI overhaul (`7f90309`).

---

## 1. Duplicate root cause — Dodgers vs Rockies rendered twice

**Primary cause:** The v2 pick engine emits up to **2 picks per matchup** (`config.maxPerGame = 2`) across market types. When a single game has both a Moneyline pick AND a Total pick that both clear a tier threshold, both picks end up in the published board and both render as **independent cards**. The UI has no grouping, so the user sees `LAD @ COL` twice.

Trace:
- `src/features/mlb/picks/v2/buildMlbPicksV2.js` generates candidates for every market independently (ML away/home, RL away/home, Total over/under). A game with any two qualifying markets enters the candidate pool with both picks.
- `src/features/mlb/picks/v2/tier.js:64-80` `assignTiers()` enforces `maxPerGame` (default 2) and `maxTier1PerGame` (default 1). So within a single tier you can have 2 picks for the same game (e.g., both in Tier 2), or split across tiers (1 in Tier 1 + 1 in Tier 2).
- `src/components/mlb/picks/TierSection.jsx` iterates picks in a flat grid. No matchup awareness. Same matchup, two cards.
- The **Top Play cross-reference** (`withTopPickCrossReference`) only flags when a tier card shares matchup with *the single Top Pick*. Siblings in Tier 1/2/3 that share a matchup with each other (but not with Top Play) are **not** flagged. This is the gap.

**Secondary cause (possible):** MLB doubleheaders create two distinct ESPN `gameId`s for the same `(awaySlug, homeSlug, date)`. Those picks are semantically different games, but the UI shows no Game 1 / Game 2 label. They read as accidental duplicates.

**Conclusion:** Both causes are legitimate in the data; the UI just needs to express them. Fix with:
1. Group by `gameId` per tier. Render a **single matchup card** whose primary pick is the highest-conviction market, with compact "Also from this matchup" sibling rows inside.
2. Annotate doubleheaders with a `Game 1 / Game 2` pill derived from sorting the two games in `(awaySlug, homeSlug, slateDate)` order by `startTime`.

---

## 2. Card density — where space is being wasted

### Desktop
- PickCardV2 uses `padding: 14px 16px 12px` + `gap: 10px` between sections + explicit `margin-bottom` on the tier section. Stack of 4+ vertically-spaced blocks per card: meta, pick, headline, metrics, component bar, bullets.
- On a 1440×900 viewport in tier-1 view: a single card eats ~240px of height. Three in a row → one row above the fold, nothing more.
- `.componentBar` consumes ~60px for a breakdown most users only glance at.
- Bullets sit at 12px/1.45, fine alone, but double-spaced against the headline.
- Metrics and component bar carry redundant signal (Edge appears in both the metrics chip AND the component bar).

### Mobile
- Every block stacks. Card heights balloon to ~360px.
- Tag row wraps, pushing conviction badge to line 2.
- Bullets add another line per rationale point.

**Targets for condensation:**
- Trim card padding to `12px 14px 10px`.
- Combine meta + tagRow into a single row.
- Remove top Kicker "Selection" label — redundant with the label size.
- Collapse the component bar to a single horizontal **inline segmented bar** (50% of current height) with labels beneath as 9px micro-ticks.
- Reduce bullets to max 2 (not 3) and tighten leading.
- Keep default expanded — just make expanded compact.

Result target: card height down from ~240px → ~155px on desktop (~35% denser).

---

## 3. Category structure unclear

Users think in bet types — **Pick 'Ems / Spreads / Value Leans / Game Totals** — but the current tier sections render a flat grid of mixed market types. Within Tier 2 they see a Moneyline, two Spreads, and a Total all jumbled together.

The brief calls for keeping the conviction-first primary structure (Tier 1 / 2 / 3) AND adding clearer bet-type sub-groupings within each tier.

**Proposed treatment:** Inside each TierSection, group picks by market type and render compact sub-headers above each group:

```
Tier 1 — Maximus Top Plays
  · Pick 'Ems (1)       ← subgroup header, no full frame, just a kicker line
     [card] [card]
  · Game Totals (1)
     [card]

Tier 2 — Strong Plays
  · Spreads (2)
     [card] [card]
```

Sub-header treatment: a thin row with an icon, a label ("Pick 'Ems"), and a count. Doesn't add a full card frame — keeps the visual hierarchy primary-on-tier.

Tier-3 Moneyline picks are also the "Value Leans" product term. When a Tier-3 section contains moneyline picks, label that subgroup "Value Leans" instead of "Pick 'Ems" so the product vocabulary stays consistent with how the brand has historically talked about softer-edge plays.

---

## 4. MLB Home preview too shallow

Current: hero strip (scorecard + Top Play) + a single Tier-1 card.

Brief wants: more picks, still a teaser, still premium.

**Proposed layout:**
```
┌─ Yesterday's Scorecard ─┬─ Today's Top Play ─┐
│                         │                    │
├─────────────────────────┴────────────────────┤
│  What is Maximus's Picks? (3 short lines)    │
├──────────────────────────────────────────────┤
│  Tier 1 cards (up to 3, dense)                │
├──────────────────────────────────────────────┤
│  Tier 2 cards (up to 2, compact)              │
├──────────────────────────────────────────────┤
│  "See all N picks →"                          │
```

The explanatory block becomes the bridge between "this is what we grade" (scorecard) → "this is the best bet today" (Top Play) → "here's why you should click through" (model explanation + more picks).

---

## 5. Explanatory copy gaps

The full page has a 1-line subtitle under the header. Home has none. Nothing explains:

- What the scorecard represents
- What Conviction means (0-100 bounded composite)
- What the four score components are and why they matter
- How tiers are defined (percentile + floor)
- Why this is model-scored, not curated

**Proposed copy addition:** a compact `<HowItWorks>` block that sits once on `/mlb/insights` (between Top Play and Tier 1) and once on MLB Home (between hero strip and Tier 1 preview). Four compact points:

1. **Model-scored, not hand-picked.** Every pick gets a conviction score from 0 to 100 that blends edge, confidence, situational context, and market quality.
2. **Tiered by conviction.** Top Plays require score ≥ 75 AND top 10% of today's slate. Strong Plays and Leans follow proportionally.
3. **Grouped by bet type within each tier.** Pick 'Ems, Spreads, Game Totals, and Value Leans are organized within each conviction level.
4. **Evaluated every day.** Yesterday's scorecard tracks real results and feeds the model's self-improvement loop.

Copy voice: editorial, confident, concise.

---

## 6. Number clarity — remaining gaps

Post-overhaul, most labels are explicit. Remaining ambiguity:

- Conviction badge on `TopPlayHero` shows the value top-right but the label is below; some users may read it as "Today's Top Play ... 93" rather than parsing the badge. Mitigate with a micro-label on the score.
- Component bar segment values: `0-100` scale but no axis clue. Add "0-100" kicker or trim to just a bar without raw value so it reads as "relative strength."
- On home preview, the "full board →" pill doesn't say how many picks are waiting. Change to "See all {n} picks →".

---

## 7. Summary of changes this cycle will land

| Area | Change |
|---|---|
| Duplicate fix | Matchup-level grouping inside tiers + doubleheader Game 1/2 tag |
| Card density | Trimmer padding, inline tag row, tighter component bar, 2-bullet cap |
| Category | Market-type subgroups inside each tier ("Pick 'Ems", "Spreads", "Game Totals", "Value Leans") |
| Home preview | Tier 1 + Tier 2 preview cards, explanatory block, "See all N picks" CTA |
| Explanatory copy | New `<HowItWorks>` 4-point block on Insights and Home |
| Number clarity | Micro-label on TopPlayHero conviction, relative-strength segments, picks-count CTA |
| Drift | Both pages still consume `useMlbPicks` exclusively; grouping helpers are pure |

---

*End of audit.*
