/**
 * normalizeNbaImagePayload
 *
 * Converts NBA Content Studio dashboard state (and autopost-assembled data)
 * into a single canonical payload consumed by buildNbaCaption(), the NBA
 * slide components, and the image render route.
 *
 * Mirrors normalizeMlbImagePayload() exactly: one function, one shape, one
 * source of truth. Autopost and preview/manual BOTH call this — never a
 * parallel reduced payload.
 *
 * Returns (for daily-briefing):
 * {
 *   workspace: 'nba',
 *   section: 'daily-briefing',
 *   sport: 'nba',
 *   dateLabel, aspectRatio, tags,
 *
 *   // canonical data (spread into every section return)
 *   nbaPicks, canonicalPicks, nbaLeaders, nbaStandings,
 *   nbaChampOdds, nbaGames, nbaLiveGames, nbaNews,
 *   nbaPlayoffContext, nbaBriefing,
 *
 *   // daily-briefing view derived from the inputs
 *   headline, subhead, heroTitle, mainHeadline,
 *   bullets,                 // array of { text, logoSlug }
 *   playoffOutlook,          // { east: [...], west: [...] }
 * }
 */

import { NBA_TEAMS } from '../../../sports/nba/teams.js';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';
import { buildNbaDailyHeadline } from './buildNbaDailyHeadline.js';
import { buildNbaHotPress } from './buildNbaHotPress.js';

const SECTION_MAP = {
  'nba-daily':    'daily-briefing',
  'nba-team':     'team-intel',
  'nba-league':   'league-intel',
  'nba-division': 'division-intel',
  'nba-game':     'game-insights',
  'nba-picks':    'maximus-picks',
};

function today() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function oddsToProb(american) {
  if (american == null || typeof american !== 'number') return null;
  return american < 0
    ? Math.abs(american) / (Math.abs(american) + 100)
    : 100 / (american + 100);
}

