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
        homeLogo: home?.team?.logo || null,
        awayLogo: away?.team?.logo || null,
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
        const recItems = team.record?.items ?? r.recordSummary ? [{ summary: r.recordSummary }] : [];
        const recordSummary = recItems[0]?.summary ?? r.recordSummary ?? null;
        return { teamName, rank: r.current ?? r.rank ?? null, teamId: team.id ? String(team.id) : null, recordSummary };
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
  let overPrice = null;
  let underPrice = null;
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
        const under = mkt.outcomes.find((o) => o.name === 'Under');
        if (over?.point != null) {
          total = over.point;
          overPrice = over.price ?? null;
          underPrice = under?.price ?? null;
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
    if (homeSpread != null && total != null && moneyline != null) break;
  }
  // Legacy `spread` field: home team's spread as a formatted string (backward compat)
  const spread = homeSpread != null
    ? (homeSpread > 0 ? `+${homeSpread}` : String(homeSpread))
    : null;
  return { spread, homeSpread, awaySpread, total, overPrice, underPrice, moneyline, sportsbook };
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
      const { spread, homeSpread, awaySpread, total, overPrice, underPrice, moneyline, sportsbook } =
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
        overPrice: overPrice ?? null,
        underPrice: underPrice ?? null,
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

function _espnSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

function _shapeScheduleEvents(rawEvents, teamId) {
  return rawEvents.map((ev) => {
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
    const seasonType = ev?.season?.type ?? ev?.seasonType ?? null;
    const evName = ev?.name || ev?.shortName || '';
    const compNotes = (comp?.notes || []).map((n) => n.headline || n.text || '').filter(Boolean);
    const oppTeam = homeAway === 'home' ? away : home;
    const broadcast = getNetwork(comp) || null;
    const evLinks = ev?.links || [];
    const gcLink = evLinks.find((l) => Array.isArray(l.rel) && l.rel.some((r) => r === 'summary' || r === 'gamecast'));
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
      seasonType,
      eventName: evName,
      notes: compNotes,
      broadcast,
      gamecastUrl: gcLink?.href || null,
      opponentLogo: oppTeam?.team?.logo || null,
      opponentId: oppTeam?.team?.id ? String(oppTeam.team.id) : null,
    };
  });
}

export async function fetchScheduleSource(teamId) {
  const cacheKey = `schedule:${teamId}`;
  const cached = scheduleCache.get(cacheKey);
  if (cached) return cached;

  const result = await coalesce(cacheKey, async () => {
    const seasonYear = _espnSeasonYear();
    const baseUrl = `${ESPN_SCHEDULE_BASE}/${teamId}/schedule`;

    const res = await fetch(`${baseUrl}?season=${seasonYear}`);
    if (!res.ok) throw new Error(`ESPN schedule: ${res.status}`);
    const data = await res.json();

    const teamRecord = data?.team?.recordSummary || null;
    const standingSummary = data?.team?.standingSummary || null;

    let rawEvents = data?.events || [];
    let events = _shapeScheduleEvents(rawEvents, teamId);

    const preMarchCount = events.filter((e) => e.date && e.date.slice(0, 10) < '2026-03-01').length;
    if (preMarchCount < 10 && events.length < 20) {
      try {
        const regRes = await fetch(`${baseUrl}?season=${seasonYear}&seasontype=2`);
        if (regRes.ok) {
          const regData = await regRes.json();
          const regRaw = regData?.events || [];
          const existingIds = new Set(events.map((e) => e.id));
          const regShaped = _shapeScheduleEvents(regRaw, teamId);
          events = [...events, ...regShaped.filter((e) => !existingIds.has(e.id))];
        }
      } catch { /* non-fatal: continue with existing events */ }
    }

    return { events, teamRecord, standingSummary };
  });

  scheduleCache.set(cacheKey, result);
  return result;
}

// --- News (team) — quality-ranked ---

