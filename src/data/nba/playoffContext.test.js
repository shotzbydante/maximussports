/**
 * Locks the data-accuracy contract for NBA Daily Briefing series state:
 *   - Active series resolved from real game wins (3-2, 4-0, etc.)
 *   - Completed series flagged isComplete + winnerSlug set
 *   - Stale 0-0 placeholders excluded from series[] when no game signal
 *     exists in the window (this is the bug surfaced by the audit
 *     screenshots: "OKC vs Play-In Winner — series tied 0-0").
 *   - isClincher fires when the most-recent final IS the deciding game
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPlayoffContext } from './playoffContext.js';

function final(awaySlug, awayScore, homeSlug, homeScore, hoursAgo = 12) {
  const startTime = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  return {
    gameId: `${awaySlug}-${homeSlug}-${startTime}`,
    sport: 'nba',
    status: 'final',
    startTime,
    teams: {
      away: { slug: awaySlug, score: awayScore, name: awaySlug, abbrev: awaySlug.toUpperCase() },
      home: { slug: homeSlug, score: homeScore, name: homeSlug, abbrev: homeSlug.toUpperCase() },
    },
    gameState: { isFinal: true, isLive: false },
  };
}

function upcoming(awaySlug, homeSlug, hoursAhead = 4) {
  const startTime = new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();
  return {
    gameId: `${awaySlug}-${homeSlug}-${startTime}`,
    sport: 'nba',
    status: 'upcoming',
    startTime,
    teams: {
      away: { slug: awaySlug, score: null, name: awaySlug, abbrev: awaySlug.toUpperCase() },
      home: { slug: homeSlug, score: null, name: homeSlug, abbrev: homeSlug.toUpperCase() },
    },
    gameState: { isFinal: false, isLive: false },
  };
}

describe('buildNbaPlayoffContext — series resolution from real games', () => {
  it('computes 3-2 series state from 5 finals between LAL and HOU', () => {
    // LAL leads HOU 3-2 in the 4 vs 5 Western matchup
    const games = [
      final('hou', 105, 'lal', 95, 192),  // Game 1: HOU wins (8 days ago)
      final('hou', 110, 'lal', 100, 168), // Game 2: HOU wins
      final('lal', 112, 'hou', 105, 144), // Game 3: LAL wins
      final('lal', 108, 'hou', 100, 96),  // Game 4: LAL wins
      final('lal', 115, 'hou', 110, 24),  // Game 5: LAL wins (yesterday)
      upcoming('hou', 'lal', 4),          // Game 6 tonight
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.series.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('lal') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('hou')
    );
    expect(series).toBeTruthy();
    expect(series.gamesPlayed).toBe(5);
    // 3-2 — winner side has 3 wins, loser has 2
    const total = series.seriesScore.top + series.seriesScore.bottom;
    expect(total).toBe(5);
    expect(Math.max(series.seriesScore.top, series.seriesScore.bottom)).toBe(3);
    expect(Math.min(series.seriesScore.top, series.seriesScore.bottom)).toBe(2);
    expect(series.isComplete).toBe(false);
    expect(series.nextGameNumber).toBe(6);
    expect(series.isStalePlaceholder).toBe(false);
  });

  it('flags a completed sweep with isComplete + winnerSlug + isClincher', () => {
    // CLE (4) sweeps TOR (5) 4-0 — both teams are fully resolved in the
    // static bracket (r1-east-1) so we don't depend on play-in resolution.
    const games = [
      final('tor', 95, 'cle', 110, 192),
      final('tor', 100, 'cle', 115, 168),
      final('cle', 120, 'tor', 105, 96),
      final('cle', 118, 'tor', 110, 24),  // Clinching Game 4 yesterday
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.series.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series).toBeTruthy();
    expect(series.isComplete).toBe(true);
    expect(series.winnerSlug).toBe('cle');
    expect(series.loserSlug).toBe('tor');
    expect(series.isClincher).toBe(true);
    // sweepThreat = 3-0 with potential closeout pending. Once 4-0 lands
    // the series is COMPLETE so sweepThreat goes false (no game pending).
    expect(series.gamesPlayed).toBe(4);
    expect(series.seriesScore.top + series.seriesScore.bottom).toBe(4);
    expect(ctx.completedSeries.some(s => s.matchupId === series.matchupId)).toBe(true);
  });

  it('flags series-clinching upset (lower seed wins 4-2)', () => {
    // MIN (6 seed) beats DEN (3 seed) 4-2
    const games = [
      final('min', 99,  'den', 95, 240),  // G1 MIN
      final('min', 100, 'den', 110, 216), // G2 DEN
      final('den', 95,  'min', 105, 168), // G3 MIN
      final('den', 105, 'min', 110, 120), // G4 MIN
      final('min', 90,  'den', 105, 72),  // G5 DEN
      final('den', 105, 'min', 115, 12),  // G6 MIN clinches
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.series.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('min') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('den')
    );
    expect(series).toBeTruthy();
    expect(series.isComplete).toBe(true);
    expect(series.winnerSlug).toBe('min');
    expect(series.isClincher).toBe(true);
  });

  it('excludes stale 0-0 placeholders (no finals + no upcoming game)', () => {
    // No games at all in the window for the OKC bracket slot.
    // The static bracket has OKC vs (Play-In Winner) for r1-west-0; with no
    // ESPN signal at all, that series should NOT appear in series[] (it
    // would render as "OKC vs Play-In Winner — Series tied 0-0").
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: [] });
    const okcSeries = ctx.series.find(s => s.topTeam?.slug === 'okc');
    expect(okcSeries).toBeFalsy();
  });
});
