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
import { LEADER_CATEGORIES, LEADER_KEYS, ESPN_CATEGORY_MAP } from '../../src/data/nba/seasonLeaders.js';
import { getJson, setJson } from '../_globalCache.js';
import { fetchNbaPlayoffScheduleWindow } from './nbaPlayoffSchedule.js';
import {
  buildNbaPostseasonLeadersFromBoxScores,
  hasValidLeaderCategories,
  hasValidPostseasonTotalsPayload,
  buildValidPlayoffTeamSlugs,
} from './nbaBoxScoreLeaders.js';
import { buildNbaPlayoffContext } from '../../src/data/nba/playoffContext.js';

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

// Canonical category keys (audit Part 1: TOTALS, not averages).
//   pts / ast / reb / stl / blk
// ESPN's leaders endpoint may emit either the canonical key OR the
// alternate names (e.g. `points`, `totalAssists`) — ESPN_CATEGORY_MAP
// resolves both. Anything that doesn't map to a canonical key is
// skipped.
const TARGET_CATS = LEADER_KEYS;
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

/**
 * Per-game average formatter — 1 decimal. Mirrors ESPN editorial table
 * (e.g. "33.8" not "33.83"). Returns '0.0' for zero/NaN.
 */
function formatPerGame(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.0';
  return n.toFixed(1);
}

