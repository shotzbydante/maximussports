/**
 * buildNbaHotPress — "Hot Off The Press" bullet builder for NBA Daily
 * Briefing. PLAYOFF-AWARE.
 *
 * Series importance scoring (Phase B audit Part 3):
 *   isClincher          120
 *   isComplete          100   (recent series wrap)
 *   isGameSeven          95
 *   isElimination        90   (next game can end the series)
 *   isCloseoutGame       85   (leader has 3, but not necessarily today)
 *   isUpset              75
 *   isSwingGame          65   (1-1 / 2-2 with active next game)
 *   has recent final     50
 *   has next game        30
 *
 * The score is computed per series candidate and used to RANK rather
 * than the previous priority constants. Bullets are then formatted
 * with playoff-aware narrative templates (audit Part 4):
 *   Clincher  : "Timberwolves eliminate Nuggets 4-2 — a major Round 1 surprise."
 *   Closeout  : "Lakers lead Rockets 3-2 entering Game 6 — L.A. can close the series tonight."
 *   Game 7    : "Celtics and 76ers are tied 3-3 — Game 7 decides the series."
 *   Swing     : "Cavaliers and Raptors are tied 1-1 — Game 3 swings the series."
 *   Upset     : "Hawks lead Knicks 2-1 — the lower seed has flipped home-court pressure."
 *
 * Strict exclusions:
 *   - isStalePlaceholder series (no game signal in window)
 *   - completed series older than 48hr (the clincher narrative ages out)
 *   - 0-0 placeholder bullets unless Game 1 is genuinely upcoming
 */

import { extractGameStories, teamName, seriesTagLower, findSecondStory } from './buildNbaDailyHeadline.js';
import { NBA_TEAMS } from '../../../sports/nba/teams.js';

const MAX_BULLETS = 4;
const CLINCHER_FRESHNESS_MS = 48 * 60 * 60 * 1000;

function nameOf(slug) {
  if (!slug) return '???';
  const t = NBA_TEAMS.find(t => t.slug === slug);
  if (!t) return slug.toUpperCase();
  if (/Trail Blazers$/i.test(t.name)) return 'Trail Blazers';
  return t.name.split(' ').slice(-1)[0];
}

/** Score a series for HOTP ranking — Phase B audit Part 3 spec. */
function scoreSeriesEvent(s) {
  if (!s || s.isStalePlaceholder) return 0;
  let score = 0;
  if (s.isClincher) score += 120;
  if (s.isComplete) score += 100;
  if (s.isGameSeven) score += 95;
  if (s.isElimination) score += 90;
  if (s.isCloseoutGame) score += 85;
  if (s.isUpset) score += 75;
  if (s.isSwingGame) score += 65;
  if (s.mostRecentGame) score += 50;
  if (s.nextGame) score += 30;
  return score;
}

// ── Narrative templates — ESPN alert + Vegas edge voice ────────────
//
// Voice rules (audit Part 1):
//   - Always include series score when available
//   - Always include why-it-matters (closeout / elimination / upset /
//     market pressure / title-path)
//   - Punchy, ≤ ~135 chars, breaking-alert tone
//   - Lead with a charged emoji (🚨 / 🔥 / ⚔️ / 📈 / 👀) so the bullet
//     reads like a notification, not a paragraph
//   - Reference the betting board / market when the moment is genuinely
//     market-moving (clincher of an upset, Game 7, closeout)