/**
 * Watch-spam detector: "how to watch", "where to watch", TV channel, live stream, etc.
 * Returns true if the headline is watch/broadcast spam.
 */
function isWatchSpam(title) {
  const t = (title || '').toLowerCase();
  return [
    'how to watch', 'where to watch', 'tv channel', 'live stream', 'streaming options',
    'streaming guide', 'watch online', 'stream live', 'broadcast guide', 'how to stream',
    'ways to watch', 'free stream', 'watch free', 'cord-cutting',
  ].some((p) => t.includes(p));
}

/**
 * Analysis-intent boost: recaps, previews, analysis, injuries, roster moves, outlook.
 * Returns a positive score if the headline signals real editorial news value.
 */
function analysisBoost(title) {
  const t = (title || '').toLowerCase();
  const highSignal = [
    'preview', 'recap', 'takeaways', 'analysis', 'grade', 'report card',
    'breaking', 'just in', 'report:', 'sources say', 'per sources', 'breaking:',
    'injury', 'injured', 'out for', 'questionable', 'doubtful', 'suspended',
    'outlook', 'bracketology', 'tournament', 'march madness', 'bubble',
    'transfer', 'portal', 'signing', 'commit', 'coaching', 'fired', 'hired',
    'post-game', 'postgame', 'halftime', 'overtime', 'upset', 'ranked',
    'milestone', 'record', 'streak', 'losing streak', 'winning streak',
    'key matchup', 'rivalry', 'top 25', 'ap poll', 'poll', 'seed',
    'big ten', 'acc ', 'sec ', 'big east', 'big 12',
    'draft', 'nba draft', 'mock draft', 'projected',
    'exclusive', 'insider', 'deep dive', 'breakdown',
  ];
  if (highSignal.some((p) => t.includes(p))) return 40;
  const mediumSignal = [
    'power rankings', 'standings', 'conference', 'matchup', 'highlights',
    'what to know', 'what we learned', 'best players', 'player of',
    'coach of', 'team of', 'awards', 'all-american',
  ];
  if (mediumSignal.some((p) => t.includes(p))) return 20;
  return 0;
}

/**
 * Source reputation boost — familiar credible sources get a score lift.
 */
function sourceRepBoost(source) {
  const s = (source || '').toLowerCase();
  const tier1 = ['espn', 'cbs sports', 'the athletic', 'associated press', 'ap news'];
  const tier2 = ['yahoo sports', 'usa today', 'sports illustrated', 'si.com', 'bleacher report',
                  'fox sports', 'nbcsports', 'athletic'];
  if (tier1.some((t) => s.includes(t))) return 20;
  if (tier2.some((t) => s.includes(t))) return 10;
  return 0;
}

/**
 * Recency bonus: recent articles are slightly preferred when quality is equal.
 */
function recencyBonus(pubDate) {
  if (!pubDate) return 0;
  const ageDays = (Date.now() - new Date(pubDate).getTime()) / 86_400_000;
  if (ageDays <= 1) return 8;
  if (ageDays <= 3) return 5;
  if (ageDays <= 7) return 2;
  return 0;
}

/**
 * Additional low-signal content detector.
 */
function isLowSignal(title) {
  const t = (title || '').toLowerCase();
  return [
    'schedule:', 'schedule for', 'game time', 'tip-off time', 'tipoff time',
    'what channel', 'odds, line', 'odds and line for', 'prediction and pick for',
    'score, result', 'score and result', 'box score',
  ].some((p) => t.includes(p));
}

/**
 * Compute a quality score for a news headline.
 * Higher = better. Watch-spam gets a heavy penalty but is not hard-excluded.
 */
