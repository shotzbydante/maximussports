# Maximus Sports — Project Status

**Last updated:** Feb 23, 2026

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
- **Cache utility:** `api/_cache.js` — `createCache(ttlMs)` and `coalesce(key, fetcher)` for in-memory TTL cache and in-flight request coalescing across serverless functions.
- **Scores API:** `/api/scores/index.js` — ESPN scoreboard proxy; cache 3 min (createCache); CDN `s-maxage=60, stale-while-revalidate=120`.
- **Rankings API:** `/api/rankings/index.js` — ESPN AP Top 25; cache 5 min; CDN `s-maxage=120, stale-while-revalidate=300`.
- **Schedule API:** `/api/schedule/[teamId].js` — ESPN team schedule (past + upcoming games)
- **Team IDs API:** `/api/teamIds/index.js` — ESPN teams list → `{ slugToId }` for schedule lookup
- **Odds API:** `/api/odds/index.js` — The Odds API proxy; cache 10 min; CDN `s-maxage=300, stale-while-revalidate=600`.
- **Odds History API:** `/api/odds-history/index.js` — Odds API historical; cache 20 min; CDN `s-maxage=600, stale-while-revalidate=900`.
- **News Aggregate API:** `/api/news/aggregate.js` — full-response cache 20 min; CDN `s-maxage=600, stale-while-revalidate=900`.
- **Summary API:** `/api/summary/index.js` — POST only; payload hash cache 30 min; rate limit 1/min per IP; SSE streaming; no internal API calls.
- **Team Summary API:** `/api/summary/team.js` — POST `{ slug, headlines }`; cache ~30 min per slug; CDN `s-maxage=900, stale-while-revalidate=1800`.
- **Home batch API:** `/api/home/index.js` — GET; returns scores + odds + rankings + headlines + dataStatus in one round trip; CDN cache 60s.
- **Team batch API:** `/api/team/[slug].js` — GET; returns schedule + odds history + team news + rank (+ teamId); CDN cache 120s.

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
| `api/summary/index.js` | Serverless: POST summary with payload; hash cache; rate limit; no internal API calls |
| `api/summary/team.js` | Serverless: POST team summary from headlines only; 30-min cache per slug |
| `src/api/summary.js` | Client: `fetchSummaryStream(payload, { force, onMessage })`, `fetchTeamSummary({ slug, headlines })` |
| `src/api/home.js` | Client: `fetchHome()` — batch scores/odds/rankings/headlines; request coalescing |
| `src/api/team.js` | Client: `fetchTeamPage(slug)` — batch schedule/oddsHistory/teamNews/rank; request coalescing |
| `api/_cache.js` | Shared: `createCache(ttlMs)`, `coalesce(key, fetcher)` for serverless |
| `api/home/index.js` | Batch: scores + odds + rankings + headlines + dataStatus |
| `api/team/[slug].js` | Batch: schedule + odds history + team news + rank |
| `scripts/fetch-logos.js` | Fetch ESPN logos → `public/logos/*.png` or generate fallback SVGs |
| `vercel.json` | Build config, SPA rewrites |

### Pages
- `Home` — **Dynamic welcome synopsis** (OpenAI) in banner (or static fallback); Pinned Teams, ATS Leaderboard, Top 25 Rankings, Dynamic Alerts, Dynamic Stats, Live Scores, sidebar
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
| `/api/summary` | POST | Home synopsis (OpenAI). Body: `{ top25, atsLeaders: { best, worst }, recentGames, upcomingGames, headlines }`. Query: `?stream=true` (required), `?force=true` bypass cache. Response: SSE stream. Cache by payload hash (30 min). Rate limit 1/min per IP. |
| `/api/summary/team` | POST | Pinned team card summary. Body: `{ slug, headlines }`. Returns `{ summary }` or message if no headlines. Cache ~30 min per slug. |
| `/api/home` | GET | Batch: scores, odds, rankings, headlines, dataStatus. One round trip for Home. CDN 60s. |
| `/api/team/:slug` | GET | Batch: schedule, oddsHistory, teamNews, rank, teamId. One round trip for Team page. CDN 120s. |
| `/api/teamIds` | GET | slug → ESPN team ID map. `?debug=true` → also `missingSlugs`, `missingCount` |
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

