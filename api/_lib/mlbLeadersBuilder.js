/**
 * mlbLeadersBuilder — direct in-process MLB season leaders builder.
 *
 * Mirrors api/_lib/mlbPicksBuilder.js exactly. Replaces HTTP self-fetches
 * to /api/mlb/leaders which are unreliable on Vercel serverless:
 *   - leaders endpoint takes 10–30s (ESPN core API + athlete $ref
 *     resolution + per-team batched lookups)
 *   - cold-start cron invocations time out the internal fetch
 *   - in-memory cache doesn't survive between serverless invocations
 *
 * Both the HTTP handler (api/mlb/leaders.js) AND any in-process caller
 * (autopost, email pipeline) should call buildMlbLeadersData() here —
 * single source of truth.
 *
 * Fallback precedence:
 *   1. Fresh build from ESPN core API
 *   2. KV latest snapshot (mlb:leaders:latest, 1hr TTL)
 *   3. KV last-known-good snapshot (mlb:leaders:lastknown, 24hr TTL)
 *      — written whenever a fresh build yields ≥3 categories
 *   4. Empty board (true last resort)
 *
 * Output shape (identical to /api/mlb/leaders so consumers don't change):
 *   {
 *     categories: {
 *       homeRuns: { label, abbrev, leaders: [{ name, team, teamAbbrev, value, display }], teamBest: { ABBR: ... } },
 *       RBIs:     { ... },
 *       hits:     { ... },
 *       wins:     { ... },
 *       saves:    { ... },
 *     },
 *     fetchedAt: ISO string,
 *     _source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty' | 'error',
 *   }
 */

import { MLB_TEAMS, MLB_ESPN_IDS } from '../../src/sports/mlb/teams.js';
import { getJson, setJson } from '../_globalCache.js';

const KV_LATEST = 'mlb:leaders:latest';
const KV_LASTKNOWN = 'mlb:leaders:lastknown';
const LATEST_TTL_SEC = 60 * 60;             // 1 hour
const LASTKNOWN_TTL_SEC = 24 * 60 * 60;     // 24 hours

const FETCH_TIMEOUT = 8000;
const REF_TIMEOUT = 5000;

const TARGET_CATS = ['homeRuns', 'RBIs', 'hits', 'wins', 'saves'];
/** Caption builder rejects an empty caption when it can't resolve any
 *  category. We treat ≥3 of 5 as "good enough to publish" — better
 *  to ship a slightly thin League Leaders strip than to no-post. */
const MIN_CATEGORIES_FOR_LASTKNOWN_WRITE = 3;

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(MLB_ESPN_IDS)) espnIdToSlug[String(eid)] = slug;

const espnIdToAbbrev = {};
for (const team of MLB_TEAMS) {
  const eid = MLB_ESPN_IDS[team.slug];
  if (eid) espnIdToAbbrev[String(eid)] = team.abbrev;
}

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
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