function scoreNewsItem(item) {
  const title = item.title || '';
  const source = (item.source && (item.source['#text'] || item.source)) || '';
  let score = 50; // base
  if (isWatchSpam(title)) score -= 60;
  if (isLowSignal(title)) score -= 35;
  score += analysisBoost(title);
  score += sourceRepBoost(source);
  score += recencyBonus(item.pubDate);
  return score;
}

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

    // MBB filter: strict first, loose fallback
    let filtered = raw.filter((item) => isMensBasketball(item.title || '', sourceStr(item), linkStr(item)));
    if (filtered.length === 0 && raw.length > 0) {
      filtered = raw.filter((item) => isMensBasketballLoose(item.title || '', sourceStr(item), linkStr(item)));
      if (debug) console.log(`[teamNews:${slug}] strict filter empty → loose filter → ${filtered.length} items`);
    }
    if (debug) console.log(`[teamNews:${slug}] after MBB filter=${filtered.length}`);

    // Dedupe by canonical link
    const seenLinks = new Set();
    const deduped = filtered.filter((item) => {
      const key = item.link || (item.title || '').slice(0, 60);
      if (seenLinks.has(key)) return false;
      seenLinks.add(key);
      return true;
    });

    // Quality-rank: score each item, sort descending
    const scored = deduped.map((item) => ({ item, score: scoreNewsItem(item) }));
    scored.sort((a, b) => b.score - a.score);

    // Enforce watch-spam cap: at most 1 watch-spam item, and only if nothing better exists
    let watchSpamCount = 0;
    const ranked = scored.filter(({ item, score }) => {
      if (isWatchSpam(item.title || '')) {
        if (watchSpamCount >= 1) return false; // max 1 watch-spam item
        watchSpamCount++;
      }
      return true;
    });

    if (debug) {
      console.log(`[teamNews:${slug}] ranked items (top 5):`);
      ranked.slice(0, 5).forEach(({ item, score }) => {
        console.log(`  score=${score} spam=${isWatchSpam(item.title||'')} "${(item.title||'').slice(0,70)}"`);
      });
    }

    const headlines = ranked.slice(0, 10).map(({ item }, i) => ({
      id: item.guid?.['#text'] || item.link || `news-${i}`,
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: sourceStr(item) || 'News',
    }));
    return { headlines };
  });

  newsTeamCache.set(cacheKey, result);
  return result;
}

// --- News (aggregate) — quality-ranked with deduplication + diversity ---

/**
 * Normalize a URL for deduplication: lowercase host, strip tracking params.
 */
function normalizeUrlForDedupe(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source', 'cid']) {
      u.searchParams.delete(p);
    }
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    u.hash = '';
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function normTitleForDedupe(title) {
  return (title || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
}

function dedupeAggregateItems(items) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  return items.filter((item) => {
    const urlKey = normalizeUrlForDedupe(item.link);
    const titleKey = normTitleForDedupe(item.title);
    if (urlKey && seenUrls.has(urlKey)) return false;
    if (titleKey && seenTitles.has(titleKey)) return false;
    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });
}

/**
 * Source diversity pass: prevent any single source from dominating the top N.
 * If one source owns >40% of the top slots, demote its lowest-scored items.
 */
function diversityPassArticles(items, topN = 12) {
  if (items.length <= topN) return items;
  const top = items.slice(0, topN);
  const rest = items.slice(topN);
  const sourceCounts = {};
  for (const item of top) {
    const s = (item.source || '').toLowerCase();
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }
  const maxPerSource = Math.ceil(topN * 0.4);
  const demoted = [];
  const kept = [];
  const keptCounts = {};
  for (const item of top) {
    const s = (item.source || '').toLowerCase();
    keptCounts[s] = (keptCounts[s] || 0);
    if ((sourceCounts[s] || 0) > maxPerSource && keptCounts[s] >= maxPerSource) {
      demoted.push(item);
    } else {
      keptCounts[s]++;
      kept.push(item);
    }
  }
  const promoted = rest.filter((item) => {
    const s = (item.source || '').toLowerCase();
    return !sourceCounts[s] || sourceCounts[s] <= 2;
  }).slice(0, demoted.length);
  return [...kept, ...promoted, ...demoted, ...rest.filter((r) => !promoted.includes(r))];
}

