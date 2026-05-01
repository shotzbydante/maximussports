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
 * Build the Playoff Outlook view (Slide 3) from championship odds +
 * standings + playoff context. Top 5 per conference.
 *
 * Each card: { team, abbrev, seed, odds, prob, label, rationale }
 *   - rationale is playoff-aware and specific (per Part 7 requirement)
 *   - if team has a live series, rationale notes current series state
 */
function buildPlayoffOutlook({ champOdds, standings, playoffContext }) {
  const conf = { Eastern: [], Western: [] };

  for (const team of NBA_TEAMS) {
    const oddsEntry = champOdds?.[team.slug];
    const american = oddsEntry?.bestChanceAmerican ?? oddsEntry?.american ?? null;
    const prob = oddsToProb(american);
    const st = standings?.[team.slug] || null;

    // Find the team's current playoff series (if any)
    let liveSeries = null;
    for (const s of (playoffContext?.series || [])) {
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
      prob,
      label: classifyContender(prob),
      liveSeries,
    });
  }

  function rank(list) {
    return list
      .sort((a, b) => {
        // Playoff teams first (those in active series), then by odds
        const aActive = a.liveSeries ? 1 : 0;
        const bActive = b.liveSeries ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aP = a.prob ?? 0;
        const bP = b.prob ?? 0;
        if (bP !== aP) return bP - aP;
        // Fall back to seed
        return (a.seed ?? 99) - (b.seed ?? 99);
      })
      .slice(0, 5)
      .map(t => ({ ...t, rationale: buildTeamRationale(t) }));
  }

  return {
    east: rank(conf['Eastern'] || []),
    west: rank(conf['Western'] || []),
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