function fmtAmerican(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Classify a team's championship profile from its implied probability.
 *   ≥0.15           → Title Favorite
 *   0.06 – 0.15     → Contender
 *   0.02 – 0.06     → Upside Team
 *   <0.02           → Long Shot
 */
function classifyContender(prob) {
  if (prob == null) return 'Long Shot';
  if (prob >= 0.15) return 'Title Favorite';
  if (prob >= 0.06) return 'Contender';
  if (prob >= 0.02) return 'Upside Team';
  return 'Long Shot';
}

/**
 * Compute the set of teams that are STILL ALIVE in the playoffs.
 *
 * Audit Part 5 — cross-round derivation:
 *   - Active = teams in incomplete series  + winners of completed
 *     series (any round, including Round-1 winners who have advanced
 *     to Round 2)
 *   - Eliminated = losers of any completed series
 *   - Eliminated wins ties: a team that won R1 but lost R2 is
 *     eliminated, not active.
 *
 * Reads from `playoffContext.allSeries` (cross-round, no stale rows).
 * Falls back to `playoffContext.series` for back-compat if a caller
 * passes an older context shape.
 *
 * When no playoff data exists yet (preseason / R1 G1 pending) we
 * leave both sets empty so the outlook builder treats it as "no
 * filtering" and shows every team.
 */
function computeActivePlayoffTeams(playoffContext) {
  const activeSlugs = new Set();
  const eliminatedSlugs = new Set();

  const seriesPool = playoffContext?.allSeries
    || playoffContext?.series
    || [];

  for (const s of seriesPool) {
    if (s.isStalePlaceholder) continue;
    if (s.isComplete) {
      if (s.winnerSlug) activeSlugs.add(s.winnerSlug);
      if (s.loserSlug)  eliminatedSlugs.add(s.loserSlug);
    } else {
      if (s.topTeam?.slug) activeSlugs.add(s.topTeam.slug);
      if (s.bottomTeam?.slug) activeSlugs.add(s.bottomTeam.slug);
    }
  }

  // Eliminated wins ties — strip out any team that ever lost a series.
  // (E.g. a hypothetical R1 winner who then lost R2 should not appear
  // active even though they were a winner of an earlier series.)
  for (const slug of eliminatedSlugs) {
    activeSlugs.delete(slug);
  }

  // Audit Part 5 diagnostic — visible from a single console line.
  console.log('[NBA_ACTIVE_PLAYOFF_TEAM_DERIVATION]', JSON.stringify({
    activeTeams: [...activeSlugs],
    eliminatedTeams: [...eliminatedSlugs],
    completedSeries: seriesPool.filter(s => s.isComplete).map(s => ({
      winner: s.winnerSlug,
      loser: s.loserSlug,
      score: `${s.seriesScore?.top ?? 0}-${s.seriesScore?.bottom ?? 0}`,
      round: s.round,
    })),
    incompleteSeries: seriesPool.filter(s => !s.isComplete && !s.isStalePlaceholder).map(s => ({
      teamA: s.topTeam?.abbrev,
      teamB: s.bottomTeam?.abbrev,
      score: `${s.seriesScore?.top ?? 0}-${s.seriesScore?.bottom ?? 0}`,
      round: s.round,
    })),
  }));

  return { activeSlugs, eliminatedSlugs };
}

/** American odds → implied probability. Negative odds rank highest;
 *  missing odds rank last (0). Used to sort Slide 3 contenders. */
function americanToImplied(odds) {
  if (odds == null) return 0;
  const n = typeof odds === 'string' ? parseFloat(odds.replace(/[^\d-+.]/g, '')) : Number(odds);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
}

/**
 * Build the Playoff Outlook view (Slide 3) from championship odds +
 * standings + playoff context.
 *
 * Filters:
 *   - Only includes teams still alive in the playoffs (audit Part 4)
 *   - Excludes stale placeholders + Play-In Winner placeholders
 *
 * Ranking (audit Part 5):
 *   - Negative odds (favorites) first
 *   - Then lowest positive odds
 *   - Missing odds rank last
 *   - Seed is the tiebreaker
 *
 * Output:
 *   { east: [...top5], west: [...top5],
 *     eastAlsoAlive: [...remaining], westAlsoAlive: [...remaining],
 *     eliminatedTeams: [...slugs] }
 *   Cards include `team, abbrev, seed, odds, oddsRaw, prob, label,
 *   rationale, liveSeries`.
 */
function buildPlayoffOutlook({ champOdds, standings, playoffContext }) {
  const { activeSlugs, eliminatedSlugs } = computeActivePlayoffTeams(playoffContext);
  const hasAnyContext = activeSlugs.size > 0 || eliminatedSlugs.size > 0;

  const conf = { Eastern: [], Western: [] };

  for (const team of NBA_TEAMS) {
    // Audit Part 4: skip eliminated teams entirely. When playoff context
    // isn't yet populated (no games played) we keep all teams listed
    // so Slide 3 still has content during the warm-up window.
    if (hasAnyContext && !activeSlugs.has(team.slug)) continue;

    const oddsEntry = champOdds?.[team.slug];
    const american = oddsEntry?.bestChanceAmerican ?? oddsEntry?.american ?? null;
    const prob = americanToImplied(american);
    const st = standings?.[team.slug] || null;

    // Look across ALL active series (any round) so a R1 winner who's
    // now in R2 still surfaces with their current series state.
    let liveSeries = null;
    for (const s of (playoffContext?.allSeries || playoffContext?.series || [])) {
      if (s.isStalePlaceholder) continue;
      if (s.isComplete) continue;
      if (s.topTeam?.slug === team.slug || s.bottomTeam?.slug === team.slug) {
        liveSeries = s;
        break;
      }
    }

    conf[team.conference] = conf[team.conference] || [];
    conf[team.conference].push({
      team: team.name,
      abbrev: team.abbrev,
      slug: team.slug,
      seed: st?.playoffSeed ?? null,
      record: st?.record ?? null,
      odds: fmtAmerican(american),
      oddsRaw: american,
      prob,
      label: classifyContender(prob),
      liveSeries,
    });
  }

  // Audit Part 5: rank by best title odds, with seed as tiebreaker.
  // Negative odds → highest implied probability → top of list.
  function sortByOdds(a, b) {
    if (b.prob !== a.prob) return b.prob - a.prob;
    return (a.seed ?? 99) - (b.seed ?? 99);
  }

  function rank(list) {
    return list.sort(sortByOdds).map(t => ({ ...t, rationale: buildTeamRationale(t) }));
  }

  const eastFull = rank(conf['Eastern'] || []);
  const westFull = rank(conf['Western'] || []);

  // Audit Part 4: show ALL active playoff teams per conference. The
  // previous implementation silently truncated to top-5 + "Also alive"
  // strip, which user reports kept it at 3 visible cards because the
  // strip wasn't surfacing as expected. Now we expose the full active
  // list and Slide 3 chooses dense vs compact mode based on length.
  // Conference cards show every active team as a real card.
  console.log('[NBA_PLAYOFF_OUTLOOK_ACTIVE_TEAMS]', JSON.stringify({
    activeCount: activeSlugs.size,
    activeTeams: [...activeSlugs],
    excludedTeams: [...eliminatedSlugs],
    eastCount: eastFull.length,
    westCount: westFull.length,
    eastTeams: eastFull.map(t => t.abbrev),
    westTeams: westFull.map(t => t.abbrev),
  }));

  return {
    east: eastFull,
    west: westFull,
    // Back-compat aliases — kept so any consumer that read these stays
    // functional. New code should iterate `east` / `west` directly.
    eastAlsoAlive: [],
    westAlsoAlive: [],
    eliminatedTeams: [...eliminatedSlugs],
  };
}

/**
 * Playoff-aware, specific team rationale. Never "strong offense leads the
 * way" — always references a concrete piece of live state.
 */
function buildTeamRationale(card) {
  const { team, abbrev, seed, record, prob, liveSeries, label } = card;

  if (liveSeries) {
    const isTop = liveSeries.topTeam?.slug === card.slug;
    const myWins = isTop ? liveSeries.seriesScore.top : liveSeries.seriesScore.bottom;
    const oppWins = isTop ? liveSeries.seriesScore.bottom : liveSeries.seriesScore.top;
    const oppAbbrev = isTop ? liveSeries.bottomTeam?.abbrev : liveSeries.topTeam?.abbrev;

    if (liveSeries.isElimination && liveSeries.eliminationFor) {
      const facingElim = (isTop && liveSeries.eliminationFor === 'top')
                     || (!isTop && liveSeries.eliminationFor === 'bottom');
      if (facingElim) {
        return `${abbrev} face elimination vs ${oppAbbrev} — must win ${oppWins - myWins + 3} straight to survive.`;
      }
      return `${abbrev} one win from closing out ${oppAbbrev} (${myWins}-${oppWins}).`;
    }
    if (liveSeries.isUpset) {
      const leaderIsMe = (isTop && liveSeries.leader === 'top')
                     || (!isTop && liveSeries.leader === 'bottom');
      if (leaderIsMe) return `${abbrev} (${seed ?? '?'}) flipping the script against ${oppAbbrev} — ${myWins}-${oppWins} lead.`;
      return `${abbrev} (${seed ?? '?'}) trail ${oppAbbrev} ${myWins}-${oppWins} — upset watch.`;
    }
    if (myWins > oppWins) {
      return `${abbrev} lead ${oppAbbrev} ${myWins}-${oppWins} in the ${liveSeries.round === 1 ? 'first round' : 'series'}.`;
    }
    if (myWins < oppWins) {
      return `${abbrev} trail ${oppAbbrev} ${myWins}-${oppWins} — series shift needed.`;
    }
    return `${abbrev} and ${oppAbbrev} tied ${myWins}-${myWins} — pivot game ahead.`;
  }

  // No active series (team out of playoffs / not yet playing)
  if (label === 'Title Favorite') {
    return record
      ? `${abbrev} (${record}) projected as a title favorite — awaiting next round.`
      : `${abbrev} projected as a title favorite this postseason.`;
  }
  if (label === 'Contender') {
    return record
      ? `${abbrev} (${record}) sit in the contender tier — championship odds shorten on bracket wins.`
      : `${abbrev} carrying contender-tier championship odds.`;
  }
  if (label === 'Upside Team') {
    return `${abbrev} a live longshot — upside scales quickly with a first-round win.`;
  }
  return `${abbrev} a deep-bracket flier at current championship odds.`;
}

/**
 * Filter the picks board so picks for completed-series matchups are
 * dropped. Audit Part 7: the picks engine doesn't know about series
 * state and may surface a Game-N pick after a series has already been
 * clinched (e.g. Lakers/Rockets Game 7 pick after the series ended in 6).
 *
 * Only filters when we have an active playoff context with at least one
 * completed series. Regular-season picks pass through untouched.
 */
function filterPicksForCompletedSeries(rawPicks, playoffContext) {
  if (!rawPicks?.categories) return rawPicks;
  if (!playoffContext?.completedSeries?.length) return rawPicks;

  // Build a Set of {slugA-slugB} pairs that have completed.
  const completedPairs = new Set();
  for (const s of playoffContext.completedSeries) {
    const a = s.topTeam?.slug;
    const b = s.bottomTeam?.slug;
    if (a && b) {
      completedPairs.add(`${a}|${b}`);
      completedPairs.add(`${b}|${a}`);
    }
  }
  if (completedPairs.size === 0) return rawPicks;

  function pickInvolvesCompletedSeries(p) {
    const a = p.matchup?.awayTeam?.slug;
    const h = p.matchup?.homeTeam?.slug;
    if (!a || !h) return false;
    return completedPairs.has(`${a}|${h}`);
  }

  const cats = rawPicks.categories;
  const filtered = {};
  let droppedCount = 0;
  for (const [k, list] of Object.entries(cats)) {
    if (!Array.isArray(list)) { filtered[k] = list; continue; }
    const kept = list.filter(p => !pickInvolvesCompletedSeries(p));
    droppedCount += list.length - kept.length;
    filtered[k] = kept;
  }
  if (droppedCount > 0) {
    console.log('[NBA_PICKS_FILTERED_COMPLETED_SERIES]', {
      droppedCount,
      completedPairs: Array.from(completedPairs).slice(0, 5),
    });
  }
  return { ...rawPicks, categories: filtered };
}

// ── Section builders ──────────────────────────────────────────────────────

function buildDailyPayload({ base, playoffContext, liveGames, champOdds, standings }) {
  const hl = buildNbaDailyHeadline({ liveGames, playoffContext });
  const hotPress = buildNbaHotPress({ liveGames, playoffContext });
  const playoffOutlook = buildPlayoffOutlook({ champOdds, standings, playoffContext });

  return {
    ...base,
    heroTitle: hl.heroTitle,
    mainHeadline: hl.mainHeadline,
    headline: hl.mainHeadline,
    subhead: hl.subhead,
    topStory: hl.topStory,
    secondStory: hl.secondStory,
    bullets: hotPress,
    playoffOutlook,
  };
}

function buildTeamPayload({ base, team, standings, liveGames, playoffContext }) {
  if (!team) return { ...base, headline: 'Select a team to generate', section: 'team-intel' };
  const slug = team.slug;
  const st = standings?.[slug] || null;
  let series = null;
  for (const s of (playoffContext?.series || [])) {
    if (s.topTeam?.slug === slug || s.bottomTeam?.slug === slug) { series = s; break; }
  }
  return {
    ...base,
    headline: `${team.name} Playoff Intel`,
    subhead: series
      ? `${series.seriesScore.summary} — ${series.round === 1 ? 'first round' : 'series'} in motion`
      : `${team.conference} Conference`,
    teamA: { name: team.name, slug, abbrev: team.abbrev },
    record: st?.record || null,
    conference: team.conference,
    division: team.division,
    liveSeries: series,
    nbaLiveGames: liveGames || [],
  };
}

/**
 * Main normalizer.
 *
 * @param {object} opts
 * @param {string} [opts.activeSection='nba-daily']
 * @param {object} [opts.nbaPicks]          — output of buildNbaPicksV2 / /api/nba/picks/built
 * @param {Array}  [opts.nbaGames=[]]       — upcoming games list (from /api/nba/picks/board)
 * @param {Array}  [opts.nbaLiveGames=[]]   — /api/nba/live/games
 * @param {object} [opts.nbaChampOdds]      — { [slug]: { bestChanceAmerican } }
 * @param {object} [opts.nbaStandings]      — { [slug]: { wins, losses, record, ... } }
 * @param {object} [opts.nbaLeaders]        — { categories: { avgPoints, ... } }
 * @param {Array}  [opts.nbaNews=[]]        — headlines (from /api/nba/news/headlines)
 * @param {object} [opts.nbaSelectedTeam]   — current team for team-intel section
 * @param {object} [opts.nbaPlayoffContext] — optional override; otherwise derived from liveGames
 * @param {string} [opts.nbaBriefing]       — optional AI briefing text (unused in NBA Phase 1)
 */
export function normalizeNbaImagePayload({
  activeSection = 'nba-daily',
  nbaPicks = null,
  nbaGames = [],
  nbaLiveGames = [],
  /** Multi-day ESPN scoreboard window (last ~14 days + today + tomorrow).
   *  Threaded through to playoffContext so series state reflects real
   *  finals, not just static bracket placeholders. */
  nbaWindowGames = null,
  nbaChampOdds = null,
  nbaStandings = null,
  nbaLeaders = null,
  nbaNews = [],
  nbaSelectedTeam = null,
  nbaPlayoffContext = null,
  nbaBriefing = null,
} = {}) {
  const section = SECTION_MAP[activeSection] || 'daily-briefing';

  const playoffContext = nbaPlayoffContext
    || buildNbaPlayoffContext({ liveGames: nbaLiveGames, windowGames: nbaWindowGames });

  // ── Picks filter: exclude completed-series picks ──
  // When a series is decided (one team has 4 wins), we shouldn't surface
  // picks for hypothetical further games in that matchup. The picks
  // engine doesn't know about series state, so we apply that filter here
  // and replace `nbaPicks` for downstream consumers.
  const filteredPicks = filterPicksForCompletedSeries(nbaPicks, playoffContext);

  const base = {
    workspace: 'nba',
    sport: 'nba',
    section,
    stylePreset: 'nba-black-gold',
    aspectRatio: '4:5',
    dateLabel: today(),
    tags: ['#NBA', '#NBAPlayoffs', '#MaximusSports'],
    layoutVariant: 'headline-heavy',
  };

  // Canonical data spread into every section (same contract as MLB)
  const canonicalData = {
    nbaPicks:           filteredPicks ?? null,
    canonicalPicks:     filteredPicks ?? null,
    nbaLeaders:         nbaLeaders ?? null,
    nbaStandings:       nbaStandings ?? null,
    nbaChampOdds:       nbaChampOdds ?? null,
    nbaGames:           nbaGames ?? [],
    nbaLiveGames:       nbaLiveGames ?? [],
    nbaWindowGames:     nbaWindowGames ?? null,
    nbaNews:            nbaNews ?? [],
    nbaPlayoffContext:  playoffContext,
    nbaBriefing:        nbaBriefing ?? null,
  };

  switch (section) {
    case 'daily-briefing':
      return {
        ...canonicalData,
        ...buildDailyPayload({
          base,
          playoffContext,
          liveGames: nbaLiveGames,
          champOdds: nbaChampOdds,
          standings: nbaStandings,
        }),
      };
    case 'team-intel':
      return {
        ...canonicalData,
        ...buildTeamPayload({
          base,
          team: nbaSelectedTeam,
          standings: nbaStandings,
          liveGames: nbaLiveGames,
          playoffContext,
        }),
      };
    default:
      return {
        ...canonicalData,
        ...base,
        headline: 'NBA Playoffs',
        subhead: 'Series by series, the title race continues',
      };
  }
}

export default normalizeNbaImagePayload;
export { buildPlayoffOutlook, classifyContender };
