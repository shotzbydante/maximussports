/**
 * buildNbaDailyHeadline — Daily, result-driven hero headlines for NBA Daily
 * Briefing. PLAYOFF-AWARE.
 *
 * Priority hierarchy (strictly enforced):
 *   1. Yesterday's playoff results with series implications (3-1 leads,
 *      elimination wins, sweeps, Game 7s, upsets)
 *   2. Playoff storylines derived from playoffContext (series scores,
 *      elimination games today, upset watch)
 *   3. Contender framing (only when backed by playoff results)
 *   4. Regular-season framing is EXPLICITLY AVOIDED — if no playoff
 *      signal exists and games are not playoff games, the builder still
 *      frames in playoff tone ("the road to the title continues")
 *
 * Returns: { heroTitle, mainHeadline, subhead, topStory, secondStory }
 *   heroTitle    → Slide 1 hero text (all-caps, 2 clauses, ≤ 75 chars ideal)
 *   mainHeadline → Slide 2 header (mixed case, ~70 chars)
 *   subhead      → Slide 2 subhead (1 sentence, ≤ 110 chars)
 *   topStory/secondStory → attached to result/signal for downstream use
 *
 * NO generic regular-season language. NO "strong offense leads the way".
 * Every sentence MUST reference a team + result or a concrete series state.
 */

import { NBA_TEAMS } from '../../../sports/nba/teams.js';
import { findSeriesForGame } from '../../../data/nba/playoffContext.js';

// ── Team metadata ─────────────────────────────────────────────────────────

const TEAM_META = Object.fromEntries(
  NBA_TEAMS.map(t => [t.slug, {
    name: t.name.split(' ').pop() === 'Blazers' ? 'Trail Blazers' : t.name.split(' ').pop(),
    full: t.name,
    abbrev: t.abbrev,
    conference: t.conference,
    division: t.division,
  }])
);

// Multi-word mascots must stay whole
function resolveNickname(fullName) {
  if (!fullName) return '???';
  if (/Trail Blazers$/i.test(fullName)) return 'Trail Blazers';
  return fullName.split(' ').pop();
}
for (const t of NBA_TEAMS) TEAM_META[t.slug].name = resolveNickname(t.name);

function teamName(slug) { return TEAM_META[slug]?.name || slug || '???'; }
function teamAbbrev(slug) { return TEAM_META[slug]?.abbrev || slug?.toUpperCase() || '???'; }

function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

// ── Extract stories from completed playoff games ──────────────────────────
//
// Every story is anchored to a SERIES when possible. Series membership is
// determined by playoffContext, not by guessing from opponent slugs.

/**
 * Round-aware game-number derivation. When the bracket has no series
 * for this matchup (Round 2+ slots are placeholders in the static
 * bracket), we count head-to-head games chronologically among the
 * available finals to recover the Game N label. This is what gives
 * non-clincher Round-2 bullets ("Game 1 statement win", "Game 3 swing")
 * even when findSeriesForGame() returns null.
 */
function deriveHeadToHeadGameNumber(targetGame, finals) {
  if (!targetGame) return null;
  const aSlug = targetGame.teams?.away?.slug;
  const hSlug = targetGame.teams?.home?.slug;
  if (!aSlug || !hSlug) return null;
  // Order ALL finals between these two teams chronologically — the
  // target's index + 1 is its Game N within the series. Includes the
  // target so we can find it.
  const h2h = finals
    .filter(g => {
      const a = g?.teams?.away?.slug;
      const h = g?.teams?.home?.slug;
      return (a === aSlug && h === hSlug) || (a === hSlug && h === aSlug);
    })
    .sort((x, y) => new Date(x.startTime || 0) - new Date(y.startTime || 0));
  const idx = h2h.findIndex(g => g.gameId === targetGame.gameId);
  return idx >= 0 ? idx + 1 : null;
}

