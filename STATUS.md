# Maximus Sports — Project Status

**Last updated:** Feb 22, 2025

## Summary

March Madness Intelligence Hub — a college basketball web app with daily reports, game previews, upset alerts, team news (Google News RSS), live odds (The Odds API), and ESPN Bubble Watch team listings. Built with Vite + React, deployed on Vercel. Uses Air Force One color palette with Bloomberg-style data-dense UI.

---

## Architecture

### Frontend
- **Framework:** Vite 7 + React 19
- **Routing:** React Router v7
- **Styling:** Plain CSS + CSS modules (no UI libraries)
- **Fonts:** DM Sans, JetBrains Mono, Oswald

### Backend
- **Platform:** Vercel Serverless Functions
- **News API:** `/api/news/team/[slug].js` — fetches Google News RSS (per-team); `/api/news/aggregate.js` — aggregates Google + national feeds (Yahoo, CBS, NCAA) + team RSS
- **Scores API:** `/api/scores/index.js` — proxies ESPN college basketball scoreboard, returns simplified game list (gameId, teams, scores, status, startTime, network, venue)
- **Rankings API:** `/api/rankings/index.js` — proxies ESPN AP Top 25 rankings, returns `{ rankings: [{ teamName, rank, teamId }] }`
- **Schedule API:** `/api/schedule/[teamId].js` — ESPN team schedule (past + upcoming games)
- **Team IDs API:** `/api/teamIds/index.js` — ESPN teams list → `{ slugToId }` for schedule lookup
- **Odds API:** `/api/odds/index.js` — proxy The Odds API (NCAA basketball spreads, totals, moneyline); optional `ODDS_API_KEY`; 5-min cache
- **Odds History API:** `/api/odds-history/index.js` — proxy Odds API historical odds (spreads); accepts long ranges via 31-day chunking; per-chunk + full-result cache (7 min)

### Design System
- **Palette:** Metro Blue #3C79B4, Andrea #C9ECF5, Angora White #F6F6F6, Beige Dune #B7986C
- **UI:** Bloomberg-style — compact, monospace for dates/numbers, uppercase section labels

---

## Key Files

| Path | Purpose |
|------|---------|
| `src/App.jsx` | Router + layout routes |
| `src/main.jsx` | Entry, StrictMode |
| `src/index.css` | Global design tokens |
| `src/data/teams.js` | 74 ESPN Bubble Watch teams (conference, oddsTier, keywords) |
| `src/data/mockData.js` | Mock dashboard data (matchups, odds, news, stats) |
| `src/data/newsSources.js` | `NATIONAL_FEEDS` (Yahoo, CBS, NCAA), `TEAM_FEEDS` (team-specific RSS) |
| `src/api/news.js` | Client fetcher: `fetchTeamNews`, `fetchAggregatedNews`, `fetchAggregateNews` |
| `src/api/scores.js` | Client fetcher `fetchScores()`, `fetchScoresByDate(date)` |
| `src/api/rankings.js` | Client fetcher `fetchRankings()` for AP Top 25 |
| `src/utils/teamSlug.js` | Maps ESPN team names → teams.js slugs |
| `src/utils/pinnedTeams.js` | localStorage get/set for pinned team slugs |
| `src/utils/rankingsNormalize.js` | ESPN name normalization + `buildSlugToRankMap` |
| `src/utils/teamIdMap.js` | `buildSlugToIdFromRankings` — slug → ESPN team ID |
| `src/api/schedule.js` | Client fetcher `fetchTeamSchedule(teamId)` |
| `src/api/teamIds.js` | Client fetcher `fetchTeamIds()` for slug→id map |
| `src/api/odds.js` | Client: `fetchOdds()`, `fetchOddsHistory()`, `mergeGamesWithOdds()`, `matchOddsHistoryToEvent()` |
| `src/utils/ats.js` | ATS helpers: `computeATS()`, `computeATSForEvent()`, `getOurSpread()`, `aggregateATS()` |
| `src/utils/dateChunks.js` | `SEASON_START` (2025-11-01), `chunkDateRange(from, to, maxDays=31)` |
| `src/utils/dates.js` | Schedule date helpers (now → Selection Sunday) |
| `src/data/keyDates.js` | Conference finals + NCAA key dates (PST) |
| `api/news/team/[slug].js` | Serverless: Google News RSS; MBB filter → JSON (per-team) |
| `api/news/filters.js` | Men's basketball allowlist + exclude filter (`isMensBasketball`) |
| `api/news/aggregate.js` | Serverless: Google + national + team feeds; MBB filter; source-priority sort → `{ items }` |
| `api/scores/index.js` | Serverless: ESPN scoreboard proxy → simplified JSON |
| `api/rankings/index.js` | Serverless: ESPN AP Top 25 → `{ rankings }` (incl. teamId) |
| `api/schedule/[teamId].js` | Serverless: ESPN team schedule → `{ events }` |
| `api/teamIds/index.js` | Serverless: ESPN teams → `{ slugToId }` |
| `api/odds/index.js` | Serverless: The Odds API proxy → `{ games }` (gameId, spread, total, moneyline) |
| `api/odds-history/index.js` | Serverless: Odds API historical → `{ games }` (gameId, homeTeam, awayTeam, spread, sportsbook) |
| `scripts/fetch-logos.js` | Fetch ESPN logos → `public/logos/*.png` or generate fallback SVGs |
| `vercel.json` | Build config, SPA rewrites |

