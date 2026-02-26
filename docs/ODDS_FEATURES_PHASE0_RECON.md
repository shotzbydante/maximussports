# Phase 0: Recon & Plan — Odds Features (Championship, Consensus, Movement, Value)

**Repo:** shotzbydante/maximussports · **Branch:** main · **Scope:** Core app only, no /marketing, no new external services.

---

## 1. Where Bubble Watch Is Rendered

| Location | Component / Data | Notes |
|----------|------------------|--------|
| **Home** | `src/pages/Home.jsx` → `<section className={styles.bubbleWatchSection}>` → **`RankingsTable`** with `title="Bubble Watch - Full Rankings"` and **`rankings={top25}`** (from `fetchHomeFast` → `rankingsTop25`). | Single table; rows are from **TEAMS** (filtered/sorted), with optional `#rank` from `slugToRank`. **No odds/championship data today.** |
| **Teams page** | `src/pages/Teams.jsx` — Full "Bubble Watch" page: `<h1>Bubble Watch</h1>`, Top25Rankings, then **conference → tier → team list** (from `TEAMS`). Each row: TeamLogo, `team.name`, tier badge, link to `/teams/:slug`. | Renders `filteredTeams` from `TEAMS`; no API call for team list. **Good place for championship badge next to team name.** |
| **Odds Insights** | `src/pages/Insights.jsx` — Uses **`fetchHomeFast()`** only (no `/api/home/slow`). Renders "Bubble Watch — Full Rankings" via **`RankingsTable`** with rankings from fast (same as Home). Also ATS Leaderboard. | **Must not regress:** same endpoints, same data; no extra Odds API calls from Insights. |

**RankingsTable** (`src/components/insights/RankingsTable.jsx`):
- Props: `rankings` (for slugToRank / Top 25 badge), `title`.
- Renders **TEAMS** (all 74) filtered by conference/tier/sort; each row: Team logo, **team name** (Link), optional `#rank`, conference, tier badge.
- **Badge insertion point:** Next to team name in `<td className={styles.colTeam}>`, e.g. after `#{rank}` and before chevron — add championship odds badge here (and on Teams page team row).

---

## 2. Team Page Structure

| File | Purpose |
|------|--------|
| **`src/components/team/TeamPage.jsx`** | Entry: `useParams().slug` → `getTeamBySlug(slug)` from `teams.js`, **`fetchTeamPage(slug)`** (single batch). State: `batch`, `headlines`, `loading`, `error`. Sections in order: **header** (back link, logo, name, rank, conference, tier badge), **Maximus's Insight**, **ATS** (MaximusInsight atsOnly), **News**, **Schedule** (TeamSchedule). **No odds card / next game line today.** |
| **`src/api/team.js`** | **`fetchTeamPage(slug)`** → GET **`/api/team/:slug`** (no query). Returns: `team`, `schedule`, `oddsHistory`, `teamNews`, `rank`, `teamId`, `tier`. |
| **`api/team/[slug].js`** | Fetches: teamIds, rankings, team news, **schedule** (fetchScheduleSource), **oddsHistory** (fetchOddsHistorySource SEASON_START → today). No outrights, no “next game” odds. |

**Header** (`TeamPage.module.css` + header block): good place for championship badge (e.g. next to tier badge). “Odds” / “Next Game Line” will be a **new section** (or new card) so as not to change existing sections.

---

## 3. Existing Odds API Usage and Routes

