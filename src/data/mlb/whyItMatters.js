/**
 * whyItMatters.js — Shared "Why It Matters" narrative engine for MLB.
 *
 * Generates structured narrative signals that answer:
 *   "Why should I care about this today?"
 *
 * Two modes:
 *   1. Team-level: buildTeamWhyItMatters() — for Team Intel surfaces
 *   2. Game-level: buildGameWhyItMatters() — for Daily Briefing surfaces
 *
 * Narrative types (ranked by editorial urgency):
 *   - standings_shift : division race gain/loss, wild card movement
 *   - momentum        : hot/cold streaks, inflection points
 *   - leverage        : high-stakes series, divisional matchups
 *   - risk            : injuries, regression signals, model flags
 *   - market          : odds movement, model vs. market disagreement
 *   - news            : breaking storylines from headlines
 *
 * Each signal: { type, short, long, priority }
 *   - short : ~30-40 chars, for appending to HOTP bullets or captions
 *   - long  : ~80-120 chars, for subtext or standalone context
 *   - priority : 0-100, higher = more editorially urgent
 *
 * Consumers: buildTeamIntelBriefing, buildMlbDailyHeadline, buildMlbCaption,
 *            homeSummary prompt, email briefing
 */

import { getTeamProjection } from './seasonModel.js';
import { MLB_TEAMS } from '../../sports/mlb/teams.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function teamNameFromSlug(slug) {
  const t = MLB_TEAMS.find(tm => tm.slug === slug);
  return t ? shortName(t.name) : slug?.toUpperCase() || '???';
}

