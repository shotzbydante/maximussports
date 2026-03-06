/**
 * Shared data sources for /api/home and /api/team.
 * Used in-place of standalone endpoints. All use _cache.js for TTL + coalesce.
 */

import { createCache, coalesce } from './_cache.js';
import { getJson, setJson } from './_globalCache.js';

const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const ESPN_RANKINGS_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings';
const ESPN_TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400';
const ESPN_SCHEDULE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams';
const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds';
const ODDS_HISTORY_BASE = 'https://api.the-odds-api.com/v4/historical/sports/basketball_ncaab/odds';

const CACHE_SCORES_MS = 3 * 60 * 1000;
const CACHE_RANKINGS_MS = 5 * 60 * 1000;
const CACHE_ODDS_MS = 10 * 60 * 1000;
const CACHE_ODDS_HISTORY_MS = 20 * 60 * 1000;
const CACHE_TEAM_IDS_MS = 10 * 60 * 1000;
const CACHE_SCHEDULE_MS = 5 * 60 * 1000;
const CACHE_NEWS_TEAM_MS = 10 * 60 * 1000;
const CACHE_NEWS_AGG_MS = 20 * 60 * 1000;

const scoresCache = createCache(CACHE_SCORES_MS);
const rankingsCache = createCache(CACHE_RANKINGS_MS);
const oddsCache = createCache(CACHE_ODDS_MS);
const oddsHistoryCache = createCache(CACHE_ODDS_HISTORY_MS);
const teamIdsCache = createCache(CACHE_TEAM_IDS_MS);
const scheduleCache = createCache(CACHE_SCHEDULE_MS);
const newsTeamCache = createCache(CACHE_NEWS_TEAM_MS);
const newsAggCache = createCache(CACHE_NEWS_AGG_MS);

// --- Scores ---
function getGameStatus(status) {
  if (!status) return 'Scheduled';
  const { type, displayClock, period } = status;
  const name = type?.name || '';
  if (name === 'STATUS_FINAL' || name === 'STATUS_POSTPONED') return status.type?.description || 'Final';
  if (name === 'STATUS_HALFTIME') return 'Halftime';
  if (name === 'STATUS_IN_PROGRESS' && displayClock != null && period != null) {
    const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : `Q${period}`;
    return `${periodLabel} ${displayClock}`;
  }
  return status.type?.description || status.type?.shortDetail || 'Scheduled';
}

function getNetwork(comp) {
  const broadcasts = comp?.broadcasts;
  if (!Array.isArray(broadcasts) || broadcasts.length === 0) return null;
  const first = broadcasts[0];
  const names = first?.names;
  return Array.isArray(names) && names.length > 0 ? names[0] : null;
}

function getVenue(comp) {
  const venue = comp?.venue;
  return venue ? (venue.fullName || venue.name || null) : null;
}

