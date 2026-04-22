/**
 * GET /api/nba/leaders — NBA season stat leaders via ESPN API.
 *
 * Mirrors /api/mlb/leaders contract exactly. Returns top 3 leaders + per-
 * team best in 5 categories:
 *   PPG (avgPoints), APG (avgAssists), RPG (avgRebounds),
 *   SPG (avgSteals), BPG (avgBlocks).
 *
 * Uses ESPN core API with athlete $ref resolution; 30-minute cache with
 * stale-while-revalidate up to 6 hours on fetch failure.
 *
 * Response shape (identical to MLB so caption builder can branch on sport):
 * {
 *   categories: {
 *     avgPoints: {
 *       label: 'Points Per Game',
 *       abbrev: 'PPG',
 *       leaders: [
 *         { name, team, teamAbbrev, value, display },  // top 3
 *         ...
 *       ],
 *       teamBest: { LAL: { name, value, display }, ... },
 *     },
 *     ...
 *   },
 *   fetchedAt: ISO string,
 * }
 */

import { createCache, coalesce } from '../_cache.js';
import { NBA_TEAMS, NBA_ESPN_IDS } from '../../src/sports/nba/teams.js';
import { LEADER_CATEGORIES, LEADER_KEYS } from '../../src/data/nba/seasonLeaders.js';
import { setJson } from '../_globalCache.js';

const CACHE_TTL = 30 * 60 * 1000;
const STALE_TTL = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 8000;
const REF_TIMEOUT = 5000;
const cache = createCache(CACHE_TTL);

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(NBA_ESPN_IDS)) espnIdToSlug[String(eid)] = slug;

const espnIdToAbbrev = {};
for (const team of NBA_TEAMS) {
  const eid = NBA_ESPN_IDS[team.slug];
  if (eid) espnIdToAbbrev[String(eid)] = team.abbrev;
}

const LABEL_BY_KEY = Object.fromEntries(
  LEADER_CATEGORIES.map(c => [c.key, { label: c.label, abbrev: c.abbrev }])
);

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  // NBA season spans two calendar years (Oct→Jun). ESPN labels the season
  // by its ENDING year: "2025-26" season = 2026. Pre-October = last year.
  return month >= 10 ? now.getFullYear() + 1 : now.getFullYear();
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

function teamAbbrevFromRef(teamRef) {
  if (!teamRef) return '';
  const m = teamRef.match(/teams\/(\d+)/);
  return m ? (espnIdToAbbrev[m[1]] || '') : '';
}

function formatPerGame(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.0';
  return n.toFixed(1);
}

async function resolveEntry(entry) {
  const athleteRef = entry.athlete?.$ref || '';
  const teamRef = entry.team?.$ref || '';

  let athleteName = '—';
  let teamAbbrev = '';
  let teamName = '';

  if (teamRef) {
    const m = teamRef.match(/teams\/(\d+)/);
    if (m) {
      const tid = m[1];
      teamAbbrev = espnIdToAbbrev[tid] || '';
      const slug = espnIdToSlug[tid];
      if (slug) {
        const t = NBA_TEAMS.find(t => t.slug === slug);
        teamName = t?.name || '';
      }
    }
  }

  if (athleteRef) {
    try {
      const ar = await fetchWithTimeout(athleteRef, REF_TIMEOUT);
      if (ar.ok) {
        const ad = await ar.json();
        athleteName = ad.displayName || ad.fullName || '—';
      }
    } catch { /* non-fatal */ }
  }

  const value = Number(entry.value ?? 0);
  return {
    name: athleteName,
    team: teamName,
    teamAbbrev,
    value,
    display: formatPerGame(value),
  };
}

