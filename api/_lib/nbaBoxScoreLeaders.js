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

/**
 * Adaptive thresholds (audit Part 2). Strict floors are correct once
 * the playoffs have a real sample size, but mid-Round-1 we'd otherwise
 * filter out everyone and Slide 2 would render "Postseason feed
 * updating" forever. Three tiers based on TOTAL completed playoff
 * games in the window:
 *   ≥12 games  → minGames=3, minMinutes=60   (mid Round 1+)
 *   ≥6 games   → minGames=2, minMinutes=35   (early Round 1)
 *   otherwise  → minGames=1, minMinutes=15   (G1-G2 of Round 1)
 *
 * Plus per-category retry: if any category ends up empty after the
 * primary filter, that single category retries with relaxed
 * thresholds (audit Part 2 explicit requirement).
 */
function adaptiveThresholds(totalGames) {
  if (totalGames >= 12) return { minGames: 3, minMinutes: 60 };
  if (totalGames >= 6)  return { minGames: 2, minMinutes: 35 };
  return { minGames: 1, minMinutes: 15 };
}
const RELAXED_RETRY = { minGames: 1, minMinutes: 0 };

/**
 * Validate a leaders payload for "real data" — used to defeat KV
 * cache poisoning (an empty payload written by an earlier run
 * before this code shipped should be treated as missing, not as a
 * cache hit).
 */
export function hasValidLeaderCategories(leaders) {
  const required = ['pts', 'ast', 'reb', 'stl', 'blk'];
  return required.every(k => (leaders?.categories?.[k]?.leaders?.length ?? 0) > 0);
}

/**
 * STRICT validator for postseason cached payloads. FAIL-CLOSED design:
 * when we don't have a verified playoff team set, we refuse to validate
 * ANY payload as good — better to rebuild from scratch than ship NOP /
 * POR / DAL stars under a "Postseason Leaders" header.
 *
 * Returns true ONLY when:
 *   - seasonType === 'postseason'
 *   - statType === 'totals'
 *   - all 5 canonical categories exist with ≥1 leader
 *   - no category abbrev uses per-game shape (PPG/APG/RPG/SPG/BPG)
 *   - validPlayoffTeamSlugs is provided AND non-empty
 *   - every leader's team is in validPlayoffTeamSlugs
 *
 * Pass `{ allowMissingTeamSet: true }` ONLY in early-bootstrap callsites
 * where there's no playoff context to compare against (e.g. an empty-
 * payload write check). Default behavior is the strict fail-closed path.
 */
export function hasValidPostseasonTotalsPayload(leaders, validPlayoffTeamSlugs = null, opts = {}) {
  const { allowMissingTeamSet = false } = opts;
  if (!leaders) return false;
  if (leaders.seasonType && leaders.seasonType !== 'postseason') return false;
  if (leaders.statType && leaders.statType !== 'totals') return false;

  const cats = leaders.categories || {};
  const required = ['pts', 'ast', 'reb', 'stl', 'blk'];

  const haveValidSet = !!(validPlayoffTeamSlugs && validPlayoffTeamSlugs.size > 0);
  if (!haveValidSet && !allowMissingTeamSet) {
    // FAIL-CLOSED — without a verified playoff team set we cannot
    // confirm leaders are postseason-legitimate. Reject so the caller
    // falls through to box-score aggregation (which will derive its own
    // team set from games and either succeed or return empty).
    return false;
  }

  for (const k of required) {
    const c = cats[k];
    const list = c?.leaders || [];
    if (list.length === 0) return false;
    // Reject per-game category shape on the abbrev (PPG/APG/RPG/SPG/BPG).
    const abbrev = String(c?.abbrev || '').toUpperCase();
    if (/^[PARSB]PG$/.test(abbrev)) return false;
    // Team eligibility: every leader's team must be in the active
    // playoff field. When no set is provided AND the caller explicitly
    // allowed it (allowMissingTeamSet), skip the team check.
    if (haveValidSet) {
      for (const ldr of list) {
        const slug = ldr?.teamSlug || null;
        if (!slug) return false;            // leaders without team identity are unsafe
        if (!validPlayoffTeamSlugs.has(slug)) return false;
      }
    }
  }
  return true;
}