export async function fetchScoresSource(dateStr = null) {
  const cacheKey = `scores:${dateStr || 'default'}`;
  const cached = scoresCache.get(cacheKey);
  if (cached) return cached;

  const games = await coalesce(cacheKey, async () => {
    const url = dateStr
      ? `${ESPN_SCOREBOARD_URL}?dates=${String(dateStr).replace(/-/g, '')}`
      : ESPN_SCOREBOARD_URL;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN scores: ${res.status}`);
    const data = await res.json();
    const events = data?.events || [];
    return events.map((event) => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      const status = comp?.status || event?.status;
      return {
        gameId: event.id,
        homeTeam: home?.team?.displayName || home?.team?.shortDisplayName || 'TBD',
        awayTeam: away?.team?.displayName || away?.team?.shortDisplayName || 'TBD',
        homeScore: home?.score != null ? String(home.score) : null,
        awayScore: away?.score != null ? String(away.score) : null,
        gameStatus: getGameStatus(status),
        startTime: event.date || comp?.date || null,
        network: getNetwork(comp),
        venue: getVenue(comp),
      };
    });
  });

  scoresCache.set(cacheKey, games);
  return games;
}

// --- Rankings ---
export async function fetchRankingsSource() {
  const key = 'rankings';
  const cached = rankingsCache.get(key);
  if (cached) return cached;

  const result = await coalesce(key, async () => {
    const res = await fetch(ESPN_RANKINGS_URL);
    if (!res.ok) throw new Error(`ESPN rankings: ${res.status}`);
    const data = await res.json();
    const pollList = data?.rankings || [];
    const apPoll = pollList.find((p) => (p.type || '').toLowerCase() === 'ap') || pollList[0];
    const ranks = apPoll?.ranks || [];
    return {
      rankings: ranks.map((r) => {
        const team = r.team || {};
        const teamName = [team.location, team.name].filter(Boolean).join(' ').trim() || 'Unknown';
        return { teamName, rank: r.current ?? r.rank ?? null, teamId: team.id ? String(team.id) : null };
      }),
    };
  });

  rankingsCache.set(key, result);
  return result;
}

// --- Odds ---

/**
 * Loose name match for outcome.name vs team name from Odds API.
 * Handles cases where outcome names are substrings or superstrings of event team names.
 */
function outcomeTeamMatch(outcomeName, teamName) {
  if (!outcomeName || !teamName) return false;
  const a = outcomeName.toLowerCase().trim();
  const b = teamName.toLowerCase().trim();
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Extract odds from bookmakers array.
 * @param {Array} bookmakers
 * @param {string} [homeTeamName] – event home_team for correct spread attribution
 * @param {string} [awayTeamName] – event away_team for correct spread attribution
 * Returns:
 *   homeSpread {number|null} – home team's spread (negative = home favored)
 *   awaySpread {number|null} – away team's spread (positive = away is underdog)
 *   spread     {string|null} – legacy: homeSpread as a formatted string ("-3" / "+3")
 */
function extractOdds(bookmakers, homeTeamName, awayTeamName) {
  let homeSpread = null;
  let awaySpread = null;
  let total = null;
  let moneyline = null;
  let sportsbook = null;
  for (const bm of bookmakers || []) {
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads' && mkt.outcomes?.length >= 2) {
        // Match each outcome to home or away team by name
        for (const oc of mkt.outcomes) {
          if (oc.point == null) continue;
          if (homeTeamName && outcomeTeamMatch(oc.name, homeTeamName)) {
            homeSpread = oc.point;
          } else if (awayTeamName && outcomeTeamMatch(oc.name, awayTeamName)) {
            awaySpread = oc.point;
          }
        }
        // Fallback: if name matching failed, use first outcome as home team's spread
        if (homeSpread === null && awaySpread === null) {
          const first = mkt.outcomes.find((o) => o.point != null);
          if (first) homeSpread = first.point;
        }
        // Derive the missing side by sign inversion (spreads always sum to ~0)
        if (homeSpread !== null && awaySpread === null) awaySpread = -homeSpread;
        if (awaySpread !== null && homeSpread === null) homeSpread = -awaySpread;
        sportsbook = sportsbook || bm.title;
      }
      if (mkt.key === 'totals' && mkt.outcomes?.length >= 2) {
        const over = mkt.outcomes.find((o) => o.name === 'Over');
        if (over?.point != null) {
          total = over.point;
          sportsbook = sportsbook || bm.title;
        }
      }
      if (mkt.key === 'h2h' && mkt.outcomes?.length >= 2) {
        const outcomes = mkt.outcomes;
        const prices = outcomes.map((o) => (o.price != null ? (o.price > 0 ? `+${o.price}` : String(o.price)) : null)).filter(Boolean);
        if (prices.length >= 2) {
          moneyline = `${prices[0]} / ${prices[1]}`;
          sportsbook = sportsbook || bm.title;
        }
      }
    }
    if (homeSpread != null && total != null) break;
  }
  // Legacy `spread` field: home team's spread as a formatted string (backward compat)
  const spread = homeSpread != null
    ? (homeSpread > 0 ? `+${homeSpread}` : String(homeSpread))
    : null;
  return { spread, homeSpread, awaySpread, total, moneyline, sportsbook };
}

export async function fetchOddsSource(params = {}) {
  const apiKey = process.env.ODDS_API_KEY;
  const hasOddsKey = !!apiKey;
  if (!apiKey) {
    return { games: [], error: 'missing_key', hasOddsKey: false };
  }

  const { date: dateParam } = params;
  const cacheKey = `odds:${dateParam || 'default'}`;
  const cached = oddsCache.get(cacheKey);
  if (cached) return cached;

  const result = await coalesce(cacheKey, async () => {
    const searchParams = new URLSearchParams({
      regions: 'us',
      markets: 'spreads,totals,h2h',
      oddsFormat: 'american',
      dateFormat: 'iso',
      apiKey,
    });
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      searchParams.set('commenceTimeFrom', `${dateParam}T00:00:00Z`);
      searchParams.set('commenceTimeTo', `${dateParam}T23:59:59Z`);
    }
    const tryMarkets = ['spreads,totals,h2h', 'spreads,totals', 'spreads'];
    let raw = [];
    for (const markets of tryMarkets) {
      searchParams.set('markets', markets);
      const res = await fetch(`${ODDS_BASE}?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Odds API: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected Odds API response');
      raw = data;
      if (raw.length > 0) break;
    }
    const games = raw.map((ev) => {
      const { spread, homeSpread, awaySpread, total, moneyline, sportsbook } =
        extractOdds(ev.bookmakers, ev.home_team, ev.away_team);
      return {
        gameId: ev.id,
        homeTeam: ev.home_team,
        awayTeam: ev.away_team,
        commenceTime: ev.commence_time,
        spread,
        homeSpread: homeSpread ?? null,
        awaySpread: awaySpread ?? null,
        total: total != null ? String(total) : null,
        moneyline,
        sportsbook: sportsbook || 'Odds API',
      };
    });
    return { games, hasOddsKey: true };
  });

  oddsCache.set(cacheKey, result);
  return result;
}