async function fetchRssFeeds(feeds, headers) {
  const settled = await Promise.allSettled(
    feeds.map(async (f) => {
      try {
        const res = await fetch(f.url, { headers, signal: AbortSignal.timeout(8000) });
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
          image: item?.enclosure?.['@_url'] || item?.['media:content']?.['@_url'] || null,
          description: (item?.description?.['#text'] || item?.description || item?.summary || '').replace(/<[^>]*>/g, '').slice(0, 200),
        }));
      } catch {
        return [];
      }
    })
  );
  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
}

export async function fetchNewsAggregateSource(options = {}) {
  const { includeNational = true } = options;
  const cacheKey = `news-agg:${includeNational}`;
  const cached = newsAggCache.get(cacheKey);
  if (cached) return cached;

  const { NATIONAL_FEEDS } = await import('../src/data/newsSources.js');
  const { isMensBasketball, isMensBasketballLoose } = await import('./news/filters.js');
  const HEADERS = { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)', Accept: 'application/rss+xml, application/xml, text/xml' };

  const result = await coalesce(cacheKey, async () => {
    let items = [];
    if (includeNational && NATIONAL_FEEDS?.length > 0) {
      const all = await fetchRssFeeds(NATIONAL_FEEDS.slice(0, 8), HEADERS);
      let filtered = all.filter((item) => isMensBasketball(item.title, item.source, item.link));
      if (filtered.length === 0 && all.length > 0) {
        filtered = all.filter((item) => isMensBasketballLoose(item.title, item.source, item.link));
      }
      const deduped = dedupeAggregateItems(filtered);
      const scored = deduped.map((item) => ({ ...item, _score: scoreNewsItem(item) }));
      scored.sort((a, b) => b._score - a._score);
      items = diversityPassArticles(scored);
    }
    return { items };
  });

  newsAggCache.set(cacheKey, result);
  return result;
}

// --- News (betting aggregate) — betting-oriented content ---
const bettingNewsCache = createCache(20 * 60 * 1000);

export async function fetchBettingNewsSource() {
  const cacheKey = 'news-betting';
  const cached = bettingNewsCache.get(cacheKey);
  if (cached) return cached;

  const { BETTING_FEEDS, NATIONAL_FEEDS } = await import('../src/data/newsSources.js');
  const HEADERS = { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)', Accept: 'application/rss+xml, application/xml, text/xml' };

  const result = await coalesce(cacheKey, async () => {
    const feeds = [...(BETTING_FEEDS || []), ...(NATIONAL_FEEDS || []).slice(0, 3)];
    const all = await fetchRssFeeds(feeds, HEADERS);

    const BETTING_KEYWORDS = [
      'bet', 'betting', 'pick', 'picks', 'spread', 'odds', 'over/under',
      'parlay', 'moneyline', 'futures', 'prop', 'wager', 'sportsbook',
      'handicap', 'line', 'best bet', 'lock', 'fade', 'ats', 'against the spread',
      'total', 'cover', 'point spread', 'money line',
    ];
    const BASKETBALL_KEYWORDS = [
      'basketball', 'ncaab', 'ncaam', 'college basketball', 'march madness',
      'final four', 'bracket', 'cbb', 'hoops',
    ];

    const filtered = all.filter((item) => {
      const t = (item.title || '').toLowerCase();
      const s = (item.source || '').toLowerCase();
      const hasBetting = BETTING_KEYWORDS.some((k) => t.includes(k));
      const hasBasketball = BASKETBALL_KEYWORDS.some((k) => t.includes(k));
      const isBettingSource = ['action network', 'covers', 'vsin'].some((src) => s.includes(src));
      if (isBettingSource) return true;
      return hasBetting && hasBasketball;
    });

    const deduped = dedupeAggregateItems(filtered);
    deduped.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    return { items: deduped };
  });

  bettingNewsCache.set(cacheKey, result);
  return result;
}
