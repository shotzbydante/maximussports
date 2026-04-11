/**
 * GET /api/nba/team/board — NBA team board payload.
 * Returns all 30 teams with standings, records, and conference context
 * from ESPN NBA standings API.
 */

import { createCache } from '../../_cache.js';
import { NBA_TEAMS, NBA_ESPN_IDS } from '../../../src/sports/nba/teams.js';

const cache = createCache(5 * 60 * 1000);
const CACHE_KEY = 'nba:team:board';

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const FETCH_TIMEOUT_MS = 8000;

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(NBA_ESPN_IDS)) espnIdToSlug[eid] = slug;

function parseStandings(data) {
  const teams = {};

  // ESPN standings returns children[] with conference groups
  const children = data?.children || [];
  for (const conf of children) {
    const confName = conf.name || conf.abbreviation || '';
    const isEast = /east/i.test(confName);
    const isWest = /west/i.test(confName);
    const confLabel = isEast ? 'Eastern' : isWest ? 'Western' : confName;

    const standings = conf.standings?.entries || [];
    for (const entry of standings) {
      const espnTeam = entry.team || {};
      const espnId = String(espnTeam.id || '');
      const slug = espnIdToSlug[espnId];
      if (!slug) continue;

      const stats = {};
      for (const stat of entry.stats || []) {
        stats[stat.name || stat.abbreviation] = stat.value ?? stat.displayValue;
      }

      const wins = Number(stats.wins ?? stats.W ?? 0);
      const losses = Number(stats.losses ?? stats.L ?? 0);
      const record = `${wins}-${losses}`;
      const confRank = Number(stats.playoffSeed ?? stats.rank ?? 0);
      const rawStreak = stats.streak ?? null;
      // Clean ESPN streak format: "W4", "L10|4" → "W4", "L10"
      const streak = typeof rawStreak === 'string'
        ? rawStreak.split('|')[0].trim()
        : null;
      const pct = Number(stats.winPercent ?? stats.winPct ?? (wins / Math.max(wins + losses, 1)));
      const gb = stats.gamesBehind ?? stats.GB ?? null;

      teams[slug] = {
        slug,
        record,
        wins,
        losses,
        pct: Math.round(pct * 1000) / 1000,
        confRank,
        standing: confRank ? `${ordinal(confRank)} in ${confLabel}` : null,
        streak: typeof streak === 'string' ? streak : null,
        gb: gb != null ? String(gb) : null,
        conference: confLabel,
      };
    }
  }

  return teams;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const r = await fetch(ESPN_STANDINGS, { signal: controller.signal });
    clearTimeout(timer);

    if (!r.ok) {
      return res.status(200).json({ teams: {}, source: 'espn_error' });
    }

    const data = await r.json();
    const teams = parseStandings(data);

    // Merge with static team metadata
    const board = NBA_TEAMS.map(t => {
      const standing = teams[t.slug] || {};
      return {
        slug: t.slug,
        name: t.name,
        abbrev: t.abbrev,
        conference: t.conference,
        division: t.division,
        record: standing.record || '0-0',
        wins: standing.wins || 0,
        losses: standing.losses || 0,
        pct: standing.pct || 0,
        confRank: standing.confRank || 0,
        standing: standing.standing || null,
        streak: standing.streak || null,
        gb: standing.gb || null,
        logo: `https://a.espncdn.com/i/teamlogos/nba/500/${NBA_ESPN_IDS[t.slug]}.png`,
      };
    });

    const payload = { board, fetchedAt: new Date().toISOString() };
    cache.set(CACHE_KEY, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ board: [], error: err?.message });
  }
}