// --- Odds History ---
function chunkDateRange(fromStr, toStr, maxDays = 31) {
  const chunks = [];
  let start = new Date(fromStr);
  const end = new Date(toStr);
  while (start <= end) {
    const chunkEnd = new Date(start);
    chunkEnd.setDate(chunkEnd.getDate() + (maxDays - 1));
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      from: start.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    start = new Date(chunkEnd);
    start.setDate(start.getDate() + 1);
  }
  return chunks;
}

function getDaysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T12:00:00Z');
  const to = new Date(toStr + 'T12:00:00Z');
  const days = [];
  const cur = new Date(from);
  while (cur <= to) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function extractSpread(bookmakers) {
  for (const bm of bookmakers || []) {
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads' && mkt.outcomes?.length >= 2) {
        const awayOutcome = mkt.outcomes.find((o) => o.point != null);
        if (awayOutcome) {
          const pt = awayOutcome.point;
          return { spread: pt > 0 ? `+${pt}` : String(pt), sportsbook: bm.title || 'Odds API' };
        }
      }
    }
  }
  return { spread: null, sportsbook: null };
}

// ── Odds-history KV caching ───────────────────────────────────────────────────
// Each calendar-day's odds are cached in Vercel KV so repeated refreshes skip
// upstream API calls entirely.  Past-game spreads never change, so a long TTL
// is safe.  Writes are fire-and-forget (.catch(()=>{})) so a KV outage never
// blocks the compute path.
const KV_ODDS_DAY_KEY = (day) => `odds:history:ncaab:${day}`;
const KV_ODDS_DAY_TTL_SEC = 8 * 60 * 60; // 8 hours