function extractGameStories(liveGames, playoffContext) {
  if (!Array.isArray(liveGames) || liveGames.length === 0) return [];

  const finals = liveGames.filter(g =>
    g?.gameState?.isFinal || g?.status === 'final'
  );
  if (finals.length === 0) return [];

  const stories = [];

  for (const g of finals) {
    const away = g.teams?.away || {};
    const home = g.teams?.home || {};
    const awayScore = Number(away.score ?? 0);
    const homeScore = Number(home.score ?? 0);
    if (awayScore === 0 && homeScore === 0) continue;

    const winner = awayScore > homeScore ? away : home;
    const loser  = awayScore > homeScore ? home : away;
    const winSlug = winner.slug;
    const loseSlug = loser.slug;
    if (!winSlug) continue;

    const winScore = Math.max(awayScore, homeScore);
    const loseScore = Math.min(awayScore, homeScore);
    const margin = winScore - loseScore;

    // Series context — anchor to playoff series if one matches.
    const match = findSeriesForGame(g, playoffContext);
    const series = match?.series || null;

    // Determine post-game state for the series (the series object in the
    // context already reflects all finals to date — so `series.seriesScore`
    // is the CURRENT state, not the state before this specific game).
    const inSeries = !!series;
    const winSeriesWins = inSeries
      ? (series.topTeam?.slug === winSlug ? series.seriesScore.top : series.seriesScore.bottom)
      : 0;
    const loseSeriesWins = inSeries
      ? (series.topTeam?.slug === loseSlug ? series.seriesScore.top : series.seriesScore.bottom)
      : 0;
    const isClinch = inSeries && winSeriesWins >= 4;
    const isComeback = inSeries && series.gamesPlayed >= 4 && loseSeriesWins > winSeriesWins;

    // Per-game upset = winner of THIS game is the lower seed (higher seed
    // number). Distinct from `series.isUpset` which is a series-state flag.
    let isUpset = false;
    if (inSeries) {
      const winIsTop = series.topTeam?.slug === winSlug;
      const winSeed = winIsTop ? series.topTeam?.seed : series.bottomTeam?.seed;
      const loseSeed = winIsTop ? series.bottomTeam?.seed : series.topTeam?.seed;
      if (winSeed != null && loseSeed != null && winSeed > loseSeed) {
        isUpset = true;
      }
    }

    const isElimWin = inSeries && winSeriesWins === 3 && loseSeriesWins < 3; // win that puts opponent on brink
    const isGame7Win = inSeries && winSeriesWins === 4 && loseSeriesWins === 3;
    const isSweep = inSeries && winSeriesWins === 4 && loseSeriesWins === 0;
    const isStolenRoadWin = inSeries && g.teams?.away?.slug === winSlug;

    let type = 'result';
    if (isSweep) type = 'sweep';
    else if (isGame7Win) type = 'game7';
    else if (isClinch) type = 'clinch';
    else if (isElimWin) type = 'brinkWin';
    else if (loseScore === 0 || margin >= 20) type = 'blowout';
    else if (margin <= 3) type = 'close';

    // Carry the narrative payload + which side won so the HOTP layer
    // can detect overtime / comebacks / buzzer-beaters from real game
    // data (see buildNbaGameNarrative).
    const winSide = awayScore > homeScore ? 'away' : 'home';
    const narrative = g.narrative || null;

    // 3-1 COMEBACK — PATH-VERIFIED ONLY. Reads `series.seriesStates`
    // populated by computeSeriesPath() in playoffContext.js. The flag
    // is true iff the eventual winner ACTUALLY trailed 1-3 (i.e. at
    // some point after Game 4, winner had 1 win and opponent had 3).
    // Final-score inference is no longer accepted — that's the bug
    // that produced the false "Cavaliers complete the 3-1 comeback"
    // narrative when CLE actually went 2-0 → 2-2 → 3-2 → 3-3 → 4-3
    // (never down 3-1). Integrity > hype.
    const seriesStates = inSeries ? (series?.seriesStates || {}) : {};
    const winnerWasDown31 = inSeries
      && !!seriesStates.winnerWasDown31
      && seriesStates.winnerSlug === winSlug;
    const winnerWasDown30 = inSeries
      && !!seriesStates.winnerWasDown30
      && seriesStates.winnerSlug === winSlug;
    const isComebackFrom31 = winnerWasDown31 && isClinch;
    // Game-7 survival — clincher in Game 7 by a winner that was NOT
    // down 3-1. Drives "survive / outlast / close out" copy instead
    // of generic "X eliminate Y 4-3".
    const wentGame7 = inSeries && !!seriesStates.wentGame7;
    const clinchedInGame7 = inSeries
      && !!seriesStates.clinchedInGame7
      && seriesStates.winnerSlug === winSlug;
    const game7Survival = clinchedInGame7 && !winnerWasDown31;
    // Series-extender flags (the trailing team wins to keep the
    // series alive). Unchanged from before — these are post-game
    // facts, not series-history claims.
    const forcesGame7 = inSeries && winSeriesWins === 3 && loseSeriesWins === 3;
    const eliminationAvoided = inSeries && !isClinch && !isGame7Win
      && (winSeriesWins + loseSeriesWins) >= 4
      && winSeriesWins <= loseSeriesWins;
    const closeoutFailed = inSeries && eliminationAvoided && loseSeriesWins === 3;

    // Round-aware game number — falls back to head-to-head count when
    // the bracket has no series (Round 2+ slots are placeholders in
    // the static bracket, so findSeriesForGame returns null for early
    // R2 games like OKC vs LAL). This is what lets the HOTP narrative
    // builder say "Game 1" / "Game 3" with confidence even outside
    // the bracket-anchored series.
    const h2hGameNumber = inSeries
      ? (winSeriesWins + loseSeriesWins)
      : deriveHeadToHeadGameNumber(g, finals);
    // Round label — accurate when the matched series isn't a
    // misleading placeholder fill. When BOTH teams have a completed
    // R1 series elsewhere (i.e. they're R1 winners now playing each
    // other), this game is a R2+ matchup regardless of what
    // findSeriesForGame returned. The static bracket has placeholder
    // R2 slots so its round labeling can't be trusted for R2 G1s.
    let roundNumber = series?.round || playoffContext?.roundNumber || playoffContext?.round || null;
    {
      const completedR1ForWinner = (playoffContext?.allSeries || []).some(s =>
        s.round === 1 && s.isComplete && s.seriesStates?.winnerSlug === winSlug
      );
      const completedR1ForLoser = (playoffContext?.allSeries || []).some(s =>
        s.round === 1 && s.isComplete && s.seriesStates?.winnerSlug === loseSlug
      );
      if (completedR1ForWinner && completedR1ForLoser) {
        // Both teams won R1 separately; this game is at least R2.
        roundNumber = Math.max(roundNumber || 2, 2);
      }
    }
    // Margin tier — used by the HOTP narrative templates to pick
    // between blowout / control / tight-game framing.
    const marginTier = margin >= 25 ? 'historic'
      : margin >= 15 ? 'blowout'
      : margin >= 10 ? 'double_digit'
      : margin <= 3 ? 'tight'
      : 'standard';
    // Road-game flag (always derivable from the game data, even
    // without series context).
    const isRoadWin = g.teams?.away?.slug === winSlug;

    const story = {
      type,
      winSlug, loseSlug, winSide,
      winScore, loseScore, margin,
      inSeries, series,
      winSeriesWins, loseSeriesWins,
      isClinch, isComeback, isUpset, isElimWin, isGame7Win, isSweep, isStolenRoadWin,
      // Path-verified narrative beats — the hero/HOTP layers must use
      // these flags directly. Never re-infer comeback from the final
      // series score; that's the bug we just fixed.
      isComebackFrom31,
      winnerWasDown31,
      winnerWasDown30,
      game7Survival,
      clinchedInGame7,
      wentGame7,
      forcesGame7,
      eliminationAvoided,
      closeoutFailed,
      // Non-clincher narrative inputs (HOTP-rich-fallback support).
      // These are SAFE — derived from the game/playoffContext, never
      // from inference. The HOTP narrative builder uses them to emit
      // "Game 1 statement" / "first punch" / "series-edge" copy when
      // no clincher / OT / buzzer flag fires.
      h2hGameNumber,
      roundNumber,
      marginTier,
      isRoadWin,
      gameId: g.gameId,
      gameDate: g.startTime || null,
      narrative,
    };

    // [NBA_COMEBACK_BEAT_AUDIT] — integrity log so a false "3-1
    // comeback" claim is visible from the console alone. Emitted for
    // every clincher; shows the series-after-game-4 split that gates
    // the comeback flag.
    if (isClinch) {
      const game4 = series?.seriesPath?.[3] || null;
      const seriesAfter4 = game4
        ? `${winSlug} ${game4.seriesAfter?.[winSlug] ?? 0}, ${loseSlug} ${game4.seriesAfter?.[loseSlug] ?? 0}`
        : 'series < 4 games';
      console.log('[NBA_COMEBACK_BEAT_AUDIT]', JSON.stringify({
        matchup: `${winSlug.toUpperCase()}-${loseSlug.toUpperCase()}`,
        winner: winSlug, loser: loseSlug,
        finalSeries: `${winSeriesWins}-${loseSeriesWins}`,
        seriesAfterGame4: seriesAfter4,
        winnerWasDown31,
        winnerWasDown30,
        wentGame7,
        clinchedInGame7,
        selectedBeat: winnerWasDown31
          ? 'comeback_from_3_1'
          : (game7Survival ? 'game7_survival' : 'standard_clincher'),
      }));
    }
    story.priority = storyPriority(story);
    // Boost narrative priority for dramatic games (OT / comeback /
    // buzzer-beater) so they outrank generic "team wins" stories.
    if (narrative?.isOvertime) story.priority += 25;
    if (narrative?.notesText && /buzzer|game[-\s]*winn|last[-\s]*second/.test(narrative.notesText)) story.priority += 30;
    stories.push(story);
  }

  stories.sort((a, b) => b.priority - a.priority);
  return stories;
}

