# NBA Scorecard — Repeat Matchup Audit v1

**Date:** 2026-05-02
**Scope:** Game-identity safety in NBA picks settlement + per-row UI clarity for repeat playoff matchups.
**Trigger:** User saw an NBA scorecard row that read `HOU @ LAL` / `Pick: HOU +4` / `Final: HOU 98 – LAL 78` / `WIN · Covered by 16.0`, but a different recent Rockets/Lakers result is `LAL 98, HOU 78`. Repeat playoff matchups within a 7-game series produce two valid Final scores that look superficially similar and the UI gives no game-level distinguisher.

---

## 1. Grading pipeline — what could possibly be wrong

The NBA grading path is:

```
api/cron/nba/settle-yesterday  ──┐
                                 │  ──► gradePicks(picks, finalsByGameId, alreadyGraded)
api/_lib/autoHealSlate           ─┤      └─► settlePick(pick, final)
                                 │
api/nba/picks/scorecard?regrade=1┘
```

Both entry points do the same three things in order:

1. **Pull picks for the slate.** `getPicksForSlate({ sport: 'nba', slateDate })` returns every persisted `picks` row for that single ET calendar day. Each row carries `game_id`, `away_team_slug`, `home_team_slug`, `selection_side`, `line_value`, and a join to its `pick_results` row.
2. **Pull ESPN finals for the same slate.** `fetchYesterdayFinals({ slateDate })` calls ESPN scoreboard `?dates=YYYYMMDD` and returns ONLY the games whose ET calendar day matches `slateDate`.
3. **Build a finals index + fallback.**
   * Primary: `finalsByGameId.set(g.gameId, g)`.
   * Secondary: `finalsBySlugPair.set(slugPairKey(awaySlug, homeSlug), g)` — falls back to unordered team-slug pair when the persisted `pick.game_id` doesn't match an ESPN final id (legacy picks may carry an Odds-API id rather than an ESPN id).
4. **Grade.** For every ungraded pick, look up by `pick.game_id`. If missing, fall back to the team-pair index. Then call `settlePick`.

### 1.1 Cross-date collision risk

The primary risk for a repeat playoff matchup like HOU/LAL is "a pick for Game 5 (date A) gets graded against the final from Game 6 (date B)." This can only happen if the team-pair fallback indexes BOTH games into the same map, then a pick with the wrong `game_id` lands on the other game.

That's structurally **prevented today** because:

* `fetchYesterdayFinals({ slateDate })` only loads one ET day's finals into the map.
* So the fallback index for May 1 contains only May 1 games; the index for May 2 contains only May 2 games.
* A pick persisted with `slate_date = '2026-05-01'` is graded against `slate_date = '2026-05-01'` finals only.

The remaining risk is therefore narrower: a pick that's persisted with the WRONG `slate_date`. That's a persistence bug surface — not a grading bug surface — and we can defend against it by rejecting fallback matches whose final's `startTime` falls on a different ET day than the pick's `start_time`.

### 1.2 What we CAN'T verify from the local sandbox

This worktree has no Supabase credentials, so I can't read the actual `picks` / `pick_results` rows. To definitively answer "was this graded against the correct game?", an operator should hit:

```
/api/nba/picks/scorecard-debug?date=2026-05-02
/api/nba/picks/scorecard-debug?date=2026-05-01
```

The debug endpoint returns `persistedPicksCount`, `completedGamesCount`, `gradedPicksCount`, `missingGameIds`, and the resolved `slate_date`. The scorecard endpoint with `?includePicks=1&date=YYYY-MM-DD` returns each row's `gameId`, `finalAwayScore`, `finalHomeScore`, `pickLabel`, and `status`. Cross-referencing those against the ESPN scoreboard for the same date confirms identity.

---

## 2. Symptom triangulation

Two scenarios can produce the user-reported observation:

