/**
 * GET /api/mlb/leaders — MLB season stat leaders via ESPN API.
 *
 * Returns top 3 leaders in 5 categories: HR, RBI, Hits, Wins, Saves.
 * Uses ESPN v3 site API (batting, inline names) + core API (pitching).
 * Cached for 30 minutes.
 *
 * Response shape:
 * {
 *   categories: {
 *     homeRuns: { label: 'Home Runs', abbrev: 'HR', leaders: [{ name, team, teamAbbrev, value, display }] },
 *     RBIs:     { ... },
 *     hits:     { ... },
 *     wins:     { ... },
 *     saves:    { ... },
 *   },
 *   fetchedAt: ISO string
 * }
 */

import { createCache, coalesce } from '../_cache.js';
import { MLB_TEAMS, MLB_ESPN_IDS } from '../../src/sports/mlb/teams.js';

const CACHE_TTL = 30 * 60 * 1000; // 30 min
const FETCH_TIMEOUT = 8000;
const cache = createCache(CACHE_TTL);

// ESPN team ID → our slug
const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(MLB_ESPN_IDS)) espnIdToSlug[String(eid)] = slug;

// ESPN team ID → abbreviation
const espnIdToAbbrev = {};
for (const team of MLB_TEAMS) {
  const eid = MLB_ESPN_IDS[team.slug];
  if (eid) espnIdToAbbrev[String(eid)] = team.abbrev;
}

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  // If January/February, use prior year season
  return month <= 2 ? now.getFullYear() - 1 : now.getFullYear();
}

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── All leaders via core API (athlete $ref resolution) ───────────────

const TARGET_CATS = ['homeRuns', 'RBIs', 'hits', 'wins', 'saves'];

async function resolveEntry(entry) {
  const athleteRef = entry.athlete?.$ref || '';
  const teamRef = entry.team?.$ref || '';

  let athleteName = '—';
  let teamAbbrev = '';
  let teamName = '';

  if (athleteRef) {
    try {
      const ar = await fetchWithTimeout(athleteRef, 4000);
      if (ar.ok) {
        const ad = await ar.json();
        athleteName = ad.displayName || ad.fullName || '—';
      }
    } catch { /* fallback */ }
  }

  if (teamRef) {
    const teamIdMatch = teamRef.match(/teams\/(\d+)/);
    if (teamIdMatch) {
      const tid = teamIdMatch[1];
      teamAbbrev = espnIdToAbbrev[tid] || '';
      const slug = espnIdToSlug[tid];
      if (slug) {
        const t = MLB_TEAMS.find(t => t.slug === slug);
        teamName = t?.name || '';
      }
    }
  }

  return {
    name: athleteName,
    team: teamName,
    teamAbbrev,
    value: entry.value ?? 0,
    display: String(Math.round(entry.value ?? 0)),
  };
}

async function fetchAllLeaders() {
  const season = getCurrentSeason();
  const url = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/${season}/types/2/leaders?limit=5`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) return { categories: {}, fetchedAt: new Date().toISOString() };

  const data = await r.json();
  const cats = data?.categories || [];
  const categories = {};

  for (const cat of cats) {
    if (!TARGET_CATS.includes(cat.name)) continue;

    const entries = (cat.leaders || []).slice(0, 3);
    const resolved = await Promise.all(entries.map(resolveEntry));

    categories[cat.name] = {
      label: cat.displayName || cat.name,
      abbrev: cat.abbreviation || cat.name,
      leaders: resolved,
    };
  }

  return { categories, fetchedAt: new Date().toISOString() };
}

// ─── Handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await coalesce('mlb:leaders', () => {
      const cached = cache.get('mlb:leaders');
      if (cached) return cached;
      return fetchAllLeaders().then(data => {
        cache.set('mlb:leaders', data);
        return data;
      });
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[mlb/leaders] error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch leaders', categories: {} });
  }
}