function clincherText(s) {
  const winner = s.winnerSlug === s.topTeam?.slug ? s.topTeam : s.bottomTeam;
  const loser = s.winnerSlug === s.topTeam?.slug ? s.bottomTeam : s.topTeam;
  if (!winner || !loser) return null;
  const winnerName = nameOf(winner.slug);
  const loserName = nameOf(loser.slug);
  const winsW = Math.max(s.seriesScore?.top ?? 0, s.seriesScore?.bottom ?? 0);
  const winsL = Math.min(s.seriesScore?.top ?? 0, s.seriesScore?.bottom ?? 0);
  const conf = s.conference === 'Western' ? 'West' : s.conference === 'Eastern' ? 'East' : null;
  const bracketTag = conf ? `${conf} bracket` : 'bracket';

  if (s.isUpset) {
    // Lower seed eliminates the higher seed — single, plain-English line
    // that lands the upset stake without forced betting jargon.
    return `🚨 ${winnerName} finish ${loserName} ${winsW}–${winsL} — a major Round 1 upset that reshapes the ${bracketTag}.`;
  }
  if (winsL === 0) {
    return `🚨 ${winnerName} sweep ${loserName} ${winsW}–${winsL} — full week of rest while the rest of the ${bracketTag} keeps grinding.`;
  }
  return `🚨 ${winnerName} eliminate ${loserName} ${winsW}–${winsL} — series done, ${winnerName} advance and shift the title path.`;
}

function gameSevenText(s) {
  if (!s.topTeam || !s.bottomTeam) return null;
  const aName = nameOf(s.topTeam?.slug);
  const bName = nameOf(s.bottomTeam?.slug);
  return `⚔️ ${aName}–${bName} go the distance — Game 7 decides the series and shakes the title path.`;
}

function closeoutText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leaderTeam = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailerTeam = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leaderTeam || !trailerTeam) return null;
  const leaderName = nameOf(leaderTeam.slug);
  const trailerName = nameOf(trailerTeam.slug);
  const lead = Math.max(ts, bs);
  const trail = Math.min(ts, bs);
  const gameNum = s.nextGameNumber || (ts + bs + 1);
  return `🔥 ${leaderName} lead ${trailerName} ${lead}–${trail} entering Game ${gameNum} — ${trailerName}'s season is on the line tonight.`;
}

function eliminationText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leaderTeam = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailerTeam = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leaderTeam || !trailerTeam) return null;
  const leaderName = nameOf(leaderTeam.slug);
  const trailerName = nameOf(trailerTeam.slug);
  const gameNum = s.nextGameNumber || (ts + bs + 1);
  return `🔥 ${trailerName} face elimination — ${leaderName} lead ${Math.max(ts, bs)}–${Math.min(ts, bs)} entering Game ${gameNum}, win-or-go-home tonight.`;
}

function swingText(s) {
  if (!s.topTeam || !s.bottomTeam) return null;
  const a = nameOf(s.topTeam?.slug);
  const b = nameOf(s.bottomTeam?.slug);
  const tied = s.seriesScore?.top ?? 0;
  const gameNum = s.nextGameNumber || (tied * 2 + 1);
  return `📈 ${a}–${b} hit Game ${gameNum} tied ${tied}–${tied} — winner grabs series control and pricing leverage.`;
}

function upsetText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const leaderTeam = ts >= bs ? s.topTeam : s.bottomTeam;
  const trailerTeam = ts >= bs ? s.bottomTeam : s.topTeam;
  if (!leaderTeam || !trailerTeam) return null;
  const leaderName = nameOf(leaderTeam.slug);
  const trailerName = nameOf(trailerTeam.slug);
  const lead = Math.max(ts, bs);
  const trail = Math.min(ts, bs);
  return `👀 ${trailerName} are in trouble — ${leaderName} lead ${lead}–${trail} and have flipped home-court pressure.`;
}

function activeSeriesText(s) {
  const ts = s.seriesScore?.top ?? 0;
  const bs = s.seriesScore?.bottom ?? 0;
  const a = nameOf(s.topTeam?.slug);
  const b = nameOf(s.bottomTeam?.slug);
  const gameNum = s.nextGameNumber || (ts + bs + 1);

  if (ts > bs) return `📊 ${a} lead ${b} ${ts}–${bs} entering Game ${gameNum} — series control on the line.`;
  if (bs > ts) return `📊 ${b} lead ${a} ${bs}–${ts} entering Game ${gameNum} — series control on the line.`;
  if ((ts + bs) === 0 && s.nextGame) return `📊 ${a}–${b} tip Game 1 tonight — Round 1 begins.`;
  return null;
}