// Batch of parallel API requests for dates NOT in KV.
// 4 is enough to cut 30-day fetch to ~3 batches; smaller batches are gentler
// on the upstream rate limiter.
const ODDS_HISTORY_BATCH = 4;
const ODDS_HISTORY_BATCH_DELAY_MS = 100; // pause between API batches

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function eventsToGames(events) {
  const games = [];
  for (const ev of (Array.isArray(events) ? events : events?.data ?? [])) {
    const { spread, sportsbook } = extractSpread(ev.bookmakers);
    if (spread == null) continue;
    games.push({
      gameId: ev.id,
      homeTeam: ev.home_team,
      awayTeam: ev.away_team,
      commenceTime: ev.commence_time,
      spread,
      sportsbook: sportsbook || 'Odds API',
    });
  }
  return games;
}

async function fetchOddsHistoryChunk(apiKey, fromStr, toStr) {
  const cacheKey = `odds-history:${fromStr}:${toStr}`;
  const memCached = oddsHistoryCache.get(cacheKey);
  if (memCached) return memCached;

  const days = getDaysBetween(fromStr, toStr);
  const gameMap = new Map();
  let firstErrorStatus = null;
  let cacheHits = 0;
  let cacheMisses = 0;

  // ── Step 1: parallel KV reads for all days ──────────────────────────────
  const kvResults = await Promise.allSettled(
    days.map((day) => getJson(KV_ODDS_DAY_KEY(day)).catch(() => null))
  );

  const missingDays = [];
  for (let i = 0; i < days.length; i++) {
    const kvVal = kvResults[i].status === 'fulfilled' ? kvResults[i].value : null;
    if (kvVal?.games != null) {
      cacheHits++;
      for (const g of kvVal.games) {
        const k = `${g.gameId || ''}-${g.commenceTime || ''}`.trim() || `${g.homeTeam}-${g.awayTeam}-${g.commenceTime}`;
        if (!gameMap.has(k)) gameMap.set(k, g);
      }
    } else {
      cacheMisses++;
      missingDays.push(days[i]);
    }
  }

  // ── Step 2: batch-fetch API only for KV misses ──────────────────────────
  for (let i = 0; i < missingDays.length; i += ODDS_HISTORY_BATCH) {
    if (i > 0) await delay(ODDS_HISTORY_BATCH_DELAY_MS);
    const batch = missingDays.slice(i, i + ODDS_HISTORY_BATCH);

    const settled = await Promise.allSettled(
      batch.map(async (day) => {
        const params = new URLSearchParams({
          regions: 'us',
          markets: 'spreads',
          oddsFormat: 'american',
          dateFormat: 'iso',
          date: `${day}T23:59:59Z`,
          apiKey,
        });
        const res = await fetch(`${ODDS_HISTORY_BASE}?${params.toString()}`);
        if (!res.ok) {
          throw Object.assign(
            new Error(res.status === 402 || res.status === 429
              ? 'Odds API historical requires paid plan'
              : `Odds history: ${res.status}`),
            { httpStatus: res.status, day }
          );
        }
        const raw = await res.json();
        const games = eventsToGames(raw);
        // Write to KV (fire-and-forget — safe if KV unavailable)
        setJson(KV_ODDS_DAY_KEY(day), { games }, { exSeconds: KV_ODDS_DAY_TTL_SEC }).catch(() => {});
        return games;
      })
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        for (const g of outcome.value) {
          const k = `${g.gameId || ''}-${g.commenceTime || ''}`.trim() || `${g.homeTeam}-${g.awayTeam}-${g.commenceTime}`;
          if (!gameMap.has(k)) gameMap.set(k, g);
        }
      } else {
        const err = outcome.reason;
        if (!firstErrorStatus) firstErrorStatus = err?.httpStatus ?? 'unknown';
        if (err?.message?.includes('paid plan')) {
          throw Object.assign(new Error(err.message), { httpStatus: err?.httpStatus ?? 402 });
        }
      }
    }
  }

  const result = {
    games: Array.from(gameMap.values()),
    _firstErrorStatus: firstErrorStatus,
    _cacheHits: cacheHits,
    _cacheMisses: cacheMisses,
  };
  oddsHistoryCache.set(cacheKey, result);
  return result;
}