function storyPriority(s) {
  // Comeback-from-3-1 + Game-7 wins outrank a routine clincher because
  // they're the rarer, more dramatic narrative beats.
  if (s.isComebackFrom31) return 110;
  if (s.isGame7Win) return 100;
  if (s.closeoutFailed) return 97;
  if (s.isClinch) return 95;
  if (s.isSweep) return 90;
  if (s.forcesGame7) return 89;
  if (s.isUpset && s.isElimWin) return 88;
  if (s.isElimWin) return 80;
  if (s.isUpset) return 75;
  if (s.eliminationAvoided) return 70;
  if (s.isStolenRoadWin && s.inSeries) return 65;
  if (s.type === 'close' && s.inSeries) return 60;
  if (s.type === 'blowout' && s.inSeries) return 55;
  if (s.inSeries) return 45;
  return 20;
}

function findSecondStory(stories, top) {
  if (stories.length < 2) return null;
  for (const s of stories.slice(1)) {
    if (s.series?.matchupId !== top.series?.matchupId) return s;
  }
  return stories[1];
}

// ── Series descriptor fragments ───────────────────────────────────────────

function seriesTag(story) {
  if (!story.inSeries || !story.series) return '';
  if (story.isSweep) return ' — SWEEP';
  if (story.isGame7Win) return ' IN GAME 7';
  if (story.isClinch) return ` — SERIES WIN ${story.winSeriesWins}-${story.loseSeriesWins}`;
  if (story.isElimWin) return ` — LEAD SERIES ${story.winSeriesWins}-${story.loseSeriesWins}`;
  // General series state
  if (story.winSeriesWins > story.loseSeriesWins) {
    return ` — LEAD SERIES ${story.winSeriesWins}-${story.loseSeriesWins}`;
  }
  if (story.winSeriesWins < story.loseSeriesWins) {
    return ` — TRAIL SERIES ${story.winSeriesWins}-${story.loseSeriesWins}`;
  }
  return ` — SERIES TIED ${story.winSeriesWins}-${story.loseSeriesWins}`;
}

