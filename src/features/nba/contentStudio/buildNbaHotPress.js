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

  // PATH-VERIFIED 3-1 COMEBACK. Reads `s.seriesStates` from playoff-
  // Context — the flag is true ONLY when the eventual winner actually
  // trailed 1-3 in the series at some point. The previous heuristic
  // claimed any 4-3 final was a "3-1 comeback", which produced the
  // false "Cavaliers complete the 3-1 comeback" line for a series CLE
  // led 2-0 → 2-2 → 3-2 → 3-3 → 4-3. Integrity > hype.
  const states = s.seriesStates || {};
  const verifiedComebackFrom31 = !!states.winnerWasDown31
    && states.winnerSlug === winner.slug;
  if (verifiedComebackFrom31) {
    return `🚨 ${winnerName} complete the 3-1 comeback — ${winnerName} eliminate ${loserName} ${winsW}–${winsL} and blow up the ${bracketTag}.`;
  }
  if (s.isUpset) {
    return `🚨 ${winnerName} finish ${loserName} ${winsW}–${winsL} — a major Round 1 upset that reshapes the ${bracketTag}.`;
  }
  if (winsL === 0) {
    return `🚨 ${winnerName} sweep ${loserName} ${winsW}–${winsL} — full week of rest while the rest of the ${bracketTag} keeps grinding.`;
  }
  // Game 7 survival — winner clinched in 7 but was NOT down 3-1.
  // Replaces the old 4-3 comeback branch for CLE/TOR-style paths.
  if (winsW === 4 && winsL === 3) {
    return `🚨 ${winnerName} survive ${loserName} in Game 7 — ${winnerName} outlast ${loserName} ${winsW}–${winsL} and keep their ${bracketTag} path alive.`;
  }
  return `🚨 ${winnerName} eliminate ${loserName} ${winsW}–${winsL} — series done, ${winnerName} advance and shift the title path.`;
}

/**
 * Build a "comeback" narrative annotation (e.g., " — erasing a 22-point
 * deficit") from a normalized game's per-quarter linescores. Returns
 * empty string when no notable deficit detected. The winner side is
 * required to compute deficit correctly.
 */
function comebackTagFromNarrative(narr, winSide) {
  const winLine = winSide === 'home' ? narr?.homeLine : winSide === 'away' ? narr?.awayLine : null;
  const losLine = winSide === 'home' ? narr?.awayLine : winSide === 'away' ? narr?.homeLine : null;
  if (!Array.isArray(winLine) || !Array.isArray(losLine)) return { maxDeficit: 0, halftimeDeficit: 0 };
  let maxDeficit = 0;
  let halftimeDeficit = 0;
  let cumW = 0, cumL = 0;
  for (let i = 0; i < Math.min(winLine.length, losLine.length); i++) {
    cumW += winLine[i] || 0;
    cumL += losLine[i] || 0;
    if (i === winLine.length - 1) break; // skip final-buzzer state
    const deficit = cumL - cumW;
    if (deficit > maxDeficit) maxDeficit = deficit;
    if (i === 1) halftimeDeficit = deficit;
  }
  return { maxDeficit, halftimeDeficit };
}