## Latest Changes (Feb 23, 2026)

**Performance overhaul (cache, batch APIs, defer, skeletons):**
- **Server-side caching** — `api/_cache.js`: `createCache(ttlMs)` and `coalesce(key, fetcher)` for in-flight request coalescing. All critical APIs use it: scores (3 min), rankings (5 min), odds (10 min), odds-history (20 min), news/aggregate (20 min full-response), summary (30 min hash), summary/team (30 min per slug). Cached payload returned when valid.
- **CDN Cache-Control** — `s-maxage` + `stale-while-revalidate` on responses: scores 60/120, odds 300/600, odds-history 600/900, news/aggregate 600/900, summary/team 900/1800, home 60/120, team 120/300.
- **Batch endpoints** — `/api/home` (GET): scores + odds + rankings + headlines + dataStatus in one call. `/api/team/[slug]` (GET): schedule + odds history + team news + rank + teamId. Client uses `fetchHome()` and `fetchTeamPage(slug)` with request coalescing (identical in-flight requests share one promise).
- **Home page** — Single `fetchHome()` on load; merge scores+odds client-side; summary still loads immediately (payload built from batch result, then stream). Pinned team news deferred via `requestIdleCallback` (or `setTimeout(0)`). Skeleton loaders for summary (shimmer lines while “Generating summary…”).
- **Team page** — Single `fetchTeamPage(slug)`; passes `initialData` (schedule, oddsHistory, teamId) to `MaximusInsight` and `TeamSchedule` so they skip duplicate fetches. Rank from batch shown in header. News from batch.
- **Defer non-critical** — Home: ATS + summary + Top 25 from batch first; news and pinned team summaries load after render (idle/timeout). Team: ATS + schedule from batch first; news from same batch.
- **Measurements** — `console.time` / `console.timeEnd` around key API calls in development (scores, odds, odds-history, rankings, news/aggregate, home batch, team batch, client fetchHome/fetchTeamPage).

---

**Previous: Summary simplified to use Home-loaded data only; pinned team GPT summaries:**
- **Summary API (POST only)** — No internal calls to `/api/scores`, `/api/rankings`, `/api/odds`, `/api/news`. Accepts POST body: `{ top25, atsLeaders: { best, worst }, recentGames, upcomingGames, headlines }` as sole source of truth. Recap built from these arrays; empty arrays → “unavailable” in prompt.
- **Home payload** — Client builds `summaryPayload` from existing state: Top 25 from rankings fetch, ATS best/worst from `ATSLeaderboard` via `onDataLoaded`, recent/upcoming games from `scores.games` (final vs non-final), headlines from `newsData.newsFeed`. Sends POST to `/api/summary?stream=true`; SSE streaming unchanged.
- **Cache** — 30-minute cache keyed by payload hash (`crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')`). Same payload returns cached summary immediately.
- **Rate limit** — Max 1 refresh per 60 seconds per client (IP). If exceeded: return cached summary with message “Please wait a minute before refreshing again.” or error if no cache for current payload.
- **Data availability badges** — Use payload counts (not API counts) for “Show data status” badges (ESPN/Odds/News OK / PARTIAL / MISSING).
- **Pinned team ChatGPT summary** — Each pinned team card shows a short GPT summary (1–2 sentences) from that card’s headlines only. `POST /api/summary/team` with `{ slug, headlines }`; no external APIs; cache ~30 min per team slug. Non-streaming. “Summary unavailable” if card has no headlines.
- **ATSLeaderboard** — New prop `onDataLoaded({ best, worst })` so Home can include ATS leaderboard data in the summary payload.

---