async function resolveEntry(entry, { isAverage = true } = {}) {
  const athleteRef = entry.athlete?.$ref || '';
  const teamRef = entry.team?.$ref || '';

  let athleteName = '—';
  let teamAbbrev = '';
  let teamName = '';
  let teamSlug = null;

  if (teamRef) {
    const m = teamRef.match(/teams\/(\d+)/);
    if (m) {
      const tid = m[1];
      teamAbbrev = espnIdToAbbrev[tid] || '';
      const slug = espnIdToSlug[tid];
      if (slug) {
        teamSlug = slug;
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
  const display = isAverage
    ? formatPerGame(value)
    : (Number.isFinite(value) ? String(Math.round(value)) : '0');
  return {
    name: athleteName,
    team: teamName,
    teamAbbrev,
    teamSlug,
    value: isAverage ? Number(value.toFixed(1)) : Math.round(value),
    display,
  };
}

async function fetchLeadersFresh(seasonType = 'regular', validPlayoffTeamSlugs = null) {
  const season = getCurrentSeason();
  const typeId = espnSeasonType(seasonType);
  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/types/${typeId}/leaders?limit=100`;

  // [NBA_POSTSEASON_LEADERS_ESPN_FETCH] — single line traceability
  // for the ESPN-first path. Emitted on EVERY postseason fetch so a
  // failed/empty ESPN response is visible from the console alone.
  if (seasonType === 'postseason') {
    console.log('[NBA_POSTSEASON_LEADERS_ESPN_FETCH]', JSON.stringify({
      url, season, typeId,
    }));
  }

  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) {
    if (seasonType === 'postseason') {
      console.warn('[NBA_POSTSEASON_LEADERS_ESPN_FETCH_FAIL]', JSON.stringify({
        status: r.status, url,
      }));
    }
    return { categories: {}, fetchedAt: new Date().toISOString(), seasonType };
  }

  const data = await r.json();
  const cats = data?.categories || [];
  const categories = {};

  // ESPN's leaders endpoint can return BOTH per-game (avgPoints,
  // pointsPerGame) AND total (points, totalPoints) categories. For
  // postseason we PREFER per-game averages — the editorial convention
  // mirrors ESPN's own postseason leaders table (33.8 PPG, 26.3 PPG).
  // We keep the canonical key (pts/ast/reb/stl/blk) but route the
  // per-game ESPN category to it when both are present.
  const isAverageMetric = seasonType === 'postseason';
  const perGameCategoryNames = new Set([
    'avgPoints', 'pointsPerGame',
    'avgAssists', 'assistsPerGame',
    'avgRebounds', 'reboundsPerGame',
    'avgSteals', 'stealsPerGame',
    'avgBlocks', 'blocksPerGame',
  ]);
  // First pass: claim per-game categories. They take priority over
  // totals so ESPN's avgPoints output beats the duplicate `points`
  // total entry.
  const claimedKeys = new Set();
  if (isAverageMetric) {
    for (const cat of cats) {
      if (!perGameCategoryNames.has(cat.name)) continue;
      const canonicalKey = ESPN_CATEGORY_MAP[cat.name];
      if (canonicalKey && TARGET_CATS.includes(canonicalKey)) {
        claimedKeys.add(canonicalKey);
      }
    }
  }

  // Postseason team filter: ESPN's types/3 leaders endpoint sometimes
  // surfaces all-NBA leaders (regular-season totals) instead of true
  // postseason leaders. We refuse to accept any entry whose team is
  // not in the active playoff field. Without this gate, NOP/POR/DAL
  // stars who never made the playoffs would still appear on Slide 2.
  const useTeamFilter = seasonType === 'postseason'
    && validPlayoffTeamSlugs
    && validPlayoffTeamSlugs.size > 0;
  const teamSlugFromRef = (ref) => {
    if (!ref) return null;
    const m = ref.match(/teams\/(\d+)/);
    return m ? (espnIdToSlug[m[1]] || null) : null;
  };
  let totalLeaderEntries = 0;
  let droppedByTeamFilter = 0;
  const droppedTeamSlugs = new Set();

  for (const cat of cats) {
    // Map ESPN's category name to our canonical key. Accepts averages
    // (`avgPoints`, `pointsPerGame`) AND totals (`points`,
    // `totalPoints`) — averages preferred for postseason. We KEEP the
    // canonical key so consumers iterate `pts/ast/...`.
    const canonicalKey = ESPN_CATEGORY_MAP[cat.name];
    if (!canonicalKey || !TARGET_CATS.includes(canonicalKey)) continue;
    // Postseason: skip the totals entry if the per-game entry has
    // already claimed this canonical key.
    if (isAverageMetric && claimedKeys.has(canonicalKey) && !perGameCategoryNames.has(cat.name)) {
      continue;
    }

    let allEntries = cat.leaders || [];
    totalLeaderEntries += allEntries.length;
    if (useTeamFilter) {
      const before = allEntries.length;
      allEntries = allEntries.filter(e => {
        const slug = teamSlugFromRef(e?.team?.$ref || '');
        if (!slug) {
          droppedByTeamFilter += 1;
          return false;
        }
        if (!validPlayoffTeamSlugs.has(slug)) {
          droppedByTeamFilter += 1;
          droppedTeamSlugs.add(slug);
          return false;
        }
        return true;
      });
      if (allEntries.length === 0) continue; // skip empty category
      // Diagnostic: per-category visibility.
      if (before !== allEntries.length) {
        console.log('[NBA_LEADERS_FRESH_TEAM_FILTER]', JSON.stringify({
          category: canonicalKey,
          before, after: allEntries.length, dropped: before - allEntries.length,
        }));
      }
    }

    // Phase 1 — cheap team-best extraction (no HTTP)
    const teamBestEntries = new Map();
    for (const entry of allEntries) {
      const abbrev = teamAbbrevFromRef(entry.team?.$ref || '');
      if (abbrev && !teamBestEntries.has(abbrev)) teamBestEntries.set(abbrev, entry);
    }

    // Phase 2 — top-3 league leaders (parallel $ref resolution)
    const top3Entries = allEntries.slice(0, 3);
    const top3Results = await Promise.allSettled(
      top3Entries.map(e => resolveEntry(e, { isAverage: isAverageMetric }))
    );
    const top3Resolved = top3Results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : {
        name: '—', team: '', teamAbbrev: teamAbbrevFromRef(top3Entries[i]?.team?.$ref),
        value: Number(top3Entries[i]?.value ?? 0),
        display: isAverageMetric
          ? formatPerGame(top3Entries[i]?.value ?? 0)
          : String(Math.round(Number(top3Entries[i]?.value ?? 0))),
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
      const batchResults = await Promise.allSettled(
        batch.map(({ entry }) => resolveEntry(entry, { isAverage: isAverageMetric }))
      );
      const resolved = batchResults.map((r, idx) =>
        r.status === 'fulfilled' ? r.value : {
          name: '—', team: '', teamAbbrev: batch[idx].abbrev,
          value: Number(batch[idx].entry?.value ?? 0),
          display: isAverageMetric
            ? formatPerGame(batch[idx].entry?.value ?? 0)
            : String(Math.round(Number(batch[idx].entry?.value ?? 0))),
        }
      );
      for (let j = 0; j < batch.length; j++) {
        const abbrev = batch[j].abbrev;
        const r = resolved[j];
        if (!teamBest[abbrev]) teamBest[abbrev] = { name: r.name, value: r.value, display: r.display };
      }
    }

    const labels = LABEL_BY_KEY[canonicalKey] || {};
    categories[canonicalKey] = {
      label: labels.label || cat.displayName || canonicalKey,
      abbrev: labels.abbrev || cat.abbreviation || canonicalKey,
      leaders: top3Resolved,
      teamBest,
    };
  }

  if (useTeamFilter && (droppedByTeamFilter > 0 || droppedTeamSlugs.size > 0)) {
    console.log('[NBA_LEADERS_FRESH_TEAM_FILTER_SUMMARY]', JSON.stringify({
      seasonType,
      totalLeaderEntries,
      droppedByTeamFilter,
      droppedTeamSlugs: Array.from(droppedTeamSlugs).sort(),
    }));
  }

  // [NBA_POSTSEASON_LEADERS_ESPN_NORMALIZED] — single canonical line
  // showing what we got from ESPN after team-filter + per-category
  // shaping. If this is empty, the postseason builder will fall back
  // to box-score aggregation.
  if (seasonType === 'postseason') {
    console.log('[NBA_POSTSEASON_LEADERS_ESPN_NORMALIZED]', JSON.stringify({
      url,
      categoriesFound: Object.keys(categories),
      totalLeaderEntries,
      droppedByTeamFilter,
      perCategoryTop: Object.fromEntries(
        Object.entries(categories).map(([k, v]) => [
          k,
          (v?.leaders || []).slice(0, 3).map(p => ({
            name: p.name,
            team: p.teamAbbrev,
            value: p.value,
            display: p.display,
          })),
        ])
      ),
    }));
  }

  return {
    categories,
    fetchedAt: new Date().toISOString(),
    seasonType,
    // Per-game averages for postseason (mirrors ESPN's editorial table).
    // Regular season also uses averages so consumers don't need to
    // branch on seasonType for formatting.
    statType: seasonType === 'postseason' ? 'averages' : undefined,
  };
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
/**
 * `true` when ANY canonical leader category has at least one leader. Used
 * to decide whether a freshly-aggregated payload is shippable — we don't
 * require all 5 categories to be populated before rendering. A category
 * with zero leaders renders as a per-cell "Updating" placeholder; the
 * other categories still ship.
 */
export function hasAnyValidLeaderCategory(leaders) {
  return Object.values(leaders?.categories || {}).some(
    c => Array.isArray(c?.leaders) && c.leaders.length > 0
  );
}

/**
 * Postseason leaders builder — ESPN-FIRST with box-score fallback.
 *
 * Order of operations:
 *   1. Build the canonical playoff team set + window games.
 *   2. PRIMARY: hit ESPN's types/3 leaders endpoint (per-game averages)
 *      filtered by playoff teams. The endpoint mirrors ESPN's editorial
 *      postseason table (33.8 PPG, 26.3 PPG, etc.) so the slide reads
 *      identical to ESPN's web view.
 *   3. FALLBACK: aggregate from completed playoff box scores and convert
 *      totals → averages using gamesPlayed.
 *   4. Cache fallback (KV latest / lastknown) only if both fail.
 *
 * Team filter (audit Part 3): playoff teams = bracket-anchored UNION
 * teams that played a Round-1 game. Eliminated R1 teams stay in the
 * filter — their players are still legitimate postseason leaders.
 * Play-in only teams are excluded.
 */
async function buildPostseasonLeadersData({ preferFresh: _preferFresh = false, keys }) {
  // 1. Build the canonical playoff team set + window games.
  let validPlayoffTeamSlugs = null;
  let psWindowGames = [];
  try {
    const { games } = await fetchNbaPlayoffScheduleWindow({ daysBack: 21, daysForward: 1 });
    psWindowGames = games || [];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: psWindowGames });
    validPlayoffTeamSlugs = buildValidPlayoffTeamSlugs(ctx, psWindowGames);
    console.log('[NBA_PLAYOFF_TEAMS_FINAL]', JSON.stringify({
      teams: Array.from(validPlayoffTeamSlugs).sort(),
      size: validPlayoffTeamSlugs.size,
      windowGames: psWindowGames.length,
    }));
  } catch (err) {
    console.warn(`[nbaLeadersBuilder] postseason team set build failed: ${err.message}`);
  }

  const haveTeamSet = !!(validPlayoffTeamSlugs && validPlayoffTeamSlugs.size > 0);
  const haveGames   = !!(psWindowGames && psWindowGames.length > 0);

  // 2. PRIMARY — ESPN /types/3 leaders endpoint (per-game averages).
  //    Filter to playoff teams (alive OR eliminated, play-in excluded).
  try {
    const espnFresh = await fetchLeadersFresh('postseason', validPlayoffTeamSlugs);
    if (hasAnyValidLeaderCategory(espnFresh)) {
      const espnPayload = { ...espnFresh, _source: 'espn_postseason', statType: 'averages' };
      const isFull = hasValidPostseasonTotalsPayload(espnPayload, null, { allowMissingTeamSet: true });
      if (isFull) {
        setJson(keys.latest, espnPayload, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
        setJson(keys.lastknown, espnPayload, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
      } else {
        console.warn(`[nbaLeadersBuilder] ESPN postseason partial (categories=${categoryCount(espnPayload)}) — shipping without cache write`);
      }
      console.log('[NBA_POSTSEASON_LEADERS_FINAL]', JSON.stringify({
        source: 'espn_postseason',
        statType: 'averages',
        categories: Object.fromEntries(
          Object.entries(espnPayload.categories || {}).map(([k, v]) => [
            k,
            (v?.leaders || []).map(p => ({
              name: p.name, team: p.teamAbbrev, value: p.value, display: p.display,
            })),
          ])
        ),
      }));
      return {
        data: espnPayload,
        source: isFull ? 'espn_postseason' : 'espn_postseason_partial',
        counts: getCounts(espnPayload),
      };
    }
    console.warn('[NBA_POSTSEASON_LEADERS_FALLBACK_USED]', JSON.stringify({
      reason: 'espn_returned_zero_valid_categories',
    }));
  } catch (err) {
    console.warn('[NBA_POSTSEASON_LEADERS_FALLBACK_USED]', JSON.stringify({
      reason: 'espn_fetch_threw',
      error: err?.message || String(err),
    }));
  }

  // 3. FALLBACK — box-score aggregation (totals → per-game averages).
  if (haveGames) {
    try {
      console.log(`[nbaLeadersBuilder] postseason → box-score fallback (games=${psWindowGames.length}, bracketTeams=${validPlayoffTeamSlugs?.size ?? 0})`);
      const aggregate = await buildNbaPostseasonLeadersFromBoxScores({
        windowGames: psWindowGames,
        validPlayoffTeamSlugs,
      });
      if (hasAnyValidLeaderCategory(aggregate)) {
        const isFull = hasValidPostseasonTotalsPayload(aggregate, null, { allowMissingTeamSet: true });
        if (isFull) {
          setJson(keys.latest, aggregate, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
          setJson(keys.lastknown, aggregate, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
        } else {
          console.warn(`[nbaLeadersBuilder] box-score aggregate partial (categories=${categoryCount(aggregate)}, missing=${getCounts(aggregate)._missingCategories?.join(',')}) — shipping without cache write`);
        }
        return {
          data: aggregate,
          source: isFull ? 'boxscore_aggregate' : 'boxscore_aggregate_partial',
          counts: getCounts(aggregate),
        };
      }
      console.warn('[nbaLeadersBuilder] box-score aggregation produced 0 valid categories — falling through to cache');
    } catch (err) {
      console.warn(`[nbaLeadersBuilder] box-score aggregation failed: ${err.message}`);
    }
  }

  // 3. Cache fallback. Reached only when aggregation produced nothing
  //    (no games, or every category empty after filters). Strict
  //    validator: when we have a bracket team set, every leader's team
  //    must be in it. When we only have games (no bracket yet), allow
  //    the missing-team-set escape so cache reads aren't unconditionally
  //    rejected.
  const cacheValidatorOpts = haveTeamSet ? {} : { allowMissingTeamSet: true };
  try {
    const latest = await getJson(keys.latest);
    if (hasValidPostseasonTotalsPayload(latest, validPlayoffTeamSlugs, cacheValidatorOpts)) {
      console.log(`[nbaLeadersBuilder] using KV latest (postseason fallback): categories=${categoryCount(latest)}`);
      return { data: latest, source: 'kv_latest', counts: getCounts(latest) };
    }
    if (latest) {
      console.warn(`[nbaLeadersBuilder] KV latest postseason rejected (categories=${categoryCount(latest)}, missing=${getCounts(latest)._missingCategories?.join(',')}) — likely poisoned`);
    }
  } catch (err) {
    console.warn(`[nbaLeadersBuilder] KV latest read failed: ${err.message}`);
  }

  try {
    const lastknown = await getJson(keys.lastknown);
    if (hasValidPostseasonTotalsPayload(lastknown, validPlayoffTeamSlugs, cacheValidatorOpts)) {
      console.log(`[nbaLeadersBuilder] using KV last-known-good (postseason fallback): categories=${categoryCount(lastknown)}`);
      return { data: lastknown, source: 'kv_lastknown', counts: getCounts(lastknown) };
    }
    if (lastknown) {
      console.warn(`[nbaLeadersBuilder] KV lastknown postseason rejected (categories=${categoryCount(lastknown)}, missing=${getCounts(lastknown)._missingCategories?.join(',')}) — likely poisoned`);
    }
  } catch (err) {
    console.warn(`[nbaLeadersBuilder] KV lastknown read failed: ${err.message}`);
  }

  // 4. All sources failed — return empty postseason payload (NEVER
  //    fall through to ESPN regular-season data). When we never even
  //    had games to try aggregation, log it specifically.
  if (!haveTeamSet && !haveGames) {
    console.warn('[nbaLeadersBuilder] postseason: no team set AND no games — returning empty');
    return {
      data: emptyPostseasonPayload('no playoff team set or games available'),
      source: 'empty',
      counts: getCounts({ categories: {} }),
    };
  }
  console.warn('[nbaLeadersBuilder] postseason: all sources empty — returning placeholder');
  return {
    data: emptyPostseasonPayload('postseason aggregate unavailable'),
    source: 'empty',
    counts: getCounts({ categories: {} }),
  };
}

function emptyPostseasonPayload(reason) {
  return {
    categories: {},
    fetchedAt: new Date().toISOString(),
    seasonType: 'postseason',
    statType: 'averages',
    _source: 'empty',
    _error: reason,
  };
}

export async function buildNbaLeadersData(opts = {}) {
  const { preferFresh = false, seasonType = 'regular' } = opts;
  const keys = kvKeys(seasonType);
  const isStrictPostseason = seasonType === 'postseason';

  // ────────────────────────────────────────────────────────────────────
  // POSTSEASON PATH — BOX-SCORE ONLY
  // ────────────────────────────────────────────────────────────────────
  // ESPN's types/3 leaders endpoint has historically returned all-NBA
  // stat leaders rather than playoff-only — even with type=3 it can
  // include stars from non-playoff teams (NOP/POR/DAL). Filtering it
  // after the fact is fragile (relies on the playoff team set being
  // built successfully on EVERY request). We bypass it entirely for
  // postseason and always derive leaders from real playoff box scores.
  //
  // Pipeline:
  //   1. Build the canonical playoff team set from the schedule window
  //      UNION the static bracket. If we can't build a non-empty set,
  //      we refuse to ship any postseason data (return empty placeholder).
  //   2. Try KV cache reads — must pass strict validator (totals + every
  //      leader on a valid playoff team).
  //   3. Aggregate from box scores with the playoff team filter applied.
  //   4. Validate the aggregate before writing to lastknown.
  //
  // Regular-season path (below) keeps the ESPN types/2 fast path.
  // ────────────────────────────────────────────────────────────────────
  if (isStrictPostseason) {
    return await buildPostseasonLeadersData({ preferFresh, keys });
  }

  // ────────────────────────────────────────────────────────────────────
  // REGULAR-SEASON PATH — original ESPN types/2 flow.
  // ────────────────────────────────────────────────────────────────────
  let freshData = null;
  let freshError = null;
  try {
    freshData = await fetchLeadersFresh(seasonType, null);
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

  // ── Postseason has NO regular-season fallback (audit Part 2) ──
  // Showing regular-season leaders under a "Postseason Leaders" section
  // is misleading — Slide 2 would silently render summer-league or
  // regular-season players as if they were the playoff leaderboard. We
  // deliberately drop the regular_fallback path here so Slide 2 either
  // shows a real postseason source (ESPN types/3 / KV cache / box-score
  // aggregate) or renders the explicit "Postseason feed updating"
  // placeholder.

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