export async function fetchOddsHistorySource(fromStr, toStr) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return {
      games: [], error: 'missing_key', hasOddsKey: false,
      meta: { fromStr, toStr, gamesCount: 0, errorCode: 'missing_key', oddsCacheHits: 0, oddsCacheMisses: 0 },
    };
  }

  const fullKey = `odds-history-full:${fromStr}:${toStr}`;
  const fullCached = oddsHistoryCache.get(fullKey);
  if (fullCached) return fullCached;

  try {
    const chunks = chunkDateRange(fromStr, toStr, 31);
    const gameMap = new Map();
    let firstErrorStatus = null;
    let totalHits = 0;
    let totalMisses = 0;

    for (const chunk of chunks) {
      const chunkResult = await fetchOddsHistoryChunk(apiKey, chunk.from, chunk.to);
      for (const g of chunkResult.games || []) {
        const key = `${g.gameId || ''}-${g.commenceTime || ''}`.trim() || `${g.homeTeam}-${g.awayTeam}-${g.commenceTime}`;
        if (!gameMap.has(key)) gameMap.set(key, g);
      }
      if (!firstErrorStatus && chunkResult._firstErrorStatus) firstErrorStatus = chunkResult._firstErrorStatus;
      totalHits += chunkResult._cacheHits ?? 0;
      totalMisses += chunkResult._cacheMisses ?? 0;
    }

    const games = Array.from(gameMap.values());
    const result = {
      games,
      hasOddsKey: true,
      meta: {
        fromStr,
        toStr,
        gamesCount: games.length,
        errorCode: firstErrorStatus != null ? `partial_http_${firstErrorStatus}` : null,
        oddsCacheHits: totalHits,
        oddsCacheMisses: totalMisses,
      },
    };
    oddsHistoryCache.set(fullKey, result);
    return result;
  } catch (err) {
    const errorCode = err.message?.includes('paid plan') ? 'paid_plan_required' : 'fetch_error';
    return {
      games: [],
      error: err.message,
      hasOddsKey: true,
      meta: {
        fromStr, toStr, gamesCount: 0,
        errorCode, httpStatus: err?.httpStatus ?? null,
        oddsCacheHits: 0, oddsCacheMisses: 0,
      },
    };
  }
}

// --- Team IDs ---
const TEAM_ID_OVERRIDES = {
  'michigan-wolverines': '130', 'purdue-boilermakers': '2509', 'illinois-fighting-illini': '356',
  'nebraska-cornhuskers': '158', 'michigan-state-spartans': '127', 'wisconsin-badgers': '275',
  'iowa-hawkeyes': '2294', 'indiana-hoosiers': '84', 'ohio-state-buckeyes': '194',
  'ucla-bruins': '26', 'usc-trojans': '30', 'washington-huskies': '264', 'uconn-huskies': '41',
  'tulsa-golden-hurricane': '202', 'liberty-flames': '2335', 'mcneese-cowboys': '2377',
  'grand-canyon-lopes': '166', 'dayton-flyers': '2126', 'south-florida-bulls': '58',
  'belmont-bruins': '2057', 'nevada-wolf-pack': '2440', 'boise-state-broncos': '68',
  'santa-clara-broncos': '221', 'new-mexico-lobos': '167', 'vcu-rams': '2670',
};