**Previous (Feb 23): Summary data availability fix (ESPN / Odds / News):**
- **Counts before prompt** — `/api/summary` now computes and uses `scoresCount`, `rankingsCount`, `oddsCount`, `oddsHistoryCount`, `headlinesCount`. A source is marked “unavailable” only when its count = 0.
- **ESPN** — Uses `/api/scores` for today + yesterday and `/api/rankings` (Top 25). If `scoresCount > 0`, summary never says ESPN is missing.
- **Odds** — Uses `/api/odds` and `/api/odds-history` (yesterday→today); spreads merged into scores. Odds marked missing only when both `oddsCount` and `oddsHistoryCount` are 0.
- **News** — Uses `/api/news/aggregate?includeNational=true` (Google + Yahoo at minimum). If `headlinesCount > 0`, summary never says news is missing.
- **Debug mode** — `GET /api/summary?debug=true` returns JSON: `{ scoresCount, rankingsCount, oddsCount, oddsHistoryCount, headlinesCount, sampleScore, sampleHeadline, dataStatusLine }` for verification (no stream, no OpenAI call).
- **DATA STATUS in prompt** — A “DATA STATUS — ESPN: OK (X scores, Y ranked). Odds: OK (…). News: OK (…).” line is injected into the summary prompt and returned in debug; any source with 0 count is marked MISSING.
- **Prompt text** — Summary prompt is built from real data arrays; model instructed to only say a source is unavailable when DATA STATUS marks it MISSING, and to reference actual games and headlines when present.
- **Stream dataStatus** — First SSE event from `/api/summary?stream=true` includes `dataStatus` (counts + dataStatusLine) so the client can show badges without a second request.
- **Home: “Show data status” toggle** — Small toggle (default OFF) on the Home page. When ON, a compact badge row appears under the summary: “ESPN OK / Odds OK / News OK” (or PARTIAL / MISSING). Badges are color-coded: green = OK, amber = PARTIAL (&lt;3 items), red = MISSING (0). When toggle is ON and status not yet loaded, client calls `?debug=true` to fetch counts.
- **Client** — `fetchSummaryDebug()` in `src/api/summary.js` for debug payload; Home captures `dataStatus` from stream or debug and renders badge row when toggle is on.

---

## Previous Changes (Feb 22, 2026)

**Dynamic Home synopsis (OpenAI) — streaming, sources, welcome persistence:**
- **Welcome persistence** — Bold welcome message stays visible **at all times**; only hidden after the user **explicitly clicks Refresh** (then recap-only view).
- **Streaming throttle** — Client buffers incoming SSE chunks and flushes to UI every **80ms** so text appears more slowly and is easier to read in real time.
- **Data sources (explicit)** — **ESPN:** schedules, scores, Top 25 rankings. **Odds API:** spreads and ATS performance (historical odds for last 24h). **Google + Yahoo:** news from aggregate tied to those teams. Prompt requires naming these sources; if any dataset is missing, the summary must say that data was unavailable.
- **Content requirements** — Recap must include: **games in the last 24 hours** (historical) with final score + ATS outcome; **upcoming games tomorrow** with spreads; **Top 25** context from ESPN; **2–4 headlines** tied to those teams. **Every game mentioned** must include spread and ATS result where applicable. Prompt enforces this; model instructed to say "spread/ATS unavailable" when missing.
- **Summary API** — Fetches scores for today + yesterday (last 24h), odds-history for that range (ATS computed per game), rankings, news aggregate. Builds data-availability string and passes to prompt. SSE streaming unchanged; 30-min cache; `?force=true` bypasses cache.
- **UI** — Same palette and typography; last updated timestamp (PST) and fallback behavior unchanged.