function teamCity(slug) {
  if (!slug) return null;
  const t = NBA_TEAMS.find(t => t.slug === slug);
  if (!t) return null;
  // Conventional city short tag for closeout copy
  const cityMap = {
    lal: 'L.A.', lac: 'L.A.', gsw: 'Golden State', sf: 'Bay Area',
    bos: 'Boston', nyk: 'New York', bkn: 'Brooklyn', phi: 'Philly',
    mia: 'Miami', orl: 'Orlando', atl: 'Atlanta', cha: 'Charlotte',
    det: 'Detroit', cle: 'Cleveland', mil: 'Milwaukee', chi: 'Chicago', ind: 'Indiana',
    tor: 'Toronto', was: 'D.C.',
    okc: 'OKC', hou: 'Houston', sas: 'San Antonio', dal: 'Dallas', mem: 'Memphis', nop: 'New Orleans',
    den: 'Denver', min: 'Minnesota', uta: 'Utah', por: 'Portland', sac: 'Sacramento',
    phx: 'Phoenix',
  };
  return cityMap[slug] || null;
}

// ── Bullet builder by event type ────────────────────────────────────

function bulletForSeries(s, score) {
  const isFreshClincher = s.isClincher && s.mostRecentGameTs &&
    (Date.now() - s.mostRecentGameTs) <= CLINCHER_FRESHNESS_MS;

  let text = null;
  let _source = 'series';

  if (isFreshClincher) {
    text = clincherText(s);
    _source = 'clincher';
  } else if (s.isGameSeven) {
    text = gameSevenText(s);
    _source = 'game7';
  } else if (s.isCloseoutGame && s.isElimination && s.nextGame) {
    text = closeoutText(s);
    _source = 'closeout';
  } else if (s.isElimination && s.nextGame) {
    text = eliminationText(s);
    _source = 'elimination';
  } else if (s.isUpset && !s.isComplete) {
    text = upsetText(s);
    _source = 'upset';
  } else if (s.isSwingGame) {
    text = swingText(s);
    _source = 'swing';
  } else if (!s.isComplete) {
    text = activeSeriesText(s);
    _source = 'active_series';
  } else if (s.isComplete) {
    // Past clincher (>48hr) — surface as "team awaits next opponent"
    const winner = s.winnerSlug === s.topTeam?.slug ? s.topTeam : s.bottomTeam;
    if (winner) {
      text = `${nameOf(winner.slug)} await their next opponent.`;
      _source = 'awaiting';
    }
  }

  if (!text) return null;
  return {
    text,
    logoSlug: pickLogoSlug(s, _source),
    source: _source,
    _score: score,
  };
}

function pickLogoSlug(s, source) {
  if (source === 'clincher') return s.winnerSlug;
  if (source === 'awaiting') return s.winnerSlug;
  if (source === 'closeout' || source === 'elimination') {
    const ts = s.seriesScore?.top ?? 0;
    const bs = s.seriesScore?.bottom ?? 0;
    return ts >= bs ? s.topTeam?.slug : s.bottomTeam?.slug;
  }
  if (source === 'upset') {
    const ts = s.seriesScore?.top ?? 0;
    const bs = s.seriesScore?.bottom ?? 0;
    return ts >= bs ? s.topTeam?.slug : s.bottomTeam?.slug;
  }
  return s.topTeam?.slug || s.bottomTeam?.slug;
}

// ── Game-story bullets (close/blowout/individual finals) ────────────