function seriesTagLower(story) {
  if (!story.inSeries || !story.series) return '';
  if (story.isSweep) return ' with a series sweep';
  if (story.isGame7Win) return ' in Game 7';
  if (story.isClinch) return `, advancing ${story.winSeriesWins}-${story.loseSeriesWins}`;
  if (story.isElimWin) return `, taking a ${story.winSeriesWins}-${story.loseSeriesWins} series lead`;
  if (story.winSeriesWins > story.loseSeriesWins) {
    return `, leading the series ${story.winSeriesWins}-${story.loseSeriesWins}`;
  }
  if (story.winSeriesWins < story.loseSeriesWins) {
    return `, cutting the deficit to ${story.loseSeriesWins}-${story.winSeriesWins}`;
  }
  return `, evening the series ${story.winSeriesWins}-${story.loseSeriesWins}`;
}

function roadStealTag(story) {
  return story.isStolenRoadWin && story.inSeries && story.winSeriesWins === 1 && story.loseSeriesWins === 0
    ? ' ON THE ROAD' : '';
}

// ═══════════════════════════════════════════════════════════════════════
//  HERO TITLE — playoff-first, result-driven
// ═══════════════════════════════════════════════════════════════════════

function heroForStory(top, second, doy) {
  const w = teamName(top.winSlug).toUpperCase();
  const l = teamName(top.loseSlug).toUpperCase();
  const score = `${top.winScore}-${top.loseScore}`;
  const tag = seriesTag(top);

  // Detect dramatic narrative signals — never fabricated, always read
  // off the game data. Used to layer "in OT" / "on a buzzer-beater" /
  // "after a 22-pt comeback" suffixes onto the hero copy.
  const narr = top.narrative || {};
  const ot = !!narr.isOvertime;
  const notes = String(narr.notesText || '').toLowerCase();
  const buzzer = /buzzer[-\s]*beater|game[-\s]*winn|last[-\s]*second|walk[-\s]*off|ot three|overtime three/.test(notes);
  // Per-quarter linescore comeback margin (winner side perspective).
  let comebackDef = 0;
  const winLine = top.winSide === 'home' ? narr.homeLine : top.winSide === 'away' ? narr.awayLine : null;
  const losLine = top.winSide === 'home' ? narr.awayLine : top.winSide === 'away' ? narr.homeLine : null;
  if (Array.isArray(winLine) && Array.isArray(losLine)) {
    let cumW = 0, cumL = 0;
    for (let i = 0; i < Math.min(winLine.length, losLine.length); i++) {
      cumW += winLine[i] || 0;
      cumL += losLine[i] || 0;
      if (i === winLine.length - 1) break;
      const def = cumL - cumW;
      if (def > comebackDef) comebackDef = def;
    }
  }

  // 3-1 SERIES COMEBACK — rarest playoff narrative beat. Outranks any
  // other clincher template because "complete the 3-1 comeback" is the
  // line that defines a postseason for years.
  if (top.isComebackFrom31) {
    return `${w} COMPLETE 3-1 COMEBACK TO STUN ${l} AND ADVANCE.`;
  }
  // GAME 7 WIN — clinch by Game 7. Layer in OT/buzzer if the data says
  // so. When the winner was NOT down 3-1 (path-verified via
  // game7Survival), prefer "survive / outlast" copy over the more
  // dramatic "stun" framing.
  if (top.isGame7Win) {
    if (ot && buzzer)  return `${w} SURVIVE ${l} IN GAME 7 OT — LAST-SECOND SHOT BOOKS NEXT ROUND.`;
    if (ot)            return `${w} OUTLAST ${l} IN GAME 7 OT, ADVANCE TO NEXT ROUND.`;
    if (buzzer)        return `${w} WIN GAME 7 ${score} ON A LAST-SECOND SHOT, ADVANCE.`;
    if (comebackDef >= 15) return `${w} ERASE ${comebackDef}-PT GAME 7 DEFICIT TO STUN ${l} AND ADVANCE.`;
    if (top.game7Survival) return `${w} SURVIVE ${l} IN GAME 7 — OUTLAST ${l} ${score} TO ADVANCE.`;
    return `${w} WIN GAME 7 OVER ${l}, ADVANCE TO NEXT ROUND.`;
  }
  if (top.isSweep) {
    return `${w} COMPLETE SWEEP OVER ${l} — ${tag.replace(/^ — /, '')}`;
  }
  if (top.isClinch) {
    if (ot && buzzer)  return `${w} CLOSE OUT ${l} IN OT — LAST-SECOND SHOT ENDS THE SERIES.`;
    if (ot)            return `${w} ELIMINATE ${l} IN OT${tag}. NEXT ROUND AWAITS.`;
    if (buzzer)        return `${w} ELIMINATE ${l} ON A LAST-SECOND SHOT${tag}.`;
    if (comebackDef >= 20) return `${w} ERASE ${comebackDef}-PT DEFICIT TO ELIMINATE ${l}${tag}.`;
    return `${w} CLOSE OUT ${l}${tag}. NEXT ROUND AWAITS.`;
  }
  // CLOSEOUT FAILED / FORCES GAME 7 / ELIMINATION AVOIDED — series-extender
  // narratives. Title "force Game 7" or "stay alive" instead of generic
  // "win" copy.
  if (top.forcesGame7) {
    if (ot && buzzer)  return `${w} FORCE GAME 7 ON A LAST-SECOND OT SHOT, SERIES TIED 3-3.`;
    if (ot)            return `${w} OUTLAST ${l} IN OT TO FORCE GAME 7. SEASON ON ONE TIP.`;
    if (buzzer)        return `${w} FORCE GAME 7 ON A LAST-SECOND SHOT — SERIES GOES THE DISTANCE.`;
    if (comebackDef >= 15) return `${w} RALLY FROM ${comebackDef} DOWN TO FORCE GAME 7 OVER ${l}.`;
    return `${w} FORCE GAME 7 OVER ${l}, SERIES GOES THE DISTANCE.`;
  }
  if (top.closeoutFailed) {
    return `${w} STAY ALIVE — BEAT ${l} ${score} TO PUSH SERIES TO GAME ${top.winSeriesWins + top.loseSeriesWins + 1}.`;
  }
  if (top.eliminationAvoided) {
    return `${w} AVOID ELIMINATION ${score} OVER ${l}${tag}. SEASON LIVES.`;
  }
  if (top.isUpset && top.isElimWin) {
    return `${w} STUN ${l} ${score}${tag} — UPSET ONE WIN AWAY.`;
  }
  if (top.isElimWin) {
    return `${w} PUSH ${l} TO THE BRINK ${score}${tag}. ONE WIN AWAY FROM CLOSING IT.`;
  }
  if (top.isUpset) {
    if (ot && buzzer)  return `${w} STEAL ${l} ${score} IN OT ON A LAST-SECOND SHOT — UPSET WATCH.`;
    if (ot)            return `${w} STEAL ${score} FROM ${l} IN OT${tag}.`;
    return `${w} UPSET ${l} ${score}${tag}.`;
  }
  if (comebackDef >= 25) {
    return `${w} CAP HISTORIC ${comebackDef}-PT COMEBACK OVER ${l} ${score}${tag}.`;
  }
  if (comebackDef >= 20) {
    return `${w} ERASE ${comebackDef}-PT DEFICIT TO BEAT ${l} ${score}${tag}.`;
  }
  if (top.isStolenRoadWin && top.winSeriesWins >= top.loseSeriesWins) {
    return second
      ? `${w} STEAL GAME ${top.winSeriesWins + top.loseSeriesWins}${roadStealTag(top)}${tag}. ${teamName(second.winSlug).toUpperCase()} ALSO WIN.`
      : `${w} STEAL GAME ${top.winSeriesWins + top.loseSeriesWins}${roadStealTag(top)} OVER ${l}${tag}.`;
  }

  const templates = [
    () => second
      ? `${w} WIN ${score}${tag}. ${teamName(second.winSlug).toUpperCase()} ALSO DELIVER.`
      : `${w} TOP ${l} ${score}${tag}.`,
    () => `${w} HANDLE ${l} ${score}${tag}. PLAYOFF RACE CONTINUES.`,
  ];
  return templates[doy % templates.length]();
}