### Pages
- `Home` — Pinned Teams Dashboard: pinned teams, **Top 25 Rankings** (full AP Top 25, clickable to team page), Dynamic Alerts, Dynamic Stats, hero, Live Scores, matchups, sidebar
- `Teams` — Bubble Watch list by conference + odds tier
- `TeamPage` — **Maximus's Insight** (ATS), team header, **News** (Last 7 days default; collapsible Previous 90 days; source legend), **Full Schedule** (past: spread + ATS; upcoming: odds)
- `Games` — Key Dates (top), Daily Schedule (collapsible), Live scores (60s auto-refresh) + key matchups (spreads, O/U, upset watch)
- `Insights` — Daily report, rankings snapshot, filterable Bubble Watch table
- `Alerts` — Upset alerts + odds movement

### Components
- **Layout:** `TopNav`, `Sidebar`, `Layout`
- **Shared:** `StatCard`, `TrendArrow`, `TeamLogo`
- **Dashboard:** `MatchupPreview`, `OddsMovementWidget`, `NewsFeed`, `TeamNewsPreview`
- **Scores:** `LiveScores`, `MatchupRow` (team links, PST, network, source badge)
- **Shared:** `SourceBadge` (ESPN | Google News | Yahoo Sports | CBS Sports | NCAA.com | Mock | Odds API | team feeds)
- **Home:** `PinnedTeamsSection`, `Top25Rankings` (collapsible; desktop expanded, mobile collapsed), `DynamicAlerts` (closing spread, ESPN + Odds API badges), `DynamicStats`
- **Games:** `KeyDatesWidget`, `DailySchedule` (collapsible; zebra striping; mobile-responsive)
- **Team:** `TeamSchedule` (past: spread + ATS badge W/L/P; upcoming: spread + O/U), `MaximusInsight` (real ATS: season/30d/7d)
- **Insights:** `RankingsTable` (conference + tier filters)

---

## APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/news/team/:slug` | GET | Top 10 Google News headlines for team (90-day query) |
| `/api/news/aggregate` | GET | Aggregated news. Params: `teamSlug`, `includeNational`, `includeTeamFeeds` |
| `/api/scores` | GET | College basketball scoreboard. Optional `?date=YYYYMMDD` for specific date |
| `/api/rankings` | GET | ESPN AP Top 25 rankings (teamName, rank, teamId) |
| `/api/schedule/:teamId` | GET | ESPN team schedule (past + upcoming) |
| `/api/teamIds` | GET | slug → ESPN team ID map |
| `/api/odds` | GET | NCAA basketball odds. Params: `date`, `team`. Returns spreads, totals, moneyline. Requires `ODDS_API_KEY` |
| `/api/odds-history` | GET | Historical odds (paid plan). Params: `from`, `to` (YYYY-MM-DD). Chunks long ranges into 31-day windows; merges and dedupes. Requires `ODDS_API_KEY` |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (localhost:5173) |
| `npm run build` | Production build → `dist/` |
| `npm run fetch-logos` | Fetch ESPN logos, save to `public/logos/` |
| `npm run fetch-logos -- --fallbacks-only` | Generate monogram SVGs only (offline) |
| `npm run fetch-logos -- --force` | Replace existing logos |
| `npx vercel dev` | Local Vercel (frontend + API routes) |

