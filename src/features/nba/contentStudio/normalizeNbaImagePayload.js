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
 * Detect a play-in game from a normalized scoreboard event. Mirrors
 * api/_lib/nbaBoxScoreLeaders.js#isPlayInGame but lives here so the
 * client-side normalizer (which can't import from api/_lib) has its
 * own copy. We only need a quick text-based check at this layer.
 */
function isPlayInGameClientSide(g) {
  if (!g) return false;
  const blob = [
    g?.notes,
    g?.competitions?.[0]?.notes,
    g?.competitions?.[0]?.series?.type,
    g?.competitions?.[0]?.series?.title,
    g?.season?.slug,
    g?.season?.displayName,
    g?.week?.text,
  ]
    .map(v => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map(n => (typeof n === 'string' ? n : (n?.headline || n?.text || ''))).join(' ');
      return '';
    })
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!blob) return false;
  return /play[\s-]*in\b/.test(blob);
}

/**
 * Walk all completed playoff games (excluding play-in) and derive the
 * active team set directly from real game results — no dependency on
 * the static bracket's placeholder slots. This catches the case where
 * the bracket lists `BOS vs (Play-In Winner)` but BOS has actually
 * played 4 real games against PHI: the bracket-anchored series is
 * marked stale, but the games speak for themselves.
 *
 * Counts wins per (sortedSlug-pair) → if any team has ≥4 wins in a
 * pair, that side is active and the opponent is eliminated. Any pair
 * with <4 wins both sides means an in-progress series — both teams
 * stay active.
 */
function deriveActiveFromGames(allGames) {
  const active = new Set();
  const eliminated = new Set();
  if (!Array.isArray(allGames) || allGames.length === 0) return { active, eliminated };

  // Group by (slugA, slugB) pair (sorted for stable key) and count
  // wins per side from completed playoff games (excluding play-in).
  const pairs = new Map();
  for (const g of allGames) {
    const isFinal = g?.gameState?.isFinal || g?.status === 'final';
    if (!isFinal) continue;
    if (isPlayInGameClientSide(g)) continue;
    const a = g?.teams?.away;
    const h = g?.teams?.home;
    if (!a?.slug || !h?.slug) continue;
    const aScore = Number(a.score ?? 0);
    const hScore = Number(h.score ?? 0);
    if (aScore === 0 && hScore === 0) continue;
    const winner = aScore > hScore ? a.slug : h.slug;
    const key = [a.slug, h.slug].sort().join('|');
    if (!pairs.has(key)) pairs.set(key, {});
    const counts = pairs.get(key);
    counts[winner] = (counts[winner] || 0) + 1;
  }

  for (const [key, counts] of pairs) {
    const [slug1, slug2] = key.split('|');
    const w1 = counts[slug1] || 0;
    const w2 = counts[slug2] || 0;
    if (w1 >= 4) { active.add(slug1); eliminated.add(slug2); }
    else if (w2 >= 4) { active.add(slug2); eliminated.add(slug1); }
    else {
      // In-progress series — both teams alive
      active.add(slug1);
      active.add(slug2);
    }
  }
  return { active, eliminated };
}

/**
 * Compute the set of teams that are STILL ALIVE in the playoffs.
 *
 * UNION of two sources:
 *   1. Bracket-anchored derivation from playoffContext.allSeries
 *      (uses static bracket, captures Round-1 winners awaiting R2
 *      via the scaffold)
 *   2. Game-data derivation from raw scoreboard events (catches
 *      teams whose bracket entry has unresolved play-in placeholders
 *      — e.g. BOS vs tbd("Play-In Winner") still shows BOS as active
 *      once BOS plays real games)
 *
 * Eliminated wins ties across BOTH sources: a team that lost any
 * series is excluded.
 */