// ═══════════════════════════════════════════════════════════════════════
//  SLIDE 2 HEADLINE — mixed case
// ═══════════════════════════════════════════════════════════════════════

function slide2ForStory(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const tag = seriesTagLower(top);

  if (top.isComebackFrom31) {
    return `${w} complete the 3-1 comeback to stun ${l} and advance`;
  }
  if (top.isGame7Win) {
    if (top.game7Survival) return `${w} survive ${l} in Game 7 — outlast ${l} ${score} to advance`;
    return `${w} win Game 7 over ${l} ${score} and advance`;
  }
  if (top.isSweep) {
    return `${w} sweep ${l}${tag}`;
  }
  if (top.isClinch) {
    return `${w} eliminate ${l} ${score}${tag}`;
  }
  if (top.forcesGame7) {
    return `${w} force Game 7 over ${l} — series goes the distance`;
  }
  if (top.closeoutFailed) {
    return `${w} stay alive ${score} over ${l} — pushes series to Game ${top.winSeriesWins + top.loseSeriesWins + 1}`;
  }
  if (top.eliminationAvoided) {
    return `${w} avoid elimination ${score} over ${l}${tag}`;
  }
  if (top.isUpset && top.isElimWin) {
    return `${w} stun ${l} ${score}${tag} — one win from the upset`;
  }
  if (top.isElimWin) {
    return `${w} push ${l} to the brink ${score}${tag} — one win from closing out`;
  }
  if (top.isUpset) {
    return `${w} pull the upset over ${l} ${score}${tag}`;
  }
  if (second) {
    return `${w} top ${l} ${score}${tag} while ${teamName(second.winSlug)} also deliver`;
  }
  return `${w} take down ${l} ${score}${tag}`;
}

