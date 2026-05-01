/**
 * nbaBoxScoreLeaders — postseason leaders builder via per-game ESPN
 * box-score aggregation. Returns ABSOLUTE TOTALS, not per-game averages
 * (audit Part 1 requirement).
 *
 * Used as the primary post-ESPN-fetch fallback for postseason leaders.
 * ESPN's `types/3` leaders endpoint is unreliable early in the playoffs;
 * this aggregates real box-score data so we always have a reliable
 * answer when there are completed playoff games in the window.
 *
 * Trade-offs:
 *   - 1 HTTP call per completed playoff game (parallel, capped)
 *   - Athlete name resolution comes from the box score itself, no extra
 *     $ref calls
 *   - Includes only players with ≥2 games to avoid a single 40-pt outlier
 *     dominating the slide (relaxed if total game count is small)
 *
 * Output shape (audit Part 1 — totals, not averages):
 *   {
 *     categories: {
 *       pts: { label: 'Points',   abbrev: 'PTS', leaders: [...top3], teamBest: {} },
 *       ast: { label: 'Assists',  abbrev: 'AST', leaders: [...] },
 *       reb: { label: 'Rebounds', abbrev: 'REB', leaders: [...] },
 *       stl: { label: 'Steals',   abbrev: 'STL', leaders: [...] },
 *       blk: { label: 'Blocks',   abbrev: 'BLK', leaders: [...] },
 *     },
 *     fetchedAt, seasonType: 'postseason', statType: 'totals',
 *     _source: 'boxscore_aggregate',
 *     _meta: { gamesAggregated, uniquePlayers, excludedPlayInGames },
 *   }
 *
 * Each leader entry:
 *   { name, team, teamAbbrev, teamSlug, value (integer total),
 *     display (string), gamesPlayed }
 */

import { LEADER_CATEGORIES, LEADER_KEYS } from '../../src/data/nba/seasonLeaders.js';
import { NBA_TEAMS, NBA_ESPN_IDS } from '../../src/sports/nba/teams.js';

const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const FETCH_TIMEOUT_MS = 6000;
const MAX_PARALLEL_GAMES = 30;
const MIN_GAMES_FOR_LEADER = 2;
const RELAXED_MIN_GAMES = 1; // when there are fewer than 4 total games, drop the floor

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

// ─── Play-In exclusion helpers ──────────────────────────────────────
//
// Audit Part 2: postseason leaders must EXCLUDE play-in tournament
// games. ESPN sometimes treats play-in as `season.type === 3` (same as
// playoffs proper), so a season-type filter alone isn't enough. We
// look at three signals:
//   1. event/competition `notes[]` text containing "Play-In"
//   2. event/competition `series.type` (e.g. 'play-in')
//   3. season/week labels that mention play-in
// A game is play-in if ANY of those signals fires. False positives
// here are safer than false negatives (we'd just lose a game from the
// aggregate, not contaminate the leaderboard).

function notesText(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map(n => (typeof n === 'string' ? n : (n?.headline || n?.text || ''))).join(' ').toLowerCase();
}

/**
 * Detect play-in / play-in tournament games from an ESPN event payload
 * OR from a normalized game object that retains the event passthrough.
 *
 * Returns true ONLY when we see an explicit play-in marker. Returns
 * false on uncertainty so we don't silently drop legitimate playoff
 * games.
 */
