/**
 * GET /api/mlb/team/leaders?team=nyy
 *
 * Returns team-level stat leaders (top player per category) from ESPN.
 * Categories: HR, RBI, Hits, Wins, Saves
 *
 * Source: ESPN team statistics endpoint
 * Cache: 2 hours (stats don't change frequently)
 *
 * Response:
 * {
 *   team: 'nyy',
 *   leaders: {
 *     hr:    { name: 'Aaron Judge', value: 12 },
 *     rbi:   { name: 'Aaron Judge', value: 30 },
 *     hits:  { name: 'Juan Soto',   value: 45 },
 *     wins:  { name: 'Gerrit Cole', value: 4 },
 *     saves: { name: 'Clay Holmes', value: 8 },
 *   },
 *   fetchedAt: ISO string
 * }
 */

import { createCache } from '../../_cache.js';

const cache = createCache(2 * 60 * 60 * 1000); // 2 hour cache
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
 * Fetch team roster/stats from ESPN and extract leaders.
 */
async function fetchTeamLeaders(espnId) {
  // ESPN team endpoint includes leaders in the response
  const url = `${ESPN_BASE}/teams/${espnId}?enable=roster,stats`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'MaximusSports/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;

    const data = await r.json();
    const team = data?.team;
    if (!team) return null;

    // ESPN returns team.record.items for standings
    const record = team.record?.items?.[0]?.summary || null;

    // Try to get leaders from team response
    // ESPN sometimes includes leaders in the team endpoint
    const leaders = {};

    // Check if nextEvent exists for schedule info
    const nextEvent = team.nextEvent?.[0];
    const nextGame = nextEvent ? {
      opponent: null,
      date: nextEvent.date,
      name: nextEvent.name || nextEvent.shortName,
    } : null;

    // Try the statistics endpoint for detailed team stats
    return { record, leaders, nextGame };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[mlb/team/leaders] fetch failed for ${espnId}:`, err.message);
    return null;
  }
}

/**
 * Fetch team statistics with batting/pitching leaders from ESPN.
 */
async function fetchTeamStats(espnId) {
  const url = `${ESPN_BASE}/teams/${espnId}/statistics`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'MaximusSports/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      console.warn(`[mlb/team/leaders] stats endpoint returned ${r.status} for team ${espnId}`);
      return null;
    }

    const data = await r.json();

    // Parse batting leaders
    const batting = data?.results?.stats?.categories?.find(c =>
      c.name === 'batting' || c.displayName === 'Batting'
    );
    const pitching = data?.results?.stats?.categories?.find(c =>
      c.name === 'pitching' || c.displayName === 'Pitching'
    );

    const leaders = {};

    // Extract from splits or leaders
    if (batting?.leaders) {
      for (const leader of batting.leaders) {
        const cat = leader.abbreviation?.toLowerCase() || leader.name?.toLowerCase();
        const topAthlete = leader.leaders?.[0];
        if (topAthlete?.athlete) {
          const entry = {
            name: topAthlete.athlete.displayName || topAthlete.athlete.shortName,
            value: topAthlete.value != null ? Number(topAthlete.value) : null,
          };
          if (cat === 'hr' || cat === 'homeRuns') leaders.hr = entry;
          if (cat === 'rbi') leaders.rbi = entry;
          if (cat === 'h' || cat === 'hits') leaders.hits = entry;
        }
      }
    }

    if (pitching?.leaders) {
      for (const leader of pitching.leaders) {
        const cat = leader.abbreviation?.toLowerCase() || leader.name?.toLowerCase();
        const topAthlete = leader.leaders?.[0];
        if (topAthlete?.athlete) {
          const entry = {
            name: topAthlete.athlete.displayName || topAthlete.athlete.shortName,
            value: topAthlete.value != null ? Number(topAthlete.value) : null,
          };
          if (cat === 'w' || cat === 'wins') leaders.wins = entry;
          if (cat === 'sv' || cat === 'saves') leaders.saves = entry;
        }
      }
    }

    return leaders;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[mlb/team/leaders] stats fetch failed for ${espnId}:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const slug = url.searchParams.get('team');

  if (!slug || !SLUG_TO_ESPN_ID[slug]) {
    return res.status(400).json({ error: 'Invalid team slug. Use ?team=nyy, ?team=lad, etc.' });
  }

  const cacheKey = `mlb:leaders:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  const espnId = SLUG_TO_ESPN_ID[slug];

  // Fetch team info + stats in parallel
  const [teamInfo, stats] = await Promise.allSettled([
    fetchTeamLeaders(espnId),
    fetchTeamStats(espnId),
  ]);

  const info = teamInfo.status === 'fulfilled' ? teamInfo.value : null;
  const leaders = stats.status === 'fulfilled' ? stats.value : null;

  const payload = {
    team: slug,
    record: info?.record || null,
    leaders: leaders || {},
    nextGame: info?.nextGame || null,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, payload);
  return res.status(200).json(payload);
}

/**
 * Batch fetch leaders for multiple teams. Used by email pipeline.
 */
export async function fetchTeamLeadersBatch(baseUrl, slugs) {
  if (!slugs?.length) return {};
  const results = await Promise.allSettled(
    slugs.map(slug =>
      fetch(`${baseUrl}/api/mlb/team/leaders?team=${slug}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );
  const map = {};
  slugs.forEach((slug, i) => {
    const r = results[i];
    map[slug] = r.status === 'fulfilled' ? r.value : null;
  });
  return map;
}