function gameSevenText(s, mostRecentNarrative = null) {
  if (!s.topTeam || !s.bottomTeam) return null;
  const aName = nameOf(s.topTeam?.slug);
  const bName = nameOf(s.bottomTeam?.slug);
  // Enrich with the Game-6 drama when the most recent game carried
  // an OT / buzzer-beater / comeback signal — never fabricated.
  const ot = !!mostRecentNarrative?.isOvertime;
  const notes = String(mostRecentNarrative?.notesText || '').toLowerCase();
  const buzzer = /buzzer[-\s]*beater|game[-\s]*winn|last[-\s]*second|walk[-\s]*off|ot three|overtime three/.test(notes);
  if (ot && buzzer) {
    return `⚔️ ${aName}–${bName} go the distance after a last-second OT three — Game 7 decides the series and shakes the title path.`;
  }
  if (buzzer) {
    return `⚔️ ${aName}–${bName} go the distance after a last-second game-winner — Game 7 decides the series and shakes the title path.`;
  }
  if (ot) {
    return `⚔️ ${aName}–${bName} go the distance after an OT thriller — Game 7 decides the series and shakes the title path.`;
  }
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

function bulletForSeries(s, score, mostRecentNarrative = null) {
  const isFreshClincher = s.isClincher && s.mostRecentGameTs &&
    (Date.now() - s.mostRecentGameTs) <= CLINCHER_FRESHNESS_MS;

  let text = null;
  let _source = 'series';

  if (isFreshClincher) {
    text = clincherText(s);
    _source = 'clincher';
  } else if (s.isGameSeven) {
    text = gameSevenText(s, mostRecentNarrative);
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
  // [NBA_NARRATIVE_BEAT_FINAL] integrity log — emitted whenever a HOTP
  // bullet is selected for a series. Lets us trace which beat fired
  // and whether it relied on path-verified state (winnerWasDown31)
  // or fell back to non-comeback language.
  if (_source === 'clincher') {
    const states = s.seriesStates || {};
    console.log('[NBA_NARRATIVE_BEAT_FINAL]', JSON.stringify({
      surface: 'hotp',
      matchup: `${s.topTeam?.abbrev || s.topTeam?.slug}-${s.bottomTeam?.abbrev || s.bottomTeam?.slug}`,
      winner: s.winnerSlug,
      winnerWasDown31: !!states.winnerWasDown31 && states.winnerSlug === s.winnerSlug,
      clinchedInGame7: !!states.clinchedInGame7,
      beat: text.includes('3-1 comeback') ? 'comeback_from_3_1'
          : text.includes('survive') ? 'game7_survival'
          : text.includes('sweep') ? 'sweep'
          : 'standard_clincher',
    }));
  }
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
  // / Game-1 statement / series-edge games surface with stronger
  // language when the game data supports it. The non-clincher
  // playoff narratives added in section 6 of buildNbaGameNarrative
  // mean this almost always returns a rich bullet — the legacy
  // templates below run only when there's literally nothing else
  // to say (off-bracket exhibition, etc.).
  const dramatic = buildNbaGameNarrative(story);
  if (dramatic) return dramatic;

  const w = teamName(story.winSlug);
  const l = teamName(story.loseSlug);
  const score = `${story.winScore}-${story.loseScore}`;
  const tag = seriesTagLower(story);
  if (story.isComebackFrom31) return `${w} complete the 3-1 comeback to stun ${l} ${score} and advance.`;
  if (story.isSweep) return `${w} sweep ${l} ${score}${tag}.`;
  if (story.isGame7Win) return `${w} win Game 7 over ${l} ${score} and advance.`;
  if (story.isClinch) return `${w} eliminate ${l} ${score}${tag}.`;
  if (story.forcesGame7) return `${w} force Game 7 over ${l} ${score} — series goes the distance.`;
  if (story.closeoutFailed) return `${w} stave off elimination ${score} over ${l} — series extends.`;
  if (story.eliminationAvoided) return `${w} avoid elimination ${score} over ${l}${tag}.`;
  if (story.isElimWin) return `${w} beat ${l} ${score}${tag} — one win from closing out.`;
  if (story.isUpset) return `${w} pull the upset over ${l} ${score}${tag}.`;
  if (story.isStolenRoadWin && story.winSeriesWins >= story.loseSeriesWins) {
    return `${w} steal one on the road from ${l} ${score}${tag}.`;
  }
  if (story.type === 'blowout') return `${w} roll past ${l} ${score}${tag} — handles business with bracket pressure rising.`;
  if (story.type === 'close') return `${w} edge ${l} ${score}${tag} — every possession on the line.`;
  // Final safety net — NEVER ship the bare "Team beat Team SCORE."
  // copy that the audit screenshot called out. Always anchor on the
  // implied playoff context: if we got here at all, this is a
  // playoff-window game, so framing it as a playoff edge is safe.
  return `${w} handle ${l} ${score}${tag} — playoff edge tightens around the matchup.`;
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

  // 0. 3-1 COMEBACK CLINCHER — rarest, highest-priority narrative beat.
  //    Outranks even buzzer/OT — "complete the 3-1 comeback" is the
  //    line that defines a postseason for years.
  if (story.isComebackFrom31) {
    return `🚨 ${w} complete the 3-1 comeback — ${w} eliminate ${l} ${score} and rewrite the bracket.`;
  }
  // 0a. CLOSEOUT FAILED — winner staved off elimination at 3-2/3-1/3-0.
  //     Distinguish from forces-G7 (handled separately at the right
  //     score). closeoutFailed fires when the winner forced extension
  //     at any score short of 3-3.
  if (story.closeoutFailed && !story.forcesGame7) {
    return `🔥 ${w} stave off elimination ${score} over ${l} — series extends, ${l} can't close the door.`;
  }
  // 0b. ELIMINATION AVOIDED — winner was facing elimination, won.
  if (story.eliminationAvoided && !story.forcesGame7 && !story.closeoutFailed) {
    return `🔥 ${w} avoid elimination ${score} over ${l}${tag} — season lives another night.`;
  }

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

  // ─────────────────────────────────────────────────────────────────
  // 6. NON-CLINCHER PLAYOFF NARRATIVES (audit Part 2 fix). Fires for
  //    Round 1+ games that aren't clinching/OT/buzzer/comeback —
  //    these used to fall through to the bare "Team beat Team SCORE"
  //    fallback. With game-number + round + margin context we can
  //    always emit playoff-grade copy.
  //
  //    Order: more dramatic / specific beats first.
  //
  //    Required signals (all derived in extractGameStories from
  //    game/playoffContext, never inferred):
  //      story.h2hGameNumber  — e.g. 1 for Game 1 of any series
  //      story.roundNumber    — playoff round (1..4)
  //      story.marginTier     — historic | blowout | double_digit |
  //                             standard | tight
  //      story.isRoadWin      — boolean
  //      story.isUpset        — boolean (when seed comparable)
  //      story.winSeriesWins  — winner's series wins AFTER game (when
  //                             series matched)
  //      story.loseSeriesWins
  // ─────────────────────────────────────────────────────────────────
  const gameN = story.h2hGameNumber || (story.inSeries ? (story.winSeriesWins + story.loseSeriesWins) : null);
  const roundLabel = roundLabelFor(story.roundNumber);
  const wW = story.winSeriesWins;
  const wL = story.loseSeriesWins;

  // 6a. SERIES-EDGE / SERIES-LEAD CREATED — only when we know the
  //     series state from a matched bracket series.
  if (story.inSeries && wW != null && wL != null) {
    if (wW === 3 && wL === 1) {
      return `🔥 ${w} take a 3-1 series lead over ${l} — ${score} win puts ${l} on the brink with their season on the line.`;
    }
    if (wW === 3 && wL === 2) {
      return `🔥 ${w} grab a 3-2 series lead over ${l} — ${score} win moves them one step from closing it out.`;
    }
    if (wW === 2 && wL === 0) {
      return `🔥 ${w} take a 2-0 series lead over ${l} ${score} — control of the ${roundLabel || 'series'} swings their way.`;
    }
    if (wW === 2 && wL === 1) {
      return `📈 ${w} reclaim the series edge ${score} over ${l} — leads ${l} 2-1 with momentum heading into the next game.`;
    }
    if (wW === 1 && wL === 1) {
      return `⚖️ ${w} answer ${l} ${score} to even the series 1-1 — the ${roundLabel || 'series'} resets with home court back in play.`;
    }
    if (wW === 2 && wL === 2) {
      return `⚖️ ${w} respond to even the series 2-2 over ${l} ${score} — best-of-three from here.`;
    }
  }

  // 6b. GAME 1 STATEMENT / FIRST PUNCH — fires when we can identify
  //     this is the first game of the series (h2hGameNumber === 1).
  //     Branches on margin / road / upset to pick the right framing.
  //     Never claims comeback; only describes observable game facts.
  if (gameN === 1) {
    const r = roundLabel || 'series';
    // Road winner (any margin) — most distinctive Game-1 outcome.
    // Outranks the home-court templates so DET stealing Game 1 over
    // CLE doesn't get tagged with "protect home court".
    if (story.isRoadWin && story.marginTier !== 'tight') {
      const verb = (story.marginTier === 'historic' || story.marginTier === 'blowout')
        ? 'blow out' : 'handle';
      return `🚨 ${w} land the first punch — ${w} ${verb} ${l} ${score} on the road and steal home-court control to open the ${r}.`;
    }
    if (story.marginTier === 'historic' || story.marginTier === 'blowout') {
      return `🚨 ${w} send a Game 1 statement — ${w} blow out ${l} ${score} and open the ${r} like a contender.`;
    }
    if (story.marginTier === 'double_digit') {
      return `🔥 ${w} send a Game 1 statement — ${w} control ${l} ${score} and protect home court to open the ${r}.`;
    }
    if (story.isUpset) {
      return `👀 ${w} land the first punch — ${w} upset ${l} ${score} and put immediate pressure on the favorite to start the ${r}.`;
    }
    if (story.isRoadWin) {
      return `🚨 ${w} steal Game 1 on the road — ${w} take ${l} ${score} and flip home-court control to open the ${r}.`;
    }
    return `🔥 ${w} take Game 1 over ${l} ${score} and grab the early series edge in the ${r}.`;
  }

  // 6c. GAME 2+ NON-CLINCHER, MARGIN-DRIVEN — leans on margin tier
  //     when we don't have a full series-state branch above.
  if (story.marginTier === 'historic' || story.marginTier === 'blowout') {
    const r = roundLabel || 'series';
    return `🔥 ${w} blow out ${l} ${score} in the ${r} — a statement win that swings momentum.`;
  }
  if (story.marginTier === 'double_digit') {
    const r = roundLabel || 'series';
    return `🔥 ${w} control ${l} ${score} in the ${r} — handles business and grabs the next game's edge.`;
  }
  if (story.marginTier === 'tight' && story.inSeries) {
    return `⚡ ${w} edge ${l} ${score}${tag} — every possession swung the series.`;
  }
  if (story.isRoadWin && story.inSeries) {
    return `🚨 ${w} steal one on the road from ${l} ${score}${tag} — flips home-court math.`;
  }

  // 6d. SAFE PLAYOFF FALLBACK — never returns the bare "Team beat
  //     Team SCORE." copy from the audit. Always anchors on round
  //     context if we have it.
  if (story.roundNumber || gameN) {
    const r = roundLabel || 'series';
    if (gameN && story.inSeries) {
      return `📊 ${w} take Game ${gameN} over ${l} ${score} in the ${r} — bracket pressure rises${tag}.`;
    }
    if (gameN) {
      return `📊 ${w} take Game ${gameN} over ${l} ${score} in the ${r} — playoff pressure builds.`;
    }
    return `📊 ${w} handle ${l} ${score} in the ${r} — playoff edge tightens around this matchup.`;
  }

  return null;
}

/** Map round number → human-readable label for narrative copy. */
function roundLabelFor(round) {
  if (round === 1) return 'first round';
  if (round === 2) return 'conference semis';
  if (round === 3) return 'conference finals';
  if (round === 4) return 'NBA Finals';
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
  // Build a quick lookup: series → most-recent-game narrative. Used to
  // enrich gameSevenText / closeoutText / etc. with OT/buzzer/comeback
  // context from the actual most recent finals.
  const finals = (liveGames || []).filter(g => g?.gameState?.isFinal || g?.status === 'final');
  function mostRecentNarrativeForSeries(s) {
    if (!s?.topTeam?.slug || !s?.bottomTeam?.slug) return null;
    const a = s.topTeam.slug, b = s.bottomTeam.slug;
    let best = null;
    let bestTs = 0;
    for (const g of finals) {
      const aw = g?.teams?.away?.slug, hm = g?.teams?.home?.slug;
      if (!((aw === a && hm === b) || (aw === b && hm === a))) continue;
      const ts = g?.startTime ? new Date(g.startTime).getTime() : 0;
      if (ts > bestTs) {
        bestTs = ts;
        best = g?.narrative || null;
      }
    }
    return best;
  }

  const seriesList = (playoffContext?.series || []).filter(s => !s.isStalePlaceholder);
  for (const s of seriesList) {
    const score = scoreSeriesEvent(s);
    if (score === 0) continue;
    // For completed series older than 48hr, suppress unless really fresh
    const isStale = s.isComplete && s.mostRecentGameTs &&
      (Date.now() - s.mostRecentGameTs) > CLINCHER_FRESHNESS_MS;
    if (isStale) continue;
    const recentNarr = mostRecentNarrativeForSeries(s);
    const bullet = bulletForSeries(s, score, recentNarr);
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