| Scenario | Diagnostic | Likely? |
|---|---|---|
| **A. Grading is correct, UI is ambiguous.** Pick was for Game 5 (HOU 98–78 LAL on date X). User is mentally comparing it against Game 6 result (LAL 98–78 HOU on date Y). | Scorecard row's `slateDate` matches Game 5's date AND the persisted ESPN `gameId` matches Game 5's ESPN id. | **Most likely.** UI shows no date / game# / series label; two final scores in the same matchup look interchangeable. |
| **B. Grading is wrong.** Pick persisted with one slate_date but indexed against the wrong ESPN final. | `pick.game_id` does not match any ESPN id for `slate_date`, AND the team-pair fallback indexed a game from a different date. Today's pipeline forbids this (see §1.1). | Unlikely with current code. Was theoretically possible if a pick row's `slate_date` was persisted incorrectly. |

The fix in this PR addresses **both** simultaneously: it adds context to every row (so Scenario A is impossible to mistake) AND tightens the fallback to refuse cross-date matches (so Scenario B can never occur even if upstream data is bad).

---

## 3. Concrete changes shipped with this audit

### 3.1 Cross-date safety in fallback matching

`autoHealSlate` and `settle-yesterday` will treat a team-pair fallback hit as **invalid** when the candidate final's ET calendar day differs from the pick's persisted `slate_date`. The pick stays pending instead of being graded against the wrong game. A diagnostic line is logged.

### 3.2 Series context on every scorecard row

The scorecard endpoint (`/api/nba/picks/scorecard?includePicks=1`) now enriches each pick row with:

* `gameDate` — the ET day the game was played (`YYYY-MM-DD`)
* `gameDateLabel` — `Fri, May 1`
* `gameNumber` — the playoff game number (`1`–`7`) when the matchup is a tracked playoff series
* `seriesRound` — `Round 1` / `Conference Semifinals` / `Conference Finals` / `NBA Finals`
* `seriesContextLabel` — `West Round 1 · Game 5` style formatted line, or empty when the game isn't part of a tracked playoff series

The UI surfaces these on every row, so `HOU @ LAL · Fri, May 1 · West Round 1 · Game 5 · HOU 98 – LAL 78 · WIN · Covered by 16.0` is unambiguous.

### 3.3 NBA Home shows all picks

`MlbMaximusPicksSectionV2` (the shared NBA + MLB picks layout) gains a `homeShowAll` prop. When true (NBA only), the home-mode renderer drops the artificial truncation (`tier2.slice(0, 3)`, `tier3.slice(0, 2)`) and renders every published pick + every coverage pick. MLB Home keeps the existing preview behavior.

### 3.4 NBA Home hero polish

The picks section gets a premium hero shell on NBA Home: gold-accent eyebrow + title, glass-framed picks panel, and an integrated scorecard strip that visually reads as one cohesive intelligence surface instead of three stacked modules.

### 3.5 Tests

* `repeat-matchup.test.js` — exercises `gradePicks` with two HOU/LAL games on different dates and confirms a pick for date A grades only against date A's final, never date B's.
* `annotatePick.seriesContext.test.js` — confirms enriched rows carry `gameNumber` and `seriesContextLabel` when a playoff context is supplied.
* Existing 7-scenario spread grading tests remain green.

---

## 4. Operator verification checklist (post-deploy)

After this commit deploys, an operator can:

1. Hit `/api/nba/picks/scorecard-debug?date=2026-05-02` → confirm `persistedPicksCount`, `completedGamesCount`, and `gradedPicksCount` are sane.
2. Hit `/api/nba/picks/scorecard?includePicks=1&date=2026-05-02` → every row now includes `gameDate` + `seriesContextLabel`.
3. If any row's grading needs to be re-run after the deploy: `/api/nba/picks/scorecard?date=2026-05-02&regrade=1` (the existing escape hatch from the May 2 grading-math fix).
4. Visit `/nba` → all NBA picks render in the home Maximus's Picks section, no truncation, premium hero framing.

---

## 5. Caveats

* The grading-correctness verification is bound by the operator hitting the debug endpoint with prod credentials. The local sandbox has no DB access. The structural fixes in this PR (§3.1, §3.2) make grading + UI **safe regardless** of which specific scenario was happening.
* Series context derivation depends on `src/data/nba/playoffContext.js` being able to read a multi-day window of ESPN finals (already fetched by `nbaPicksBuilder` for picks generation; reused here for scorecard enrichment). If `playoffContext` returns no series for a matchup (out-of-bracket exhibition, regular season), the row falls back to date-only context, never a misleading game number.