function teamDivFromSlug(slug) {
  return MLB_TEAMS.find(t => t.slug === slug)?.division || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEAM-LEVEL "WHY IT MATTERS"
//
//  For Team Intel slide, team page, team caption.
//  Answers: "Why should I care about THIS TEAM today?"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {Object} opts
 * @param {string} opts.slug
 * @param {string} opts.teamName
 * @param {string} opts.division
 * @param {Object} [opts.standings] - ESPN standings: { rank, gb, l10, streak, wins, losses }
 * @param {Object} [opts.projection] - from getTeamProjection()
 * @param {Object} [opts.teamContext] - from extractTeamContext()
 * @param {Object} [opts.champOdds] - { bestChanceAmerican }
 * @returns {{ signals: Array<{ type, short, long, priority }>, top: { type, short, long, priority } | null }}
 */
export function buildTeamWhyItMatters({
  slug, teamName, division, standings, projection, teamContext, champOdds,
}) {
  const signals = [];
  const sn = shortName(teamName);
  const proj = projection || (slug ? getTeamProjection(slug) : null);
  const { streak, l10Record, l10Wins, recentGames } = teamContext || {};

  // ── STANDINGS SHIFT ──────────────────────────────────────────────────────

  if (standings?.rank != null && division) {
    const { rank, gb } = standings;
    if (rank === 1) {
      signals.push({
        type: 'standings_shift',
        short: `Leading the ${division}`,
        long: `${sn} hold 1st in the ${division}${gb === 0 ? '' : ` by ${gb} games`}. Every win extends the cushion.`,
        priority: 82,
      });
    } else if (gb != null && gb <= 2) {
      signals.push({
        type: 'standings_shift',
        short: `${gb} GB in ${division}`,
        long: `${sn} sit just ${gb} ${gb === 1 ? 'game' : 'games'} back in the ${division}. This is a coin-flip race — every series matters.`,
        priority: 90,
      });
    } else if (gb != null && gb <= 5) {
      signals.push({
        type: 'standings_shift',
        short: `${gb} GB — still in it`,
        long: `${sn} are ${gb} games back in the ${division}. Close enough to make a run, but the margin is shrinking.`,
        priority: 75,
      });
    } else if (gb != null && gb > 8) {
      signals.push({
        type: 'standings_shift',
        short: `${gb} GB — fading`,
        long: `${sn} are ${gb} games off the pace in the ${division}. The gap is real and the clock is ticking.`,
        priority: 55,
      });
    }
  }

  // ── MOMENTUM ─────────────────────────────────────────────────────────────

  if (streak) {
    const n = parseInt(streak.slice(1));
    if (streak.startsWith('W') && n >= 5) {
      signals.push({
        type: 'momentum',
        short: `${n}-game win streak`,
        long: `${sn} have won ${n} straight — this is the kind of run that reshapes division races.`,
        priority: 88,
      });
    } else if (streak.startsWith('W') && n >= 3) {
      signals.push({
        type: 'momentum',
        short: `Won ${n} straight`,
        long: `${sn} have won ${n} in a row. Momentum is building at the right time.`,
        priority: 70,
      });
    } else if (streak.startsWith('L') && n >= 5) {
      signals.push({
        type: 'momentum',
        short: `${n}-game skid`,
        long: `${sn} have dropped ${n} straight — the kind of slide that changes the trajectory of a season.`,
        priority: 85,
      });
    } else if (streak.startsWith('L') && n >= 3) {
      signals.push({
        type: 'momentum',
        short: `Lost ${n} straight`,
        long: `${sn} have dropped ${n} in a row. The pressure to stop the bleeding is mounting.`,
        priority: 68,
      });
    }
  }

  if (l10Wins != null && l10Record) {
    if (l10Wins >= 8) {
      signals.push({
        type: 'momentum',
        short: `L10: ${l10Record} — surging`,
        long: `${l10Record} over the last 10. ${sn} are on the hottest stretch of their season.`,
        priority: 80,
      });
    } else if (l10Wins <= 2) {
      signals.push({
        type: 'momentum',
        short: `L10: ${l10Record} — freefall`,
        long: `${l10Record} over the last 10. ${sn} are in crisis mode — answers are needed now.`,
        priority: 78,
      });
    }
  }

  // ── MARKET ───────────────────────────────────────────────────────────────

  const delta = proj?.marketDelta;
  if (delta != null && Math.abs(delta) >= 3) {
    const dir = delta > 0 ? 'above' : 'below';
    const stance = delta > 0
      ? 'The number hasn\'t caught up yet.'
      : 'The market may be overvaluing this roster.';
    signals.push({
      type: 'market',
      short: `${Math.abs(delta).toFixed(1)}W ${dir} market`,
      long: `Model sees ${sn} ${Math.abs(delta).toFixed(1)} wins ${dir} market consensus. ${stance}`,
      priority: delta > 0 ? 62 : 58,
    });
  }

  // ── LEVERAGE (upcoming game context) ─────────────────────────────────────

  // Check if next game is divisional
  const nextOpp = recentGames?.[0]; // We can also check future games if available
  // This will be enriched when next-game data is passed in

  // ── RISK ─────────────────────────────────────────────────────────────────

  if (proj) {
    const range = (proj.ceiling || 0) - (proj.floor || 0);
    if (range >= 20) {
      signals.push({
        type: 'risk',
        short: `Wide range: ${proj.floor}–${proj.ceiling}`,
        long: `The model's ${proj.floor}–${proj.ceiling} win range signals high variance. ${sn} could be a wild card or a disappointment.`,
        priority: 50,
      });
    }
    if (proj.confidenceTier === 'LOW') {
      signals.push({
        type: 'risk',
        short: 'Low model confidence',
        long: `Model confidence in ${sn} is LOW — too many unknowns to project with conviction.`,
        priority: 45,
      });
    }
  }

  // Sort by priority
  signals.sort((a, b) => b.priority - a.priority);

  return {
    signals,
    top: signals[0] || null,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
//  GAME-LEVEL "WHY IT MATTERS"
//
//  For Daily Briefing HOTP bullets, daily caption, email.
//  Answers: "Why does THIS RESULT matter for the bigger picture?"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {Object} story - game story from extractGameStories()
 * @param {string} story.winSlug
 * @param {string} story.loseSlug
 * @param {number} story.winScore
 * @param {number} story.loseScore
 * @param {boolean} story.isContender
 * @param {boolean} story.isUpset
 * @param {boolean} story.isDivisionRival
 * @param {Object} [allStandings] - { [slug]: { rank, gb, l10, wins, losses, division } }
 * @returns {{ type, short, long, priority } | null}
 */
export function buildGameWhyItMatters(story, allStandings) {
  if (!story?.winSlug) return null;

  const winName = teamNameFromSlug(story.winSlug);
  const loseName = teamNameFromSlug(story.loseSlug);
  const winStanding = allStandings?.[story.winSlug];
  const loseStanding = allStandings?.[story.loseSlug];
  const winDiv = teamDivFromSlug(story.winSlug);
  const loseDiv = teamDivFromSlug(story.loseSlug);

  // ── Division rival result — standings shift ──────────────────────────────
  if (story.isDivisionRival && winStanding && loseStanding) {
    const winRank = winStanding.rank;
    const loseRank = loseStanding.rank;
    const winGB = winStanding.gb ?? 0;
    const loseGB = loseStanding.gb ?? 0;

    // Winner gains ground on loser (or extends lead)
    if (winRank < loseRank) {
      return {
        type: 'standings_shift',
        short: `${winName} extend ${winDiv} lead`,
        long: `A divisional win that widens the gap. ${winName} hold ${ordinal(winRank)} in the ${winDiv}, ${loseGB > 0 ? `pushing ${loseName} to ${loseGB} GB` : `keeping ${loseName} at bay`}.`,
        priority: 92,
      };
    }
    if (winRank > loseRank && winGB <= 3) {
      return {
        type: 'standings_shift',
        short: `${winName} close gap in ${winDiv}`,
        long: `${winName} gain ground in a critical ${winDiv} matchup — now ${winGB > 0 ? `${winGB} games back` : 'tied for the lead'}. The race just tightened.`,
        priority: 95,
      };
    }
    // General divisional result
    return {
      type: 'standings_shift',
      short: `${winDiv} race implications`,
      long: `A ${winDiv} head-to-head that shifts the standings. ${winName} over ${loseName} — every divisional game carries double weight.`,
      priority: 85,
    };
  }

  // ── Contender loses to non-contender — potential standings shift ─────────
  if (story.isUpset && loseStanding) {
    const loseRank = loseStanding.rank;
    return {
      type: 'standings_shift',
      short: `${loseName} stumble — door opens`,
      long: `${loseName} (${ordinal(loseRank)} in ${loseDiv}) drop one they shouldn't. The rest of the ${loseDiv} gains ground without playing.`,
      priority: 88,
    };
  }

  // ── Contender win with standings context ─────────────────────────────────
  if (story.isContender && winStanding) {
    const rank = winStanding.rank;
    const gb = winStanding.gb ?? 0;

    if (rank === 1) {
      return {
        type: 'standings_shift',
        short: `${winName} hold 1st in ${winDiv}`,
        long: `${winName} protect the top spot in the ${winDiv}. Contenders can't afford to let them pull away.`,
        priority: 72,
      };
    }
    if (gb <= 3) {
      return {
        type: 'standings_shift',
        short: `${winName} gain ground`,
        long: `${winName} pick up a win and sit ${gb} back in the ${winDiv}. The gap is closing.`,
        priority: 75,
      };
    }
  }

  // ── Momentum signal (streak) ─────────────────────────────────────────────
  if (winStanding?.streak) {
    const streakMatch = winStanding.streak.match(/^([WL])(\d+)$/);
    if (streakMatch && streakMatch[1] === 'W' && parseInt(streakMatch[2]) >= 4) {
      const n = parseInt(streakMatch[2]);
      return {
        type: 'momentum',
        short: `${winName} win streak at ${n}`,
        long: `${winName} extend their win streak to ${n}. This is the kind of run that changes the standings picture.`,
        priority: 78,
      };
    }
  }
  if (loseStanding?.streak) {
    const streakMatch = loseStanding.streak.match(/^([WL])(\d+)$/);
    if (streakMatch && streakMatch[1] === 'L' && parseInt(streakMatch[2]) >= 4) {
      const n = parseInt(streakMatch[2]);
      return {
        type: 'momentum',
        short: `${loseName} skid reaches ${n}`,
        long: `${loseName} drop their ${ordinal(n)} straight. The slide is costing real ground in the ${loseDiv}.`,
        priority: 76,
      };
    }
  }

  // ── Generic contender context ────────────────────────────────────────────
  if (story.isContender) {
    return {
      type: 'leverage',
      short: `${winName} stay on track`,
      long: `${winName} take care of business. In a tight race, banking wins against the field is how you build separation.`,
      priority: 55,
    };
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  LEAGUE-LEVEL "WHY IT MATTERS"
//
//  For Daily Briefing overview bullets, home page, email.
//  Answers: "What's the biggest 'why it matters' across all games tonight?"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Given an array of game stories and standings, find the top league-wide
 * narrative signal for the day.
 *
 * @param {Array} stories - from extractGameStories()
 * @param {Object} [allStandings] - { [slug]: standings }
 * @returns {{ type, short, long, priority } | null}
 */
export function buildLeagueWhyItMatters(stories, allStandings) {
  if (!stories?.length) return null;

  const gameSignals = stories
    .map(s => buildGameWhyItMatters(s, allStandings))
    .filter(Boolean);

  if (gameSignals.length === 0) return null;

  // Sort by priority and return the top signal
  gameSignals.sort((a, b) => b.priority - a.priority);

  // If multiple high-priority signals, synthesize into one coherent sentence
  const top = gameSignals[0];
  if (gameSignals.length >= 2 && gameSignals[1].priority >= 80) {
    const second = gameSignals[1];
    // Use .short values for concise, clean synthesis — no multi-sentence fragments
    return {
      type: 'standings_shift',
      short: top.short,
      long: `${top.short}, while ${second.short.charAt(0).toLowerCase() + second.short.slice(1)}.`,
      priority: Math.max(top.priority, second.priority),
    };
  }

  return top;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  STANDINGS SUMMARY FOR PROMPTS
//
//  Generates a compact text block of standings for AI prompt injection.
//  Used by homeSummary.js to give OpenAI division-race context.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a compact standings summary string for use in AI prompts.
 *
 * @param {Object} allStandings - { [slug]: { rank, gb, wins, losses, record, l10, streak, division } }
 * @returns {string} Multi-line standings summary, grouped by division
 */
export function buildStandingsSummaryForPrompt(allStandings) {
  if (!allStandings || Object.keys(allStandings).length === 0) return '';

  // Group by division
  const divisions = {};
  for (const [slug, st] of Object.entries(allStandings)) {
    const div = st.division || teamDivFromSlug(slug);
    if (!div) continue;
    if (!divisions[div]) divisions[div] = [];
    const teamName = MLB_TEAMS.find(t => t.slug === slug)?.name || slug;
    divisions[div].push({
      name: teamName,
      slug,
      rank: st.rank ?? 99,
      record: st.record || `${st.wins || 0}-${st.losses || 0}`,
      gb: st.gb ?? 0,
      gbDisplay: st.gbDisplay || (st.gb === 0 ? '—' : `${st.gb}`),
      l10: st.l10 || '',
      streak: st.streak || '',
    });
  }

  const lines = ['CURRENT MLB STANDINGS (from ESPN):'];
  const divOrder = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West'];

  for (const div of divOrder) {
    const teams = divisions[div];
    if (!teams?.length) continue;
    teams.sort((a, b) => a.rank - b.rank);
    lines.push(`\n${div}:`);
    for (const t of teams) {
      const gbStr = t.gb === 0 ? '(1st)' : `(${t.gb} GB)`;
      const l10Str = t.l10 ? ` L10:${t.l10}` : '';
      const streakStr = t.streak ? ` ${t.streak}` : '';
      lines.push(`  ${t.rank}. ${t.name} ${t.record} ${gbStr}${l10Str}${streakStr}`);
    }
  }

  return lines.join('\n');
}
