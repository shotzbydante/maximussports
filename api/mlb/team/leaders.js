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
  const [infoResult, statsResult] = await Promise.allSettled([
    fetchTeamInfo(espnId),
    fetchTeamStats(espnId),
  ]);

  const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;

  const payload = {
    team: slug,
    record: info?.record || null,
    standingSummary: info?.standingSummary || null,
    nextGame: info?.nextGame || null,
    teamStats: stats || null,
    fetchedAt: new Date().toISOString(),
  };

  console.log(`[mlb/team/leaders] ${slug}: record=${payload.record} standing=${payload.standingSummary} stats=${!!stats}`);

  cache.set(cacheKey, payload);
  return res.status(200).json(payload);
}