function bulletForGameStory(story) {
  // Narrative-aware path FIRST: dramatic OT / comeback / buzzer-beater
  // games surface with stronger language when the game data supports it.
  // Falls back to the generic templates below if no special signal fires.
  const dramatic = buildNbaGameNarrative(story);
  if (dramatic) return dramatic;

  const w = teamName(story.winSlug);
  const l = teamName(story.loseSlug);
  const score = `${story.winScore}-${story.loseScore}`;
  const tag = seriesTagLower(story);
  if (story.isSweep) return `${w} sweep ${l} ${score}${tag}.`;
  if (story.isGame7Win) return `${w} win Game 7 over ${l} ${score} and advance.`;
  if (story.isClinch) return `${w} close out ${l} ${score}${tag}.`;
  if (story.isElimWin) return `${w} beat ${l} ${score}${tag} — one win from closing out.`;
  if (story.isUpset) return `${w} pull the upset over ${l} ${score}${tag}.`;
  if (story.isStolenRoadWin && story.winSeriesWins >= story.loseSeriesWins) {
    return `${w} steal one on the road from ${l} ${score}${tag}.`;
  }
  if (story.type === 'blowout') return `${w} roll past ${l} ${score}${tag}.`;
  if (story.type === 'close') return `${w} edge ${l} ${score}${tag}.`;
  return `${w} beat ${l} ${score}${tag}.`;
}

/**
 * Detect dramatic game context from a normalized game-story object and
 * return an enriched bullet, or null if nothing special fires.
 *
 * Signals (non-fabricated — read straight off the game data):
 *   - Overtime:        gameState.isOvertime / overtimeCount
 *   - Comeback:        per-quarter linescores → halftime margin vs final
 *   - Buzzer-beater:   notes blob containing buzzer / game-winner /
 *                      last-second pattern
 *   - Series clincher / Game 7 / elimination: story flags from
 *                      buildNbaDailyHeadline.extractGameStories
 *
 * The returned text leads with an ESPN-style alert emoji + verb so the
 * bullet reads like a notification, then layers a short stake clause.
 *
 * @param {object} story  — game story w/ winSlug / loseSlug / winScore /
 *                          loseScore + optional `narrative`
 *                          (carried through from normalized event)
 * @returns {string|null}
 */
