/**
 * buildMlbDailySignals — Daily intelligence layer for MLB Daily Briefing.
 *
 * Combines yesterday's game results with live standings data, streaks,
 * and momentum to produce structured narrative signals that drive
 * headlines, HOTP bullets, and story cards.
 *
 * Narrative hierarchy (enforced):
 *   1. Results    — what happened (scores, upsets, shutouts, blowouts)
 *   2. Standings  — what changed (GB shifts, division lead changes, position movement)
 *   3. Momentum   — who's trending (streaks, L10, hot/cold runs)
 *   4. Model      — what the projections say (secondary context only)
 *
 * Consumers: buildMlbDailyHeadline, buildMlbHotPress, MlbDailySlide1, MlbDailySlide2,
 *            buildMlbCaption, email briefing
 */

import { MLB_TEAMS } from '../../../sports/mlb/teams.js';
import { getTeamProjection } from '../../../data/mlb/seasonModel.js';
import { buildGameWhyItMatters } from '../../../data/mlb/whyItMatters.js';

// ── Team metadata ──────────────────────────────────────────────────────

const TEAM_META = Object.fromEntries(
  MLB_TEAMS.map(t => [t.slug, { name: t.name.split(' ').pop(), abbrev: t.abbrev, division: t.division, league: t.league }])
);
function teamName(slug) { return TEAM_META[slug]?.name || slug || '???'; }
function teamDiv(slug) { return TEAM_META[slug]?.division || ''; }

// ── Enriched game stories ──────────────────────────────────────────────

/**
 * Extract and enrich game stories with standings + model context.
 *
 * Each story gets: result type, scores, isUpset/isContender/isDivisionRival,
 * PLUS standings data (rank, GB, streak, L10) and a whyItMatters signal.
 *
 * @param {Array} liveGames - from /api/mlb/live/games
 * @param {Object} [allStandings] - { [slug]: { rank, gb, gbDisplay, streak, l10, wins, losses, division } }
 * @returns {Array} sorted enriched stories
 */
export function extractEnrichedStories(liveGames, allStandings) {
  if (!Array.isArray(liveGames) || liveGames.length === 0) return [];

  const finals = liveGames.filter(g =>
    g.gameState?.isFinal || g.status === 'final'
  );
  if (finals.length === 0) return [];

  const stories = [];

  for (const g of finals) {
    const away = g.teams?.away || {};
    const home = g.teams?.home || {};
    const awayScore = away.score ?? 0;
    const homeScore = home.score ?? 0;
    const winner = awayScore > homeScore ? away : home;
    const loser = awayScore > homeScore ? home : away;
    const winScore = Math.max(awayScore, homeScore);
    const loseScore = Math.min(awayScore, homeScore);
    const margin = winScore - loseScore;

    const winSlug = winner.slug;
    const loseSlug = loser.slug;
    if (!winSlug) continue;

    // Model context
    const winProj = getTeamProjection(winSlug);
    const loseProj = getTeamProjection(loseSlug);
    const winProjWins = winProj?.projectedWins ?? 81;
    const loseProjWins = loseProj?.projectedWins ?? 81;
    const isContender = winProjWins >= 88;
    const isUpset = loseProjWins >= 88 && winProjWins < 84;

    // Division context
    const winDiv = teamDiv(winSlug);
    const loseDiv = teamDiv(loseSlug);
    const isDivisionRival = winDiv && winDiv === loseDiv;

    // Standings enrichment
    const winStanding = allStandings?.[winSlug] || null;
    const loseStanding = allStandings?.[loseSlug] || null;

    const story = {
      type: loseScore === 0 ? 'shutout' : margin >= 7 ? 'blowout' : margin === 1 ? 'close' : 'result',
      winSlug, loseSlug,
      winScore, loseScore, margin,
      isContender, isUpset, isDivisionRival,
      winProjWins, loseProjWins,
      winDiv, loseDiv,
      // Standings data for narrative enrichment
      winStanding, loseStanding,
      winRecord: winStanding ? `${winStanding.wins}-${winStanding.losses}` : null,
      loseRecord: loseStanding ? `${loseStanding.wins}-${loseStanding.losses}` : null,
      winStreak: winStanding?.streak || null,
      loseStreak: loseStanding?.streak || null,
      winGB: winStanding?.gb ?? null,
      loseGB: loseStanding?.gb ?? null,
      winRank: winStanding?.rank ?? null,
      loseRank: loseStanding?.rank ?? null,
      winL10: winStanding?.l10 || null,
      loseL10: loseStanding?.l10 || null,
      // Why it matters signal
      signal: null,
    };

    // Generate "why it matters" signal for this game
    story.signal = buildGameWhyItMatters(story, allStandings);

    stories.push(story);
  }

  // Sort: highest-priority signal first, then upsets, shutouts, blowouts, contenders
  stories.sort((a, b) => {
    // Prioritize by signal priority if available
    const aPri = a.signal?.priority ?? 0;
    const bPri = b.signal?.priority ?? 0;
    if (Math.abs(aPri - bPri) >= 10) return bPri - aPri;

    // Then by story type
    if (a.isUpset && !b.isUpset) return -1;
    if (!a.isUpset && b.isUpset) return 1;
    const typeOrder = { shutout: 0, blowout: 1, close: 2, result: 3 };
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    if (a.isContender && !b.isContender) return -1;
    if (!a.isContender && b.isContender) return 1;
    return b.margin - a.margin;
  });

  return stories;
}