export async function fetchTeamIdsSource() {
  const key = 'teamIds';
  const cached = teamIdsCache.get(key);
  if (cached) return cached;

  const result = await coalesce(key, async () => {
    const { getTeamSlug } = await import('../src/utils/teamSlug.js');
    const { TEAMS } = await import('../src/data/teams.js');
    const out = {};
    for (const [slug, id] of Object.entries(TEAM_ID_OVERRIDES)) {
      if (TEAMS.some((t) => t.slug === slug)) out[slug] = String(id);
    }
    const res = await fetch(ESPN_TEAMS_URL);
    if (!res.ok) return { slugToId: out };
    const data = await res.json();
    for (const sport of data?.sports || []) {
      for (const league of sport?.leagues || []) {
        for (const t of league?.teams || []) {
          const team = t?.team || t;
          const id = team?.id ? String(team.id) : null;
          if (!id) continue;
          const displayName = team?.displayName || '';
          const location = team?.location || '';
          const name = team?.name || '';
          const shortDisplayName = team?.shortDisplayName || '';
          const variants = [
            displayName,
            [location, name].filter(Boolean).join(' '),
            shortDisplayName,
            [shortDisplayName, name].filter(Boolean).join(' '),
          ].filter(Boolean);
          let slug = null;
          for (const v of variants) {
            slug = getTeamSlug(v);
            if (slug) break;
          }
          if (slug && !out[slug]) out[slug] = id;
        }
      }
    }
    return { slugToId: out };
  });

  teamIdsCache.set(key, result);
  return result;
}

// --- Schedule ---
function toScore(val) {
  if (val == null) return null;
  if (typeof val === 'number' && !isNaN(val)) return String(val);
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    const v = val.displayValue ?? val['#text'] ?? val.value;
    if (v != null) return String(v);
  }
  return null;
}

export async function fetchScheduleSource(teamId) {
  const cacheKey = `schedule:${teamId}`;
  const cached = scheduleCache.get(cacheKey);
  if (cached) return cached;

  const result = await coalesce(cacheKey, async () => {
    const res = await fetch(`${ESPN_SCHEDULE_BASE}/${teamId}/schedule`);
    if (!res.ok) throw new Error(`ESPN schedule: ${res.status}`);
    const data = await res.json();
    const rawEvents = data?.events || [];
    const events = rawEvents.map((ev) => {
      const comp = ev?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      const status = comp?.status || ev?.status;
      const statusType = status?.type?.name || '';
      const isFinal = statusType === 'STATUS_FINAL' || statusType === 'STATUS_POSTPONED';
      const homeTeam = home?.team?.displayName || home?.team?.shortDisplayName || 'TBD';
      const awayTeam = away?.team?.displayName || away?.team?.shortDisplayName || 'TBD';
      const homeScore = toScore(home?.score);
      const awayScore = toScore(away?.score);
      const homeId = home?.team?.id;
      const homeAway = homeId === String(teamId) ? 'home' : 'away';
      const opponent = homeAway === 'home' ? awayTeam : homeTeam;
      const ourScore = homeAway === 'home' ? homeScore : awayScore;
      const oppScore = homeAway === 'home' ? awayScore : homeScore;
      return {
        id: ev.id,
        date: ev.date || comp?.date || null,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        status: status?.type?.description || status?.type?.shortDetail || 'Scheduled',
        statusType,
        isFinal,
        venue: comp?.venue?.fullName || comp?.venue?.name || null,
        homeAway,
        opponent,
        ourScore,
        oppScore,
      };
    });
    return { events };
  });

  scheduleCache.set(cacheKey, result);
  return result;
}