export function buildNbaGameNarrative(story) {
  if (!story || !story.winSlug || !story.loseSlug) return null;
  const narr = story.narrative || {};
  const w = teamName(story.winSlug);
  const l = teamName(story.loseSlug);
  const score = `${story.winScore}-${story.loseScore}`;
  const tag = seriesTagLower(story);
  const margin = (story.winScore || 0) - (story.loseScore || 0);

  // Detect "forces Game N" — when the trailing team wins to extend.
  // story.winSeriesWins is the WINNER's series wins AFTER this game.
  // If the winner was the trailing side BEFORE this game, they've
  // forced another game. That's true when winSeriesWins <= loseSeriesWins
  // immediately after this win (still tied or trailing). When winner
  // was 2-3 entering, they win to tie 3-3 → forces Game 7.
  const forcesAnotherGame = story.inSeries
    && story.winSeriesWins != null && story.loseSeriesWins != null
    && story.winSeriesWins <= story.loseSeriesWins + 1
    && (story.winSeriesWins + story.loseSeriesWins) >= 4
    && !story.isClinch && !story.isGame7Win;
  const forcesGame7 = story.inSeries
    && story.winSeriesWins === 3 && story.loseSeriesWins === 3;

  // 1. BUZZER-BEATER / GAME-WINNER (highest narrative priority).
  //    Requires explicit notes-text signal — never inferred.
  const notes = String(narr.notesText || '').toLowerCase();
  const buzzerHit = /buzzer[-\s]*beater|game[-\s]*winn|last[-\s]*second|walk[-\s]*off|wins it at|hits the (game|series)[-\s]*winn|ot three|overtime three/.test(notes);
  if (buzzerHit && narr.isOvertime) {
    if (forcesGame7) {
      return `🚨 ${w} stun ${l} ${score} in OT — a last-second three forces Game 7 and flips the series pressure.`;
    }
    if (forcesAnotherGame) {
      return `🚨 ${w} stun ${l} ${score} in OT — a last-second shot forces Game ${story.winSeriesWins + story.loseSeriesWins + 1} and shifts the series pressure${tag}.`;
    }
    return `🚨 ${w} stun ${l} ${score} in OT — a last-second shot flips the series pressure${tag}.`;
  }
  if (buzzerHit) {
    if (forcesGame7) {
      return `🚨 ${w} beat ${l} ${score} on a last-second shot — Game 7 forced, series swings on the next tip.`;
    }
    return `🚨 ${w} beat ${l} ${score} on a last-second shot${tag} — the kind of moment that swings a series.`;
  }

  // 2. OVERTIME (no explicit buzzer signal).
  if (narr.isOvertime) {
    const otTag = (narr.overtimeCount && narr.overtimeCount > 1) ? `${narr.overtimeCount}OT` : 'OT';
    if (story.isClinch || story.isGame7Win) {
      return `🚨 ${w} survive ${l} ${score} in ${otTag} — series clinched in dramatic fashion${tag}.`;
    }
    if (forcesGame7) {
      return `🚨 ${w} edge ${l} ${score} in ${otTag} — Game 7 forced, the series goes the distance.`;
    }
    if (story.isElimWin) {
      return `🚨 ${w} steal ${score} from ${l} in ${otTag} — one win from closing out${tag}.`;
    }
    if (story.isUpset) {
      return `🚨 ${w} pull the upset over ${l} ${score} in ${otTag}${tag} — bracket on notice.`;
    }
    return `🚨 ${w} edge ${l} ${score} in ${otTag}${tag} — series shifts on a coin flip.`;
  }

  // 3. COMEBACK — derived from period-by-period linescores.
  //    Comeback margin = the largest deficit the WINNER faced at the
  //    end of any period before the final buzzer.
  //    Tiers: 25+ historic, 20+ massive, 15+ comeback.
  const winningSide = (story?.winSide === 'home' || story?.winSide === 'away')
    ? story.winSide
    : null;
  const winLine = winningSide === 'home' ? narr.homeLine : winningSide === 'away' ? narr.awayLine : null;
  const losLine = winningSide === 'home' ? narr.awayLine : winningSide === 'away' ? narr.homeLine : null;
  if (Array.isArray(winLine) && Array.isArray(losLine) && winLine.length >= 2 && losLine.length >= 2) {
    let maxDeficit = 0;
    let halftimeDeficit = 0;
    let cumW = 0, cumL = 0;
    for (let i = 0; i < Math.min(winLine.length, losLine.length); i++) {
      cumW += winLine[i] || 0;
      cumL += losLine[i] || 0;
      // Don't count the deficit at the final buzzer — that's just the
      // outcome, not a comeback signal.
      if (i === winLine.length - 1) break;
      const deficit = cumL - cumW;
      if (deficit > maxDeficit) maxDeficit = deficit;
      if (i === 1) halftimeDeficit = deficit; // after Q2 = halftime
    }
    if (maxDeficit >= 25) {
      const halftimeNote = halftimeDeficit >= 15 ? ` (down ${halftimeDeficit} at the half)` : '';
      return `🔥 ${w} erase a ${maxDeficit}-point deficit to beat ${l} ${score}${halftimeNote}${tag} — one of the biggest comebacks of the postseason.`;
    }
    if (maxDeficit >= 20) {
      return `🔥 ${w} erase a ${maxDeficit}-point deficit to beat ${l} ${score}${tag} — a massive postseason comeback.`;
    }
    if (maxDeficit >= 15) {
      return `🔥 ${w} rally from a ${maxDeficit}-point hole to beat ${l} ${score}${tag} — a real momentum swing.`;
    }
  }

  // 4. FORCES GAME 7 (no OT, no buzzer-beater — but a series-extender).
  if (forcesGame7) {
    return `⚔️ ${w} beat ${l} ${score} to force Game 7 — series goes the distance, season on a single tip.`;
  }

  // 5. BLOWOUT in a clinching context (margin ≥ 25 AND series-defining).
  if (margin >= 25 && (story.isClinch || story.isGame7Win)) {
    return `🔥 ${w} blow out ${l} ${score}${tag} — series clinched in a statement win.`;
  }

  return null;
}

// ── Last-resort filler ──────────────────────────────────────────────

