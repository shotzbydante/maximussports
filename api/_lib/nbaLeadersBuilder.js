/**
 * nbaLeadersBuilder — direct in-process NBA season leaders builder.
 *
 * Mirrors api/_lib/mlbLeadersBuilder.js exactly. Replaces HTTP self-fetches
 * to /api/nba/leaders which are unreliable on Vercel serverless:
 *   - leaders endpoint takes 10–30s (ESPN core API + athlete $ref
 *     resolution + per-team batched lookups)
 *   - cold-start cron invocations time out the internal fetch
 *   - in-memory cache doesn't survive between serverless invocations
 *
 * Both the HTTP handler (api/nba/leaders.js) AND any in-process caller
 * (autopost, email pipeline) should call buildNbaLeadersData() — single
 * source of truth.
 *
 * Fallback precedence:
 *   1. Fresh build from ESPN core API
 *   2. KV latest snapshot (nba:leaders:latest, 1hr TTL)
 *   3. KV last-known-good snapshot (nba:leaders:lastknown, 24hr TTL)
 *      — written whenever a fresh build yields ≥3 categories
 *   4. Empty board (true last resort)
 *
 * Output shape (identical to /api/nba/leaders so consumers don't change):
 *   {
 *     categories: {
 *       avgPoints:   { label, abbrev, leaders: [{ name, team, teamAbbrev, value, display }], teamBest: { ABBR: ... } },
 *       avgAssists:  { ... },
 *       avgRebounds: { ... },
 *       avgSteals:   { ... },
 *       avgBlocks:   { ... },
 *     },
 *     fetchedAt: ISO string,
 *     _source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty' | 'error',
 *   }
 */

import { NBA_TEAMS, NBA_ESPN_IDS } from '../../src/sports/nba/teams.js';
import { LEADER_CATEGORIES, LEADER_KEYS } from '../../src/data/nba/seasonLeaders.js';
import { getJson, setJson } from '../_globalCache.js';

// KV keys are namespaced by season type so postseason and regular
// season caches don't poison each other.
const LATEST_TTL_SEC = 60 * 60;             // 1 hour
const LASTKNOWN_TTL_SEC = 24 * 60 * 60;     // 24 hours

function kvKeys(seasonType) {
  const slug = seasonType === 'postseason' ? 'postseason' : 'regular';
  return {
    latest: `nba:leaders:${slug}:latest`,
    lastknown: `nba:leaders:${slug}:lastknown`,
  };
}

// ESPN season-type integer:
//   regular season = 2
//   postseason     = 3
function espnSeasonType(seasonType) {
  return seasonType === 'postseason' ? 3 : 2;
}

const FETCH_TIMEOUT = 8000;
const REF_TIMEOUT = 5000;

const TARGET_CATS = LEADER_KEYS;            // avgPoints, avgAssists, avgRebounds, avgSteals, avgBlocks
const MIN_CATEGORIES_FOR_LASTKNOWN_WRITE = 3;

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
  // NBA season ends in June, labeled by ENDING year.
  // Pre-October = previous-year season label (regular season just finished).
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

