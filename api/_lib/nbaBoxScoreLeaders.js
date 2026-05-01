/**
 * nbaBoxScoreLeaders — fallback postseason leaders builder via per-game
 * ESPN box-score aggregation.
 *
 * Used when /v2/.../seasons/{year}/types/3/leaders returns empty (which
 * happens early in the postseason, when ESPN's leaders feed lags by 1-2
 * games). Aggregates player stats across the recent playoff window and
 * computes per-game averages.
 *
 * Trade-offs:
 *   - 1 HTTP call per completed playoff game (parallel, capped)
 *   - Athlete name resolution comes from the box score itself, no extra
 *     $ref calls
 *   - Includes only players with ≥2 games to avoid a single 40-pt outlier
 *     dominating the slide
 *
 * Output shape matches the ESPN leaders endpoint so downstream
 * consumers (normalizer / Slide 2) don't change:
 *   {
 *     categories: {
 *       avgPoints:   { label, abbrev, leaders: [...top3], teamBest: {...} },
 *       avgAssists:  { ... },
 *       avgRebounds: { ... },
 *       avgSteals:   { ... },
 *       avgBlocks:   { ... },
 *     },
 *     fetchedAt, seasonType: 'postseason', _source: 'boxscore_aggregate',
 *   }
 */

import { LEADER_CATEGORIES, LEADER_KEYS } from '../../src/data/nba/seasonLeaders.js';
import { NBA_TEAMS, NBA_ESPN_IDS } from '../../src/sports/nba/teams.js';

const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const FETCH_TIMEOUT_MS = 6000;
const MAX_PARALLEL_GAMES = 30; // cap to keep total time bounded
const MIN_GAMES_FOR_LEADER = 2;

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

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
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

/**
 * Find the column-index of a given stat label inside a box-score
 * statistics block. ESPN exposes:
 *   stats: ['MIN', '17:38'] keyed at row level via labels[]
 * We just match by upper-cased label name.
 */