function teamAbbrevFromRef(teamRef) {
  if (!teamRef) return '';
  const m = teamRef.match(/teams\/(\d+)/);
  return m ? (espnIdToAbbrev[m[1]] || '') : '';
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
        const t = MLB_TEAMS.find(t => t.slug === slug);
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

/**
 * Fresh ESPN-driven build. Same algorithm the HTTP handler used to run
 * inline; lifted into the lib so both surfaces share it.
 */
async function fetchLeadersFresh() {
  const season = getCurrentSeason();
  const url = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/${season}/types/2/leaders?limit=100`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) return { categories: {}, fetchedAt: new Date().toISOString() };

  const data = await r.json();
  const cats = data?.categories || [];
  const categories = {};

  for (const cat of cats) {
    if (!TARGET_CATS.includes(cat.name)) continue;

    const allEntries = cat.leaders || [];

    // Phase 1 — cheap team-best extraction (no HTTP)
    const teamBestEntries = new Map();
    for (const entry of allEntries) {
      const abbrev = teamAbbrevFromRef(entry.team?.$ref || '');
      if (abbrev && !teamBestEntries.has(abbrev)) teamBestEntries.set(abbrev, entry);
    }

    // Phase 2 — top-3 league leaders (parallel $ref resolution)
    const top3Entries = allEntries.slice(0, 3);
    const top3Results = await Promise.allSettled(top3Entries.map(resolveEntry));
    const top3Resolved = top3Results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : {
        name: '—', team: '', teamAbbrev: teamAbbrevFromRef(top3Entries[i]?.team?.$ref),
        value: top3Entries[i]?.value ?? 0, display: String(Math.round(top3Entries[i]?.value ?? 0)),
      }
    );

    // Phase 3 — per-team best (batched)
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
          value: batch[idx].entry?.value ?? 0, display: String(Math.round(batch[idx].entry?.value ?? 0)),
        }
      );
      for (let j = 0; j < batch.length; j++) {
        const abbrev = batch[j].abbrev;
        const r = resolved[j];
        if (!teamBest[abbrev]) teamBest[abbrev] = { name: r.name, value: r.value, display: r.display };
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

function categoryCount(data) {
  return Object.keys(data?.categories || {}).length;
}

function getCounts(data) {
  const cats = data?.categories || {};
  const out = {};
  for (const k of TARGET_CATS) {
    out[k] = cats[k]?.leaders?.length || 0;
  }
  out._categoriesFound = Object.keys(cats).length;
  out._missingCategories = TARGET_CATS.filter(k => !(cats[k]?.leaders?.length > 0));
  return out;
}

/**
 * Build leaders board directly (no HTTP self-fetch).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.preferFresh=false] — skip KV latest, force ESPN refetch
 * @returns {Promise<{ data, source, counts }>}
 */
export async function buildMlbLeadersData(opts = {}) {
  const { preferFresh = false } = opts;

  // Try fresh build first
  let freshData = null;
  let freshError = null;
  try {
    freshData = await fetchLeadersFresh();
    const freshCount = categoryCount(freshData);
    console.log(`[mlbLeadersBuilder] fresh build: categories=${freshCount}`);

    if (freshCount >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
      // Persist to KV so future cold starts (and other cron lanes) can recover
      setJson(KV_LATEST, freshData, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
      setJson(KV_LASTKNOWN, freshData, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
      return { data: freshData, source: 'fresh', counts: getCounts(freshData) };
    }
    if (freshCount > 0) {
      // Partial fresh — write to KV_LATEST only (don't pollute lastknown)
      setJson(KV_LATEST, freshData, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
    }
  } catch (err) {
    freshError = err.message;
    console.warn(`[mlbLeadersBuilder] fresh build failed: ${err.message}`);
  }

  // Fresh build failed or partial — try KV latest (1hr)
  if (!preferFresh) {
    try {
      const latest = await getJson(KV_LATEST);
      if (categoryCount(latest) >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
        console.log(`[mlbLeadersBuilder] using KV latest snapshot: categories=${categoryCount(latest)}`);
        return { data: latest, source: 'kv_latest', counts: getCounts(latest) };
      }
    } catch (err) {
      console.warn(`[mlbLeadersBuilder] KV latest read failed: ${err.message}`);
    }
  }

  // Try last-known-good (24hr)
  try {
    const lastknown = await getJson(KV_LASTKNOWN);
    if (categoryCount(lastknown) >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
      console.log(`[mlbLeadersBuilder] using KV last-known-good: categories=${categoryCount(lastknown)}`);
      return { data: lastknown, source: 'kv_lastknown', counts: getCounts(lastknown) };
    }
  } catch (err) {
    console.warn(`[mlbLeadersBuilder] KV lastknown read failed: ${err.message}`);
  }

  // Last resort — return whatever fresh data we have (could be empty/partial)
  // OR a structured empty board with the underlying error.
  const empty = freshData || {
    categories: {},
    fetchedAt: new Date().toISOString(),
    _error: freshError || 'no data available',
  };
  console.warn(`[mlbLeadersBuilder] all sources empty/partial — returning categories=${categoryCount(empty)}`);
  return { data: empty, source: 'empty', counts: getCounts(empty) };
}

export const MLB_LEADERS_TARGET_CATEGORIES = TARGET_CATS;
