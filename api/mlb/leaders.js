/**
 * GET /api/mlb/leaders — MLB season stat leaders via ESPN API.
 *
 * Returns top 3 leaders + per-team best in 5 categories: HR, RBI, Hits, Wins, Saves.
 * Uses ESPN core API with athlete $ref resolution.
 * Cached for 30 minutes.
 *
 * Response shape:
 * {
 *   categories: {
 *     homeRuns: {
 *       label, abbrev,
 *       leaders: [top3...],
 *       teamBest: { NYY: { name, value, display }, ... }
 *     },
 *     ...
 *   },
 *   fetchedAt: ISO string
 * }
 */

import { createCache, coalesce } from '../_cache.js';
import { MLB_TEAMS, MLB_ESPN_IDS } from '../../src/sports/mlb/teams.js';
import { setJson } from '../_globalCache.js';

const CACHE_TTL = 30 * 60 * 1000; // 30 min
const STALE_TTL = 6 * 60 * 60 * 1000; // Serve stale up to 6 hours if fresh fetch fails
const FETCH_TIMEOUT = 8000;
const REF_TIMEOUT = 5000; // Per-$ref resolution timeout
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

  // Resolve team from $ref URL — no HTTP needed, just parse the ID
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

  // Resolve athlete name via HTTP — non-fatal, falls back to '—'
  if (athleteRef) {
    try {
      const ar = await fetchWithTimeout(athleteRef, REF_TIMEOUT);
      if (ar.ok) {
        const ad = await ar.json();
        athleteName = ad.displayName || ad.fullName || '—';
      }
    } catch { /* non-fatal — name stays as '—' */ }
  }

  return {
    name: athleteName,
    team: teamName,
    teamAbbrev,
    value: entry.value ?? 0,
    display: String(Math.round(entry.value ?? 0)),
  };
}

// Extract team abbreviation from a team $ref URL without an HTTP call
function teamAbbrevFromRef(teamRef) {
  if (!teamRef) return '';
  const m = teamRef.match(/teams\/(\d+)/);
  return m ? (espnIdToAbbrev[m[1]] || '') : '';
}

async function fetchAllLeaders() {
  const season = getCurrentSeason();
  // Fetch deep enough to cover all 30 teams (pitching stats may need more depth)
  const url = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/${season}/types/2/leaders?limit=100`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) return { categories: {}, fetchedAt: new Date().toISOString() };

  const data = await r.json();
  const cats = data?.categories || [];
  const categories = {};

  for (const cat of cats) {
    if (!TARGET_CATS.includes(cat.name)) continue;

    const allEntries = cat.leaders || [];

    // Phase 1: cheaply extract team abbrev from $ref URLs to find per-team best
    const teamBestEntries = new Map(); // teamAbbrev → entry (first = highest ranked)
    for (const entry of allEntries) {
      const abbrev = teamAbbrevFromRef(entry.team?.$ref || '');
      if (abbrev && !teamBestEntries.has(abbrev)) {
        teamBestEntries.set(abbrev, entry);
      }
    }

    // Phase 2: resolve top 3 for league-wide display (non-fatal per entry)
    const top3Entries = allEntries.slice(0, 3);
    const top3Results = await Promise.allSettled(top3Entries.map(resolveEntry));
    const top3Resolved = top3Results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : {
        name: '—', team: '', teamAbbrev: teamAbbrevFromRef(top3Entries[i]?.team?.$ref),
        value: top3Entries[i]?.value ?? 0, display: String(Math.round(top3Entries[i]?.value ?? 0)),
      }
    );

    // Phase 3: resolve team-best entries (skip any already resolved in top 3)
    const top3Refs = new Set(top3Entries.map(e => e.athlete?.$ref || ''));
    const teamBestToResolve = [];
    for (const [abbrev, entry] of teamBestEntries) {
      const ref = entry.athlete?.$ref || '';
      if (top3Refs.has(ref) && ref) {
        // Already resolved in top 3 — reuse it
        const existing = top3Resolved.find(r => r.teamAbbrev === abbrev);
        if (existing) continue;
      }
      teamBestToResolve.push({ abbrev, entry });
    }

    // Resolve remaining team-best athletes in parallel (batched)
    const batchSize = 10;
    const teamBest = {};
    // First, add any top-3 players to teamBest
    for (const r of top3Resolved) {
      if (r.teamAbbrev && !teamBest[r.teamAbbrev]) {
        teamBest[r.teamAbbrev] = { name: r.name, value: r.value, display: r.display };
      }
    }
    // Then resolve remaining in batches
    for (let i = 0; i < teamBestToResolve.length; i += batchSize) {
      const batch = teamBestToResolve.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(({ entry }) => resolveEntry(entry)));
      const resolved = batchResults.map((r, idx) =>
        r.status === 'fulfilled' ? r.value : {
          name: '—', team: '', teamAbbrev: batch[idx].abbrev,
          value: batch[idx].entry?.value ?? 0, display: String(Math.round(batch[idx].entry?.value ?? 0)),
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

    categories[cat.name] = {
      label: cat.displayName || cat.name,
      abbrev: cat.abbreviation || cat.name,
      leaders: top3Resolved,
      teamBest,
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
    const result = await coalesce('mlb:leaders', async () => {
      // 1. Fresh cache hit — return immediately
      const fresh = cache.get('mlb:leaders');
      if (fresh) return fresh;

      // 2. Try fresh fetch
      try {
        const data = await fetchAllLeaders();
        // Only cache if we actually got categories
        const catCount = Object.keys(data?.categories || {}).length;
        if (catCount > 0) {
          cache.set('mlb:leaders', data);
          return data;
        }
        // ESPN returned 200 but no matching categories — fall through to stale
        console.warn(`[mlb/leaders] fresh fetch returned 0 categories`);
      } catch (fetchErr) {
        console.warn(`[mlb/leaders] fresh fetch failed: ${fetchErr?.message}`);
      }

      // 3. Fresh fetch failed or empty — serve stale if available
      const stale = cache.getMaybeStale('mlb:leaders', STALE_TTL);
      if (stale?.value) {
        console.log(`[mlb/leaders] serving stale data (age=${Math.round(stale.ageMs / 1000)}s)`);
        return stale.value;
      }

      // 4. No stale data available — return empty
      return { categories: {}, fetchedAt: new Date().toISOString(), partial: true };
    });

    // Persist to KV so email pipeline can read directly (avoid self-fetch)
    setJson('mlb:leaders:latest', result, { exSeconds: 3600 }).catch(() => {});

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[mlb/leaders] error:', err?.message);

    // Last resort: serve stale even from outer catch
    const stale = cache.getMaybeStale('mlb:leaders', STALE_TTL);
    if (stale?.value) {
      console.log(`[mlb/leaders] serving stale data from error handler`);
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json(stale.value);
    }

    return res.status(500).json({ error: 'Failed to fetch leaders', categories: {} });
  }
}
