# Maximus Sports — Project Status

**Last updated:** Feb 26, 2026

## Summary

March Madness Intelligence Hub — a college basketball web app with daily reports, game previews, upset alerts, team news (Google News RSS), live odds (The Odds API), and ESPN Bubble Watch team listings. Built with Vite + React, deployed on Vercel. Uses Air Force One color palette with Bloomberg-style data-dense UI.

**ATS Leaders reliability (Feb 2026):** ATS on Home could stay stuck warming until Odds Insights was visited. Fix: server-side refresh kick in `/api/ats/leaders` uses `getOriginFromReq(req)` (no env vars); shared `useAtsLeaders` hook on Home and Insights with one POST refresh per window when warming and retries at 1200/3500ms; proactive warming via `/api/ats/warmAll` (cron every 10 min) and fire-and-forget from GET /api/home; KV stale data is always returned (never downgrade to empty). Locks prevent stampedes.

---

## Architecture

### Frontend
- **Framework:** Vite 7 + React 19
- **Routing:** React Router v7
- **Styling:** Plain CSS + CSS modules (no UI libraries)
- **Fonts:** DM Sans, JetBrains Mono, Oswald

### Backend
- **Platform:** Vercel Serverless Functions (≤12 for Hobby plan; consolidated to 4–6 endpoints).
- **Cache utility:** `api/_cache.js` — `createCache(ttlMs)` (with `getMaybeStale()` for SWR), `coalesce(key, fetcher)`, `buildCacheMeta()` for response metadata. In-memory cache may reset on cold starts.
- **Shared sources:** `api/_sources.js` — shared fetchers (scores, rankings, odds, odds-history, teamIds, schedule, news aggregate, team news) used only by `/api/home` and `/api/team/[slug]`; no HTTP between APIs.
- **ATS pipeline:** `api/home/atsPipeline.js` — `getAtsLeadersPipeline({ warm?: boolean })` used by /api/home, /api/home/fast (warmers), /api/home/slow, /api/ats/warm. Cache + coalescing + stale-while-revalidate; never hangs.
- **Home API (full):** `/api/home/index.js` — GET; returns scores, odds, rankings, atsLeaders (via pipeline, 8s timeout then stale/empty), headlines, dataStatus, generatedAt, cache meta. CDN 90s / SWR 300s.
- **Home Fast:** `/api/home/fast.js` — GET; scoresToday, scoresYesterday, rankingsTop25, atsLeaders (from cache), headlines, dataStatus; warmers call pipeline when cache empty. Response includes generatedAt, cache, sourceLabel. CDN 90s / SWR 300s.
- **Home Slow:** `/api/home/slow.js` — GET; headlines, odds, oddsHistory, atsLeaders (via pipeline or cache), pinnedTeamNews, upcomingGamesWithSpreads, slowDataStatus, cache meta. Cache 20 min; timeouts so endpoint never hangs.
- **ATS Leaders (read-only):** `GET /api/ats/leaders?window=last30|last7|season` — reads KV only; returns data with source kv_hit (or stale &gt; 30m with confidence low); when KV missing returns warming payload with nextAction/refreshEndpoint and triggers fire-and-forget refresh via `getOriginFromReq(req)` (no env vars). Never returns empty when KV has stale data. Cache-Control s-maxage=60, stale-while-revalidate=300.
- **ATS Refresh (writer):** `POST /api/ats/refresh?window=last30|last7|season` — acquires KV lock, computes ATS (9s timeout), writes to KV; 202 when locked, 200 { status: ok|failed, used?: stale|none }. Never computes in GET /api/ats/leaders.
- **ATS Warm:** `/api/ats/warm/index.js` — GET; cron every 7 min. **ATS WarmAll:** `GET/POST /api/ats/warmAll` — warms all windows (last30, last7, season); same lock as refresh; cron every 10 min. GET /api/home fires fire-and-forget POST to warmAll when origin available.
- **Home page UX:** Client fetches `/api/home/fast` first (scores, rankings, headlines); ATS comes from shared `useAtsLeaders` hook via `GET /api/ats/leaders`. Same hook used on Odds Insights so ATS behavior is identical. Hook triggers one POST refresh per window per session when warming; retries GET at 1200ms and 3500ms; shows Retry after that. Server kicks refresh from leaders when KV missing/stale using request origin (no env vars). Proactive warming: cron warmAll every 10 min; GET /api/home fires warmAll fire-and-forget so Home-first visits rarely see cold KV.
- **Team API:** `/api/team/[slug].js` — GET; returns team, schedule, oddsHistory, teamNews, rank, teamId, tier. Team page only; no prefetch for other teams. CDN 120s.
- **Team Batch:** `/api/team/batch.js` — GET `?slugs=slug1,slug2,...` (max 5). Returns schedule + ATS + headlines per slug. Cache 7 min. Used for pinned teams only after Home fast renders. Client chunks into groups of 5, coalesces by key, 5 min client cache (show cached immediately, refresh in background if stale).
- **Pinned teams:** After `/api/home/fast` renders, Home calls `fetchTeamBatch(pinnedSlugs)` (requestIdleCallback); staggered refresh: one pinned team every 2.5s via `fetchTeamPage(slug)` to smooth updates.
- **ATS leaderboard:** Full-league computed from all teams (rankings + odds-history); cached server-side with timestamp; fallback to Top 25 + Lock + "Should be in" when odds-history sparse. Client cache (5 min) via `atsLeadersCache.js`; show cached first, "Warming ATS cache…" when not ready, update in background when slow or cron warms cache.
- **Summary API:** `/api/summary/index.js` — POST only; payload hash cache 30 min; rate limit 1/min per IP; SSE streaming; no internal API calls.
- **Team Summary API:** `/api/summary/team.js` — POST body: `{ slug?, teamName, tier?, upcomingGames, lastWeek, atsSummary, headlines }`. Payload-only. `?stream=true` → SSE; `?force=true` bypasses cache. Cache 30 min per team.
- **Health:** `/api/health.js` — GET; returns `{ ok: true, timestamp }` (optional).
- **Env check:** `/api/env-check.js` — GET; returns `{ hasOddsKey, keyLength }` (never the key). For runtime verification of ODDS_API_KEY.
- **Removed standalone routes:** `/api/scores`, `/api/rankings`, `/api/odds`, `/api/odds-history`, `/api/news/aggregate`, `/api/news/team/[slug]`, `/api/teamIds`, `/api/schedule/[teamId]` — functionality folded into home and team.
- **News filters:** `api/news/filters.js` — MBB allowlist/exclude; used by _sources for news aggregate and team news (not a route).

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
| `src/utils/teamSlug.js` | Maps ESPN team names → teams.js slugs |
| `src/utils/pinnedTeams.js` | localStorage get/set for pinned team slugs |
| `src/utils/rankingsNormalize.js` | ESPN name normalization + `buildSlugToRankMap` |
| `src/utils/teamIdMap.js` | `buildSlugToIdFromRankings` — slug → ESPN team ID (used in api/home) |
| `src/api/odds.js` | Client: `mergeGamesWithOdds()`, `matchOddsHistoryToEvent()`, `matchOddsHistoryToGame()` (odds from /api/home, /api/team) |
| `src/utils/ats.js` | ATS helpers: `computeATS()`, `computeATSForEvent()`, `getOurSpread()`, `aggregateATS()` |
| `src/utils/dateChunks.js` | `SEASON_START` (2025-11-01), `chunkDateRange(from, to, maxDays=31)` |
| `src/utils/dates.js` | Schedule date helpers (now → Selection Sunday) |
| `src/data/keyDates.js` | Conference finals + NCAA key dates (PST) |
| `api/news/filters.js` | Men's basketball allowlist + exclude (`isMensBasketball`); used by _sources |
| `api/_sources.js` | Shared fetchers: scores, rankings, odds, odds-history, teamIds, schedule, news aggregate, team news (all use _cache) |
| `api/_cache.js` | Shared: `createCache(ttlMs)`, `getMaybeStale()`, `coalesce()`, `buildCacheMeta()` |
| `api/home/atsPipeline.js` | `getAtsLeadersPipeline({ warm })` — single ATS pipeline for home, fast, slow, warm; cache + coalesce + SWR |
| `api/home/index.js` | GET (full): scores, odds, rankings, atsLeaders (pipeline + timeout), headlines, dataStatus, generatedAt, cache meta |
| `api/home/fast.js` | GET: scoresToday, scoresYesterday, rankingsTop25, atsLeaders (cache), headlines; warmers use pipeline; response cache meta |
| `api/home/cache.js` | Shared server cache for atsLeaders (+ getAtsLeadersMaybeStale); read by fast/slow, written by pipeline |
| `api/home/atsLeaders.js` | computeAtsLeadersFromSources(); used only by atsPipeline |
| `api/home/slow.js` | GET: headlines, odds, oddsHistory, atsLeaders (pipeline or cache), pinnedTeamNews, upcomingGamesWithSpreads; cache meta |
| `api/ats/leaders/index.js` | GET: ?window=...; KV only; stale &gt; 30m → confidence low; warming → nextAction/refreshEndpoint; optional fire-and-forget refresh |
| `api/ats/refresh/index.js` | POST: ?window=...; lock + compute (9s) + write KV; 202 locked, 200 ok/failed |
| `api/ats/warm/index.js` | GET: cron; getAtsLeadersPipeline({ warm: true }); */7 * * * * |
| `api/ats/warmAll/index.js` | GET/POST: warm all ATS windows (last30, last7, season); same lock as refresh; */10 * * * * |
| `src/hooks/useAtsLeaders.js` | Shared ATS hook: GET leaders, one POST refresh on warming, retries at 1200/3500ms; used by Home and Insights |
| `api/team/[slug].js` | GET: team, schedule, oddsHistory, teamNews, rank, teamId, tier (Team page only) |
| `api/team/batch.js` | GET: ?slugs=slug1,slug2 (max 5). Schedule + ATS + headlines per slug; cache 7 min |
| `api/summary/index.js` | POST: summary with payload; hash cache; rate limit; SSE streaming |
| `api/summary/team.js` | POST: team insight; `?stream=true` SSE, `?force=true` bypass cache; 30-min cache |
| `api/health.js` | GET: `{ ok: true, timestamp }` (optional) |
| `api/env-check.js` | GET: `{ hasOddsKey, keyLength }` — verify ODDS_API_KEY at runtime (key never returned) |
| `src/api/home.js` | Client: `fetchHomeFast()`, `fetchHomeSlow()`, `mergeHomeData(fast, slow)` for Home; `fetchHome()` for Games/DailySchedule/Insights/NewsFeed |
| `src/api/atsLeaders.js` | Client: `fetchAtsLeaders(window)`, `fetchAtsRefresh(window)` — GET /api/ats/leaders and POST /api/ats/refresh; de-dupe on GET |
| `src/api/team.js` | Client: `fetchTeamPage(slug)` (Team page); `fetchTeamBatch(slugs)` chunked by 5, coalesced, 5 min client cache |
| `src/utils/atsLeadersCache.js` | In-memory ATS leaderboard cache (5 min); show cached first, update in background |
| `src/api/summary.js` | Client: `fetchSummaryStream`, `buildTeamSummaryPayload`, `fetchTeamSummaryStream`, `fetchTeamSummary` |
| `scripts/fetch-logos.js` | Fetch ESPN logos → `public/logos/*.png` or generate fallback SVGs |
| `vercel.json` | Build config, SPA rewrites, crons: home/slow 5 min, ats/warm 7 min, ats/warmAll 10 min, ats/warmFull 30 min |