export function isPlayInGame(eventOrGame) {
  if (!eventOrGame) return false;

  // Pull text from any plausible field ESPN might have populated.
  const fields = [];
  fields.push(notesText(eventOrGame?.notes));
  fields.push(notesText(eventOrGame?.competitions?.[0]?.notes));
  fields.push(String(eventOrGame?.competitions?.[0]?.series?.type || '').toLowerCase());
  fields.push(String(eventOrGame?.competitions?.[0]?.series?.title || '').toLowerCase());
  fields.push(String(eventOrGame?.competitions?.[0]?.series?.summary || '').toLowerCase());
  fields.push(String(eventOrGame?.season?.slug || '').toLowerCase());
  fields.push(String(eventOrGame?.season?.displayName || '').toLowerCase());
  fields.push(String(eventOrGame?.week?.text || '').toLowerCase());
  // Some normalized game objects we built may carry a `_raw` event for
  // pass-through (we don't currently store it but allow for it).
  if (eventOrGame?._raw) {
    fields.push(notesText(eventOrGame._raw?.notes));
    fields.push(notesText(eventOrGame._raw?.competitions?.[0]?.notes));
  }

  const blob = fields.filter(Boolean).join(' ');
  if (!blob) return false;
  // Tight regex — match "play-in" / "play in" / "play-in tournament"
  // but not "playin field" or unrelated phrases.
  return /play[\s-]*in\b/.test(blob);
}

/**
 * Best-effort detection that a game is a NBA Playoff (Round 1+) game.
 * Used in conjunction with !isPlayInGame to filter the box-score window.
 */
export function isNbaPostseasonGame(eventOrGame) {
  if (!eventOrGame) return false;
  const sType = eventOrGame?.season?.type;
  if (sType === 3) return true; // ESPN postseason marker
  const slug = String(eventOrGame?.season?.slug || '').toLowerCase();
  if (slug.includes('post-season') || slug.includes('postseason') || slug.includes('playoffs')) return true;
  // Fallback: rely on the schedule window which is itself postseason-
  // focused; if no negative signal is present, treat as playoff.
  return false;
}

function isCompleted(g) {
  return !!(g?.gameState?.isFinal || g?.status === 'final');
}

/** Combined gate (audit Part 2 helper): completed && playoff && !play-in. */
export function isNbaPlayoffProperGame(g) {
  if (!isCompleted(g)) return false;
  // If the game has clear postseason markers, require non-play-in.
  if (isNbaPostseasonGame(g)) return !isPlayInGame(g);
  // No explicit postseason marker — fall back to !play-in. This keeps
  // true playoff games that ESPN normalizers strip down, while still
  // dropping anything that overtly says "Play-In".
  return !isPlayInGame(g);
}

// ─── Box-score parsing ──────────────────────────────────────────────