function computeActivePlayoffTeams(playoffContext, rawGames = []) {
  const activeSlugs = new Set();
  const eliminatedSlugs = new Set();

  // Source 1: bracket-anchored series
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

  // Source 2: real game data (catches BOS/OKC/SAS-style cases where
  // the bracket has placeholder opponents but actual playoff games
  // have been played). Use rawGames if available, otherwise any
  // games stored on playoffContext.
  const gamePool = rawGames.length > 0
    ? rawGames
    : (playoffContext?.todayGames || []).concat(playoffContext?.recentFinals || []);
  const fromGames = deriveActiveFromGames(gamePool);
  for (const slug of fromGames.active) activeSlugs.add(slug);
  for (const slug of fromGames.eliminated) eliminatedSlugs.add(slug);

  // Eliminated wins ties — strip out any team that ever lost a series.
  for (const slug of eliminatedSlugs) {
    activeSlugs.delete(slug);
  }

  // Audit diagnostic — visible from a single console line.
  console.log('[NBA_ACTIVE_TEAMS_FINAL]', JSON.stringify({
    activeTeams: [...activeSlugs],
    eliminatedTeams: [...eliminatedSlugs],
    bracketDerivedSeriesCount: seriesPool.filter(s => !s.isStalePlaceholder).length,
    gameDerivedPairsCount: gamePool.length > 0 ? fromGames.active.size + fromGames.eliminated.size : 0,
  }));
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
 *   - Includes ALL teams that touched the postseason — active AND
 *     eliminated. Eliminated teams render with an ELIMINATED badge and
 *     muted styling so the slide tells the full story of the bracket
 *     instead of silently hiding teams that already lost (audit fix).
 *   - Skips teams that never made the playoffs at all (lottery teams).
 *
 * Ranking:
 *   - Active teams first, sorted by best title odds (favorites first),
 *     seed as tiebreaker.
 *   - Eliminated teams below, sorted by seed.
 *
 * Output:
 *   { east: [...], west: [...],
 *     eastAlsoAlive: [...legacy], westAlsoAlive: [...legacy],
 *     eliminatedTeams: [...slugs] }
 *   Cards include `team, abbrev, seed, odds, oddsRaw, prob, label,
 *   status ('active'|'eliminated'), isEliminated, rationale, liveSeries`.
 */
function buildPlayoffOutlook({ champOdds, standings, playoffContext, rawGames = [] }) {
  const { activeSlugs, eliminatedSlugs } = computeActivePlayoffTeams(playoffContext, rawGames);
  const hasAnyContext = activeSlugs.size > 0 || eliminatedSlugs.size > 0;

  const conf = { Eastern: [], Western: [] };

  for (const team of NBA_TEAMS) {
    const isElim = eliminatedSlugs.has(team.slug);
    const isActive = activeSlugs.has(team.slug);
    // Skip lottery teams — anything that never made the playoffs at all
    // shouldn't appear on Slide 3. When playoff context isn't yet
    // populated (no games played) we keep all teams listed so Slide 3
    // still has content during the warm-up window.
    if (hasAnyContext && !isActive && !isElim) continue;

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

    // For eliminated teams, find the series they LOST (any round).
    let eliminatingSeries = null;
    if (isElim) {
      const series = playoffContext?.allSeries || playoffContext?.series || [];
      for (const s of series) {
        if (!s.isComplete) continue;
        if (s.loserSlug !== team.slug) continue;
        eliminatingSeries = s;
        break;
      }
    }

    const status = isElim ? 'eliminated' : 'active';
    const label = isElim ? 'Eliminated' : classifyContender(prob);

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
      label,
      status,
      isEliminated: isElim,
      eliminatingSeries,
      liveSeries,
    });
  }

  // Active teams sort by best title odds; eliminated teams sort by
  // seed (no implied prob to rank with). Active first, eliminated below.
  function sortActive(a, b) {
    if (b.prob !== a.prob) return b.prob - a.prob;
    return (a.seed ?? 99) - (b.seed ?? 99);
  }
  function sortElim(a, b) {
    return (a.seed ?? 99) - (b.seed ?? 99);
  }

  function rank(list) {
    const active = list.filter(t => !t.isEliminated).sort(sortActive);
    const elim   = list.filter(t =>  t.isEliminated).sort(sortElim);
    return [...active, ...elim].map(t => ({ ...t, rationale: buildTeamRationale(t) }));
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
  const { team, abbrev, seed, record, prob, liveSeries, label, isEliminated, eliminatingSeries } = card;

  // Eliminated teams: surface who knocked them out + the series score
  // (e.g. "Eliminated by BOS in Round 1 (4-2)"). When we don't have a
  // resolved eliminating series, fall back to a generic "Season over"
  // line so we never render a misleading Vegas-style rationale.
  if (isEliminated) {
    if (eliminatingSeries) {
      const wonByTop = eliminatingSeries.winnerSlug === eliminatingSeries.topTeam?.slug;
      const oppAbbrev = wonByTop ? eliminatingSeries.topTeam?.abbrev : eliminatingSeries.bottomTeam?.abbrev;
      const myWins = wonByTop ? eliminatingSeries.seriesScore.bottom : eliminatingSeries.seriesScore.top;
      const oppWins = wonByTop ? eliminatingSeries.seriesScore.top : eliminatingSeries.seriesScore.bottom;
      const roundLabel = eliminatingSeries.round === 1
        ? 'Round 1'
        : eliminatingSeries.round === 2
          ? 'Round 2'
          : eliminatingSeries.round === 3
            ? 'Conference Finals'
            : eliminatingSeries.round === 4
              ? 'NBA Finals'
              : `Round ${eliminatingSeries.round || '?'}`;
      return `Eliminated by ${oppAbbrev} in ${roundLabel} (${myWins}-${oppWins}).`;
    }
    return `${abbrev} season is over — eliminated from the postseason.`;
  }

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

function buildDailyPayload({ base, playoffContext, liveGames, windowGames, champOdds, standings }) {
  const hl = buildNbaDailyHeadline({ liveGames, playoffContext });
  const hotPress = buildNbaHotPress({ liveGames, playoffContext });
  // Pass the full game window into the outlook builder so the active-
  // team derivation can use real-game data when the static bracket has
  // unresolved play-in placeholders (e.g. BOS vs tbd("Play-In Winner")).
  const rawGames = [...(windowGames || []), ...(liveGames || [])];
  const playoffOutlook = buildPlayoffOutlook({ champOdds, standings, playoffContext, rawGames });

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
          windowGames: nbaWindowGames,
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
