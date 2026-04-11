/**
 * GET /api/mlb/team/leaders?team=nyy
 *
 * Returns current team metadata from ESPN:
 *   - record (e.g. "8-5")
 *   - standingSummary (e.g. "1st in AL East")
 *   - nextEvent (opponent, date)
 *   - teamStats (aggregate HR, RBI, H, W, SV)
 *
 * Note: ESPN's public API does not expose individual player leaders.
 * Team-aggregate stats are returned instead. Individual player leaders
 * require the MLB Stats API (statsapi.mlb.com) which is a future integration.
 *
 * Cache: 30 minutes
 */

import { createCache } from '../../_cache.js';

const cache = createCache(30 * 60 * 1000); // 30 min cache
const FETCH_TIMEOUT = 8000;
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';

const SLUG_TO_ESPN_ID = {
  nyy: '10', bos: '2', tor: '14', tb: '30', bal: '1',
  cle: '5', min: '9', det: '6', cws: '4', kc: '7',
  hou: '18', sea: '12', tex: '13', laa: '3', oak: '11',
  atl: '15', nym: '21', phi: '22', mia: '28', wsh: '20',
  chc: '16', mil: '8', stl: '24', pit: '23', cin: '17',
  lad: '19', sd: '25', sf: '26', ari: '29', col: '27',
};

/**
 * Fetch team info: record, standing, next event.
 */
async function fetchTeamInfo(espnId) {
  const url = `${ESPN_BASE}/teams/${espnId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'MaximusSports/1.0' }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = await r.json();
    const team = data?.team;
    if (!team) return null;

    const record = team.record?.items?.[0]?.summary || null;
    const standingSummary = team.standingSummary || null;

    // Next event
    const ne = team.nextEvent?.[0];
    let nextGame = null;
    if (ne) {
      const competitors = ne.competitions?.[0]?.competitors || [];
      const away = competitors.find(c => c.homeAway === 'away');
      const home = competitors.find(c => c.homeAway === 'home');
      nextGame = {
        name: ne.shortName || ne.name || '',
        date: ne.date,
        awayTeam: away?.team?.abbreviation || '',
        homeTeam: home?.team?.abbreviation || '',
        broadcast: ne.competitions?.[0]?.broadcasts?.[0]?.names?.[0] || null,
      };
    }

    return { record, standingSummary, nextGame };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[mlb/team/leaders] team fetch failed for ${espnId}:`, err.message);
    return null;
  }
}

/**
 * Compute L10 record from team schedule (last 10 completed games).
 */
async function fetchL10(espnId) {
  const url = `${ESPN_BASE}/teams/${espnId}/schedule`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'MaximusSports/1.0' }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = await r.json();
    const events = data?.events || [];

    // Find completed games
    const completed = events.filter(e => {
      const status = e.competitions?.[0]?.status?.type;
      return status?.completed === true;
    });

    // Take last 10
    const last10 = completed.slice(-10);
    if (last10.length === 0) return null;

    // Count wins (team is either home or away; check if their score > opponent)
    const teamAbbrev = data?.team?.abbreviation?.toUpperCase();
    let wins = 0;
    let losses = 0;

    for (const event of last10) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const competitors = comp.competitors || [];
      const teamEntry = competitors.find(c => c.team?.abbreviation?.toUpperCase() === teamAbbrev);
      const oppEntry = competitors.find(c => c.team?.abbreviation?.toUpperCase() !== teamAbbrev);
      if (teamEntry && oppEntry) {
        const teamScore = parseInt(teamEntry.score, 10);
        const oppScore = parseInt(oppEntry.score, 10);
        if (!isNaN(teamScore) && !isNaN(oppScore)) {
          if (teamScore > oppScore) wins++;
          else losses++;
        }
      }
    }

    return `${wins}-${losses}`;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[mlb/team/leaders] L10 fetch failed for ${espnId}:`, err.message);
    return null;
  }
}

/**
 * Fetch team-level aggregate stats from ESPN.
 * Returns team totals for key batting/pitching categories.
 */
async function fetchTeamStats(espnId) {
  const url = `${ESPN_BASE}/teams/${espnId}/statistics`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'MaximusSports/1.0' }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = await r.json();

    const categories = data?.results?.stats?.categories || [];
    const batting = categories.find(c => c.name === 'batting');
    const pitching = categories.find(c => c.name === 'pitching');

    const getStat = (cat, abbrev) => {
      if (!cat?.stats) return null;
      const s = cat.stats.find(st => st.abbreviation === abbrev);
      return s ? { value: s.value != null ? Number(s.value) : null, display: s.displayValue || null } : null;
    };

    return {
      hr:    getStat(batting, 'HR'),
      rbi:   getStat(batting, 'RBI'),
      hits:  getStat(batting, 'H'),
      avg:   getStat(batting, 'AVG'),
      runs:  getStat(batting, 'R'),
      wins:  getStat(pitching, 'W'),
      saves: getStat(pitching, 'SV'),
      era:   getStat(pitching, 'ERA'),
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[mlb/team/leaders] stats fetch failed for ${espnId}:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const slug = url.searchParams.get('team');

  if (!slug || !SLUG_TO_ESPN_ID[slug]) {
    return res.status(400).json({ error: 'Invalid team slug' });
  }

  const cacheKey = `mlb:team:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  const espnId = SLUG_TO_ESPN_ID[slug];
  const [infoResult, statsResult, l10Result] = await Promise.allSettled([
    fetchTeamInfo(espnId),
    fetchTeamStats(espnId),
    fetchL10(espnId),
  ]);

  const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
  const l10 = l10Result.status === 'fulfilled' ? l10Result.value : null;

  const payload = {
    team: slug,
    record: info?.record || null,
    standingSummary: info?.standingSummary || null,
    l10: l10 || null,
    nextGame: info?.nextGame || null,
    teamStats: stats || null,
    fetchedAt: new Date().toISOString(),
  };

  console.log(`[mlb/team/leaders] ${slug}: record=${payload.record} standing=${payload.standingSummary} l10=${l10} stats=${!!stats}`);

  cache.set(cacheKey, payload);
  return res.status(200).json(payload);
}