// --- News (team) ---
export async function fetchTeamNewsSource(slug, { debug = false } = {}) {
  const cacheKey = `news-team:${slug}`;
  const cached = newsTeamCache.get(cacheKey);
  if (cached) {
    if (debug) console.log(`[teamNews:${slug}] cache HIT — ${cached.headlines?.length ?? 0} items`);
    return cached;
  }

  const { getTeamBySlug } = await import('../src/data/teams.js');
  const { isMensBasketball, isMensBasketballLoose } = await import('./news/filters.js');
  const team = getTeamBySlug(slug);
  if (!team) {
    if (debug) console.log(`[teamNews:${slug}] team not found`);
    return { headlines: [] };
  }

  const result = await coalesce(cacheKey, async () => {
    const name = team.name;
    // Include "basketball" in the query so Google News returns basketball-contextual articles.
    // This significantly improves the signal-to-noise ratio before client-side filtering.
    const query = encodeURIComponent(`"${name}" basketball when:90d`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    if (debug) console.log(`[teamNews:${slug}] query="${decodeURIComponent(query)}" url=${rssUrl}`);
    let res;
    try {
      res = await fetch(rssUrl, {
        headers: { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)' },
      });
    } catch (fetchErr) {
      if (debug) console.log(`[teamNews:${slug}] fetch error:`, fetchErr.message);
      return { headlines: [] };
    }
    if (debug) console.log(`[teamNews:${slug}] HTTP status=${res.status}`);
    if (!res.ok) return { headlines: [] };
    const xml = await res.text();
    const { XMLParser } = await import('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item;
    const raw = Array.isArray(items) ? items : items ? [items] : [];
    if (debug) console.log(`[teamNews:${slug}] raw items=${raw.length}`);

    const sourceStr = (item) => (item.source && (item.source['#text'] || item.source)) || '';
    const linkStr = (item) => item.link || '';

    // Primary filter: strict MBB (requires basketball/MBB/hoops keyword in title)
    let filtered = raw.filter((item) => isMensBasketball(item.title || '', sourceStr(item), linkStr(item)));

    // Fallback: if the strict filter removes everything, try the loose filter.
    // Since we already searched with "basketball" in the query, the loose filter is safe.
    if (filtered.length === 0 && raw.length > 0) {
      filtered = raw.filter((item) => isMensBasketballLoose(item.title || '', sourceStr(item), linkStr(item)));
      if (debug) console.log(`[teamNews:${slug}] strict filter empty → loose filter → ${filtered.length} items`);
    }

    if (debug) console.log(`[teamNews:${slug}] after filter=${filtered.length}`);
    filtered.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    const headlines = filtered.slice(0, 10).map((item, i) => ({
      id: item.guid?.['#text'] || item.link || `news-${i}`,
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: (item.source && (item.source['#text'] || item.source)) || 'News',
    }));
    return { headlines };
  });

  newsTeamCache.set(cacheKey, result);
  return result;
}

// --- News (aggregate) ---
export async function fetchNewsAggregateSource(options = {}) {
  const { includeNational = true } = options;
  const cacheKey = `news-agg:${includeNational}`;
  const cached = newsAggCache.get(cacheKey);
  if (cached) return cached;

  const { getTeamBySlug } = await import('../src/data/teams.js');
  const { NATIONAL_FEEDS } = await import('../src/data/newsSources.js');
  const { isMensBasketball, isMensBasketballLoose } = await import('./news/filters.js');
  const HEADERS = { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)', Accept: 'application/rss+xml, application/xml, text/xml' };

  const result = await coalesce(cacheKey, async () => {
    let items = [];
    if (includeNational && NATIONAL_FEEDS?.length > 0) {
      const settled = await Promise.allSettled(
        NATIONAL_FEEDS.slice(0, 5).map(async (f) => {
          const res = await fetch(f.url, { headers: HEADERS });
          if (!res.ok) return [];
          const xml = await res.text();
          const { XMLParser } = await import('fast-xml-parser');
          const parser = new XMLParser({ ignoreAttributes: false });
          const parsed = parser.parse(xml);
          const channel = parsed?.rss?.channel || parsed?.feed;
          const rawItems = channel?.item || channel?.entry;
          const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
          return list.map((item) => ({
            title: (item?.title?.['#text'] || item?.title || 'No title').trim(),
            link: item?.link?.['#text'] || item?.link?.['@_href'] || item?.link || '',
            pubDate: item?.pubDate || item?.published || item?.updated || '',
            source: f.name || 'News',
          }));
        })
      );
      const all = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
      let filtered = all.filter((item) => isMensBasketball(item.title, item.source, item.link));
      if (filtered.length === 0 && all.length > 0) filtered = all.filter((item) => isMensBasketballLoose(item.title, item.source, item.link));
      const seen = new Set();
      items = filtered.filter((item) => {
        const key = item.link || `${item.title}-${item.pubDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    }
    return { items };
  });

  newsAggCache.set(cacheKey, result);
  return result;
}