function parseBoxScore(summary) {
  const rows = [];
  const teams = summary?.boxscore?.players || [];
  for (const teamBlock of teams) {
    const espnTeamId = String(teamBlock?.team?.id || '');
    const teamAbbrev = espnIdToAbbrev[espnTeamId] || teamBlock?.team?.abbreviation || '';
    const teamSlug = espnIdToSlug[espnTeamId] || null;

    for (const stat of (teamBlock?.statistics || [])) {
      const labels = stat?.labels || [];
      const ptsIdx = statIndexByLabel(labels, 'PTS');
      const astIdx = statIndexByLabel(labels, 'AST');
      const rebIdx = statIndexByLabel(labels, 'REB');
      const stlIdx = statIndexByLabel(labels, 'STL');
      const blkIdx = statIndexByLabel(labels, 'BLK');
      if (ptsIdx < 0) continue;

      for (const athleteRow of (stat?.athletes || [])) {
        const athlete = athleteRow?.athlete;
        if (!athlete) continue;
        const stats = athleteRow?.stats || [];
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

/**
 * Pick the top N players by absolute total of `srcKey`.
 * Audit Part 3: leaders are sorted by total descending, integer values.
 */
function topByTotal(playerMap, srcKey, totalGameCount, n = 3) {
  const minGames = totalGameCount < 4 ? RELAXED_MIN_GAMES : MIN_GAMES_FOR_LEADER;
  return Object.values(playerMap)
    .filter(p => p.gamesPlayed >= minGames)
    .filter(p => p[srcKey] > 0)
    .sort((a, b) => {
      // Primary: total descending. Tiebreaker: fewer games (more
      // efficient) — keeps the leaderboard from rewarding pure volume
      // when two players have identical totals.
      if (b[srcKey] !== a[srcKey]) return b[srcKey] - a[srcKey];
      return a.gamesPlayed - b.gamesPlayed;
    })
    .slice(0, n)
    .map(p => ({
      name: p.name,
      team: '',
      teamAbbrev: p.teamAbbrev,
      teamSlug: p.teamSlug,
      value: Math.round(p[srcKey]),
      display: String(Math.round(p[srcKey])),
      gamesPlayed: p.gamesPlayed,
    }));
}

function categoryFromLeaders(catKey, leaders) {
  const labels = LABEL_BY_KEY[catKey] || {};
  return {
    label: labels.label || catKey,
    abbrev: labels.abbrev || catKey,
    leaders,
    teamBest: {},
  };
}

/**
 * Build postseason leaders by aggregating box scores from completed
 * playoff games. Audit Part 1 — emits absolute totals.
 *
 * @param {object} opts
 * @param {Array}  opts.windowGames — schedule window (filter applied
 *                                    inside: completed + !play-in)
 * @returns {Promise<{ categories, fetchedAt, seasonType, statType, _source }|null>}
 */
export async function buildNbaPostseasonLeadersFromBoxScores({ windowGames = [] } = {}) {
  // Audit Part 2: filter to true playoff games only
  const totalWindowGames = (windowGames || []).length;
  const includedGames = (windowGames || []).filter(isNbaPlayoffProperGame);
  const excludedPlayInGames = (windowGames || [])
    .filter(g => isCompleted(g))
    .filter(g => isPlayInGame(g));

  console.log('[NBA_PLAYOFF_LEADER_GAMES]', JSON.stringify({
    totalWindowGames,
    includedGames: includedGames.length,
    excludedPlayInGames: excludedPlayInGames.length,
    includedGameIds: includedGames.slice(0, 30).map(g => g.gameId),
    excludedGameIds: excludedPlayInGames.map(g => g.gameId),
  }));

  if (includedGames.length === 0) {
    console.warn('[nbaBoxScoreLeaders] no playoff-proper games in window — cannot aggregate');
    return null;
  }

  const games = includedGames.slice(0, MAX_PARALLEL_GAMES);
  console.log(`[nbaBoxScoreLeaders] aggregating ${games.length} playoff-proper games`);

  const summaries = await Promise.all(games.map(g => fetchOneSummary(g.gameId)));

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
      p.teamAbbrev = row.teamAbbrev || p.teamAbbrev;
      p.teamSlug = row.teamSlug || p.teamSlug;
      playerMap[row.playerId] = p;
    }
  }

  const playerCount = Object.keys(playerMap).length;
  console.log(`[nbaBoxScoreLeaders] parsed ${parsedGames}/${games.length} summaries, ${playerCount} unique players`);
  if (playerCount === 0) return null;

  // Map category accumulator-key → canonical leader key
  const SRC_TO_KEY = {
    points: 'pts',
    assists: 'ast',
    rebounds: 'reb',
    steals: 'stl',
    blocks: 'blk',
  };
  const categories = {};
  for (const [src, catKey] of Object.entries(SRC_TO_KEY)) {
    if (!LEADER_KEYS.includes(catKey)) continue;
    const top = topByTotal(playerMap, src, parsedGames, 3);
    categories[catKey] = categoryFromLeaders(catKey, top);
  }

  const result = {
    categories,
    fetchedAt: new Date().toISOString(),
    seasonType: 'postseason',
    statType: 'totals',
    _source: 'boxscore_aggregate',
    _meta: {
      gamesAggregated: parsedGames,
      uniquePlayers: playerCount,
      excludedPlayInGames: excludedPlayInGames.length,
    },
  };

  // Audit Part 3 diagnostic — visible when box-score aggregation runs.
  console.log('[NBA_BOXSCORE_TOTAL_LEADERS_AGG]', JSON.stringify({
    gamesUsed: parsedGames,
    playersAggregated: playerCount,
    categories: Object.keys(categories || {}),
    topPts: categories?.pts?.leaders?.[0] || null,
  }));

  return result;
}