- **No standalone `/api/odds` or `/api/odds-history` route.** All odds are fetched inside serverless via **`api/_sources.js`**:
  - **`fetchOddsSource(params)`** — `ODDS_BASE` = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds`; params: `regions=us`, `markets=spreads,totals,h2h`, `oddsFormat=american`, optional `commenceTimeFrom/To` for date. In-memory cache key `odds:${dateParam||'default'}` (10 min). Returns `{ games, hasOddsKey }`; each game: `gameId`, `homeTeam`, `awayTeam`, `commenceTime`, `spread`, `total`, `moneyline`, `sportsbook`. **Single book** (first with spread+total).
  - **`fetchOddsHistorySource(fromStr, toStr)`** — Historical NCAAB odds; chunked by 31 days; in-memory cache `odds-history-full:${from}:${to}` (20 min). Returns `{ games, hasOddsKey }`; games have `spread`, `sportsbook`. Used by ATS pipeline, team batch, team page.
- **Who calls these:**
  - **`/api/home/slow`** — `fetchOddsSource()`, `fetchOddsHistorySource()` (with timeouts). **Do not add new odds calls to /api/home/fast.**
  - **`/api/home/index.js`** (full home) — same sources.
  - **`api/team/[slug].js`** — only `fetchOddsHistorySource` (for ATS).
  - **`api/team/batch.js`** — `fetchOddsHistorySource` for ATS.
- **Odds Insights page** uses only **`fetchHomeFast()`** (scores, rankings, ATS, headlines). It does **not** call `/api/home/slow` or any odds-specific endpoint. So adding new odds endpoints (championship, consensus, movement, value) must **not** be called from Home or change what Insights fetches; they can be called from Teams page and Bubble Watch (e.g. one shared championship endpoint).

---

## 4. KV Helpers and Patterns

| Location | What | Pattern |
|----------|------|--------|
| **`api/_globalCache.js`** | **`getJson(key)`**, **`setJson(key, value, { exSeconds })`** — generic KV read/write. Default `exSeconds` = **MAX_TTL_SECONDS (60 min)**. **`getWithMeta(key)`** returns `{ value, ageSeconds, stale }`; **age/stale derived from `value.atsMeta?.generatedAt`** (ATS-specific). **FRESH_SECONDS = 5 min.** Exports: `FRESH_SECONDS`, `MAX_TTL_SECONDS`, `getAtsLeadersKeyForWindow`, etc. | For **odds** we will store payloads with a top-level **`updatedAt`** (or `oddsMeta.updatedAt`) and compute age in the endpoint (or a small helper) so we can do “fresh” checks and early-exit like ATS warm. No change to `getWithMeta` required if we use a custom age field in our payload. |
| **`api/ats/warm/index.js`** | Early exit: **`getWithMeta(kvKey)`** → if `value` exists and is “real” and **fresh** (`!stale`, `ageSeconds < FRESH_SECONDS`), return without recomputing. | Same pattern for championship odds: **KV key** → if fresh and valid, return; else fetch outrights and write KV. |
| **TTL conventions** | ATS: **FRESH 5 min**, **MAX 60 min**. | Championship: **30–120 min** (config constant). Consensus/next-game: **2–5 min**. Movement snapshots: **cap 48h or 200 points**, write TTL so key doesn’t live forever. |

**New keys (to add):**
- `odds:championship:v1` — championship winner odds by team (slug or canonical name).
- `odds:next:{teamIdOrSlug}:v1` — next game consensus + meta (Phase 2).
- `odds:move:{eventId}` — time-series of consensus spread/total (Phase 3).

---

## 5. Odds Normalization and Team Name Mapping

- **`src/api/odds.js`** (client):
  - **`normName(s)`** — lowercase, strip punctuation, university/college/state.
  - **`stripMascot(name)`** — drop last word(s) for looser match.
  - **`namesMatch(a,b)`** — norm + stripMascot + slug match via **`getTeamSlug`**.
  - **`matchOddsHistoryToEvent(ev, oddsGames, teamName)`**, **`matchOddsHistoryToGame(game, oddsGames)`** — date + home/away + namesMatch.
  - **`mergeGamesWithOdds(scoreGames, oddsGames, getSlug)`** — merges by date and team match.
- **`src/utils/teamSlug.js`**:
  - **`getTeamSlug(displayName)`** — TEAMS + **ALIASES** (e.g. uconn → UConn Huskies, nc state → NC State Wolfpack) → returns canonical `team.name` and we use `team.slug` for routes. **ALIASES** map normalized tokens to full team name; then slug from TEAMS.
- **`api/_sources.js`**:
  - **`extractOdds(bookmakers)`** — first book with spread+total; **`extractSpread(bookmakers)`** — first spread outcome (away point). No normalization of outcome names; Odds API returns raw team names.

**For championship outrights:** The Odds API outrights response will have **outcome names** (e.g. "Duke Blue Devils", "North Carolina Tar Heels"). We need to map those to our **slug** (or canonical name) using the same **TEAMS** list + **ALIASES** (or a server-side alias map that mirrors teamSlug). Never throw on unknown team; return **null** odds for that key.

---

## 6. Current KV Key Patterns and TTLs

| Key pattern | TTL | Used by |
|-------------|-----|--------|
| **`ats:leaders:last30:v1`** | MAX 60 min | ATS pipeline, warm |
| **`ats:leaders:last7:v1`** | MAX 60 min | ATS pipeline, warm |
| **`ats:leaders:season:v1`** | MAX 60 min | warmFull |
| **In-memory only** | 2–20 min | scores, rankings, odds, odds-history, schedule, news (all in _sources.js) |

No other KV keys found. **Vercel KV** is used only for ATS leaders; all odds currently in-memory in serverless.

---

## 7. Odds API Quota and Error Handling

- **_sources.js** does not read **x-requests-remaining** / **x-requests-used** today. We will add **server-side debug logging** of these headers for new odds calls (not exposed to client).
- **402/429** in history: currently throws; we will add **fallback to last KV** and set **oddsMeta.source = 'stale_cache'**, **stage = 'rate_limited'** or **'error'** for new endpoints.
- **Missing key:** existing pattern returns `{ games: [], error: 'missing_key', hasOddsKey: false }`; new endpoints will return **empty but with oddsMeta** indicating failure.

---

## 8. Plan of File Changes (Phased)

### Phase 1 — Championship odds badge
- **New:** `api/odds/championship.js` (or `api/odds/championship/index.js`) — GET, returns `{ [teamSlug]: { american, book, updatedAt, source, cacheAgeSec }, oddsMeta }`. Fetch outrights from `basketball_ncaab_championship_winner` (or correct sport key), `markets=outrights`, `regions=us`, `oddsFormat=american`. KV key `odds:championship:v1`, TTL 30–120 min. Early exit if KV fresh. Normalize outcome names → slug via TEAMS + server-side alias map.
- **New (optional):** `src/api/odds.js` (or new `championship.js`) — client `fetchChampionshipOdds()` → GET `/api/odds/championship`.
- **Edit:** `RankingsTable.jsx` — accept optional `championshipOdds` (map slug → { american, book }) and render "🏆 +XXX" or "🏆 —" next to team name.
- **Edit:** `Teams.jsx` — fetch championship odds (non-blocking), pass to list; or wrap team list in a small context/provider that provides championship odds by slug.
- **Edit:** `TeamPage.jsx` — fetch championship odds for current slug, show badge in header (or small Odds card). Skeleton/placeholder if loading.

### Phase 2 — Consensus spread/total next game
- **New:** `api/odds/next-game.js` or extend team route — GET `?slug=...` or path `/api/team/:slug/next-odds`. Returns `nextEvent`, `consensus`, `contributingBooks`, `oddsMeta`. Use **fetchOddsSource** (or a variant with multiple books), compute median spread/total over N books. KV `odds:next:{slug}:v1`, TTL 2–5 min.
- **Edit:** `TeamPage.jsx` — new “Next Game Line” card with consensus spread, total, last updated; only when next event exists.

### Phase 3 — Market movement (KV snapshots)
- **New:** KV key `odds:move:{eventId}` — append-only list `[{ t, consensusSpread, consensusTotal }]`, cap 48h or 200 points. Write from Team page (on demand) or from a **lightweight warm endpoint** (e.g. when Odds Insights loads — **not** from /api/home/fast). Min interval 5–10 min between writes; only if values changed.
- **Edit:** Team page “Next Game Line” or new “Line Movement” — show short text: “Spread moved from -2.5 to -3.5 (last 12h)” etc.

### Phase 4 — Value/outlier highlighting
- **Extend:** Next-game response (or same endpoint) to compute **consensus**, then **bestOutlier** (spread), **bestTotalOutlier** (total) — book with max absolute deviation. Return in payload.
- **Edit:** Team page “Next Game Line” — “Best vs consensus: DraftKings -2.5 (consensus -3.5)”. Hide if insufficient books.

---

## 9. Edge Cases to Handle

- **Championship:** Outcome name not in TEAMS/alias map → return null for that team; never throw. Missing API key or 429 → serve last KV if present, else empty + oddsMeta.
- **Consensus:** Fewer than 2 books → still return consensus (one book) or mark as insufficient; **contributingBooks** counts let UI hide outlier in Phase 4.
- **Movement:** Same eventId across different team views — one time series per event. Duplicate writes: guard by “last written value” and min interval.
- **Team name mapping:** Reuse **getTeamSlug** + ALIASES on server (import from src/utils/teamSlug.js or duplicate minimal alias map in api) for consistent slug output.

---

## 10. Manual Verification (High Level)

- **Phase 1:** Home loads; ATS unchanged; no new Home/Insights network calls. Bubble Watch (Home + Insights) and Teams page show championship badge; Team page header shows badge. Missing team → "—". Refresh → badge from cache when KV hit.
- **Phase 2:** Team page shows “Next Game Line” with consensus spread/total; no Home/fast change; Odds Insights unchanged.
- **Phase 3:** After viewing team (or warm), movement snapshot exists; Team page shows “Spread moved …” when data exists.
- **Phase 4:** “Best vs consensus” appears when multiple books; hides when insufficient.
- **KV:** Cold start → one compute; next request within TTL → fast KV hit (<200ms). 429/error → UI shows placeholder/Retry, no crash.

---

*Recon complete. Proceeding to Phase 1 implementation next.*
