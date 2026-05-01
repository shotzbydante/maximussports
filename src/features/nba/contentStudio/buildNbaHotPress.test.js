/**
 * HOTP scoring + narrative tests.
 *
 * Locks the audit Part 3 contract:
 *   - clincher outranks closeout
 *   - closeout outranks neutral
 *   - Game 7 outranks regular elimination
 *   - stale 0-0 placeholders never appear at any priority level
 *   - bullet text always includes series score + reason it matters
 */

import { describe, it, expect } from 'vitest';
import { scoreSeriesEvent, default as buildNbaHotPress } from './buildNbaHotPress.js';

function fakeSeries(overrides = {}) {
  return {
    matchupId: overrides.matchupId || 'r1-east-1',
    topTeam: { slug: 'lal', abbrev: 'LAL', name: 'Lakers' },
    bottomTeam: { slug: 'hou', abbrev: 'HOU', name: 'Rockets' },
    seriesScore: { top: 3, bottom: 2, summary: 'LAL lead 3-2' },
    gamesPlayed: 5,
    leader: 'top',
    isElimination: true,
    eliminationFor: 'bottom',
    isUpset: false,
    sweepThreat: false,
    isComplete: false,
    isClincher: false,
    isCloseoutGame: true,
    isGameSeven: false,
    isSwingGame: false,
    nextGame: { startTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString() },
    nextGameNumber: 6,
    mostRecentGame: { winnerSlug: 'lal', loserSlug: 'hou', winScore: 115, loseScore: 110, gameDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
    mostRecentGameTs: Date.now() - 24 * 3600 * 1000,
    isStalePlaceholder: false,
    winnerSlug: null,
    loserSlug: null,
    ...overrides,
  };
}

describe('scoreSeriesEvent (HOTP ranking)', () => {
  it('clincher outranks closeout', () => {
    const clincher = fakeSeries({
      isClincher: true,
      isComplete: true,
      isCloseoutGame: false,
      seriesScore: { top: 4, bottom: 2 },
      winnerSlug: 'lal',
      isUpset: true,
    });
    const closeout = fakeSeries({ isCloseoutGame: true });
    expect(scoreSeriesEvent(clincher)).toBeGreaterThan(scoreSeriesEvent(closeout));
  });

  it('Game 7 outranks regular elimination', () => {
    const g7 = fakeSeries({
      isGameSeven: true,
      isElimination: true,
      isCloseoutGame: false,
      seriesScore: { top: 3, bottom: 3 },
      gamesPlayed: 6,
      nextGameNumber: 7,
    });
    const elim = fakeSeries({
      isGameSeven: false,
      isElimination: true,
      isCloseoutGame: true,
      seriesScore: { top: 3, bottom: 1 },
      gamesPlayed: 4,
    });
    expect(scoreSeriesEvent(g7)).toBeGreaterThan(scoreSeriesEvent(elim));
  });

  it('stale placeholder scores 0', () => {
    const stale = fakeSeries({ isStalePlaceholder: true });
    expect(scoreSeriesEvent(stale)).toBe(0);
  });

  it('upset adds 75 to base score', () => {
    const upset = fakeSeries({ isUpset: true });
    const noUpset = fakeSeries({ isUpset: false });
    expect(scoreSeriesEvent(upset) - scoreSeriesEvent(noUpset)).toBe(75);
  });
});

describe('buildNbaHotPress narrative content', () => {
  it('clincher bullet uses ESPN/Vegas voice with series score + bracket-flip framing for upsets', () => {
    const playoffContext = {
      round: 'Round 1',
      series: [
        fakeSeries({
          isClincher: true,
          isComplete: true,
          isUpset: true,
          isCloseoutGame: false,
          isElimination: false,
          winnerSlug: 'lal',
          loserSlug: 'hou',
          conference: 'Western',
          seriesScore: { top: 4, bottom: 2 },
          gamesPlayed: 6,
          mostRecentGameTs: Date.now() - 6 * 3600 * 1000, // 6hr ago — fresh
        }),
      ],
      eliminationGames: [],
      upsetWatch: [],
      completedSeries: [],
    };
    const bullets = buildNbaHotPress({ liveGames: [], playoffContext });
    const text = bullets.find(b => b.source === 'clincher')?.text || '';
    expect(text).toMatch(/4–2/);
    expect(text).toMatch(/🚨/);
    // Either bracket-flip or upset/title-path market language
    expect(text).toMatch(/bracket flips|reshuffles|upset|title path/);
  });

  it('closeout bullet includes plain-English stake + Game N + score', () => {
    const playoffContext = {
      round: 'Round 1',
      series: [
        fakeSeries({
          isCloseoutGame: true,
          isElimination: true,
          seriesScore: { top: 3, bottom: 2 },
          gamesPlayed: 5,
          nextGameNumber: 6,
        }),
      ],
      eliminationGames: [],
      upsetWatch: [],
      completedSeries: [],
    };
    const bullets = buildNbaHotPress({ liveGames: [], playoffContext });
    const text = bullets.find(b => b.source === 'closeout')?.text || '';
    expect(text).toMatch(/3–2/);
    expect(text).toMatch(/Game 6/);
    // Audit Part 2: plain-English stake — refined to drop "closeout shot"
    // jargon in favor of "season is on the line tonight"
    expect(text).toMatch(/season is on the line/);
    expect(text).toMatch(/🔥/);
  });

  it('Game 7 bullet uses "decides the series" + title-path framing', () => {
    const playoffContext = {
      round: 'Round 1',
      series: [
        fakeSeries({
          isGameSeven: true,
          isElimination: true,
          isCloseoutGame: false,
          seriesScore: { top: 3, bottom: 3 },
          gamesPlayed: 6,
          nextGameNumber: 7,
        }),
      ],
      eliminationGames: [],
      upsetWatch: [],
      completedSeries: [],
    };
    const bullets = buildNbaHotPress({ liveGames: [], playoffContext });
    const text = bullets.find(b => b.source === 'game7')?.text || '';
    expect(text).toMatch(/Game 7/);
    expect(text).toMatch(/decides the series/);
    // Audit Part 2: refined wording uses "shakes the title path"
    expect(text).toMatch(/title path/);
    expect(text).toMatch(/⚔️/);
  });

  it('swing bullet calls out series control + pricing leverage', () => {
    const playoffContext = {
      round: 'Round 1',
      series: [
        fakeSeries({
          isSwingGame: true,
          isCloseoutGame: false,
          isElimination: false,
          seriesScore: { top: 1, bottom: 1 },
          gamesPlayed: 2,
          nextGameNumber: 3,
        }),
      ],
      eliminationGames: [],
      upsetWatch: [],
      completedSeries: [],
    };
    const bullets = buildNbaHotPress({ liveGames: [], playoffContext });
    const text = bullets.find(b => b.source === 'swing')?.text || '';
    expect(text).toMatch(/Game 3/);
    expect(text).toMatch(/1–1/);
    expect(text).toMatch(/series control/);
    expect(text).toMatch(/pricing leverage|market/);
  });

  it('does NOT emit a bullet for stale placeholder series', () => {
    const playoffContext = {
      round: 'Round 1',
      series: [
        fakeSeries({
          isStalePlaceholder: true,
          isCloseoutGame: false,
          seriesScore: { top: 0, bottom: 0 },
          gamesPlayed: 0,
        }),
      ],
      eliminationGames: [],
      upsetWatch: [],
      completedSeries: [],
    };
    const bullets = buildNbaHotPress({ liveGames: [], playoffContext });
    expect(bullets.length).toBe(0);
  });

  it('NEVER emits "series tied 0-0" when game 1 has not been played and no nextGame is scheduled', () => {
    const playoffContext = {
      round: 'Round 1',
      series: [
        fakeSeries({
          isStalePlaceholder: true,
          seriesScore: { top: 0, bottom: 0 },
          gamesPlayed: 0,
          nextGame: null,
        }),
      ],
      eliminationGames: [],
      upsetWatch: [],
      completedSeries: [],
    };
    const bullets = buildNbaHotPress({ liveGames: [], playoffContext });
    const matched = bullets.some(b => /tied 0-0/.test(b.text));
    expect(matched).toBe(false);
  });
});