**Assets refresh, whitespace reduction, conference logos fix:**
- **Home banner mascot** — Replaced 3D robot with new **2D robot PNG**; saved as `public/mascot.png`. Mascot **slightly larger** (120px desktop, 96px mobile); **reduced** banner padding and gap (e.g. `padding: var(--space-xs) var(--space-md)`, `gap: var(--space-sm)`) for a more compact box; text unchanged.
- **Top-left logo** — Replaced with new **text logo** (transparent PNG); saved as `public/logo.png`. Logo **larger** (max-height 52px, max-width 320px desktop; 44px/240px mobile); **top bar height reduced** to 64px to minimize blank space; "March Madness Intelligence" kept to the right, vertically aligned.
- **Conference logos** — **Fixed** so logos load on Teams and News Feed: added **real logo files** in `public/conferences/` with filenames matching `conferenceSlug.js` (big-ten, sec, acc, big-12, big-east, mwc, aac, wcc, a10, cusa, mvc, mac, southland, others). `ConferenceLogo` now tries `/conferences/<slug>.png` then `/conferences/<slug>.svg`; **SVG placeholders** (Air Force One–style circle + initials) added for all slugs so headers show a logo; **fallback** remains initials badge if both fail.

**Favicon, top bar, banner, ATS logos, conference logos:**
- **Favicon** — Lightning bolt replaced with robot mascot; `public/favicon.png` (from mascot) and `index.html` updated to use it.
- **Top bar** — Maximus Sports logo made **2x bigger** (max-height 56px, max-width 280px desktop; 48px/220px mobile). Top bar height **reduced** to 72px to remove excess blank space; "March Madness Intelligence" kept to the right, vertically aligned; sleek, premium look.
- **Welcome banner** — Robot mascot **2x larger** (112px desktop, 88px mobile); padding/height **condensed** (tighter padding, less gap) for a tighter layout; text unchanged.
- **ATS Leaderboard (Home)** — Each team’s **logo** appears next to its name via existing `TeamLogo` component (Top 10 and Bottom 10).
- **Conference logos** — Blue "B10"-style letter badges replaced with **conference logo or fallback**: `ConferenceLogo` component uses `public/conferences/<slug>.png` or `.svg`; fallback initials badge when image missing. Applied to News Feed and Teams conference headers.

**Top bar logo, Top 25 clickable rows, mascot:**
- **Top bar logo** — Maximus Sports text logo in the top bar is **2x larger** (max-height 96px / max-width 440px desktop; 64px / 280px mobile). Top nav height increased to 100px to accommodate; logo remains aligned with "March Madness Intelligence" tagline.
- **Top 25 Rankings (Home)** — Each team row is **fully clickable** and navigates to `/teams/:slug`; row hover state (background + primary color on team name) for affordance.
- **Mascot** — Robot mascot PNG added at `public/mascot.png`. **Home banner:** mascot placed to the left of the welcome text so it appears to "speak" the message (56px height desktop, 44px mobile). **Team pages:** mascot appears next to the "Maximus's Insight" widget title (48px desktop, 40px mobile) so the robot is shown as delivering the insight. CSS modules + tokens; responsive.

**Home layout, conference defaults, branding logo:**
- **Home** — ATS Leaderboard moved to sit **below pinned teams** and **above Top 25** (order: Pinned Teams → ATS Leaderboard → Top 25 → Dynamic Alerts → Dynamic Stats → Live Scores).
- **Teams page** — All conference widgets (Big Ten, SEC, ACC, etc.) are **expanded by default**.
- **News Feed page** — All conference widgets are **expanded by default**.
- **Branding** — Top-left "Maximus Sports" text + basketball icon replaced with provided **text logo image** (`public/logo.png`). TopNav and Sidebar show the logo; logo scales on desktop (max-height 36px, max-width 180px) and mobile (28px / 140px); tagline "March Madness Intelligence" retained in header on desktop.

**Teams nav hierarchy, Top 25 logos, News Feed headers:**
- **Sidebar Teams** — Two-level expansion: “Teams” is a NavLink to `/teams`; a separate chevron toggles the conference list. Under Teams, only conference names are shown; clicking a conference expands to show that conference’s teams. Indentation: conference row +8px, team row +20px; team rows use a slightly smaller font (0.75rem). Chevrons on both levels.
- **Teams click** — Clicking “Teams” (label/icon) goes to the dedicated Teams page (Top 25 + search + filters + collapsible conferences).
- **Top 25 logos** — Home Top 25 section shows team logos next to team names via existing `TeamLogo` component with slug lookup.
- **News Feed conference headers** — Each conference (Big Ten, SEC, etc.) has a letter-mark icon (e.g. B10, B12, first letter) in a rounded badge; header uses a distinct shade (rgba 0.08 default, 0.12 hover). Bloomberg style and Air Force One palette kept.

