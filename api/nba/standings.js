/**
 * GET /api/nba/standings — NBA conference standings via ESPN API.
 *
 * Mirrors /api/mlb/standings contract exactly. Returns a flat map of
 * team slug → { wins, losses, record, gb, rank, streak, l10, conference,
 * division, playoffSeed }.
 *
 * During the playoffs `rank` reflects regular-season seeding within
 * conference (ESPN's own field). During the regular season it's the
 * conference-wide standing.
 */

import { createCache, coalesce } from '../_cache.js';
import { NBA_TEAMS, NBA_ESPN_IDS } from '../../src/sports/nba/teams.js';

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(NBA_ESPN_IDS)) espnIdToSlug[String(eid)] = slug;

const slugToMeta = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t]));

const cache = createCache(5 * 60 * 1000); // 5 min TTL

function findStat(stats, name) {
  const s = stats?.find(s => s.name === name || s.type === name);
  return s ?? null;
}

function processEntry(entry, rank, conference, teams) {
  const espnId = String(entry?.team?.id || '');
  const slug = espnIdToSlug[espnId];
  if (!slug) return;

  const stats = entry?.stats || [];
  const wins = findStat(stats, 'wins')?.value ?? 0;
  const losses = findStat(stats, 'losses')?.value ?? 0;
  const gbRaw = findStat(stats, 'gamesBehind');
  const gb = gbRaw?.value ?? 0;
  const gbDisplay = gbRaw?.displayValue ?? (gb === 0 ? '—' : String(gb));

  const streakStat = findStat(stats, 'streak');
  const streak = streakStat?.displayValue ?? null;

  const l10Stat = stats.find(s => s.type === 'lasttengames' || s.name === 'Last Ten Games');
  const l10 = l10Stat?.displayValue ?? null;

  const seedStat = findStat(stats, 'playoffSeed');
  const playoffSeed = seedStat?.value != null ? Number(seedStat.value) : null;

  const meta = slugToMeta[slug];

  teams[slug] = {
    wins: Math.round(wins),
    losses: Math.round(losses),
    record: `${Math.round(wins)}-${Math.round(losses)}`,
    gb,
    gbDisplay,
    rank,
    streak,
    l10,
    conference: conference || meta?.conference || null,
    division: meta?.division || '',
    playoffSeed,
  };
}

function parseStandings(data) {
  const teams = {};
  const topChildren = data?.children || [];

  for (const conf of topChildren) {
    const confName = conf?.name || null;              // "Eastern Conference" / "Western Conference"
    const confShort = confName?.replace(/ Conference$/i, '') || null;

    // ESPN: conference → divisions[].standings.entries  OR  conference → standings.entries
    const divisions = conf?.children || [];
    const directEntries = conf?.standings?.entries || [];

    if (directEntries.length > 0 && divisions.length === 0) {
      // Conference-wide entries — sort by wins desc for rank
      const ranked = [...directEntries].sort((a, b) => {
        const aW = findStat(a.stats, 'wins')?.value ?? 0;
        const bW = findStat(b.stats, 'wins')?.value ?? 0;
        if (bW !== aW) return bW - aW;
        const aL = findStat(a.stats, 'losses')?.value ?? 0;
        const bL = findStat(b.stats, 'losses')?.value ?? 0;
        return aL - bL;
      });
      for (let i = 0; i < ranked.length; i++) {
        processEntry(ranked[i], i + 1, confShort, teams);
      }
    }

    // Division-grouped entries (older response shape)
    for (const div of divisions) {
      const divEntries = div?.standings?.entries || [];
      for (let i = 0; i < divEntries.length; i++) {
        processEntry(divEntries[i], i + 1, confShort, teams);
      }
    }
  }

  return teams;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = 'nba:standings';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const result = await coalesce(cacheKey, async () => {
      const r = await fetch(ESPN_STANDINGS, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`ESPN NBA standings: ${r.status}`);
      const data = await r.json();
      const teams = parseStandings(data);
      return { teams, generatedAt: new Date().toISOString() };
    });

    cache.set(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ teams: {}, error: err?.message });
  }
}