/**
 * Build the canonical set of valid playoff-team slugs from BOTH the
 * static bracket (playoffContext) and live playoff-proper games. Either
 * source alone is fragile:
 *   - bracket has Play-In placeholders before the play-in round resolves
 *   - games-only misses teams between rounds (won R1, awaiting R2)
 * Union gives us a complete "who's still in the bracket world" set.
 *
 * Used as the team-eligibility filter for postseason leaders so a
 * Pelicans / Trail Blazers / Mavericks star can never appear on Slide 2
 * just because ESPN's all-NBA leaders endpoint surfaced them.
 */
export function buildValidPlayoffTeamSlugs(playoffContext = null, playoffGames = []) {
  const slugs = new Set();

  // 1. Bracket-anchored: every NAMED team across the entire bracket,
  //    INCLUDING stale-placeholder rows (e.g., BOS vs Play-In Winner).
  //    BOS is a real playoff team even though their opponent slot is
  //    still a placeholder — skipping the whole series would drop BOS
  //    from the leader filter and leave their stars off Slide 2.
  //    Also pull from `seriesAll`/`series` for older context shapes.
  const seriesPool = [
    ...(playoffContext?.allSeries || []),
    ...(playoffContext?.series || []),
    ...(playoffContext?.seriesAll || []),
  ];
  for (const s of seriesPool) {
    if (s?.topTeam?.slug && !s?.topTeam?.isPlaceholder)       slugs.add(s.topTeam.slug);
    if (s?.bottomTeam?.slug && !s?.bottomTeam?.isPlaceholder) slugs.add(s.bottomTeam.slug);
    if (s?.winnerSlug) slugs.add(s.winnerSlug);
    if (s?.loserSlug)  slugs.add(s.loserSlug);
  }

  // 2. Game-anchored: any team that has actually played a playoff-proper
  //    game. Catches bracket placeholder cases (winner of play-in
  //    becomes part of the active bracket once they play Round 1).
  //    Falls back to looser "completed final + not play-in" gate when
  //    `isNbaPostseasonGame` can't confirm season.type=3.
  for (const g of (playoffGames || [])) {
    if (!isCompleted(g)) continue;
    if (isPlayInGame(g)) continue;
    const a = g?.teams?.away?.slug || g?.awayTeam?.slug;
    const h = g?.teams?.home?.slug || g?.homeTeam?.slug;
    if (a) slugs.add(a);
    if (h) slugs.add(h);
  }

  return slugs;
}

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

/** Parse ESPN minutes: '32', '32:48', '0:00', '' → integer minutes. */
function asMinutes(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === '-' || s === '--') return 0;
  if (s.includes(':')) {
    const [mm, ss] = s.split(':');
    const m = Number(mm), sec = Number(ss);
    if (!Number.isFinite(m)) return 0;
    return Math.round(m + (Number.isFinite(sec) ? sec / 60 : 0));
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
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
  // Tight regex — match "play-in" / "play in" / "play in tournament" /
  // "tournament play-in" but not "playin field" or unrelated phrases.
  if (/play[\s-]*in\b/.test(blob)) return true;
  if (/tournament[\s-]*play/.test(blob)) return true;
  return false;
}

/**
 * Reject obviously non-postseason games (preseason, summer league,
 * regular season, all-star). Conservative: returns true only on clear
 * negative markers so we don't accidentally drop genuine playoff games.
 */
