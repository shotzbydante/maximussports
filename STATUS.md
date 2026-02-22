# Maximus Sports — Project Status

**Last updated:** Feb 21, 2025

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
| `src/utils/teamSlug.js` | Maps ESPN team names → teams.js slugs |
| `src/utils/dates.js` | Schedule date helpers (now → Selection Sunday) |
| `src/data/keyDates.js` | Conference finals + NCAA key dates (PST) |
| `api/news/team/[slug].js` | Serverless: Google News RSS → JSON |
| `api/scores/index.js` | Serverless: ESPN scoreboard proxy → simplified JSON |
| `scripts/fetch-logos.js` | Fetch ESPN logos → `public/logos/*.png` or generate fallback SVGs |
| `vercel.json` | Build config, SPA rewrites |

### Pages
- `Home` — Tournament hub: Key Dates, Daily Schedule (collapsible), hero, Live Scores (60s refresh), stats, matchups, sidebar with source badges
- `Teams` — Bubble Watch list by conference + odds tier
- `TeamPage` — Team header + last 90 days headlines
- `Games` — Live scores (60s auto-refresh) + key matchups (spreads, O/U, upset watch)
- `Insights` — Daily report, rankings snapshot, filterable Bubble Watch table
- `Alerts` — Upset alerts + odds movement

### Components
- **Layout:** `TopNav`, `Sidebar`, `Layout`
- **Shared:** `StatCard`, `TrendArrow`, `TeamLogo`
- **Dashboard:** `MatchupPreview`, `OddsMovementWidget`, `NewsFeed`, `TeamNewsPreview`
- **Scores:** `LiveScores`, `MatchupRow` (team links, PST, network, source badge)
- **Shared:** `SourceBadge` (ESPN | Google News | Mock)
- **Home:** `KeyDatesWidget`, `DailySchedule` (collapsible panels per date)
- **Insights:** `RankingsTable` (conference + tier filters)

---

## APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/news/team/:slug` | GET | Top 10 Google News headlines for team (90-day query, sorted by pubDate) |
| `/api/scores` | GET | College basketball scoreboard. Optional `?date=YYYYMMDD` for specific date |

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

## Latest Changes (Feb 21, 2025)

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
