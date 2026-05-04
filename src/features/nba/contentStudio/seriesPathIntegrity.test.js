/**
 * Locks the series-path integrity contract for 3-1 comeback narratives.
 *
 * Background: a previous heuristic inferred "3-1 comeback" from any 4-3
 * series final, which produced the false "Cavaliers complete the 3-1
 * comeback" line for a CLE/TOR series CLE actually went 2-0 → 2-2 →
 * 3-2 → 3-3 → 4-3 (never down 3-1).
 *
 * The fix: computeSeriesPath() in playoffContext.js replays games
 * chronologically and sets `seriesStates.winnerWasDown31` only when
 * the eventual winner truly trailed 1-3 at any point. Hero, HOTP,
 * Slide 2 headline, and caption all read this flag — never infer
 * comeback from final score.
 *
 * Test plan (audit Part 7):
 *   A. CLE/TOR — winner went 2-0 → 2-2 → 3-2 → 3-3 → 4-3 (no comeback)
 *   B. True 3-1 comeback (winner trailed 1-3 after Game 4)
 *   C. Tied 2-2 then winner takes 4-3 (no comeback)
 *   D. Winner led 3-2, lost G6, won G7 (no comeback)
 *   E. CLE sweep 4-0 (sweep narrative, never comeback)
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';
import { buildNbaDailyHeadline } from './buildNbaDailyHeadline.js';
import { buildNbaHotPress } from './buildNbaHotPress.js';

function mkFinal({ awaySlug, awayScore, homeSlug, homeScore, hoursAgo = 24 }) {
  const startTime = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  return {
    gameId: `${awaySlug}-${homeSlug}-${startTime}`,
    sport: 'nba',
    status: 'final',
    startTime,
    teams: {
      away: { slug: awaySlug, abbrev: awaySlug.toUpperCase(), score: awayScore, name: awaySlug },
      home: { slug: homeSlug, abbrev: homeSlug.toUpperCase(), score: homeScore, name: homeSlug },
    },
    gameState: { isFinal: true, isLive: false },
  };
}

describe('Test A — CLE/TOR exact path (no 3-1 comeback)', () => {
  // CLE wins G1, G2 (CLE 2-0), CLE wins G3 wait no — per audit spec:
  //   G1: CLE wins  → CLE 1-0
  //   G2: CLE wins  → CLE 2-0
  //   G3: TOR wins  → CLE 2-1
  //   G4: TOR wins  → tied 2-2
  //   G5: CLE wins  → CLE 3-2
  //   G6: TOR wins  → tied 3-3
  //   G7: CLE wins  → CLE 4-3
  // CLE never trailed 1-3, so isComebackFrom31 must stay false and
  // hero/HOTP must NOT mention "3-1 comeback".
  function buildCleTorPath() {
    return [
      mkFinal({ awaySlug: 'tor', awayScore: 113, homeSlug: 'cle', homeScore: 126, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 104, homeSlug: 'tor', homeScore: 126, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 89,  homeSlug: 'tor', homeScore: 93,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 120, homeSlug: 'cle', homeScore: 125, hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 112, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 114, hoursAgo: 8 }),
    ];
  }

  it('seriesPath verifies CLE was NEVER down 3-1', () => {
    const games = buildCleTorPath();
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series).toBeTruthy();
    expect(series.seriesStates.winnerSlug).toBe('cle');
    expect(series.seriesStates.winnerWasDown31).toBe(false);
    expect(series.seriesStates.winnerWasDown30).toBe(false);
    expect(series.seriesStates.winnerLed20).toBe(true);
    expect(series.seriesStates.winnerLed32).toBe(true);
    expect(series.seriesStates.clinchedInGame7).toBe(true);
    expect(series.seriesStates.finalSeriesScore).toEqual({ winner: 4, loser: 3 });
  });

  it('hero headline does NOT contain "3-1 comeback" for CLE/TOR', () => {
    const games = buildCleTorPath();
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext: ctx });
    expect(hl.heroTitle).not.toContain('3-1 COMEBACK');
    expect(hl.heroTitle).not.toContain('3-1 comeback');
    expect(hl.mainHeadline.toLowerCase()).not.toContain('3-1 comeback');
    expect(hl.topStory?.isComebackFrom31).toBe(false);
    // Hero MUST use Game 7 / survive / outlast / close-out language.
    expect(hl.heroTitle.toUpperCase()).toMatch(/GAME 7|SURVIVE|OUTLAST|CLOSE OUT|WIN GAME 7/);
  });

  it('HOTP lead bullet does NOT claim "3-1 comeback" for CLE/TOR', () => {
    const games = buildCleTorPath();
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    const lead = (bullets[0]?.text || '').toLowerCase();
    expect(lead).not.toMatch(/3-1 comeback|complete the 3-1/);
    // Must use survive / outlast / close-out language for a Game-7
    // clincher with no verified comeback.
    expect(lead).toMatch(/game 7|survive|outlast|close|finish|advance|sweep/);
  });
});

describe('Test B — true 3-1 comeback (winner trailed 1-3 after G4)', () => {
  // r1-east-1 is CLE vs TOR in the static bracket. Construct a path
  // where TOR wins 4-3 from down 1-3 — TOR is the eventual winner
  // and was at 1 win, CLE at 3, after Game 4.
  //   G1: CLE wins (CLE 1-0)
  //   G2: CLE wins (CLE 2-0)
  //   G3: TOR wins (CLE 2-1)
  //   G4: CLE wins (CLE 3-1, TOR down 3-1) ← THE comeback gate
  //   G5: TOR wins
  //   G6: TOR wins
  //   G7: TOR wins
  it('seriesPath verifies TOR was down 3-1 → flag fires', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 100, hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 95,  hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 109, homeSlug: 'cle', homeScore: 100, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.seriesStates.winnerSlug).toBe('tor');
    expect(series.seriesStates.winnerWasDown31).toBe(true);
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext: ctx });
    expect(hl.heroTitle).toContain('3-1 COMEBACK');
  });
});

describe('Test C — tied 2-2 then 4-3 (no 3-1 language)', () => {
  it('series went 2-0 / 2-2 / 3-2 / 3-3 / 4-3 → no comeback', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 90,  homeSlug: 'tor', homeScore: 95,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 102, hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 109, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.seriesStates.winnerSlug).toBe('cle');
    expect(series.seriesStates.winnerWasDown31).toBe(false);
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext: ctx });
    expect(hl.heroTitle.toLowerCase()).not.toContain('3-1 comeback');
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    expect((bullets[0]?.text || '').toLowerCase()).not.toMatch(/3-1 comeback/);
  });
});

describe('Test D — winner led 3-2, lost G6, won G7 (no 3-1 language)', () => {
  it('CLE 1-0 / 1-1 / 2-1 / 2-2 / 3-2 / 3-3 / 4-3 → no comeback', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 100, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 105, homeSlug: 'tor', homeScore: 95,  hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 90,  homeSlug: 'tor', homeScore: 95,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 102, hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 109, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.seriesStates.winnerSlug).toBe('cle');
    expect(series.seriesStates.winnerWasDown31).toBe(false);
    expect(series.seriesStates.winnerLed32).toBe(true);
  });
});

describe('Test E — sweep (4-0) is never a comeback', () => {
  it('CLE sweeps TOR 4-0 → winnerWasDown31 false, sweep beat fires', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 240 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 192 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 95,  hoursAgo: 144 }),
      mkFinal({ awaySlug: 'cle', awayScore: 120, homeSlug: 'tor', homeScore: 100, hoursAgo: 24 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.seriesStates.winnerWasDown31).toBe(false);
    expect(series.seriesStates.finalSeriesScore).toEqual({ winner: 4, loser: 0 });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    expect((bullets[0]?.text || '').toLowerCase()).not.toMatch(/3-1 comeback/);
  });
});