**UI polish (Coinbase-style) + feature updates:**
- **Design tokens** — `src/styles/tokens.css`: `--radius-card`, `--shadow-card`, `--card-padding`, `--header-font-size`, `--body-font-size`, `--divider-color`, `--pill-height`, `--badge-font-size`, `--space-*`. Imported in `index.css`. Air Force One palette + Bloomberg data density retained; softer spacing, 12px card radius, subtle shadows, clearer section headers.
- **Left nav** — New hierarchy: Home, Games, Teams (dropdown by conference → team), Odds Insights, News Feed. Quick Links removed.
- **Home** — Welcome banner above pinned teams; Top 25 clearly collapsible (card + accent header); mock hero and "Today's Key Matchups" removed; Odds Movement widget removed; Live Scores kept; **ATS Leaderboard** added (Top 10 best / Bottom 10 ATS for Season, Last 30, Last 7 from rankings + odds history). Sidebar: News Feed + Pinned Team News only.
- **Games** — Key dates compressed (no mock label); Live Scores moved above Daily Schedule (with spreads); Daily Schedule improved (clearer dividers, shaded panel headers); Key Matchups removed.
- **Teams** — Top 25 section at top; search bar + filter by conference + tier; each conference section collapsible (card style). Team profile pages unchanged.
- **Odds Insights** (Insights page) — Rankings Snapshot uses real ESPN data: AP Top 5 and Bracket Favorites with links to team pages; Biggest Movers note. ATS Leaderboard (best/worst 10) added. Daily Report + Bubble Watch table kept.
- **News Feed** — New page at `/news`: collapsible sections by conference (Big Ten, SEC, etc.); each section shows main stories (aggregate news API, last 30 days). Route added in App.

**ATS priority loading + news deferral:**
- **ATS first on TeamPage** — MaximusInsight loads immediately; if ATS is in cache, it shows instantly and refreshes in background. News fetch is deferred (150ms) so ATS/schedule render first.
- **ATS first on Pinned Teams** — Records row (Season, L10, ATS) appears above headlines; ATS uses in-memory cache so it can show before full record load. News fetch deferred 100ms so records/ATS load first.
- **In-memory ATS cache** — `src/utils/atsCache.js`: 7-min TTL per team slug; `getAtsCache(slug)` / `setAtsCache(slug, data)`. Cache hit returns instantly on TeamPage and Pinned cards.
- **News header rename** — TeamPage section title changed from "News" to "[Team Name] News Feed" (fallback: "Team News Feed").
- **Performance** — News no longer blocks ATS/schedule; Bloomberg style + Air Force One palette unchanged.

**Vercel ESM import fix (src/utils):**
- **ESM requires .js in import paths** — In `src/utils/teamSlug.js`, `rankingsNormalize.js`, and `teamIdMap.js`, all relative imports now include the `.js` extension (e.g. `'../data/teams.js'`, `'./teamSlug.js'`). Fixes `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/data/teams'` on Vercel serverless.

**Team IDs: Big Ten overrides + debug:**
- **TEAM_ID_OVERRIDES** — Added Big Ten schools so every `teams.js` slug can resolve: Iowa (2294), Indiana (84), Wisconsin (275), Ohio State (194), Michigan (130), Purdue (2509), Illinois (356), Nebraska (158), Michigan State (127); plus existing UCLA, USC, Washington. `/api/teamIds` now includes e.g. `iowa-hawkeyes`.
- **Debug flag** — `/api/teamIds?debug=true` returns `missingSlugs` and `missingCount`; without `debug`, response is `{ slugToId }` only.
- **TeamSchedule** — Message when team ID missing: "No schedule data — team ID for this school could not be resolved. Schedule and odds will not appear." Shown only when ID is truly missing (after load).

