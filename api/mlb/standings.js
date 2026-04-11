/**
 * GET /api/mlb/standings — MLB division standings via ESPN API.
 *
 * Returns a flat map of team slug → { wins, losses, gb, l10, streak, rank, division }.
 * Derived from ESPN standings endpoint, cached for 5 minutes.
 */

import { createCache, coalesce } from '../_cache.js';
import { MLB_TEAMS, MLB_ESPN_IDS } from '../../src/sports/mlb/teams.js';

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings';

// ESPN team ID → our slug
const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(MLB_ESPN_IDS)) espnIdToSlug[String(eid)] = slug;

// Our slug → division
const slugToDivision = Object.fromEntries(MLB_TEAMS.map(t => [t.slug, t.division]));

const cache = createCache(5 * 60 * 1000); // 5 min TTL

function findStat(stats, name) {
  const s = stats?.find(s => s.name === name || s.type === name);
  return s ?? null;
}

function parseStandings(data) {
  const teams = {};

  // ESPN returns children: [ { name: 'American League', children: [...] | entries: [...] }, ... ]
  // The structure can be: children → entries (flat by league) or children → children → entries (by division)
  const topChildren = data?.children || [];

  for (const league of topChildren) {
    // League may have sub-children (divisions) or direct entries
    const divisions = league?.children || [];
    const directEntries = league?.standings?.entries || [];

    // Process division-grouped entries
    for (const div of divisions) {
      const divEntries = div?.standings?.entries || [];
      for (let i = 0; i < divEntries.length; i++) {
        processEntry(divEntries[i], i + 1, teams);
      }
    }

    // Process flat league entries (fallback — entries sorted by overall record)
    if (divisions.length === 0 && directEntries.length > 0) {
      // Group by division to compute rank
      const byDiv = {};
      for (const entry of directEntries) {
        const espnId = String(entry?.team?.id || '');
        const slug = espnIdToSlug[espnId];
        const div = slug ? slugToDivision[slug] : null;
        if (!div) continue;
        if (!byDiv[div]) byDiv[div] = [];
        byDiv[div].push(entry);
      }
      for (const divEntries of Object.values(byDiv)) {
        // Sort by wins desc, then losses asc
        divEntries.sort((a, b) => {
          const aW = findStat(a.stats, 'wins')?.value ?? 0;
          const bW = findStat(b.stats, 'wins')?.value ?? 0;
          if (bW !== aW) return bW - aW;
          const aL = findStat(a.stats, 'losses')?.value ?? 0;
          const bL = findStat(b.stats, 'losses')?.value ?? 0;
          return aL - bL;
        });
        for (let i = 0; i < divEntries.length; i++) {
          processEntry(divEntries[i], i + 1, teams);
        }
      }
    }
  }

  return teams;
}

function processEntry(entry, rank, teams) {
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
  const division = slugToDivision[slug] || '';

  teams[slug] = {
    wins: Math.round(wins),
    losses: Math.round(losses),
    record: `${Math.round(wins)}-${Math.round(losses)}`,
    gb,
    gbDisplay,
    rank,
    streak,
    l10,
    division,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = 'mlb:standings';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const result = await coalesce(cacheKey, async () => {
      const year = new Date().getFullYear();
      const r = await fetch(`${ESPN_STANDINGS}?season=${year}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`ESPN standings: ${r.status}`);
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