---

## Deployment

- **Platform:** Vercel
- **Source:** GitHub (shotzbydante/maximussports)
- **Build:** `npm run build`
- **Output:** `dist/`
- **Env vars:** `ODDS_API_KEY` (optional) for live odds; app works without it (odds sections degrade gracefully)
- **SPA:** Rewrites non-API routes to `/index.html`

---

## Data

- **Teams:** 74 teams across Big Ten, SEC, ACC, Big 12, Big East, Others
- **Odds tiers:** Lock, Should be in, Work to do, Long shot
- **Logos:** 73 PNGs in `public/logos/` (fetched from ESPN CDN)
- **TeamLogo:** Tries `/logos/<slug>.svg` → `/logos/<slug>.png` → inline monogram

---

## Latest Changes (Feb 22, 2025)

**Team ID Overrides + News API Local Testing:**
- **Manual Team ID overrides** — `api/teamIds/index.js`: `TEAM_ID_OVERRIDES` map (washington-huskies 264, uconn-huskies 41, ucla-bruins 26, usc-trojans 30); used first before ESPN list; ensures Washington Huskies and others resolve when ESPN matching fails
- **Missing slugs debugging** — Response includes `missingSlugs` when any teams.js team lacks an ID; logged to console for debugging
- **News API local testing** — README: run `vercel login` before `vercel dev`; note that `/api/news/aggregate` works in local dev with vercel dev

**Team ID, ATS, News Robustness (Washington Huskies, Purdue, etc.):**
- **Team ID resolution** — `/api/teamIds`: Try multiple ESPN name variants (displayName, location+name, shortDisplayName); log unmatched teams to console; added aliases in `teamSlug.js` for Washington, UCLA, USC, Purdue, Duke, etc.
- **ATS/odds matching** — `matchOddsHistoryToEvent`: Use `getTeamSlug` for canonical team matching when string match fails; improves Odds API ↔ ESPN name alignment
- **News gaps** — `api/news/filters.js`: Added `isMensBasketballLoose`; when MBB filter yields no items, apply looser filter (college basketball, NCAA, bracket, etc.) so Google News + national feeds still populate
- **UI fallbacks** — TeamSchedule: clearer message when team ID unresolved; MaximusInsight: debug log + fallback hint; empty panels show explicit messages

---

**UI Cleanup + Readability + News Filtering:**
- **Top 25 Rankings** — Collapsible with chevron; default expanded on desktop (≥768px), collapsed on mobile
- **Upsets & Alerts** — Closing spread per alert (from Odds API history); "—" if unavailable; SourceBadge ESPN + Odds API
- **Games / Daily Schedule** — Increased spacing, line-height; wider columns (opponent, time, status); zebra striping; mobile: hide time/network, 3-column compact layout
- **Team Page News** — Last 7 days shown by default; collapsible "Previous 90 days"; single source (aggregate: Google + national + team feeds)
- **Men's basketball filtering** — `api/news/filters.js`: allowlist (men's basketball, MBB, college basketball, etc.) + exclude (women, WBB, softball, football, baseball, etc.); applied in aggregate and team news APIs
- **Source ranking** — Aggregate news sorted by priority: ESPN > NCAA.com > CBS Sports > Yahoo Sports > Team feeds > Google News, then recency
- **Source badge legend** — "Sources: ESPN, NCAA, CBS, Yahoo, Team Feeds, Google News" near News sections (NewsFeed, TeamPage)
- **Empty state** — "No men's basketball news in the last 7 days" when filtering removes all items

