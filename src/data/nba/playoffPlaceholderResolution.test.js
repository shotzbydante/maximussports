/**
 * Locks the placeholder-resolution pass for the NBA playoff context.
 *
 * Background: the static bracket carries Play-In-Winner placeholders
 * (e.g. "BOS vs Play-In Winner" for r1-east-3). When real R1 games
 * show BOS playing PHI, those games are invisible to findSeriesForGame
 * because the bracket's placeholder slot has slug=null. The resolution
 * pass scans finals against the bracket-anchored team and fills the
 * placeholder slot with the real opponent.
 *
 * Covers:
 *   - PHI vs BOS finals → BOS r1-east-3 series resolves with PHI
 *   - The series is no longer stale (gamesPlayed > 0 + bothTeamsResolved)
 *   - findSeriesForGame returns the correct series for a PHI/BOS game
 *   - Resolution does not mutate the imported NBA_PLAYOFF_BRACKET
 */

import { describe, it, expect } from 'vitest';
import {
  buildNbaPlayoffContext,
  findSeriesForGame,
} from './playoffContext.js';
import { NBA_PLAYOFF_BRACKET } from './playoffBracket.js';

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

describe('Playoff placeholder resolution', () => {
  it('resolves "BOS vs Play-In Winner" with PHI from real PHI/BOS finals', () => {
    // BOS up 3-1, PHI rallies to force Game 7 then wins Game 7 → 3-1 comeback
    const games = [
      mkFinal({ awaySlug: 'phi', awayScore: 95,  homeSlug: 'bos', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'phi', awayScore: 100, homeSlug: 'bos', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'bos', awayScore: 95,  homeSlug: 'phi', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'bos', awayScore: 110, homeSlug: 'phi', homeScore: 100, hoursAgo: 168 }),
      mkFinal({ awaySlug: 'phi', awayScore: 102, homeSlug: 'bos', homeScore: 95,  hoursAgo: 120 }),
      mkFinal({ awaySlug: 'bos', awayScore: 100, homeSlug: 'phi', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'phi', awayScore: 109, homeSlug: 'bos', homeScore: 100, hoursAgo: 8 }),
    ];

    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('bos') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('phi')
    );
    expect(series).toBeTruthy();
    expect(series.gamesPlayed).toBe(7);
    expect(series.isComplete).toBe(true);
    expect(series.winnerSlug).toBe('phi');
    expect(series.loserSlug).toBe('bos');
    expect(series.isStalePlaceholder).toBe(false);
  });

  it('findSeriesForGame matches a PHI/BOS game to the resolved BOS series', () => {
    const games = [
      mkFinal({ awaySlug: 'phi', awayScore: 95,  homeSlug: 'bos', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'phi', awayScore: 100, homeSlug: 'bos', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'bos', awayScore: 95,  homeSlug: 'phi', homeScore: 105, hoursAgo: 216 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const lookup = findSeriesForGame(games[2], ctx);
    expect(lookup).toBeTruthy();
    expect(lookup.series).toBeTruthy();
    const slugs = [lookup.series.topTeam?.slug, lookup.series.bottomTeam?.slug];
    expect(slugs).toContain('bos');
    expect(slugs).toContain('phi');
  });

  it('does NOT mutate the imported NBA_PLAYOFF_BRACKET', () => {
    const beforeBos = NBA_PLAYOFF_BRACKET.eastern.matchups
      .find(m => m.matchupId === 'r1-east-3');
    expect(beforeBos.bottomTeam.isPlaceholder).toBe(true);

    const games = [
      mkFinal({ awaySlug: 'phi', awayScore: 95, homeSlug: 'bos', homeScore: 110, hoursAgo: 200 }),
    ];
    buildNbaPlayoffContext({ liveGames: [], windowGames: games });

    const afterBos = NBA_PLAYOFF_BRACKET.eastern.matchups
      .find(m => m.matchupId === 'r1-east-3');
    // Static bracket constant must remain a placeholder; resolution only
    // applies to the cloned matchups inside the context.
    expect(afterBos.bottomTeam.isPlaceholder).toBe(true);
  });
});