### Pages
- `Home` — **Dynamic welcome synopsis** (OpenAI) in banner (or static fallback); Pinned Teams, ATS Leaderboard, Top 25 Rankings, Dynamic Alerts, Dynamic Stats, Live Scores, sidebar
- `Teams` — Bubble Watch list by conference + odds tier
- `TeamPage` — Render order: (1) **TeamSummaryBox** (Maximus's Insight chat bubble, top section), (2) **ATS** section (separate card), (3) **News** feed, (4) **Schedule**. Insight section wrapped in `<section aria-label="Maximus's Insight">` so the bubble is always visible and first.
- `Games` — Key Dates (compact grid); **Today's Scores** (renamed from Live Scores) when there are live/in-progress games — header “Today's Scores — &lt;date&gt; (PST)” with LIVE pill; team **rankings** (#rank) next to each team name (rankMap from fetchRankings, same badge styling as Daily Schedule); Daily Schedule below
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
- **Team:** `TeamSummaryBox` (GPT insight, streaming SSE + cursor, Refresh bypasses cache, chat bubble + mascot), `MaximusInsight` (ATS records; `atsOnly` for ATS section), `TeamSchedule` (past: spread + ATS; upcoming: spread + O/U)
- **Insights:** `RankingsTable` (conference + tier filters)

---

## APIs (consolidated; ≤12 serverless functions)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/home` | GET | Full batch (legacy): scores, odds, rankings, atsLeaders, headlines, dataStatus. Optional `?dates=`, `?pinnedSlugs=`. Used by Games, DailySchedule, Insights, NewsFeed. CDN 60s. |
| `/api/home/fast` | GET | Fast path: scoresToday, scoresYesterday, rankingsTop25, atsLeaders, headlines, pinnedTeamsMeta, dataStatus. Cache 2 min. ATS + headlines from cache; warmers when empty. Home page fetches this first. |
| `/api/home/slow` | GET | Slow path: headlines, odds, oddsHistory, atsLeaders, pinnedTeamNews, upcomingGamesWithSpreads. Cache 20 min. Home page fetches in background and merges. |
| `/api/team/:slug` | GET | Team page only: team, schedule, oddsHistory, teamNews, rank, teamId, tier. No prefetch for other teams. CDN 120s. |
| `/api/team/batch` | GET | `?slugs=slug1,slug2,...` (max 5). Schedule + ATS + headlines per slug. Pinned teams only, after Home fast. Cache 7 min. |
| `/api/summary` | POST | Home synopsis (OpenAI). Body: `{ top25, atsLeaders: { best, worst }, recentGames, upcomingGames, headlines }`. `?stream=true` (required), `?force=true` bypass cache. SSE stream. Cache by payload hash (30 min). Rate limit 1/min per IP. |
| `/api/summary/team` | POST | Team page insight. Body: `{ slug?, teamName, tier?, upcomingGames, lastWeek, atsSummary, headlines }`. `?stream=true` → SSE; `?force=true` bypasses cache. Payload-only. Cache 30 min per team. Pinned cards use same endpoint (no stream). |
| `/api/health` | GET | Optional. Returns `{ ok: true, timestamp }`. No cache. |
| `/api/ats/warm` | GET | Cron warm-up: computes ATS leaders, writes to shared cache, returns `{ ok, atsLeadersCount }`. Every 7 min. |
| `/api/env-check` | GET | Returns `{ hasOddsKey, keyLength }`. Verifies ODDS_API_KEY present at runtime; never returns the key. No cache. |

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

## Manual verification checklist (Vercel Pro caching / fast Home)

- [ ] **Home loads quickly** even when upstream APIs (ESPN, Odds) are slow — scores/rankings from fast path; ATS from cache or pipeline with timeout.
- [ ] **ATS appears within ~0–1s** when cache is warm (cron or prior request); when cold, compact "Loading ATS…" in reserved layout (no jump).
- [ ] **Switching Home ↔ Odds Insights** does not refetch ATS unnecessarily — client cache (`atsLeadersCache`) and shared fast response; Insights uses `fetchHomeFast()` and cache.
- [ ] **GET /api/ats/warm** returns 200 and warms cache; response `{ ok, atsLeadersCount, sourceLabel? }`; no 404 (route: `api/ats/warm/index.js`).
- [ ] **CDN caching headers** on responses: `Cache-Control: public, s-maxage=..., stale-while-revalidate=...` on /api/home, /api/home/fast, /api/home/slow; responses include `generatedAt`, `cache: { hit, ageMs, stale }`, `sourceLabel`, and optionally `errors`.
- [ ] **Dev-only logs** (NODE_ENV !== 'production'): cache hit/miss, stale served, warm endpoint execution in server logs.

---

## Latest Changes (Feb 25, 2026)

**Phase X: Home ATS cold-load reliability fix (Feb 25, 2026)**

- **Home ATS on first visit:** Home now always fetches `GET /api/ats/leaders?window=last30` in a dedicated `useEffect` that runs once on mount. It is not tied to `loadHomeBatch` or `/api/home/fast`. Visiting Odds Insights is no longer required to "wake up" ATS; Home works on first visit in incognito/cold sessions.
- **Dedicated fetch + AbortController:** ATS fetch uses its own `AbortController` created inside the ATS-only effect; aborted only on unmount cleanup. No shared controller with other requests.
- **Client last-known cache:** In `src/api/atsLeaders.js`, "last success" is stored only when the response is usable: `best.length >= 5` or `worst.length >= 5`. Warming/empty responses are never stored as last-known. When returning a client fallback, meta is set to `source: 'client_last_known'`, `reason: 'client_last_known_fallback'`, `confidence: 'low'`.
- **Per-window de-dupe:** In-flight key is stable per window: `ats:leaders:last30` (not page-specific). Prevents cross-window request blocking.
- **Bounded retries when warming:** If the first GET returns warming and there is no usable client last-known, Home schedules one retry GET after 1500ms and, if still warming, one more after 3500ms from mount. Then auto retries stop; user can click Retry. No tight polling or automatic POST refresh loops from Home.
- **React re-render:** All ATS state updates on Home use new objects/arrays (`setAtsLeaders({ best: [...], worst: [...] })`, `setAtsMeta({ ... })`) so React reliably re-renders.
- **Shared loading UI:** `src/utils/atsLeaderboardUI.js` exports `shouldShowAtsLoading(leaders, meta)` and `shouldShowAtsEmptyState(leaders, meta)`. `ATSLeaderboard` uses these so Home and Insights show the same blue progress bar and status text when warming; empty state is hidden while warming.
- **Server kick refresh:** `api/ats/leaders/index.js` uses a robust base URL: prefers `VERCEL_PROJECT_PRODUCTION_URL` (with `https://` if missing), else `VERCEL_URL`. Never throws if URL is missing. DEV-only log: `[ats] kick refresh window=... baseUrl=...|none`.
- **DEV-only logs (Home):** `[ATS Home] mount fetch start`, `mount fetch success`, `mount fetch warming`, `mount fetch error`, `cleanup abort` (and retry logs) only when `import.meta.env.DEV`.

---

**ATS lock hardening + server kick fix + fallback semantics (Feb 25, 2026)**

- **Atomic lock:** `tryAcquireLock` in `_globalCache.js` uses Redis SET with `nx: true` and `ex` when supported; falls back to token-verify (set lockKey = `{ token, createdAt }`, re-read and only proceed if stored token matches). Lock release is TTL-only; no explicit release.
- **Server kick URL:** GET /api/ats/leaders builds base URL from `VERCEL_URL` (adds `https://` if missing) or `VERCEL_PROJECT_PRODUCTION_URL`; if neither is set, skips fire-and-forget refresh and logs in dev only. Never throws.
- **KV write semantics:** `writeAtsToKvIfValid` writes when `best.length >= 5 || worst.length >= 5` (usable data). `atsMeta.generatedAt` always set on refresh output. Fallback (rankings-only) sets `reason: 'rankings_fallback'` and `confidence: 'low'` so UI can label it.
- **Client warming:** `fetchAtsRefresh` returns `{ status: 'ok'|'locked'|'failed' }`. When GET returns warming: if refresh returns `locked`, do not count as attempt and schedule one more GET at +1500ms; if `ok` or `failed`, count attempt and schedule GET at +1200ms; if `failed` and follow-up GET still empty, stop auto attempts (rely on Retry). Max 2 rounds per window per session.
- **Last-known cache:** In `src/api/atsLeaders.js`, last successful response per window is stored in memory (10 min TTL). When GET returns warming/empty or fetch errors, if last-known exists and is not expired, return it with `atsMeta.source: 'client_last_known'` and `confidence: 'low'`.
- **cacheAgeSec / unknown_age:** `getWithMeta` returns `ageSeconds: null` when `generatedAt` is missing; GET /api/ats/leaders then sets `reason: 'unknown_age'` and `confidence: 'low'` and omits cacheAgeSec. Stale still derived from `ageSeconds > FRESH_SECONDS` when age is known.

---

**ATS refresh + triggers + logo (Feb 25, 2026)**

- **POST /api/ats/refresh:** New endpoint `POST /api/ats/refresh?window=last30|last7|season` computes ATS leaders (same logic as pipeline: `computeAtsLeadersFromTeamAts` + `computeFastFallbackFromRankingsOnly`) with a 9s timeout and writes to KV. Uses KV lock `ats:leaders:refresh_lock:{window}` (TTL 60s) and per-instance `inFlight` map to prevent stampede. On compute failure does not overwrite KV; returns 200 `{ status: "failed", used: "stale"|"none" }`. On lock held returns 202 `{ status: "locked" }`.
- **GET /api/ats/leaders:** When KV is present but cache age &gt; 30m, still returns data with `confidence: "low"` and `reason: "stale"`. When KV is missing, returns 200 with `reason: "ats_data_warming"`, `nextAction: "refresh"`, `refreshEndpoint: "/api/ats/refresh?window=..."`. Server fire-and-forget: when KV missing or stale &gt; 30m (in production with VERCEL_URL), triggers a non-awaited POST to refresh so another instance can populate KV.
- **Client warming kick:** When GET /api/ats/leaders returns `reason === 'ats_data_warming'`, Home schedules POST /api/ats/refresh after 250ms and re-fetches GET after 1200ms; max 2 rounds per window per session. Same kick on period change when that window returns warming. Retry button calls refresh then refetch.
- **Observability:** With “Show data status” enabled, ATS meta (source, cacheAgeSec, generatedAt, confidence, reason, refreshEndpoint) is shown. Dev-only server logs: `[ats] leaders kv_hit`, `[ats] leaders warming`, `[ats] refresh start/locked/success/fail`.
- **Championship diagnostics:** When “Show data status” is on and `championshipOddsMeta` has `missingTeamSlugsSample` or `unmappedOutcomesSample` (dev), they appear in a collapsed &lt;details&gt;.
- **Logo:** TopNav uses `src="/maximus-logo.png"` (fallback to `/logo.png` on error). Copy the provided “Maximus Sports logo.png” to `public/maximus-logo.png` for the intended asset. CSS: desktop height 62–64px, mobile 48–52px, object-fit contain, subtle drop shadow; nav links unchanged to avoid wrapping.

---

**Phase 5 cleanup (Feb 25, 2026)**

- **ATS Leaders via dedicated endpoint:** New `GET /api/ats/leaders?window=last30|last7|season` reads KV only and returns immediately (kv_hit or kv_stale). Cache-Control: `public, s-maxage=60, stale-while-revalidate=300`. Home fetches ATS from this endpoint separately from `fetchHomeFast`; initial load and period change/Retry call only `/api/ats/leaders`. No new Odds API or heavy work on the fast path; ATS usually renders within 1–2s when KV has data. Empty KV returns lightweight payload with `reason: ats_data_warming`; UI shows “ATS data warming up.”
- **Championship odds mapping:** Stronger name normalization in `normalizeForOdds`: “st”/“st.” (after school name) → “state”, “okla” → “oklahoma”, “ariz” → “arizona”. Explicit ALIASES for Michigan St, Arizona St, Oklahoma St, Grand Canyon (Antelopes/Lopes), Nevada Wolf Pack, Tulsa Golden Hurricane. Championship API uses `normalizeForOdds` in `outcomeNameToSlug` so sportsbook variants (e.g. “Michigan St”, “Oklahoma St”) map correctly. Dev-only observability: when mapped count is low or missing teams &gt; 0, `oddsMeta` includes `missingTeamSlugsSample` (max 15) and `unmappedOutcomesSample` (max 25).
- **Logo and Today’s Scores:** TopNav logo set to 52–56px height (desktop), 44–48px (mobile) with subtle drop shadow; header stays sleek. Home passes `rankMap` to LiveScores so Today’s Scores shows Top 25 rank badges (#rank) next to team names when rankings exist.

---

**Phase 4 cleanup + ATS time-to-real fix (Feb 25, 2026)**

- **Deferred championship odds fetch to idle/after ATS** so it never competes with ATS on cold start. Championship fetch runs only after the initial `fetchHomeFast` response returns, via `requestIdleCallback` (timeout 1500ms) or `setTimeout(1500)`; scheduled once per page load. ATS warm + fast path remain first in line.
- **Moved shared TEAMS list to `/data/teams.js`** (project root). Serverless `api/odds/championship` imports from `data/teams.js` instead of `src/data/teams.js` to avoid pulling client `src/` into serverless. `src/data/teams.js` re-exports from `data/teams.js` so the app is unchanged.
- **Safer championship outcome mapping guardrails** in `buildChampionshipLookup`: strip-last-2-words matches are only added when the remaining base has ≥2 tokens and is not in the blocked set (`state`, `tech`, `college`, `university`, `usc`, `uc`, `miami`, `saint`, `st`) to reduce false matches.
- **Bounded polling**: added `homeFastRefetchInFlightRef` so the 3s/8s ATS refetches do not overlap. Dev-only logs: warm start, fetchHomeFast start/end, championship fetch start/end, refetch schedule fire.

---

**ATS Loading UX + Bounded Polling (Feb 25, 2026)**

- **Stage metadata (server → client):** ATS pipeline and responses now include `atsMeta.stage`, `atsMeta.source` (kv_hit | computed | proxy), `atsMeta.startedAt` / `atsMeta.updatedAt` / `atsMeta.elapsedMs`, and when available `atsMeta.teamCountAttempted` / `atsMeta.teamCountCompleted`. UI can show determinate progress when counts exist, otherwise indeterminate.
- **Warm early exit:** `/api/ats/warm` checks KV first; if the window already has real (non-proxy) data and is fresh (< 5 min), returns immediately with `earlyExit: true` and skips recompute to reduce server load and speed up repeat calls.
- **Bounded polling:** When the initial fast response is proxy or empty, Home schedules two refetches at **3s** and **8s** (max 2 attempts). Stops as soon as real data arrives; no infinite loops. Improves typical time-to-real for cold/incognito.
- **ATS Leaderboard loading UI:** Progress bar at top of the ATS card (determinate % when teamCountCompleted/Attempted exist, else indeterminate animation). Status line under title: “Loading ATS Leaders… (warming cache / computing league ATS)” or “(upgrading to full league)” when proxy is shown. After **20s** waiting: “Still working…” with a **Retry** button that triggers one `fetchHomeFast` (respects existing throttle). Retry does not bypass warm throttle.
- **Acceptance:** Cold incognito shows progress UI immediately; typical upgrade to real ATS within ~5–15s; warm/returning users get near-instant KV hits; no regressions to other home sections.

---

**ATS Incognito Cold-Start and 10/10 Reliability (Feb 25, 2026)**

- **Why:** ATS Leaders was inconsistent: in incognito it often stayed in proxy mode (all N/A) or took too long to show real data; in normal browsing it sometimes showed only 8 top / 8 bottom with "Insufficient data" even when more teams could qualify.
- **Warm both windows on mount:** Home now triggers `/api/ats/warm` and `/api/ats/warm?window=last7` immediately on mount (non-blocking, same 5-min throttle). Warm endpoint accepts `?window=last30|last7` and writes to the corresponding KV key so both default and Last 7 views are pre-filled for cold sessions.
- **Re-fetch after warm:** When the initial fast response returns proxy or empty, Home schedules a single follow-up `fetchHomeFast` at 2.8s. That gives the warm requests time to complete and write real data to KV; the follow-up then reads KV (or runs pipeline with warm cache) and replaces proxy with real via existing `chooseAts` logic (never replace real with proxy).
- **KV: do not overwrite real with proxy:** Pipeline and warm now pass `cacheNote` into KV payloads. `writeAtsToKvIfValid` skips writing when the incoming result is proxy (e.g. `computed_proxy`, low confidence) and the existing KV value is real (FULL, or FALLBACK with medium/high confidence, or `cacheNote: computed_recent_team_ats`). So proxy responses never overwrite good real leaderboards in KV.
- **Larger team pool and deadlines:** `computeAtsLeadersFromTeamAts` now builds the candidate list from pinned + Top 25 + remaining TEAMS with resolved IDs (up to 60 teams) so more teams can meet the 8-game (last30) / 5-game (last7) thresholds and yield 10 top / 10 bottom. Last-30 deadline increased to 4.2s and last-7 to 3.2s; per-team timeout reduced to 700ms so more teams are attempted within the deadline.
- **Acceptance:** Incognito Home should show real ATS (last30) within about 1–3s in typical cases; normal browsing should not regress to proxy; 10/10 rows when enough teams qualify; `/api/home/fast?atsWindow=last30` returns `atsMeta.cacheNote = computed_recent_team_ats` or `kv_hit` when real data is used.

---

**Recent-First ATS + Unified Navigation (Critical UX Fix)**

### Recent-First ATS Strategy
- **Default ATS window = Last 30 days** for meaningful “who’s hot” signal and faster real data.
- **Window priority:** LAST 30 (default), LAST 7, SEASON (best-effort). If Season selected but not FULL/high confidence, show Last 30 with “Season warming” note; never show blank.

### Windowed ATS Caching (Vercel KV)
- **Separate KV keys:** `ats:leaders:last30:v1`, `ats:leaders:last7:v1`, `ats:leaders:season:v1`.
- **Payload:** `atsLeaders: { best, worst }`, `atsMeta: { status, confidence, reason?, sourceLabel?, generatedAt, cacheNote? }`.
- **Overwrite rules:** NEVER write EMPTY to KV. NEVER overwrite FULL or good FALLBACK with EMPTY. Prefer FULL > real FALLBACK > proxy FALLBACK > EMPTY.

### Fast “Quick Real” ATS Compute
- **`computeAtsLeadersFromTeamAts (team ATS source; see atsLeadersFromTeamAts.js). Legacy: computeRealAtsQuickRecent({ windowDays, pinnedSlugs, maxTeams })`** in `api/home/atsQuickReal.js`: team set = pinned + Top 25 (dedupe, cap 40); recent odds-history range only; early exit per team after ~8–12 games; concurrency 6; per-request ~800–1200 ms; total deadline ~3.5 s. Returns best 10 / worst 10 by cover % (tie-break by games). atsMeta: status FALLBACK, confidence medium, sourceLabel e.g. “Pinned + Top 25 (Last 30 real ATS)”.

### Endpoint Behavior
- **`/api/ats/warm`:** Warm LAST 30 first: try quick real Last 30 → write KV; if fail, proxy fallback → write KV. Never write EMPTY.
- **`/api/ats/warmFull`:** Season FULL compute only; write to `ats:leaders:season:v1` only on FULL success; do not overwrite good data on failure.
- **`/api/home/fast`** and **`/api/home`:** Default ATS window = Last 30. Query `?atsWindow=last30|last7|season`. Pipeline: read KV for window key → on miss compute quick real (last30/last7) or proxy → write KV if non-EMPTY. Expose `atsMeta.cacheNote`: `kv_hit`, `kv_stale`, `computed_quick_real`, `computed_proxy`. Response includes `atsWindow`, `seasonWarming` when applicable.

### Home Page Behavior
- **Auto-warm:** On first load if ATS empty, call `/api/ats/warm`; throttle with sessionStorage ~5 min.
- **Window toggles:** LAST 30 (default), LAST 7, SEASON. Changing period refetches with `atsWindow`. If Season not FULL, display Last 30 data with “Season warming” indicator.
- **Proxy:** Record column shows N/A; never show 0-0; clearly labeled low confidence.

### Summary Bot Alignment
- Payload includes `atsWindow` (last30, last7, season) and `atsMeta`. Bot phrasing: “Over the last 30 days…”, “Recently…”; avoid season claims when data is recent-only.

### Navigation Change (Critical UX Fix)
- **Top horizontal nav now matches left nav exactly:** Home, Games, Teams, Odds Insights, News Feed. Same order, same labels, same routes. Removed obsolete “Insights” and “Alerts” tabs. Active tab highlighting and responsive behavior preserved.

### Test Instructions
- **ATS:** Incognito Home → ATS should appear within ~1–3 s; default view Last 30; real records when available; proxy only when necessary; no manual refresh; no reverting to empty; KV hits on repeat visits.
- **Navigation:** Top nav matches left nav; no Insights or Alerts; links route correctly; active tab highlighting works; no layout regressions.

### Verification Checklist
- [ ] Incognito Home shows ATS within ~1–3 s
- [ ] Default ATS view is Last 30
- [ ] Real records appear when available; proxy only when necessary
- [ ] No manual refresh required; no reverting to empty after load
- [ ] KV hits on repeat visits
- [ ] Top nav matches left nav (Home, Games, Teams, Odds Insights, News Feed)
- [ ] No Insights or Alerts tabs; links route correctly; active tab highlighting works; no layout regressions

---

## Previous Changes (Feb 24, 2026)

**Vercel-optimized caching + shared ATS pipeline:**
- **Server cache utility** (`api/_cache.js`): `getMaybeStale(key)` for stale-while-revalidate; `buildCacheMeta()` for response metadata. Safe fallback to empty when no cache.
- **Shared ATS pipeline** (`api/home/atsPipeline.js`): `getAtsLeadersPipeline({ warm })` used by /api/home, /api/home/fast (warmers), /api/home/slow, /api/ats/warm. Coalescing, 10 min TTL, serve stale on failure.
- **CDN-friendly responses**: Cache-Control `public, s-maxage=90, stale-while-revalidate=300` (home/fast); responses include `generatedAt`, `cache: { hit, ageMs, stale }`, `partial`, `sourceLabel`, `errors`.
- **Full /api/home**: ATS via pipeline with 8s timeout; on timeout returns stale or empty; never hangs.
- **Warm endpoint**: GET /api/ats/warm calls pipeline with `{ warm: true }` only; returns JSON summary.
- **Client**: Home gets ATS from fast/slow (no separate fetchHome for ATS); updates client `atsLeadersCache` from fast and merged slow; Insights uses cache + fetchHomeFast(); ATS section has min-height to avoid layout jump.

**Full-league ATS leaderboard, cached + cron:**
- **ATS from all teams** — `api/home/atsLeaders.js`: `computeAtsLeadersFromSources()` now uses **all teams** (TEAMS with resolved slugToId) + rankings + odds-history for best/worst Top 10 / Bottom 10. If odds-history empty, response includes `unavailableReason`.
- **Fallback leaderboard** — When full-league yields no ATS data, fallback computed from (a) Top 25 teams from rankings and (b) teams in tiers "Lock" + "Should be in". Response includes `source: 'fallback'` and `sourceLabel: 'Top 25 / Locks + Should Be In'` so UI can show the subtitle.
- **Cache with timestamp** — `api/home/cache.js`: ATS stored as `{ best, worst, timestamp, source, sourceLabel }`. `/api/home/fast` returns cached atsLeaders immediately when available (independent of slow); response includes `atsLeadersTimestamp`, `atsLeadersSourceLabel`.
- **Cron warm-up** — New `GET /api/ats/warm`: computes ATS leaders, writes to shared cache, returns `{ ok: true, atsLeadersCount }`. Vercel cron every 7 min (`*/7 * * * *`) in `vercel.json`.
- **Slow uses shared ATS** — `/api/home/slow` no longer inlines ATS logic; calls `computeAtsLeadersFromSources()` and writes result to cache; response includes `atsLeadersSourceLabel`.
- **UI** — ATS leaderboard shows "Warming ATS cache…" when cache empty and warming; when fallback source is used, shows subtitle "Top 25 / Locks + Should Be In". `mergeHomeData()` passes `atsLeadersSourceLabel` from fast/slow.

**Debugging (client + server):**
- **Client (Home):** In development, console logs: `[Home ATS] fetchHome() starting` before request; `[Home ATS] fetchHome() resolved` with `hasAtsLeaders`, `bestCount`, `worstCount`, and raw atsLeaders after response; `[Home ATS] state + cache updated` when data is set; `[Home ATS] fetchHome() failed` with error in catch; `[Home ATS] fetchHome() finished, atsLoading=false` in finally. Use Network tab to confirm `/api/home` returns and response includes `atsLeaders`. State is updated in the same effect via `setAtsLeaders(next)` so ATSLeaderboard re-renders when data arrives.
- **Client (ATSLeaderboard):** In development, logs `[ATSLeaderboard] atsLeaders updated, re-render` when best/worst counts change so you can verify the component receives new data.
- **Server /api/home:** Logs `[api/home] response` with `atsLeadersCount`, `scoresCount`, `rankingsCount` in non-production. On error, logs `[api/home] error` and stack.
- **Server /api/ats/warm:** Logs `[api/ats/warm] request` (method + url) and `[api/ats/warm] success` with atsLeadersCount/source. On error, logs message and stack. Route must be at `api/ats/warm/index.js` for Vercel (directory-based); `vercel.json` cron path is `/api/ats/warm`. If you get 404, confirm the file exists at `api/ats/warm/index.js` and redeploy; check Vercel dashboard → Logs for these messages.
- **Caching:** Client uses `atsLeadersCache` (5 min TTL). Server `/api/home` uses in-memory caches in `_sources.js` and does not share with `/api/ats/warm` server cache. Warm endpoint writes to `api/home/cache.js` for fast/slow to read; full `/api/home` computes ATS inline and does not read that cache.

**Home ATS leaderboard — same data as Odds Insights:**
- **Same endpoint** — Home fetches ATS via `fetchHome()` (full `/api/home`), using only `data.atsLeaders`. Background call after mount; does not block initial render.
- **ATS cache sync** — When Home receives atsLeaders from `fetchHome()`, it writes to `atsLeadersCache`. Odds Insights writes to `atsLeadersCache` when it receives atsLeaders. Home initializes state from `atsLeadersCache` so ATS shows immediately on navigation when cache is populated.
- **No empty state** — If atsLeaders is empty, ATSLeaderboard shows "Loading ATS…" until cache or `fetchHome()` fills it (no blank box, no "No ATS data available").
- **Share ATS state** — If fresh cache exists (e.g. user visited Odds Insights first), Home reads from `getAtsLeadersCache()`, sets atsLoading false, and skips the network call; otherwise Home calls `fetchHome()` and updates state and cache. Dev: `console.log('home atsLeaders', data?.atsLeaders)` when `fetchHome()` resolves.

---

## Previous Changes (Feb 23, 2026)

**“Needed now” team data + batch + cache:**
- **Home** — Only `/api/home/fast` and `/api/home/slow`; no prefetch of all teams. Team data only for pinned teams after initial render.

**/api/home/slow timeouts (never hang):**
- **Strict timeouts** — Each upstream fetch has an 8s timeout (`withTimeout(promise, 8000)`). Overall handler must respond within 10s (`Promise.race` with 10s deadline).
- **On timeout** — If any fetch times out or overall deadline hits: return cached payload immediately if available, else empty arrays and `slowDataStatus`; set **slowTimeout: true** in response.
- **Optional** — If elapsed time exceeds 6s after fetches, skip odds-history for ATS and use cached ATS from `getAtsLeaders()` instead of computing (sets slowTimeout).
- **Response** — All responses include **slowTimeout** (true when timeouts occurred, false otherwise).

**Fix /api/home/slow crash (Cannot read properties of undefined reading 'DEV'):**
- **src/api/odds.js** — Replaced `import.meta.env.DEV` (undefined in Node/Vercel) with safe `const isDev = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production'`. Debug logging guarded by `isDev`.
- **api/home/slow.js** — Added `isDev`; guard `console.log` (atsLeaders cache count) behind `isDev`. No `.DEV` or undefined env access.

**ATS leaders cache reliability:**
- **/api/home/fast** — When ATS cache empty: (1) kick off warmAtsCache immediately, (2) one-time fallback job after 2s that recomputes ATS and writes to cache (even if warmer failed). Guard `inFlightAtsWarm` prevents duplicate fallback jobs. Response includes `atsLeadersCount`, `atsWarming`; when ATS cannot be computed (e.g. odds history empty), `atsWarming: false` and `atsUnavailableReason` (e.g. "odds history empty").
- **/api/home/slow** — Always calls `setAtsLeaders(atsLeaders)` after computing; logs count. Response includes `atsLeadersCount` and `atsCacheWrite: true` (false when cached). Cached response includes `atsLeadersCount` and `atsCacheWrite: false`.
- **cache.js** — `getAtsUnavailableReason` / `setAtsUnavailableReason` (short TTL) so fast can return reason when fallback determined ATS unavailable.
- **computeAtsLeadersFromSources** — Returns `{ best, worst, unavailableReason? }` when rankings or odds history empty.

**Cache warming (warm-up, flags, cron):**
- **/api/home/fast** — Warmers fire immediately when cache empty: `setTimeout(() => void warm(), 0)`. Dev-only logs for warm-up start/end. Response includes `atsWarming` and `headlinesWarming` when ATS/headlines empty. Warmers write to same `api/home/cache.js` instance fast reads from.
- **Vercel cron** — `vercel.json` cron hits `/api/home/slow` every 5 min (`*/5 * * * *`) to keep caches warm.
- **Home** — When `atsWarming`/`headlinesWarming`: ATS shows "Loading ATS…", News shows "Loading headlines…"; data status badges show "WARMING" (amber). mergeHomeData passes warming flags and clears when slow delivers data.

**ATS + Headlines in fast path; summary timing and fallback:**
- **/api/home/fast** — Now returns atsLeaders and headlines from shared server cache (`api/home/cache.js`). If cache empty, returns empty and triggers non-blocking warmers (ATS via `computeAtsLeadersFromSources()`, headlines via `fetchNewsAggregateSource`).
- **/api/home/slow** — Writes atsLeaders and headlines to shared cache after computing so fast can serve them next time.
- **Summary** — Generated after fast returns (ATS + headlines set, even if partial). Fallback prompt when ATS and headlines both empty: recap from scores + Top 25 and state "ATS and news are not available yet." Summary API sends `atsLeadersCount` in dataStatus.
- **One-time retry** — If first summary had no ATS/news, client triggers a single refresh (force=true) when slow delivers ATS/headlines; "Updating summary…" badge shown until retry finishes. Guard: once per page load.
- **Data status** — ATS/headlines MISSING if still empty after slow; otherwise OK. Home "Show data status" includes ATS badge.

- **/api/team/batch** — GET `?slugs=slug1,slug2,...` (max 5). Returns schedule, ATS, headlines per slug. Cache 7 min. Client: chunk slugs into 5, coalesce by key (`slugs.join(',')`), in-memory cache 5 min (return cached immediately, background refresh if stale). After fast renders, Home calls `fetchTeamBatch(pinnedSlugs)` (requestIdleCallback).
- **Staggered refresh** — One pinned team refreshed every 2.5s via `fetchTeamPage(slug)`; updates `pinnedTeamDataBySlug` so UI stays smooth.
- **PinnedTeamsSection** — Uses `pinnedTeamDataBySlug` from Home (batch + staggered); no per-slug fetch. Derives teamRecords and teamNews from batch data.
- **ATS leaderboard** — `atsLeadersCache.js`: show cached (5 min) first; if no cache show skeleton; when slow returns update cache and UI.
- **Team page** — Only `/api/team/:slug`; no other team data fetched unless user visits that team.
- **UI priority** — Summary + scores + rankings first; pinned team details and ATS after.

---

**Home fast + slow (stale-while-revalidate):**
- **/api/home/fast** — Returns scoresToday, scoresYesterday, rankingsTop25, atsLeaders, headlines, pinnedTeamsMeta, dataStatus. ATS + headlines from shared cache; warmers when cache empty. Cache 2 min.
- **/api/home/slow** — Returns headlines, odds, oddsHistory, atsLeaders (computed), pinnedTeamNews, upcomingGamesWithSpreads, slowDataStatus. Writes atsLeaders and headlines to shared cache. Cache 20 min.
- **Client** — Home page: `fetchHomeFast({ pinnedSlugs })` first → apply scores, rankings, dataStatus, pinned meta; then `fetchHomeSlow({ pinnedSlugs })` in background → merge with `mergeHomeData(fast, slow)`, merge games with odds, update state. Games, DailySchedule, Insights, NewsFeed still use `fetchHome()` (full /api/home).
- **mergeHomeData(fast, slow)** — Merges payloads; prefers slow for odds, headlines, ATS, pinnedTeamNews. Merged dataStatus from fast + slow.
- **UX** — ATSLeaderboard shows “Loading ATS…” when `slowLoading` and no atsLeaders; partial data (scores without spreads) shown immediately.

---

**Team page runtime fix (ReferenceError: past is not defined):**
- **TeamSchedule.jsx** — Defined `pastGames` from `events` (filter isFinal, sort by date desc) and use it for the Past section; `past` was referenced but never defined. Added `eventsList = Array.isArray(events) ? events : []` and derive `pastGames`/`upcoming` from it; guard upcoming render with `Array.isArray(upcoming) && upcoming.length > 0`. Missing schedule data no longer crashes.

---

**API consolidation (≤12 serverless / Hobby plan):**
- **Removed standalone routes:** `/api/scores`, `/api/rankings`, `/api/odds`, `/api/odds-history`, `/api/news/aggregate`, `/api/news/team/[slug]`, `/api/teamIds`, `/api/schedule/[teamId]`. All behavior moved into `/api/home` and `/api/team/[slug]` via `api/_sources.js` (no HTTP between APIs).
- **Client:** Home, Games, DailySchedule, Insights, NewsFeed use only `fetchHome()`. Team page and PinnedTeamsSection use only `fetchTeamPage(slug)` for schedule/oddsHistory/records/ATS. Summary endpoints unchanged.
- **Client API cleanup:** Removed `src/api/scores.js`, `src/api/rankings.js`, `src/api/teamIds.js`, `src/api/schedule.js`, `src/api/news.js`. `src/api/odds.js` keeps only `mergeGamesWithOdds`, `matchOddsHistoryToEvent`, `matchOddsHistoryToGame`.
- **Components:** PinnedTeamsSection receives `rankMap`, `games`, `teamNewsBySlug` from Home; records/ATS via `fetchTeamPage(slug)` per pinned team. TeamSchedule and MaximusInsight use `initialData` or `fetchTeamPage(slug)` only (no rankings/teamIds/schedule/odds fetches).
- **Optional:** `/api/health` GET returns `{ ok: true, timestamp }`.
- **STATUS.md** updated for consolidated API and key files.

---

**Games page — Key Dates compact; Today's Scores (renamed) + rankings:**
- **Key Dates** — Tighter grid (reduced gap/padding), smaller card padding and line-height; remains readable and compact.
- **Today's Scores** (renamed from Live Scores) — Shown only when there is at least one live or in-progress game. Header: “Today's Scores — &lt;date&gt; (PST)” (e.g. Feb 23, 2025); vivid accent header + LIVE pill. Each team shows **AP rank** next to name (#rank, same styling as Daily Schedule); Games page fetches rankings and passes `rankMap` to LiveScores.
- **Daily Schedule** — Directly below Key Dates when Today's Scores is hidden, or below Today's Scores when present.

**Team page — Maximus’s Insight (streaming, chat bubble) + ATS section:**
- **Layout** — Render order: (1) **TeamSummaryBox** in `<section className={insightSection} aria-label="Maximus's Insight">` so the chat bubble is the top section and always mounted; (2) **ATS** in `<section aria-label="ATS">`; (3) News feed; (4) Schedule. Chat/speech bubble style (same as Home recap); mascot in header.
- **Insight content (ChatGPT)** — Uses only data already loaded on the Team page. Covers: (1) **Upcoming games + spreads**, (2) **NCAA tier/tournament prospects** (from team tier: Lock, Should be in, Work to do, Long shot), (3) **Latest record + ATS performance** (recent W–L and ATS trends), (4) **2–3 sentences** summarizing latest team-specific news.
- **Streaming** — Team insight **streams** like the Home summary. **SSE** via `POST /api/summary/team?stream=true`; **typing cursor** (▌) shown while streaming; throttled flush (80ms) for readable reveal.
- **Refresh** — **Refresh** button in the insight box; **cache 30 min** per team; **Refresh bypasses cache** (`?force=true`).
- **Data source** — Payload built from existing Team page state: `buildTeamSummaryPayload({ team, schedule, ats, news })` includes `tier: team?.oddsTier`; no refetch of ESPN/Odds/News inside the summary API.

**Team Summary API (`/api/summary/team`):**
- **Payload** — `teamName`, `tier`, `upcomingGames`, `lastWeek`, `atsSummary`, `headlines` (and optional `slug`). No external API calls.
- **Streaming** — `?stream=true` → SSE (chunks `{ text }`, then `{ done, updatedAt }`). `?force=true` bypasses cache. Cache hit when not forcing returns cached text in one event.
- **Prompt** — System: concise sports analyst; include upcoming games with spreads, NCAA tier/prospects, record + ATS, 2–3 sentences news; conversational. User: Team + tier + JSON for upcoming, last week, ATS, headlines.
- **Client** — `fetchTeamSummaryStream({ slug, payload }, { force, onMessage })` for Team page; pinned cards use non-streaming `fetchTeamSummary`.

---

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

**Vercel ESM import fix (src/utils + src/api):**
- **ESM requires .js in import paths** — In `src/utils/teamSlug.js`, `rankingsNormalize.js`, and `teamIdMap.js`, all relative imports include the `.js` extension. In `src/api/odds.js`, the import from `../utils/teamSlug` is now `../utils/teamSlug.js`. Fixes `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/utils/teamSlug'` (and similar) on Vercel serverless.

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