**ATS + Spread Chunking Fix:**
- **`src/utils/dateChunks.js`** — `SEASON_START = "2025-11-01"`; `chunkDateRange(from, to, maxDays=31)` for 31-day windows
- **`/api/odds-history`** — Accepts long date ranges; splits into 31-day chunks; fetches each chunk; caches per chunk (7 min); merges and dedupes by gameId+commenceTime; returns single merged games list
- **MaximusInsight** — Uses `SEASON_START`; requests season-to-date odds (SEASON_START → today) via chunked API; last 30d and last 7d ATS
- **`matchOddsHistoryToEvent()`** — Improved matching: normalized team names, same game date, home/away alignment; prefers exact home/away match
- **TeamSchedule** — Spread + ATS badge on past games when odds available (unchanged, now populated by chunked history)

**Full ATS Analytics (Odds API paid plan):**
- **`/api/odds-history`** — Proxy Odds API historical odds; `?from=YYYY-MM-DD&to=YYYY-MM-DD`; markets=spreads; 7‑min cache; max 31 days per request
- **`src/utils/ats.js`** — `computeATS(teamScore, oppScore, teamSpread)` → W/L/P; `getOurSpread()`; `computeATSForEvent()`; `aggregateATS()` → W‑L‑P + cover %
- **MaximusInsight** — Real ATS data: Season to date, Last 30 days, Last 7 days (W‑L‑P + cover %); fetches schedule + odds history; graceful fallback on error
- **TeamSchedule** — Past games: closing spread + ATS badge (W/L/P) next to score; `fetchOddsHistory()` for date range
- **SourceBadge** Odds API on ATS outputs; Bloomberg style + Air Force One palette; missing odds show "—"

**Odds API Integration:**
- **`/api/odds`** — Vercel serverless proxy for The Odds API (basketball_ncaab); regions=us, markets=spreads,totals,h2h; 5-min in-memory cache; `ODDS_API_KEY` required
- **`src/api/odds.js`** — `fetchOdds(params)`, `mergeGamesWithOdds(scores, odds, getSlug)` for merging ESPN scores with odds
- **LiveScores** — spread + O/U column when odds available; SourceBadge Odds API
- **Games & Home** — fetch odds with scores, merge by team names + date; display spread/total in Live Scores
- **TeamPage** — **Maximus's Insight** bubble (ATS: unavailable on free tier — SourceBadge Odds API); **Full Schedule** shows spread/O/U for upcoming games
- **SourceBadge** — added "Odds API" style
- **README** — Odds API setup; **.env.example** — `ODDS_API_KEY`

**Home → Pinned Teams Dashboard:**
- **Pinned Teams** — Multi-select list + search "Add team", localStorage; cards with team name/logo, tier badge, ESPN rank (if Top 25), next game (from ESPN scores), latest 3 headlines (Google News), link to Team page
- **Dynamic Alerts** — Upsets & Alerts: ESPN scores + odds tiers; Lock loses to Long shot, tier gap ≥ 2; 60s refresh; SourceBadge ESPN
- **Dynamic Stats** — Replaced mock stat cards: Upset alerts today, Ranked teams in action (Top 25 playing), News velocity (pinned teams headlines); SourceBadge per card
- **Key Dates + Daily Schedule moved** — Now on Games page (top), compact Bloomberg layout

**ESPN Rankings Integration:**
- **`/api/rankings`** — Serverless route proxying ESPN AP Top 25; returns `{ rankings: [{ teamName, rank }] }`
- **`src/utils/rankingsNormalize.js`** — Name normalization (lowercase, remove punctuation/university/college/the, alias map: uconn→connecticut, miami fl→miami, nc state→north carolina state, etc.)
- **Rank display** — Pinned team cards show #rank if in Top 25; MatchupRow/DailySchedule show #rank next to team name

**Helpers:**
- **`src/utils/pinnedTeams.js`** — `getPinnedTeams`, `setPinnedTeams`, `addPinnedTeam`, `removePinnedTeam`, `togglePinnedTeam`

**Top 25 Rankings (Home):**
- **`Top25Rankings`** — Full AP Top 25 list from ESPN; rank, team name (link to /teams/:slug or /teams), conference, tier badge; SourceBadge ESPN
- Rankings API now returns `teamId` per ranking