// ── Standings movement summary ─────────────────────────────────────────

/**
 * Detect the biggest standings movement across today's results.
 *
 * Returns structured signals about division lead changes, GB shifts,
 * and race tightening/widening.
 *
 * @param {Array} stories - enriched stories from extractEnrichedStories()
 * @returns {Object} { divisionShifts, tightestRace, biggestMover, summary }
 */
export function detectStandingsMovement(stories) {
  const divisionShifts = [];
  let tightestRace = null;
  let biggestMover = null;

  for (const s of stories) {
    // Division rival games = direct standings implications
    if (s.isDivisionRival && s.winStanding && s.loseStanding) {
      const shift = {
        division: s.winDiv,
        winSlug: s.winSlug, loseSlug: s.loseSlug,
        winRank: s.winRank, loseRank: s.loseRank,
        winGB: s.winGB, loseGB: s.loseGB,
        leaderChanged: s.winRank > s.loseRank && s.winGB <= 1,
        gapNarrowed: s.winRank > s.loseRank,
        gapWidened: s.winRank < s.loseRank,
      };
      divisionShifts.push(shift);
    }

    // Track teams gaining ground
    if (s.winStanding && s.winGB != null && s.winGB <= 3 && s.winRank > 1) {
      if (!biggestMover || s.winGB < (biggestMover.winGB ?? 99)) {
        biggestMover = s;
      }
    }

    // Track tightest division race
    if (s.winStanding && s.winGB != null && s.winGB <= 2) {
      if (!tightestRace || s.winGB < (tightestRace.gb ?? 99)) {
        tightestRace = { division: s.winDiv, gb: s.winGB, slug: s.winSlug };
      }
    }
  }

  // Build summary sentence
  let summary = '';
  if (divisionShifts.length > 0) {
    const ds = divisionShifts[0];
    if (ds.leaderChanged) {
      summary = `The ${ds.division} lead changes hands as ${teamName(ds.winSlug)} overtake ${teamName(ds.loseSlug)}.`;
    } else if (ds.gapNarrowed) {
      summary = `The ${ds.division} tightens as ${teamName(ds.winSlug)} gain ground on ${teamName(ds.loseSlug)}.`;
    } else if (ds.gapWidened) {
      summary = `${teamName(ds.winSlug)} extend their ${ds.division} lead over ${teamName(ds.loseSlug)}.`;
    }
  } else if (tightestRace) {
    summary = `The ${tightestRace.division} race sits at ${tightestRace.gb} ${tightestRace.gb === 1 ? 'game' : 'games'} as contenders keep pace.`;
  }

  return { divisionShifts, tightestRace, biggestMover, summary };
}

// ── Streak/momentum signals ────────────────────────────────────────────

/**
 * Extract notable streak and momentum signals from today's results.
 *
 * @param {Array} stories - enriched stories
 * @returns {Array} { slug, streakType, streakCount, text }
 */
export function extractMomentumSignals(stories) {
  const signals = [];

  for (const s of stories) {
    // Winner extending a win streak
    if (s.winStreak?.startsWith('W')) {
      const n = parseInt(s.winStreak.slice(1));
      if (n >= 3) {
        signals.push({
          slug: s.winSlug,
          streakType: 'win',
          streakCount: n,
          priority: n >= 5 ? 85 : 65,
          text: `${teamName(s.winSlug)} have won ${n} straight`,
          longText: n >= 5
            ? `${teamName(s.winSlug)} extend their winning streak to ${n} — this is the kind of run that reshapes standings.`
            : `${teamName(s.winSlug)} make it ${n} in a row, building momentum at the right time.`,
        });
      }
    }

    // Loser extending a losing streak
    if (s.loseStreak?.startsWith('L')) {
      const n = parseInt(s.loseStreak.slice(1));
      if (n >= 3) {
        signals.push({
          slug: s.loseSlug,
          streakType: 'loss',
          streakCount: n,
          priority: n >= 5 ? 82 : 60,
          text: `${teamName(s.loseSlug)} have dropped ${n} straight`,
          longText: n >= 5
            ? `${teamName(s.loseSlug)} drop their ${n}th in a row — the skid is costing real ground.`
            : `${teamName(s.loseSlug)} lose ${n} straight, pressure mounting to stop the slide.`,
        });
      }
    }
  }

  signals.sort((a, b) => b.priority - a.priority);
  return signals;
}

// ── Master builder ─────────────────────────────────────────────────────

/**
 * Build complete daily signals package.
 *
 * This is the canonical data layer that should feed ALL narrative surfaces:
 * headlines, HOTP, story cards, captions, email.
 *
 * @param {Object} opts
 * @param {Array} opts.liveGames
 * @param {Object} [opts.allStandings]
 * @returns {Object} { stories, standings, momentum, topSignal, hasResults }
 */
export function buildMlbDailySignals({ liveGames, allStandings } = {}) {
  const stories = extractEnrichedStories(liveGames, allStandings);
  const standings = detectStandingsMovement(stories);
  const momentum = extractMomentumSignals(stories);

  // Top narrative signal — what's the single most important thing today?
  let topSignal = null;
  const allSignals = stories
    .map(s => s.signal)
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);

  if (allSignals.length > 0) {
    topSignal = allSignals[0];
  }

  return {
    stories,
    standings,
    momentum,
    topSignal,
    hasResults: stories.length > 0,
    gameCount: stories.length,
  };
}

export default buildMlbDailySignals;