function subheadForStory(top, second) {
  const w = teamName(top.winSlug);
  const l = teamName(top.loseSlug);
  const score = `${top.winScore}-${top.loseScore}`;
  const tag = seriesTagLower(top);

  if (top.isComebackFrom31) {
    return `${w} erase a 3-1 series hole — knock out ${l} ${score} in Game 7 and rewrite the bracket.`;
  }
  if (top.game7Survival) {
    return `${w} survive ${l} ${score} in Game 7 — series ends 4-3 and the ${w}'s path to the next round stays alive.`;
  }
  if (top.isClinch || top.isGame7Win) {
    return `${w} finish the job — ${score} over ${l} to punch their ticket to the next round.`;
  }
  if (top.forcesGame7) {
    return `${w} stay alive ${score} over ${l} — series tied 3-3, Game 7 decides everything.`;
  }
  if (top.closeoutFailed) {
    return `${w} stave off elimination ${score} over ${l} — series extends to Game ${top.winSeriesWins + top.loseSeriesWins + 1}.`;
  }
  if (top.eliminationAvoided) {
    return `${w} avoid elimination with a ${score} win${tag} — season lives another night.`;
  }
  if (top.isElimWin) {
    return `${w} put ${l} on the brink with a ${score} win${tag}.`;
  }
  if (top.isUpset) {
    return `${w} flip the series tone with a ${score} win${tag}, rewriting expectations.`;
  }
  if (second) {
    const s2w = teamName(second.winSlug);
    const s2l = teamName(second.loseSlug);
    const s2score = `${second.winScore}-${second.loseScore}`;
    return `${w} win ${score} over ${l}${tag} while ${s2w} also handle ${s2l} ${s2score}${seriesTagLower(second)}.`;
  }
  return `${w} win ${score} over ${l}${tag}.`;
}