function isObviouslyNonPostseason(eventOrGame) {
  if (!eventOrGame) return false;
  const fields = [
    String(eventOrGame?.season?.slug || '').toLowerCase(),
    String(eventOrGame?.season?.displayName || '').toLowerCase(),
    String(eventOrGame?.competitions?.[0]?.notes || '').toLowerCase(),
    notesText(eventOrGame?.notes),
    notesText(eventOrGame?.competitions?.[0]?.notes),
  ];
  const blob = fields.filter(Boolean).join(' ');
  if (!blob) return false;
  if (/preseason|pre-season/.test(blob)) return true;
  if (/summer\s*league/.test(blob)) return true;
  if (/all[\s-]*star/.test(blob)) return true;
  if (/regular\s*season/.test(blob)) return true;
  return false;
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

/** Combined gate: completed && playoff && !play-in && !obviously-non-postseason. */
export function isNbaPlayoffProperGame(g) {
  if (!isCompleted(g)) return false;
  if (isPlayInGame(g)) return false;
  if (isObviouslyNonPostseason(g)) return false;
  // If the game has clear postseason markers, accept it.
  if (isNbaPostseasonGame(g)) return true;
  // No explicit postseason marker — accept only if no negative signal
  // fired above. This keeps true playoff games that ESPN normalizers
  // strip down, while dropping anything overtly preseason / regular
  // season / play-in / summer league.
  return true;
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
      const minIdx = statIndexByLabel(labels, 'MIN');
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
          minutes: minIdx >= 0 ? asMinutes(stats[minIdx]) : 0,
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
 * Pick the top N players by absolute total of `srcKey` after
 * applying:
 *   1. team-eligibility filter (must be in validPlayoffTeamSlugs when
 *      that set is non-empty) — defeats ESPN types/3 leaking
 *      non-playoff stars
 *   2. adaptive games-played floor
 *   3. adaptive minutes-played floor
 *
 * Returns { leaders, counts } so the caller can build the
 * [NBA_LEADER_FILTER_DEBUG] diagnostic with real before/after
 * numbers including filteredOutInactiveTeam.
 */
function topByTotal(playerMap, srcKey, thresholds, validTeamSlugs, n = 3) {
  const all = Object.values(playerMap);
  const playersBefore = all.length;

  // Team-eligibility filter is the strongest gate. Apply first.
  const useTeamFilter = !!(validTeamSlugs && validTeamSlugs.size > 0);
  const afterTeam = useTeamFilter
    ? all.filter(p => p.teamSlug && validTeamSlugs.has(p.teamSlug))
    : all;
  const afterActiveTeamFilter = afterTeam.length;
  const filteredOutInactiveTeam = playersBefore - afterActiveTeamFilter;

  const afterGames = afterTeam.filter(p => p.gamesPlayed >= thresholds.minGames);
  const afterGamesFilter = afterGames.length;
  const filteredOutLowGames = afterActiveTeamFilter - afterGamesFilter;

  const afterMinutes = afterGames.filter(p => (p.minutes || 0) >= thresholds.minMinutes);
  const afterMinutesFilter = afterMinutes.length;
  const filteredOutLowMinutes = afterGamesFilter - afterMinutesFilter;

  const leaders = afterMinutes
    .filter(p => p[srcKey] > 0)
    .sort((a, b) => {
      if (b[srcKey] !== a[srcKey]) return b[srcKey] - a[srcKey];
      return a.gamesPlayed - b.gamesPlayed; // tiebreaker: fewer games
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

  return {
    leaders,
    counts: {
      playersBefore,
      afterActiveTeamFilter,
      afterGamesFilter,
      afterMinutesFilter,
      filteredOutInactiveTeam,
      filteredOutLowGames,
      filteredOutLowMinutes,
    },
  };
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
 * playoff games. Emits absolute totals. Honors a strict playoff-team
 * eligibility filter so non-playoff stars (NOP / POR / DAL who happen
 * to be in box-score data ESPN tags as postseason) cannot leak.
 *
 * @param {object} opts
 * @param {Array}  opts.windowGames — schedule window (filter applied
 *                                    inside: completed + !play-in +
 *                                    !preseason + !summer-league)
 * @param {Set<string>} [opts.validPlayoffTeamSlugs] — when provided,
 *                                    every leader must be on one of
 *                                    these teams.
 * @returns {Promise<{ categories, fetchedAt, seasonType, statType, _source }|null>}
 */
export async function buildNbaPostseasonLeadersFromBoxScores({
  windowGames = [],
  validPlayoffTeamSlugs = null,
} = {}) {
  // Filter to true playoff games only (completed + !play-in + !preseason
  // + !summer-league + !regular-season).
  const totalWindowGames = (windowGames || []).length;
  const includedGames = (windowGames || []).filter(isNbaPlayoffProperGame);
  const completedAll = (windowGames || []).filter(isCompleted);
  const excludedPlayInGames = completedAll.filter(g => isPlayInGame(g));
  const excludedNonPlayoffGames = completedAll.filter(g =>
    !isPlayInGame(g) && !isNbaPlayoffProperGame(g)
  );

  console.log('[NBA_PLAYOFF_LEADER_GAMES]', JSON.stringify({
    totalWindowGames,
    includedGames: includedGames.length,
    excludedPlayInGames: excludedPlayInGames.length,
    excludedNonPlayoffGames: excludedNonPlayoffGames.length,
    includedGameIds: includedGames.slice(0, 30).map(g => g.gameId),
    excludedGameIds: [
      ...excludedPlayInGames.map(g => g.gameId),
      ...excludedNonPlayoffGames.map(g => g.gameId),
    ].slice(0, 30),
    validPlayoffTeamCount: validPlayoffTeamSlugs ? validPlayoffTeamSlugs.size : null,
  }));

  if (includedGames.length === 0) {
    console.warn('[nbaBoxScoreLeaders] no playoff-proper games in window — cannot aggregate');
    return null;
  }

  const games = includedGames.slice(0, MAX_PARALLEL_GAMES);
  console.log(`[nbaBoxScoreLeaders] aggregating ${games.length} playoff-proper games`);

  // Expand the team-eligibility set with EVERY team that has actually
  // appeared in a playoff-proper game. This patches over the case where
  // the bracket's stale-placeholder series caused the team set to omit
  // a real playoff team (e.g., BOS vs Play-In Winner is "stale" by
  // bracket alone — but BOS is a real playoff team the moment they
  // start playing). Without this, BOS leaders would be silently dropped
  // by the team filter and Slide 2 would render "Postseason feed
  // updating" even with full box-score data on hand.
  const expandedTeamSet = new Set(validPlayoffTeamSlugs ? Array.from(validPlayoffTeamSlugs) : []);
  for (const g of games) {
    const a = g?.teams?.away?.slug || g?.awayTeam?.slug;
    const h = g?.teams?.home?.slug || g?.homeTeam?.slug;
    if (a) expandedTeamSet.add(a);
    if (h) expandedTeamSet.add(h);
  }

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
        minutes: 0,
        points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0,
      };
      p.gamesPlayed += 1;
      p.minutes += row.minutes || 0;
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

  // Audit Part 2: adaptive games + minutes thresholds, computed from
  // the actual playoff sample size we successfully parsed. Then per-
  // category retry with RELAXED_RETRY if any category came up empty.
  const thresholds = adaptiveThresholds(parsedGames);

  // Map category accumulator-key → canonical leader key
  const SRC_TO_KEY = {
    points: 'pts',
    assists: 'ast',
    rebounds: 'reb',
    steals: 'stl',
    blocks: 'blk',
  };

  const categories = {};
  const retried = [];
  // Track the first category's filter counts for the debug log; the
  // counts are identical across categories (same filters, same
  // playerMap), only the post-positive-stat filter differs.
  let primaryCounts = null;

  for (const [src, catKey] of Object.entries(SRC_TO_KEY)) {
    if (!LEADER_KEYS.includes(catKey)) continue;
    const primary = topByTotal(playerMap, src, thresholds, expandedTeamSet, 3);
    if (!primaryCounts) primaryCounts = primary.counts;

    let leaders = primary.leaders;
    if (leaders.length === 0) {
      // Retry just this category with relaxed thresholds — never show
      // "Postseason feed updating" if box-score data exists. Team
      // eligibility filter STAYS strict on retry.
      const relaxed = topByTotal(playerMap, src, RELAXED_RETRY, expandedTeamSet, 3);
      leaders = relaxed.leaders;
      if (leaders.length > 0) retried.push(catKey);
    }
    categories[catKey] = categoryFromLeaders(catKey, leaders);
  }

  // Diagnostic — single line, audit-spec'd field names.
  console.log('[NBA_LEADER_FILTER_DEBUG]', JSON.stringify({
    playersBefore: primaryCounts?.playersBefore ?? playerCount,
    afterActiveTeamFilter: primaryCounts?.afterActiveTeamFilter ?? 0,
    afterGamesFilter: primaryCounts?.afterGamesFilter ?? 0,
    afterMinutesFilter: primaryCounts?.afterMinutesFilter ?? 0,
    filteredOutInactiveTeam: primaryCounts?.filteredOutInactiveTeam ?? 0,
    filteredOutLowGames: primaryCounts?.filteredOutLowGames ?? 0,
    filteredOutLowMinutes: primaryCounts?.filteredOutLowMinutes ?? 0,
    minGames: thresholds.minGames,
    minMinutes: thresholds.minMinutes,
    parsedGames,
    retriedCategories: retried,
    filteredOutPlayIn: excludedPlayInGames.length,
    filteredOutNonPlayoff: excludedNonPlayoffGames.length,
    validPlayoffTeamCount: validPlayoffTeamSlugs ? validPlayoffTeamSlugs.size : null,
  }));

  // Diagnostic dedicated to the team-eligibility gate. Emits the
  // exact teams that were dropped so a Pelicans/Trail Blazers leak
  // is immediately visible in production logs.
  if (expandedTeamSet && expandedTeamSet.size > 0) {
    const beforeTeams = Array.from(new Set(Object.values(playerMap).map(p => p.teamSlug).filter(Boolean)));
    const droppedTeams = beforeTeams.filter(s => !expandedTeamSet.has(s));
    console.log('[NBA_POSTSEASON_LEADER_TEAM_FILTER]', JSON.stringify({
      validTeams: Array.from(expandedTeamSet).sort(),
      bracketTeams: validPlayoffTeamSlugs ? Array.from(validPlayoffTeamSlugs).sort() : [],
      gameAddedTeams: Array.from(expandedTeamSet).filter(s => !validPlayoffTeamSlugs?.has(s)).sort(),
      teamsBefore: beforeTeams.sort(),
      excludedTeams: droppedTeams.sort(),
      playersBefore: primaryCounts?.playersBefore ?? playerCount,
      playersAfterTeamFilter: primaryCounts?.afterActiveTeamFilter ?? 0,
    }));
  }

  // Single-line summary diagnostic per audit spec.
  console.log('[NBA_LEADERS_FINAL_DEBUG]', JSON.stringify({
    playoffGamesFound: includedGames.length,
    boxscoresFetched: parsedGames,
    playersAggregated: playerCount,
    validPlayoffTeams: Array.from(expandedTeamSet).sort(),
    categories: Object.fromEntries(
      Object.entries(categories || {}).map(([k, v]) => [k, v?.leaders?.length || 0])
    ),
  }));

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
      excludedNonPlayoffGames: excludedNonPlayoffGames.length,
      validPlayoffTeams: Array.from(expandedTeamSet).sort(),
      bracketAnchoredTeams: validPlayoffTeamSlugs
        ? Array.from(validPlayoffTeamSlugs).sort()
        : null,
      thresholds,
      retriedCategories: retried,
    },
  };

  // Audit Part 3 diagnostic — visible when box-score aggregation runs.
  console.log('[NBA_BOXSCORE_TOTAL_LEADERS_AGG]', JSON.stringify({
    gamesUsed: parsedGames,
    playersAggregated: playerCount,
    categories: Object.keys(categories || {}),
    categoriesByCount: Object.fromEntries(
      Object.entries(categories || {}).map(([k, v]) => [k, v.leaders?.length || 0])
    ),
    minGames: thresholds.minGames,
    minMinutes: thresholds.minMinutes,
    retriedCategories: retried,
    topPts: categories?.pts?.leaders?.[0] || null,
  }));

  // Audit Part 4 spec — the validation log the prompt explicitly asked
  // for. Single line, all 5 categories, with playoff totals visible at
  // a glance so a "where's LeBron?" question can be answered from the
  // browser/server console alone (no instrumentation required).
  console.log('[NBA_POSTSEASON_TOTALS_FINAL]', JSON.stringify({
    gamesUsed: parsedGames,
    includedTeams: Array.from(expandedTeamSet).sort(),
    categories: Object.fromEntries(
      Object.entries(categories || {}).map(([k, v]) => [
        k,
        (v?.leaders || []).map(p => ({
          name: p.name,
          team: p.teamAbbrev,
          value: p.value,
          gamesPlayed: p.gamesPlayed,
        })),
      ])
    ),
  }));

  // Audit Part 4 spec — diagnostic for "why isn't player X showing?"
  // questions. Surfaces, per known-but-excluded player, the specific
  // reason: missing-boxscore (didn't aggregate), team-excluded
  // (eligibility filter), low-games (under threshold), or low-rank
  // (qualified but not top 3).
  const KNOWN_PLAYOFF_STARS = [
    { name: 'LeBron James', teamSlug: 'lal' },
    { name: 'Anthony Davis', teamSlug: 'lal' },
    { name: 'Luka Dončić', teamSlug: 'lal' },
    { name: 'Jayson Tatum', teamSlug: 'bos' },
    { name: 'Jaylen Brown', teamSlug: 'bos' },
    { name: 'Shai Gilgeous-Alexander', teamSlug: 'okc' },
    { name: 'Victor Wembanyama', teamSlug: 'sas' },
    { name: 'Anthony Edwards', teamSlug: 'min' },
    { name: 'Jalen Brunson', teamSlug: 'nyk' },
    { name: 'Joel Embiid', teamSlug: 'phi' },
    { name: 'Cade Cunningham', teamSlug: 'det' },
    { name: 'Donovan Mitchell', teamSlug: 'cle' },
  ];
  function lookupPlayerStatus(name, teamSlug) {
    const inTeamSet = expandedTeamSet.has(teamSlug);
    const player = Object.values(playerMap).find(p => p?.name === name);
    if (!player) {
      return inTeamSet
        ? { reason: 'missing_boxscore', detail: 'team in playoff set but no parsed boxscore for this player' }
        : { reason: 'team_excluded', detail: `team "${teamSlug}" not in expanded playoff set` };
    }
    if (!inTeamSet) return { reason: 'team_excluded', detail: `team "${teamSlug}" filtered out` };
    if (player.gamesPlayed < thresholds.minGames) {
      return { reason: 'low_games', detail: `${player.gamesPlayed} games (threshold ${thresholds.minGames})`, points: player.points };
    }
    // Player qualified — find their PTS rank.
    const ranked = Object.values(playerMap)
      .filter(p => p.teamSlug && expandedTeamSet.has(p.teamSlug))
      .filter(p => p.gamesPlayed >= thresholds.minGames)
      .sort((a, b) => (b.points || 0) - (a.points || 0));
    const rank = ranked.findIndex(p => p.playerId === player.playerId) + 1;
    return { reason: rank <= 3 ? 'top3_pts' : 'lower_total_than_top3', rank, points: player.points };
  }
  const starAudit = KNOWN_PLAYOFF_STARS.map(s => ({
    ...s,
    status: lookupPlayerStatus(s.name, s.teamSlug),
  }));
  console.log('[NBA_POSTSEASON_PLAYER_AUDIT]', JSON.stringify({
    parsedGames,
    minGames: thresholds.minGames,
    expandedTeams: Array.from(expandedTeamSet).sort(),
    stars: starAudit,
  }));

  return result;
}