function neutralUpcomingBullets(liveGames, excludeSlugs) {
  return (liveGames || [])
    .filter(g => g?.status === 'upcoming' && !g?.gameState?.isFinal && !g?.gameState?.isLive)
    .filter(g => {
      const a = g?.teams?.away?.slug;
      const h = g?.teams?.home?.slug;
      return a && h && !excludeSlugs.has(a) && !excludeSlugs.has(h);
    })
    .map(g => {
      const home = g.teams.home;
      const away = g.teams.away;
      return {
        text: `${home.name || home.abbrev} host ${away.name || away.abbrev} tonight.`,
        logoSlug: home.slug || null,
        source: 'neutral_upcoming',
        _score: 20,
      };
    });
}

/**
 * Main HOTP builder.
 *
 * @param {object} opts
 * @param {Array}  opts.liveGames
 * @param {object} [opts.playoffContext]
 * @returns {Array<{ text, logoSlug, source }>}  up to 4 bullets, score-ranked
 */
export function buildNbaHotPress({ liveGames = [], playoffContext = null } = {}) {
  const candidates = [];
  const excludeSlugs = new Set();

  // ── Series-driven candidates (every active non-stale series gets scored) ──
  const seriesList = (playoffContext?.series || []).filter(s => !s.isStalePlaceholder);
  for (const s of seriesList) {
    const score = scoreSeriesEvent(s);
    if (score === 0) continue;
    // For completed series older than 48hr, suppress unless really fresh
    const isStale = s.isComplete && s.mostRecentGameTs &&
      (Date.now() - s.mostRecentGameTs) > CLINCHER_FRESHNESS_MS;
    if (isStale) continue;
    const bullet = bulletForSeries(s, score);
    if (bullet) candidates.push(bullet);
  }

  // ── Game-story candidates (individual final-game narratives) ──
  // These complement series-level bullets when there's a notably close
  // or blowout result that the series rollup doesn't surface.
  const stories = extractGameStories(liveGames, playoffContext);
  const usedGameIds = new Set();
  for (const story of stories) {
    if (usedGameIds.has(story.gameId)) continue;
    usedGameIds.add(story.gameId);
    candidates.push({
      text: bulletForGameStory(story),
      logoSlug: story.winSlug,
      source: 'game_story',
      _score: story.priority || 40,
    });
  }

  // ── Neutral upcoming filler (only if we're starved) ──
  if (candidates.length < MAX_BULLETS) {
    const filler = neutralUpcomingBullets(liveGames, excludeSlugs);
    candidates.push(...filler);
  }

  // ── Rank, dedupe by team slug, take top N ──
  candidates.sort((a, b) => (b._score || 0) - (a._score || 0));

  const final = [];
  const used = new Set();
  for (const c of candidates) {
    if (final.length >= MAX_BULLETS) break;
    // Don't repeat the same team across consecutive HOTP slots
    if (c.logoSlug && used.has(c.logoSlug)) continue;
    final.push({ text: c.text, logoSlug: c.logoSlug, source: c.source });
    if (c.logoSlug) used.add(c.logoSlug);
  }

  return final;
}

/**
 * Single-entry helper that returns the strongest available narrative
 * string for a given series. Audit Part 1 explicitly requested this so
 * other surfaces (caption, email, autopost diagnostics) emit identical
 * voice without needing to re-implement the priority chain.
 */
export function buildNbaHotpNarrative(series) {
  if (!series || series.isStalePlaceholder) return null;
  const isFreshClincher = series.isClincher && series.mostRecentGameTs &&
    (Date.now() - series.mostRecentGameTs) <= CLINCHER_FRESHNESS_MS;
  if (isFreshClincher) return clincherText(series);
  if (series.isGameSeven) return gameSevenText(series);
  if (series.isCloseoutGame && series.isElimination && series.nextGame) return closeoutText(series);
  if (series.isElimination && series.nextGame) return eliminationText(series);
  if (series.isUpset && !series.isComplete) return upsetText(series);
  if (series.isSwingGame) return swingText(series);
  if (!series.isComplete) return activeSeriesText(series);
  return null;
}

export default buildNbaHotPress;
export { scoreSeriesEvent };