**News MVP stack:**
- **`src/data/newsSources.js`** — `NATIONAL_FEEDS` (Yahoo Sports, CBS Sports, NCAA.com), `TEAM_FEEDS` (per-slug RSS: MGoBlog, Hammer & Rails, etc.)
- **`/api/news/aggregate`** — Query params: `teamSlug`, `includeNational`, `includeTeamFeeds`; de-dupes by link, sorts by pubDate desc; handles feed failures gracefully
- **Home NewsFeed** — Uses aggregate with `includeNational=true` (Yahoo, CBS, NCAA); per-item source badges
- **TeamPage** — "All Sources" toggle: default Google News only; toggle = Google + national + team feeds; SourceBadge per item
- **SourceBadge** — Extended for Yahoo Sports, CBS Sports, NCAA.com, team feed names; "Source unavailable" when feed fails

**Team Page Full Schedule:**
- **`/api/schedule/[teamId]`** — ESPN team schedule endpoint; past games (final scores), upcoming (date/time PST); opponent, result, home/away, status
- **`/api/teamIds`** — ESPN teams list → slug→id map (via getTeamSlug matching)
- **`TeamSchedule`** — Fetches rankings + teamIds to resolve slug→id, then schedule; "Schedule unavailable" if no match

**Team Schedule score fix:**
- Fixed `[object Object]` in result column — ESPN competitors sometimes return `score` as object; added `toScore()` in schedule API to extract displayValue/primitive

---

## Previous Changes (Feb 21, 2025)

**Tournament-tracking hub:**
- **Key Dates** — Top of Home, conference finals + NCAA dates, times in PST
- **Daily Schedule** — Collapsible panels per date (now → Selection Sunday), ESPN data, "No scheduled games yet" when empty
- **MatchupRow** — Team links via `getTeamSlug`, time (PST), network, SourceBadge per game
- **SourceBadge** — ESPN / Google News / Mock on every score/news widget
- **teamSlug.js** — Maps ESPN names to slugs (exact, normalized, alias map)
- **fetchScoresByDate(date)** — API supports `?date=YYYYMMDD`
- **60s auto-refresh** — Home Live Scores + Daily Schedule today panel

**Live scores (ESPN):**
- Added `/api/scores` serverless route proxying ESPN college basketball scoreboard
- Added `src/api/scores.js` and `LiveScores` component (Bloomberg-style table)
- Home: Live Scores section (compact) after hero
- Games: Live Scores (full list) with 60s auto-refresh
- Error fallback: "Live scores temporarily unavailable"

---

## Previous Changes (MVP — Feb 21, 2025)

1. **Games page** — Replaced placeholder with key matchups list using `topMatchups` from mockData.
2. **Insights page** — Added daily report block, rankings snapshot (AP Top 5, bracket favorites, biggest movers), and filterable Bubble Watch table (conference + tier).
3. **Alerts page** — Added upset alerts (from matchups with `upsetAlert`) and odds movement widget.
4. **RankingsTable** — New component with conference and tier filters, links to team pages.
5. **Home semi-live data** — `TeamNewsPreview` and `NewsFeed` now use `fetchAggregatedNews` for real headline counts and aggregated headlines across Duke, Houston, Purdue, Kansas. Falls back to mock on error.
6. **NewsFeed** — Added link support for API-sourced headlines, empty state handling.
7. **Visual hierarchy** — Unified section titles, tighter spacing on Home, Games, Insights, Alerts.

---

## Current TODOs

1. **v1 — Search** — Add teams + news search
2. **v1 — News caching** — Cache news API responses (Vercel KV or in-memory TTL)
3. **v1 — Analytics** — Add Vercel Analytics
4. **v1 — Team detail widgets** — Record, rank, odds tier on TeamPage
5. ~~**v2 — Odds integration**~~ — Done (The Odds API proxy, Live Scores, TeamPage)
6. **v2 — Bracket simulations** — Monte Carlo or scenario-based outcomes
7. **v2 — Newsletter / export** — PDF or email report export
8. **Tests** — Unit/integration tests
9. **PWA** — Optional service worker for offline

### Proposed next (Feb 22 session)
- **Search** — Teams filter by name/conference; news keyword filter on TeamPage
- **Team detail widgets** — Record, rank on TeamPage (mock until real API)
- **News caching** — TTL cache in news API (in-memory or Vercel KV)
- **Vercel Analytics** — Add `@vercel/analytics`
- **Date picker** — Games/Daily Schedule date selector (API supports `?date=YYYYMMDD`)