**Odds API diagnostics & production fix:**
- **Debug instrumentation** — `/api/odds?debug=true` and `/api/odds-history?from=...&to=...&debug=true` return `{ games, debug: { gamesCount, cacheHit, firstGame, hasOddsKey, error? } }`
- **Vercel env var check** — Both APIs return 200 with `{ games: [], error: "missing_key", hasOddsKey: false }` when ODDS_API_KEY missing (no 503)
- **Frontend missing odds state** — LiveScores shows: "Odds API key missing in production." when error=missing_key; "Odds API returned no games." when 0 games from API; "No odds currently available." when empty schedule
- **mergeGamesWithOdds** — Normalizes team names (strip mascots, punctuation, University, State); matches by date (same day); chooses closest commenceTime when multiple matches; dev-only debug log for no-match
- **Odds API fallback** — When primary markets (spreads,totals,h2h) return empty, tries spreads,totals then spreads only

---

## Previous Changes (Feb 22, 2025)

**News timeouts fix (priority fetch + cache):**
- **Priority fetch** — `/api/news/aggregate`: Google News first (10s timeout), then other feeds via Promise.allSettled (5s). Google baseline used immediately; national/team feeds merged without blocking
- **Per-source cache** — In-memory cache per feed (10 min TTL). On timeout, return cached result if available
- **AbortController** — All fetches use AbortController + timeout; non-blocking
- **Headers** — User-Agent: MaximusSports/1.0 (+https://maximussports.vercel.app); Accept: application/rss+xml, application/xml, text/xml
- **Response shape** — Always 200 with `{ items, sourcesTried, errors }`; never 500

**Vercel module path fix:**
- **Serverless imports** — api/teamIds, api/news/aggregate: use `../../src/` (two levels up from api subdir to project root); api/news/team/[slug].js uses `../../../src/` (3 levels deep). Fixes ERR_MODULE_NOT_FOUND for /var/src/...

**Production Fixes (Tulsa, Liberty, McNeese, etc.):**
- **Diagnostics** — `/api/teamIds`: Returns `{ slugToId }`; `?debug=true` adds `missingSlugs`, `missingCount`; on error returns 200 with fallback overrides; `/api/news/aggregate?debug=true`: returns `{ items, sourcesTried, errors }`; `/api/odds-history?debug=true` and `/api/odds?debug=true`: return `{ games, debug: { gamesCount, cacheHit, firstGame } }`
- **Team ID fallback map** — Expanded TEAM_ID_OVERRIDES: Tulsa 202, Liberty 2335, McNeese 2377, Grand Canyon 166, Dayton 2126, South Florida 58, Belmont 2057, Nevada 2440, Boise State 68, Santa Clara 221, New Mexico 167, VCU 2670; teamIds never returns 500 (falls back to overrides on ESPN error)
- **News 500s fix** — User-Agent header on all fetches; `safeParseXml()` guards XML parse errors; per-feed failures never throw; always 200; fallback chain: full → Google only → Google+Yahoo → empty
- **Odds/ATS** — odds-history and odds return 200 with `{ games: [] }` on error instead of 500; ATS shows "—" when no odds

**News 500s Fix + Pinned Team Records:**
- **News API staged fallback** — `/api/news/aggregate`: 1) Full stack (Google + National + Team Feeds) → 2) Google only → 3) Google + Yahoo → 4) empty array 200. Never returns 500; all fetches wrapped in try/catch; per-feed failures return []; always 200 with `{ items: [] }`
- **Google News safety** — teamSlug URL-decoded; fallback query when team not in teams.js; teamSlug always yields Google News attempt
- **Frontend empty message** — NewsFeed and TeamPage: "No men's basketball news available. Try again later."
- **Pinned Team Records** — Season (W–L), Last 10 (W–L), ATS (W–L–P) at bottom of each pinned card; compact 3-column row; ESPN schedule + odds-history + ATS logic; "—" when missing; SourceBadge ESPN + Odds API when data present

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