async function fetchLeadersFresh(seasonType = 'regular') {
  const season = getCurrentSeason();
  const typeId = espnSeasonType(seasonType);
  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/types/${typeId}/leaders?limit=100`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) return { categories: {}, fetchedAt: new Date().toISOString(), seasonType };

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
        value: Number(top3Entries[i]?.value ?? 0),
        display: formatPerGame(top3Entries[i]?.value ?? 0),
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
          value: Number(batch[idx].entry?.value ?? 0),
          display: formatPerGame(batch[idx].entry?.value ?? 0),
        }
      );
      for (let j = 0; j < batch.length; j++) {
        const abbrev = batch[j].abbrev;
        const r = resolved[j];
        if (!teamBest[abbrev]) teamBest[abbrev] = { name: r.name, value: r.value, display: r.display };
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

  return { categories, fetchedAt: new Date().toISOString(), seasonType };
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
 * @param {'regular'|'postseason'} [opts.seasonType='regular']
 *        For NBA Daily Briefing during the playoffs, callers should pass
 *        'postseason' to hit ESPN types/3. Each season type has its own
 *        KV namespace so caches don't cross-pollinate.
 * @param {boolean} [opts.preferFresh=false] — skip KV latest, force ESPN refetch
 * @returns {Promise<{ data, source, counts }>}
 */
export async function buildNbaLeadersData(opts = {}) {
  const { preferFresh = false, seasonType = 'regular' } = opts;
  const keys = kvKeys(seasonType);

  let freshData = null;
  let freshError = null;
  try {
    freshData = await fetchLeadersFresh(seasonType);
    const freshCount = categoryCount(freshData);
    console.log(`[nbaLeadersBuilder] fresh build: seasonType=${seasonType} categories=${freshCount}`);

    if (freshCount >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
      setJson(keys.latest, freshData, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
      setJson(keys.lastknown, freshData, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
      return { data: freshData, source: 'fresh', counts: getCounts(freshData) };
    }
    if (freshCount > 0) {
      setJson(keys.latest, freshData, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
    }
  } catch (err) {
    freshError = err.message;
    console.warn(`[nbaLeadersBuilder] fresh build failed (seasonType=${seasonType}): ${err.message}`);
  }

  if (!preferFresh) {
    try {
      const latest = await getJson(keys.latest);
      if (categoryCount(latest) >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
        console.log(`[nbaLeadersBuilder] using KV latest (${seasonType}): categories=${categoryCount(latest)}`);
        return { data: latest, source: 'kv_latest', counts: getCounts(latest) };
      }
    } catch (err) {
      console.warn(`[nbaLeadersBuilder] KV latest read failed: ${err.message}`);
    }
  }

  try {
    const lastknown = await getJson(keys.lastknown);
    if (categoryCount(lastknown) >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
      console.log(`[nbaLeadersBuilder] using KV last-known-good (${seasonType}): categories=${categoryCount(lastknown)}`);
      return { data: lastknown, source: 'kv_lastknown', counts: getCounts(lastknown) };
    }
  } catch (err) {
    console.warn(`[nbaLeadersBuilder] KV lastknown read failed: ${err.message}`);
  }

  // ── Postseason fallback to regular season ──
  // ESPN's types/3 leaders endpoint is sometimes empty early in the
  // postseason. Rather than render a blank Slide 2, surface regular-
  // season leaders with source='regular_fallback' so consumers can show
  // a small "Reg. season" tag. The caption layer can decide whether to
  // gate on this.
  if (seasonType === 'postseason') {
    try {
      console.log('[nbaLeadersBuilder] postseason empty — falling back to regular season');
      const regularKeys = kvKeys('regular');
      const regular = await getJson(regularKeys.lastknown) || await getJson(regularKeys.latest);
      if (categoryCount(regular) >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
        return { data: { ...regular, seasonType: 'regular' }, source: 'regular_fallback', counts: getCounts(regular) };
      }
      // Last-ditch fresh regular-season fetch
      const fresh = await fetchLeadersFresh('regular');
      if (categoryCount(fresh) >= MIN_CATEGORIES_FOR_LASTKNOWN_WRITE) {
        return { data: fresh, source: 'regular_fallback', counts: getCounts(fresh) };
      }
    } catch (err) {
      console.warn(`[nbaLeadersBuilder] regular-season fallback failed: ${err.message}`);
    }
  }

  const empty = freshData || {
    categories: {},
    fetchedAt: new Date().toISOString(),
    seasonType,
    _error: freshError || 'no data available',
  };
  console.warn(`[nbaLeadersBuilder] all sources empty/partial — seasonType=${seasonType} categories=${categoryCount(empty)}`);
  return { data: empty, source: 'empty', counts: getCounts(empty) };
}

export const NBA_LEADERS_TARGET_CATEGORIES = TARGET_CATS;
