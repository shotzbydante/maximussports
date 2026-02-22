# Maximus Sports — Project Status

**Last updated:** Feb 22, 2025

## Summary

March Madness Intelligence Hub — a college basketball web app with daily reports, game previews, upset alerts, team news (Google News RSS), and ESPN Bubble Watch team listings. Built with Vite + React, deployed on Vercel. Uses Air Force One color palette with Bloomberg-style data-dense UI.

---

## Architecture

### Frontend
- **Framework:** Vite 7 + React 19
- **Routing:** React Router v7
- **Styling:** Plain CSS + CSS modules (no UI libraries)
- **Fonts:** DM Sans, JetBrains Mono, Oswald

### Backend
- **Platform:** Vercel Serverless Functions
- **News API:** `/api/news/team/[slug].js` — fetches Google News RSS, parses with `fast-xml-parser`, returns top 10 headlines (90-day lookback)
- **Scores API:** `/api/scores/index.js` — proxies ESPN college basketball scoreboard, returns simplified game list (gameId, teams, scores, status, startTime, network, venue)
- **Rankings API:** `/api/rankings/index.js` — proxies ESPN AP Top 25 rankings, returns `{ rankings: [{ teamName, rank, teamId }] }`
- **Schedule API:** `/api/schedule/[teamId].js` — ESPN team schedule (past + upcoming games)
- **Team IDs API:** `/api/teamIds/index.js` — ESPN teams list → `{ slugToId }` for schedule lookup
- **No env vars required** — Google News RSS and ESPN endpoints are free, no API key

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
| `src/api/news.js` | Client fetcher + `fetchAggregatedNews` for multi-team news |
| `src/api/scores.js` | Client fetcher `fetchScores()`, `fetchScoresByDate(date)` |
| `src/api/rankings.js` | Client fetcher `fetchRankings()` for AP Top 25 |
| `src/utils/teamSlug.js` | Maps ESPN team names → teams.js slugs |
| `src/utils/pinnedTeams.js` | localStorage get/set for pinned team slugs |
| `src/utils/rankingsNormalize.js` | ESPN name normalization + `buildSlugToRankMap` |
| `src/utils/teamIdMap.js` | `buildSlugToIdFromRankings` — slug → ESPN team ID |
| `src/api/schedule.js` | Client fetcher `fetchTeamSchedule(teamId)` |
| `src/api/teamIds.js` | Client fetcher `fetchTeamIds()` for slug→id map |
| `src/utils/dates.js` | Schedule date helpers (now → Selection Sunday) |
| `src/data/keyDates.js` | Conference finals + NCAA key dates (PST) |
| `api/news/team/[slug].js` | Serverless: Google News RSS → JSON |
| `api/scores/index.js` | Serverless: ESPN scoreboard proxy → simplified JSON |
| `api/rankings/index.js` | Serverless: ESPN AP Top 25 → `{ rankings }` (incl. teamId) |
| `api/schedule/[teamId].js` | Serverless: ESPN team schedule → `{ events }` |
| `api/teamIds/index.js` | Serverless: ESPN teams → `{ slugToId }` |
| `scripts/fetch-logos.js` | Fetch ESPN logos → `public/logos/*.png` or generate fallback SVGs |
| `vercel.json` | Build config, SPA rewrites |

### Pages
- `Home` — Pinned Teams Dashboard: pinned teams, **Top 25 Rankings** (full AP Top 25, clickable to team page), Dynamic Alerts, Dynamic Stats, hero, Live Scores, matchups, sidebar
- `Teams` — Bubble Watch list by conference + odds tier
- `TeamPage` — Team header + last 90 days headlines + **Full Schedule** (past + upcoming, ESPN, SourceBadge)
- `Games` — Key Dates (top), Daily Schedule (collapsible), Live scores (60s auto-refresh) + key matchups (spreads, O/U, upset watch)
- `Insights` — Daily report, rankings snapshot, filterable Bubble Watch table
- `Alerts` — Upset alerts + odds movement

### Components
- **Layout:** `TopNav`, `Sidebar`, `Layout`
- **Shared:** `StatCard`, `TrendArrow`, `TeamLogo`
- **Dashboard:** `MatchupPreview`, `OddsMovementWidget`, `NewsFeed`, `TeamNewsPreview`
- **Scores:** `LiveScores`, `MatchupRow` (team links, PST, network, source badge)
- **Shared:** `SourceBadge` (ESPN | Google News | Mock)
- **Home:** `PinnedTeamsSection`, `Top25Rankings` (full AP Top 25, links to team pages), `DynamicAlerts`, `DynamicStats`
- **Games:** `KeyDatesWidget`, `DailySchedule` (collapsible panels per date)
- **Team:** `TeamSchedule` (Full Schedule — past + upcoming, ESPN)
- **Insights:** `RankingsTable` (conference + tier filters)

---

## APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/news/team/:slug` | GET | Top 10 Google News headlines for team (90-day query, sorted by pubDate) |
| `/api/scores` | GET | College basketball scoreboard. Optional `?date=YYYYMMDD` for specific date |
| `/api/rankings` | GET | ESPN AP Top 25 rankings (teamName, rank, teamId) |
| `/api/schedule/:teamId` | GET | ESPN team schedule (past + upcoming) |
| `/api/teamIds` | GET | slug → ESPN team ID map |

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
- **Env vars:** None required
- **SPA:** Rewrites non-API routes to `/index.html`

---

## Data

- **Teams:** 74 teams across Big Ten, SEC, ACC, Big 12, Big East, Others
- **Odds tiers:** Lock, Should be in, Work to do, Long shot
- **Logos:** 73 PNGs in `public/logos/` (fetched from ESPN CDN)
- **TeamLogo:** Tries `/logos/<slug>.svg` → `/logos/<slug>.png` → inline monogram

---

## Latest Changes (Feb 22, 2025)

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

**Team Page Full Schedule:**
- **`/api/schedule/[teamId]`** — ESPN team schedule endpoint; past games (final scores), upcoming (date/time PST); opponent, result, home/away, status
- **`/api/teamIds`** — ESPN teams list → slug→id map (via getTeamSlug matching)
- **`TeamSchedule`** — Fetches rankings + teamIds to resolve slug→id, then schedule; "Schedule unavailable" if no match

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
5. **v2 — Odds integration** — Live odds API
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