async function fetchAllLeaders() {
  const season = getCurrentSeason();
  // NBA "types/2" = regular season
  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/types/2/leaders?limit=100`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) return { categories: {}, fetchedAt: new Date().toISOString() };

  const data = await r.json();
  const cats = data?.categories || [];
  const categories = {};

  for (const cat of cats) {
    if (!LEADER_KEYS.includes(cat.name)) continue;

    const allEntries = cat.leaders || [];

    const teamBestEntries = new Map();
    for (const entry of allEntries) {
      const abbrev = teamAbbrevFromRef(entry.team?.$ref || '');
      if (abbrev && !teamBestEntries.has(abbrev)) {
        teamBestEntries.set(abbrev, entry);
      }
    }

    const top3Entries = allEntries.slice(0, 3);
    const top3Results = await Promise.allSettled(top3Entries.map(resolveEntry));
    const top3Resolved = top3Results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : {
        name: '—', team: '', teamAbbrev: teamAbbrevFromRef(top3Entries[i]?.team?.$ref),
        value: Number(top3Entries[i]?.value ?? 0),
        display: formatPerGame(top3Entries[i]?.value ?? 0),
      }
    );

    const top3Refs = new Set(top3Entries.map(e => e.athlete?.$ref || ''));
    const teamBestToResolve = [];
    for (const [abbrev, entry] of teamBestEntries) {
      const ref = entry.athlete?.$ref || '';
      if (top3Refs.has(ref) && ref) {
        const existing = top3Resolved.find(r => r.teamAbbrev === abbrev);
        if (existing) continue;
      }
      teamBestToResolve.push({ abbrev, entry });
    }

    const batchSize = 10;
    const teamBest = {};
    for (const r of top3Resolved) {
      if (r.teamAbbrev && !teamBest[r.teamAbbrev]) {
        teamBest[r.teamAbbrev] = { name: r.name, value: r.value, display: r.display };
      }
    }
    for (let i = 0; i < teamBestToResolve.length; i += batchSize) {
      const batch = teamBestToResolve.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(({ entry }) => resolveEntry(entry)));
      const resolved = batchResults.map((r, idx) =>
        r.status === 'fulfilled' ? r.value : {
          name: '—', team: '', teamAbbrev: batch[idx].abbrev,
          value: Number(batch[idx].entry?.value ?? 0),
          display: formatPerGame(batch[idx].entry?.value ?? 0),
        }
      );
      for (let j = 0; j < batch.length; j++) {
        const abbrev = batch[j].abbrev;
        const r = resolved[j];
        if (!teamBest[abbrev]) {
          teamBest[abbrev] = { name: r.name, value: r.value, display: r.display };
        }
      }
    }

    const labels = LABEL_BY_KEY[cat.name] || {};
    categories[cat.name] = {
      label: labels.label || cat.displayName || cat.name,
      abbrev: labels.abbrev || cat.abbreviation || cat.name,
      leaders: top3Resolved,
      teamBest,
    };
  }

  return { categories, fetchedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await coalesce('nba:leaders', async () => {
      const fresh = cache.get('nba:leaders');
      if (fresh) return fresh;

      try {
        const data = await fetchAllLeaders();
        const catCount = Object.keys(data?.categories || {}).length;
        if (catCount > 0) {
          cache.set('nba:leaders', data);
          return data;
        }
        console.warn('[nba/leaders] fresh fetch returned 0 categories');
      } catch (fetchErr) {
        console.warn(`[nba/leaders] fresh fetch failed: ${fetchErr?.message}`);
      }

      const stale = cache.getMaybeStale('nba:leaders', STALE_TTL);
      if (stale?.value) {
        console.log(`[nba/leaders] serving stale data (age=${Math.round(stale.ageMs / 1000)}s)`);
        return stale.value;
      }

      return { categories: {}, fetchedAt: new Date().toISOString(), partial: true };
    });

    // Persist to KV for in-process callers (autopost/email) to read without self-fetch
    setJson('nba:leaders:latest', result, { exSeconds: 3600 }).catch(() => {});

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[nba/leaders] error:', err?.message);
    const stale = cache.getMaybeStale('nba:leaders', STALE_TTL);
    if (stale?.value) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json(stale.value);
    }
    return res.status(500).json({ error: 'Failed to fetch leaders', categories: {} });
  }
}
