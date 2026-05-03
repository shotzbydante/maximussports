/**
 * seriesContextForPick — UI clarity for repeat playoff matchups.
 *
 * Locks the contract: every scorecard row carries enough context that
 * repeat playoff games (HOU/LAL Game 5 vs Game 6) are unambiguous.
 *
 * The derivation tolerates missing inputs gracefully — when no playoff
 * series is tracked for a matchup, the row falls back to date-only
 * context, never invents a game number.
 */

import { describe, it, expect } from 'vitest';
import { seriesContextForPick } from './seriesContextForPick.js';

function mkSeries({
  round = 1, conference = 'Western',
  topSlug = 'lal', bottomSlug = 'hou',
  topWins = 3, bottomWins = 2,
  isElimination = false, isGameSeven = false,
  mostRecentGameTs = null,
  games = null,
}) {
  return {
    matchupId: `${conference}-r${round}-${topSlug}-${bottomSlug}`,
    round, conference,
    topTeam: { slug: topSlug, abbrev: topSlug.toUpperCase() },
    bottomTeam: { slug: bottomSlug, abbrev: bottomSlug.toUpperCase() },
    seriesScore: { top: topWins, bottom: bottomWins, summary: `${topSlug.toUpperCase()} lead ${topWins}-${bottomWins}` },
    gamesPlayed: topWins + bottomWins,
    isElimination, isGameSeven,
    mostRecentGameTs,
    games,
  };
}

describe('seriesContextForPick — date label fallback', () => {
  it('returns gameDate + label even with no playoff context', () => {
    const out = seriesContextForPick({
      pick: { away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' },
      gameStartTimeISO: '2026-05-01T22:30:00Z',
      playoffContext: null,
    });
    expect(out.gameDate).toBe('2026-05-01');
    expect(out.gameDateLabel).toMatch(/Fri, May 1/);
    expect(out.gameNumber).toBeNull();
    expect(out.contextLabel).toBe(out.gameDateLabel);
  });
});

describe('seriesContextForPick — playoff series enrichment', () => {
  it('attaches gameNumber + round when matchup is in the bracket', () => {
    const series = mkSeries({
      topSlug: 'lal', bottomSlug: 'hou', topWins: 3, bottomWins: 2,
      mostRecentGameTs: new Date('2026-05-01T22:30:00Z').getTime(),
    });
    const out = seriesContextForPick({
      pick: { away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' },
      gameStartTimeISO: '2026-05-01T22:30:00Z',
      playoffContext: { allSeries: [series], series: [series] },
    });
    expect(out.seriesRound).toBe('Round 1');
    expect(out.seriesRoundShort).toBe('West Round 1');
    expect(out.gameNumber).toBe(5);                   // 3+2 = Game 5 most recent
    expect(out.seriesScoreSummary).toBe('LAL lead 3-2');
    expect(out.contextLabel).toMatch(/Fri, May 1/);
    expect(out.contextLabel).toMatch(/West Round 1/);
    expect(out.contextLabel).toMatch(/Game 5/);
  });

  it('flags Game 7 explicitly', () => {
    const series = mkSeries({
      topSlug: 'bos', bottomSlug: 'phi', topWins: 3, bottomWins: 3,
      conference: 'Eastern',
      isElimination: true, isGameSeven: true,
      mostRecentGameTs: new Date('2026-05-02T20:00:00Z').getTime(),
    });
    const out = seriesContextForPick({
      pick: { away_team_slug: 'phi', home_team_slug: 'bos', slate_date: '2026-05-04' },
      gameStartTimeISO: '2026-05-04T19:30:00Z',
      playoffContext: { allSeries: [series], series: [series] },
    });
    expect(out.isGameSeven).toBe(true);
    expect(out.isElimination).toBe(true);
    expect(out.contextLabel).toMatch(/Game 7/);
  });

  it('reverses team order in the slug check (away vs home agnostic)', () => {
    const series = mkSeries({ topSlug: 'lal', bottomSlug: 'hou' });
    const out = seriesContextForPick({
      // Pick has HOU as home, LAL as away — reverse of bracket order
      pick: { away_team_slug: 'lal', home_team_slug: 'hou', slate_date: '2026-05-03' },
      gameStartTimeISO: '2026-05-03T22:30:00Z',
      playoffContext: { allSeries: [series] },
    });
    expect(out.seriesRound).toBe('Round 1');
  });

  it('NBA Finals omits the conference prefix', () => {
    const series = mkSeries({
      round: 4, conference: 'Eastern',
      topSlug: 'bos', bottomSlug: 'lal', topWins: 1, bottomWins: 0,
    });
    const out = seriesContextForPick({
      pick: { away_team_slug: 'lal', home_team_slug: 'bos', slate_date: '2026-06-05' },
      gameStartTimeISO: '2026-06-05T20:00:00Z',
      playoffContext: { allSeries: [series] },
    });
    expect(out.seriesRound).toBe('NBA Finals');
    expect(out.seriesRoundShort).toBe('NBA Finals');
  });

  it('does not invent a game number when no series data is available', () => {
    const out = seriesContextForPick({
      pick: { away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' },
      gameStartTimeISO: '2026-05-01T22:30:00Z',
      playoffContext: { series: [], allSeries: [] },
    });
    expect(out.gameNumber).toBeNull();
    expect(out.seriesRound).toBeNull();
    expect(out.contextLabel).toBe(out.gameDateLabel); // date-only
  });
});

describe('seriesContextForPick — repeat HOU/LAL identity', () => {
  it('Game 5 (May 1) and Game 6 (May 3) get distinct context labels', () => {
    const series = mkSeries({
      topSlug: 'lal', bottomSlug: 'hou', topWins: 3, bottomWins: 2,
      mostRecentGameTs: new Date('2026-05-03T22:30:00Z').getTime(),
      games: [
        { gameDate: '2026-04-21T22:30:00Z' }, // Game 1
        { gameDate: '2026-04-23T22:30:00Z' }, // Game 2
        { gameDate: '2026-04-26T22:30:00Z' }, // Game 3
        { gameDate: '2026-04-28T22:30:00Z' }, // Game 4
        { gameDate: '2026-05-01T22:30:00Z' }, // Game 5
        { gameDate: '2026-05-03T22:30:00Z' }, // Game 6 (most recent)
      ],
    });
    const game5 = seriesContextForPick({
      pick: { away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' },
      gameStartTimeISO: '2026-05-01T22:30:00Z',
      playoffContext: { allSeries: [series] },
    });
    const game6 = seriesContextForPick({
      pick: { away_team_slug: 'lal', home_team_slug: 'hou', slate_date: '2026-05-03' },
      gameStartTimeISO: '2026-05-03T22:30:00Z',
      playoffContext: { allSeries: [series] },
    });
    expect(game5.gameNumber).toBe(5);
    expect(game6.gameNumber).toBe(6);
    expect(game5.contextLabel).toMatch(/Fri, May 1/);
    expect(game6.contextLabel).toMatch(/Sun, May 3/);
    expect(game5.contextLabel).not.toEqual(game6.contextLabel);
  });
});