function statIndexByLabel(labels, target) {
  if (!Array.isArray(labels)) return -1;
  const wanted = target.toLowerCase();
  for (let i = 0; i < labels.length; i++) {
    const l = (labels[i] || '').toString().toLowerCase();
    if (l === wanted || l === wanted.charAt(0)) return i;
  }
  return -1;
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pull player stat rows from a single ESPN summary response.
 *
 * Returns an array of:
 *   { playerId, name, teamAbbrev, teamSlug, points, assists, rebounds, steals, blocks }
 */
function parseBoxScore(summary) {
  const rows = [];
  const teams = summary?.boxscore?.players || [];
  for (const teamBlock of teams) {
    const espnTeamId = String(teamBlock?.team?.id || '');
    const teamAbbrev = espnIdToAbbrev[espnTeamId] || teamBlock?.team?.abbreviation || '';
    const teamSlug = espnIdToSlug[espnTeamId] || null;

    // ESPN groups stats per team by category (e.g. starters/bench).
    // Iterate every group and aggregate at the player level.
    for (const stat of (teamBlock?.statistics || [])) {
      const labels = stat?.labels || [];
      const ptsIdx = statIndexByLabel(labels, 'PTS');
      const astIdx = statIndexByLabel(labels, 'AST');
      const rebIdx = statIndexByLabel(labels, 'REB');
      const stlIdx = statIndexByLabel(labels, 'STL');
      const blkIdx = statIndexByLabel(labels, 'BLK');
      // Need at least PTS to count this row meaningfully
      if (ptsIdx < 0) continue;

      for (const athleteRow of (stat?.athletes || [])) {
        const athlete = athleteRow?.athlete;
        if (!athlete) continue;
        const stats = athleteRow?.stats || [];
        // ESPN sometimes emits 'DNP' rows where stats is shorter than labels
        if (stats.length < ptsIdx + 1) continue;

        rows.push({
          playerId: String(athlete.id || athlete.uid || athlete.displayName),
          name: athlete.displayName || athlete.fullName || '—',
          teamAbbrev,
          teamSlug,
          points: asNum(stats[ptsIdx]),
          assists: astIdx >= 0 ? asNum(stats[astIdx]) : 0,
          rebounds: rebIdx >= 0 ? asNum(stats[rebIdx]) : 0,
          steals: stlIdx >= 0 ? asNum(stats[stlIdx]) : 0,
          blocks: blkIdx >= 0 ? asNum(stats[blkIdx]) : 0,
        });
      }
    }
  }
  return rows;
}

async function fetchOneSummary(gameId) {
  try {
    const r = await fetchWithTimeout(`${SUMMARY_BASE}?event=${gameId}`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function topN(playerMap, key, n = 3) {
  return Object.values(playerMap)
    .filter(p => p.gamesPlayed >= MIN_GAMES_FOR_LEADER)
    .map(p => ({
      ...p,
      avg: p.gamesPlayed > 0 ? p[key] / p.gamesPlayed : 0,
    }))
    .filter(p => p.avg > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, n);
}

function categoryFromTopN(catKey, top) {
  const labels = LABEL_BY_KEY[catKey] || {};
  return {
    label: labels.label || catKey,
    abbrev: labels.abbrev || catKey,
    leaders: top.map(p => ({
      name: p.name,
      team: '',
      teamAbbrev: p.teamAbbrev,
      teamSlug: p.teamSlug,
      value: p.avg,
      display: p.avg.toFixed(1),
    })),
    teamBest: {},
  };
}

/**
 * Build postseason leaders by aggregating box scores from completed
 * playoff games in the supplied schedule window.
 *
 * @param {object} opts
 * @param {Array}  opts.windowGames — output of fetchNbaPlayoffScheduleWindow
 *                                    (only games with status='final' are used)
 * @returns {Promise<{ categories, fetchedAt, seasonType, _source }|null>}
 *          Returns null if there are no completed games to aggregate.
 */
export async function buildNbaPostseasonLeadersFromBoxScores({ windowGames = [] } = {}) {
  const finals = (windowGames || []).filter(g =>
    g?.gameState?.isFinal || g?.status === 'final'
  );
  if (finals.length === 0) {
    console.warn('[nbaBoxScoreLeaders] no completed games in window — cannot aggregate');
    return null;
  }

  const games = finals.slice(0, MAX_PARALLEL_GAMES);
  console.log(`[nbaBoxScoreLeaders] aggregating ${games.length} games`);

  const summaries = await Promise.all(
    games.map(g => fetchOneSummary(g.gameId))
  );

  const playerMap = {};
  let parsedGames = 0;
  for (const summary of summaries) {
    if (!summary) continue;
    parsedGames += 1;
    const rows = parseBoxScore(summary);
    for (const row of rows) {
      if (!row.playerId) continue;
      const p = playerMap[row.playerId] || {
        playerId: row.playerId,
        name: row.name,
        teamAbbrev: row.teamAbbrev,
        teamSlug: row.teamSlug,
        gamesPlayed: 0,
        points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0,
      };
      p.gamesPlayed += 1;
      p.points += row.points;
      p.assists += row.assists;
      p.rebounds += row.rebounds;
      p.steals += row.steals;
      p.blocks += row.blocks;
      // Refresh team in case a player was traded mid-postseason — keep most recent
      p.teamAbbrev = row.teamAbbrev || p.teamAbbrev;
      p.teamSlug = row.teamSlug || p.teamSlug;
      playerMap[row.playerId] = p;
    }
  }

  const playerCount = Object.keys(playerMap).length;
  console.log(`[nbaBoxScoreLeaders] parsed ${parsedGames}/${games.length} summaries, ${playerCount} unique players`);
  if (playerCount === 0) return null;

  const categories = {};
  // Source key in the playerMap accumulator → ESPN-style category key
  const SRC_TO_KEY = {
    points: 'avgPoints',
    assists: 'avgAssists',
    rebounds: 'avgRebounds',
    steals: 'avgSteals',
    blocks: 'avgBlocks',
  };
  for (const [src, catKey] of Object.entries(SRC_TO_KEY)) {
    if (!LEADER_KEYS.includes(catKey)) continue;
    const top = topN(playerMap, src, 3);
    categories[catKey] = categoryFromTopN(catKey, top);
  }

  return {
    categories,
    fetchedAt: new Date().toISOString(),
    seasonType: 'postseason',
    _source: 'boxscore_aggregate',
    _meta: {
      gamesAggregated: parsedGames,
      uniquePlayers: playerCount,
    },
  };
}