// ═══════════════════════════════════════════════════════════════════════
//  PLAYOFF-ONLY FALLBACK (no finals yet today, but we're in the playoffs)
// ═══════════════════════════════════════════════════════════════════════

function playoffFallbackHero(playoffContext, doy) {
  const elim = playoffContext?.eliminationGames?.[0];
  const upset = playoffContext?.upsetWatch?.[0];
  const activeRound = playoffContext?.round || 'Round 1';
  const seriesList = playoffContext?.series || [];

  // Detect pivot games (Game 2 or Game 3 in Round 1)
  const pivotSeries = seriesList.find(s => {
    const played = s.gamesPlayed || 0;
    return (played === 1 || played === 2) && !s.isElimination;
  });

  // Detect "underdogs steal home court" — lower seed leads on the road
  // (lower seed = higher seed-number; road win = away team won game 1)
  const roadSteal = seriesList.find(s => {
    if (!s.isUpset) return false;
    if ((s.gamesPlayed || 0) !== 1) return false;
    return true;
  });

  if (elim) {
    const trailer = elim.eliminationFor === 'top' ? elim.topTeam : elim.bottomTeam;
    const leader  = elim.eliminationFor === 'top' ? elim.bottomTeam : elim.topTeam;
    if (trailer && leader) {
      return `${leader.abbrev} TRY TO CLOSE OUT ${trailer.abbrev}. ${elim.eliminationLabel?.toUpperCase() || 'ELIMINATION NIGHT'}.`;
    }
  }
  if (roadSteal) {
    const leader = roadSteal.leader === 'top' ? roadSteal.topTeam : roadSteal.bottomTeam;
    const trailer = roadSteal.leader === 'top' ? roadSteal.bottomTeam : roadSteal.topTeam;
    if (leader && trailer) {
      return `UNDERDOGS STEAL HOME COURT EARLY — ${leader.abbrev} (${leader.seed}) LEAD ${trailer.abbrev} (${trailer.seed}).`;
    }
  }
  if (upset) {
    const leader = upset.leader === 'top' ? upset.topTeam : upset.bottomTeam;
    const trailer = upset.leader === 'top' ? upset.bottomTeam : upset.topTeam;
    if (leader && trailer) {
      return `${leader.abbrev} (${leader.seed}) LEAD ${trailer.abbrev} (${trailer.seed}). UPSET WATCH.`;
    }
  }
  if (pivotSeries) {
    const gameNumber = (pivotSeries.gamesPlayed || 0) + 1;
    return `GAME ${gameNumber} SWINGS MOMENTUM ACROSS THE BRACKET.`;
  }

  // Last-resort templates — still concrete enough to feel playoff-tuned.
  const templates = [
    () => `${activeRound.toUpperCase()} ROLLS ON. SERIES PRESSURE BUILDS.`,
    () => `${activeRound.toUpperCase()} SERIES TAKE SHAPE. EVERY GAME MATTERS.`,
    () => `${activeRound.toUpperCase()} SHIFTS GEARS — ROAD TO THE TITLE TIGHTENS.`,
  ];
  return templates[doy % templates.length]();
}

