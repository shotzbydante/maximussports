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
function deriveActiveFromGames(allGames, bracketTeamSlugs = null) {
  const active = new Set();
  const eliminated = new Set();
  if (!Array.isArray(allGames) || allGames.length === 0) return { active, eliminated };

  // When a bracket team set is provided, ONLY consider game pairs
  // where at least one team is a bracket-anchored playoff team. This
  // prevents play-in matchups (e.g., PHI vs MIA, LAC vs GSW) from
  // polluting the active set when the text-based play-in detector
  // misses the signal on stripped scoreboard data.
  const requireBracketTeam = !!(bracketTeamSlugs && bracketTeamSlugs.size > 0);

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
    if (requireBracketTeam && !bracketTeamSlugs.has(a.slug) && !bracketTeamSlugs.has(h.slug)) {
      // Both teams are non-bracket → treat as a play-in / non-playoff
      // pair and skip. Real Round-1 games always involve at least one
      // bracket-anchored team.
      continue;
    }
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
/**
 * Last-mile guard for postseason leaders. Filters out any leader whose
 * team is NOT in the active-or-eliminated playoff team set. The server-
 * side builder already filters on the box-score path, but if a poisoned
 * cache or out-of-band fetch ever sneaks regular-season ESPN data
 * through, this stops it from rendering on Slide 2 / Slide 1 / caption.
 *
 * Behavior:
 *   - Returns the leaders payload UNCHANGED for non-postseason data.
 *   - For postseason data, builds the same playoff-team set the builder
 *     uses (bracket UNION game-derived) and filters every leader.
 *   - Logs a single [NBA_LEADERS_FINAL_GUARD] line whenever a leader is
 *     dropped, so the leak is visible in production logs.
 *   - When the playoff team set is empty (no playoff context yet), the
 *     guard does nothing — there's no way to validate, so we trust the
 *     payload was server-validated. (Hard-throw would crash the slide
 *     in legitimate edge cases like a fresh boot before any games.)
 */
function sanitizePostseasonLeaders(leaders, playoffContext, rawGames) {
  if (!leaders || !leaders.categories) return leaders;
  const isPostseason = leaders.seasonType === 'postseason';
  if (!isPostseason) return leaders;

  // Build the same active∪eliminated team set the server builder used.
  // Eliminated teams stay in the set because their LEADERS are still
  // legitimate "postseason leaders" — they played playoff games before
  // bowing out. (Slide 3 separately excludes eliminated teams from the
  // bracket outlook.)
  const playoffTeams = new Set();
  const seriesPool = playoffContext?.allSeries || playoffContext?.series || [];
  for (const s of seriesPool) {
    if (s?.isStalePlaceholder) continue;
    if (s?.topTeam?.slug && !s?.topTeam?.isPlaceholder)       playoffTeams.add(s.topTeam.slug);
    if (s?.bottomTeam?.slug && !s?.bottomTeam?.isPlaceholder) playoffTeams.add(s.bottomTeam.slug);
    if (s?.winnerSlug) playoffTeams.add(s.winnerSlug);
    if (s?.loserSlug)  playoffTeams.add(s.loserSlug);
  }
  // Game-anchored fallback (catches BOS/OKC/SAS placeholder cases)
  for (const g of (rawGames || [])) {
    if (!g?.gameState?.isFinal && g?.status !== 'final') continue;
    const a = g?.teams?.away?.slug;
    const h = g?.teams?.home?.slug;
    if (a) playoffTeams.add(a);
    if (h) playoffTeams.add(h);
  }

  if (playoffTeams.size === 0) {
    // No way to validate — trust server payload. (This is the "early
    // bootstrap" edge case where playoff context hasn't been built yet.)
    return leaders;
  }

  // Some leader payloads carry only `teamAbbrev` (uppercase, e.g. "MIN")
  // and not `teamSlug` (lowercase, "min"). Derive slug from abbrev so
  // the team check works on either shape.
  const abbrevToSlug = Object.fromEntries(
    NBA_TEAMS.map(t => [String(t.abbrev || '').toUpperCase(), t.slug])
  );
  const resolveSlug = (ldr) => {
    if (ldr?.teamSlug) return ldr.teamSlug;
    const ab = String(ldr?.teamAbbrev || '').toUpperCase();
    return ab ? (abbrevToSlug[ab] || null) : null;
  };

  let totalLeadersBefore = 0;
  let totalLeadersAfter = 0;
  const droppedSlugs = new Set();
  const filteredCats = {};
  for (const [key, cat] of Object.entries(leaders.categories || {})) {
    const list = Array.isArray(cat?.leaders) ? cat.leaders : [];
    totalLeadersBefore += list.length;
    const kept = list.filter(ldr => {
      const slug = resolveSlug(ldr);
      if (!slug || !playoffTeams.has(slug)) {
        if (slug) droppedSlugs.add(slug);
        return false;
      }
      return true;
    });
    totalLeadersAfter += kept.length;
    filteredCats[key] = { ...cat, leaders: kept };
  }

  if (totalLeadersBefore !== totalLeadersAfter) {
    // Loud diagnostic — production log should never see this if the
    // server-side builder is working. If it does, the team filter at
    // the API layer is being bypassed somehow.
    console.warn('[NBA_LEADERS_FINAL_GUARD] non-playoff leaders filtered at normalizer', JSON.stringify({
      before: totalLeadersBefore,
      after: totalLeadersAfter,
      droppedTeams: Array.from(droppedSlugs).sort(),
      validTeams: Array.from(playoffTeams).sort(),
      source: leaders._source || 'unknown',
    }));
  }

  return { ...leaders, categories: filteredCats, _sanitizedAtNormalizer: true };
}

function computeActivePlayoffTeams(playoffContext, rawGames = []) {
  const activeSlugs = new Set();
  const eliminatedSlugs = new Set();

  // Build the canonical set of "bracket-anchored" teams — every team
  // listed by name in any bracket matchup (even if the matchup is
  // currently stale-placeholder). This is the whitelist that gates
  // the game-data fallback below: a Round-1 game pair must include at
  // least one bracket-anchored team to count, otherwise it's a
  // play-in matchup that shouldn't surface on Slide 3.
  const bracketTeamSlugs = new Set();
  const seriesPoolForBracket = [
    ...(playoffContext?.allSeries || []),
    ...(playoffContext?.series || []),
    ...(playoffContext?.seriesAll || []),
  ];
  for (const s of seriesPoolForBracket) {
    if (s?.topTeam?.slug && !s?.topTeam?.isPlaceholder)       bracketTeamSlugs.add(s.topTeam.slug);
    if (s?.bottomTeam?.slug && !s?.bottomTeam?.isPlaceholder) bracketTeamSlugs.add(s.bottomTeam.slug);
  }

  // Source 1: bracket-anchored series (only NON-stale series count
  // toward active. Stale rows like "BOS vs Play-In Winner" don't
  // automatically promote BOS to active — that comes via Source 2
  // once BOS plays a real Round-1 game).
  const seriesPool = playoffContext?.allSeries
    || playoffContext?.series
    || [];
  for (const s of seriesPool) {
    if (s.isStalePlaceholder) continue;
    if (s.isComplete) {
      if (s.winnerSlug) activeSlugs.add(s.winnerSlug);
      if (s.loserSlug)  eliminatedSlugs.add(s.loserSlug);
    } else {
      if (s.topTeam?.slug && !s.topTeam.isPlaceholder)       activeSlugs.add(s.topTeam.slug);
      if (s.bottomTeam?.slug && !s.bottomTeam.isPlaceholder) activeSlugs.add(s.bottomTeam.slug);
    }
  }

  // Source 2: real game data (catches BOS/OKC/SAS-style cases where
  // the bracket has placeholder opponents but actual playoff games
  // have been played). Use rawGames if available, otherwise any
  // games stored on playoffContext.
  // Pass bracketTeamSlugs so play-in pairs (PHI/MIA, LAC/GSW, etc.)
  // are filtered out of the active set.
  const gamePool = rawGames.length > 0
    ? rawGames
    : (playoffContext?.todayGames || []).concat(playoffContext?.recentFinals || []);
  const fromGames = deriveActiveFromGames(gamePool, bracketTeamSlugs);
  for (const slug of fromGames.active) activeSlugs.add(slug);
  for (const slug of fromGames.eliminated) eliminatedSlugs.add(slug);

  // Source 3 (FAIL-CLOSED guard): when neither bracket nor game data has
  // produced any active or eliminated team, the upstream filter would
  // bypass entirely (`hasAnyContext === false`) and let all 30 NBA teams
  // pass through Slide 3 — the user-reported bug where lottery teams like
  // CHA / NOP / MEM / UTA / BKN appeared. Fall back to bracketTeamSlugs:
  // if we have ANY hardcoded playoff bracket, treat its named teams as
  // the active set. Better to render an over-inclusive playoff list than
  // a regular-season-by-odds list. The caller (`buildPlayoffOutlook`)
  // will still apply seed/odds filtering on top of this.
  if (activeSlugs.size === 0 && eliminatedSlugs.size === 0 && bracketTeamSlugs.size > 0) {
    for (const slug of bracketTeamSlugs) activeSlugs.add(slug);
    console.warn('[NBA_ACTIVE_TEAMS_BRACKET_FALLBACK]', JSON.stringify({
      reason: 'no signal from bracket series or games — using static bracket teams',
      bracketTeams: Array.from(bracketTeamSlugs).sort(),
    }));
  }

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
 * ACTIVE TEAMS ONLY (per latest spec): eliminated teams are excluded
 * entirely. The previous "ELIMINATED badge" treatment was reverted —
 * Slide 3 now shows only teams still alive in the bracket.
 *
 * Active team =
 *   - team in an incomplete (non-stale) playoff series, OR
 *   - winner of a completed series who is awaiting the next round
 *
 * Eliminated team (excluded):
 *   - loser of any completed series
 *   - team not in playoff proper bracket (lottery)
 *   - stale-placeholder rows
 *
 * Ranking: best title odds (favorites first), seed tiebreaker.
 *
 * Output:
 *   { east: [...], west: [...], eliminatedTeams: [...slugs (for diag)] }
 *   Cards: { team, abbrev, slug, seed, odds, oddsRaw, prob, label,
 *            rationale, liveSeries }
 */
function buildPlayoffOutlook({ champOdds, standings, playoffContext, rawGames = [] }) {
  const { activeSlugs, eliminatedSlugs } = computeActivePlayoffTeams(playoffContext, rawGames);
  const hasAnyContext = activeSlugs.size > 0 || eliminatedSlugs.size > 0;

  const conf = { Eastern: [], Western: [] };

  for (const team of NBA_TEAMS) {
    // Active-only filter. When playoff context isn't yet populated (no
    // games played at all) we let everyone through so Slide 3 still
    // has content during the pre-Round-1 warm-up window.
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
      status: 'active',
      isEliminated: false,
      liveSeries,
    });
  }

  // Sort by best title odds; seed tiebreaker.
  function sortByOdds(a, b) {
    if (b.prob !== a.prob) return b.prob - a.prob;
    return (a.seed ?? 99) - (b.seed ?? 99);
  }

  function rank(list) {
    return list.sort(sortByOdds).map(t => ({ ...t, rationale: buildTeamRationale(t) }));
  }

  const eastFull = rank(conf['Eastern'] || []);
  const westFull = rank(conf['Western'] || []);

  // Audit Part 5: cap each conference at TOP 4 active teams by best
  // championship odds (seed as tiebreaker). Slide 3 is not a roster
  // page; it's a focused contender card. If fewer than 4 teams are
  // alive (e.g. deep into Round 3), we render what we have. Caption
  // Title Path can still consume the full ranked list via eastFull /
  // westFull when it wants the complete contender field.
  const TITLE_PATH_PER_CONF = 4;
  const east = eastFull.slice(0, TITLE_PATH_PER_CONF);
  const west = westFull.slice(0, TITLE_PATH_PER_CONF);

  console.log('[NBA_PLAYOFF_OUTLOOK_ACTIVE_TEAMS]', JSON.stringify({
    activeCount: activeSlugs.size,
    activeTeams: [...activeSlugs],
    excludedTeams: [...eliminatedSlugs],
    eastCount: east.length,
    westCount: west.length,
    eastTeams: east.map(t => t.abbrev),
    westTeams: west.map(t => t.abbrev),
    truncatedEast: eastFull.slice(TITLE_PATH_PER_CONF).map(t => t.abbrev),
    truncatedWest: westFull.slice(TITLE_PATH_PER_CONF).map(t => t.abbrev),
  }));

  // Audit-spec'd Slide 3 final-set diagnostic.
  console.log('[NBA_SLIDE3_ACTIVE_FINAL]', JSON.stringify({
    east: east.map(t => t.abbrev),
    west: west.map(t => t.abbrev),
    eliminated: [...eliminatedSlugs],
  }));

  return {
    east,
    west,
    // Full ranked lists exposed for caption + Title Path consumers
    // that want the complete contender field rather than Slide 3's
    // top-4.
    eastFull,
    westFull,
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
  // Look across allSeries (cross-round) — needed for a R1 winner who's
  // about to start the semis. The previous lookup walked pc.series
  // (current-round only), which paired with the "in motion" subhead
  // produced "LAL won 4-2 — first round in motion" — incoherent for a
  // FINISHED series.
  let series = null;
  const seriesPool = playoffContext?.allSeries || playoffContext?.series || [];
  // Prefer an active series; fall back to the most-recent completed
  // one if no active series exists for this team.
  const teamSeriesAll = seriesPool.filter(s =>
    s?.topTeam?.slug === slug || s?.bottomTeam?.slug === slug
  );
  series = teamSeriesAll.find(s => !s.isComplete) || teamSeriesAll[0] || null;
  // Subhead is now state-aware: a completed series can't be "in
  // motion". Wins/sweeps go to "advances to next round" copy; active
  // series keep "in motion".
  const roundShort = (round) => {
    if (round === 2) return team.conference === 'Eastern' ? 'East Semifinals' : 'West Semifinals';
    if (round === 3) return team.conference === 'Eastern' ? 'East Finals' : 'West Finals';
    if (round === 4) return 'NBA Finals';
    return 'first round';
  };
  let subhead;
  if (!series) {
    subhead = `${team.conference} Conference`;
  } else if (series.isComplete) {
    const won = series.seriesStates?.winnerSlug === slug;
    if (won) {
      const next = (series.round || 1) === 4
        ? 'champions'
        : roundShort((series.round || 1) + 1);
      subhead = `${series.seriesScore.summary} — advances to the ${next}.`;
    } else {
      subhead = `${series.seriesScore.summary} — series ends here.`;
    }
  } else {
    const r = series.round === 1 ? 'first round' : roundShort(series.round);
    subhead = `${series.seriesScore.summary} — ${r} in motion`;
  }
  return {
    ...base,
    headline: `${team.name} Playoff Intel`,
    subhead,
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

  // ── HARD GUARD: postseason leaders must only contain players from
  // teams in the active playoff bracket. The builder already filters
  // on the server, but this last-mile check ensures that even if a
  // poisoned cache or out-of-band fetch sneaks a non-playoff team
  // through, it never reaches the slide. We FILTER (not throw) so the
  // dashboard never crashes on bad upstream data — but we LOG loudly
  // so the leak is visible in production. */
  const sanitizedLeaders = sanitizePostseasonLeaders(nbaLeaders, playoffContext, nbaWindowGames);

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
    nbaLeaders:         sanitizedLeaders,
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
export { buildPlayoffOutlook, classifyContender, computeActivePlayoffTeams };

/**
 * Resolve the set of teams currently alive in the playoffs. Used by
 * Team Intel to know which 8 (semis), 4 (CF), or 2 (Finals) teams
 * should generate slides. Logs `[NBA_TEAM_INTEL_ACTIVE_TEAMS]` so the
 * dynamic active-set is visible from the console.
 *
 * @param {object} playoffContext  built via buildNbaPlayoffContext
 * @param {Array}  rawGames        windowGames + liveGames (optional)
 * @returns {string[]}             slugs of alive teams (sorted)
 */
export function resolveActivePlayoffTeams(playoffContext, rawGames = []) {
  const { activeSlugs } = computeActivePlayoffTeams(playoffContext, rawGames);
  const slugs = Array.from(activeSlugs).sort();
  if (typeof console !== 'undefined') {
    console.log('[NBA_TEAM_INTEL_ACTIVE_TEAMS]', JSON.stringify({
      count: slugs.length,
      teams: slugs,
      round: playoffContext?.round || null,
    }));
  }
  return slugs;
}