function playoffFallbackSlide2(playoffContext) {
  const elim = playoffContext?.eliminationGames?.[0];
  if (elim) {
    const leader = elim.eliminationFor === 'top' ? elim.bottomTeam : elim.topTeam;
    const trailer = elim.eliminationFor === 'top' ? elim.topTeam : elim.bottomTeam;
    if (leader && trailer) {
      return `${leader.name || leader.abbrev} try to close out ${trailer.name || trailer.abbrev} — ${elim.seriesScore.summary}`;
    }
  }
  const upset = playoffContext?.upsetWatch?.[0];
  if (upset) {
    const leader = upset.leader === 'top' ? upset.topTeam : upset.bottomTeam;
    const trailer = upset.leader === 'top' ? upset.bottomTeam : upset.topTeam;
    if (leader && trailer) {
      return `${leader.name || leader.abbrev} flip the script on ${trailer.name || trailer.abbrev} — ${upset.seriesScore.summary}`;
    }
  }
  // Pivot-game framing
  const pivot = (playoffContext?.series || []).find(s => {
    const p = s.gamesPlayed || 0;
    return (p === 1 || p === 2) && !s.isElimination;
  });
  if (pivot) {
    const gameNum = (pivot.gamesPlayed || 0) + 1;
    return `Game ${gameNum} swings momentum across the bracket`;
  }
  return `${playoffContext?.round || 'Round 1'} series continue across the bracket`;
}

function playoffFallbackSubhead(playoffContext) {
  const elim = playoffContext?.eliminationGames?.[0];
  if (elim) {
    return `${elim.eliminationLabel || 'Elimination game'} on the board — ${elim.seriesScore.summary}. Every possession carries the series.`;
  }
  const upset = playoffContext?.upsetWatch?.[0];
  if (upset) {
    return `${upset.upsetLabel} — ${upset.seriesScore.summary}. The bracket is already rewriting itself.`;
  }
  const n = playoffContext?.series?.length || 0;
  if (n >= 2) {
    return `${n} ${playoffContext?.round || 'playoff'} series in motion — tonight's results reshape the bracket.`;
  }
  return 'The road to the title continues — every series shifts with tonight\'s tip.';
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

export function buildNbaDailyHeadline({ liveGames = [], playoffContext = null } = {}) {
  const doy = dayOfYear();
  const stories = extractGameStories(liveGames, playoffContext);

  const topStory = stories[0] || null;
  const secondStory = topStory ? findSecondStory(stories, topStory) : null;

  let heroTitle = '';
  let mainHeadline = '';
  let subhead = '';

  if (topStory) {
    heroTitle = heroForStory(topStory, secondStory, doy);
    mainHeadline = slide2ForStory(topStory, secondStory);
    subhead = subheadForStory(topStory, secondStory);
  } else {
    heroTitle = playoffFallbackHero(playoffContext, doy);
    mainHeadline = playoffFallbackSlide2(playoffContext);
    subhead = playoffFallbackSubhead(playoffContext);
  }

  heroTitle = heroTitle.toUpperCase();
  if (heroTitle.length > 90) {
    const period = heroTitle.lastIndexOf('.', 85);
    if (period > 30) heroTitle = heroTitle.slice(0, period + 1);
  }

  return { heroTitle, mainHeadline, subhead, topStory, secondStory };
}

export default buildNbaDailyHeadline;

// Exported for buildNbaHotPress + tests
export { extractGameStories, findSecondStory, teamName, teamAbbrev, seriesTagLower, deriveHeadToHeadGameNumber };
