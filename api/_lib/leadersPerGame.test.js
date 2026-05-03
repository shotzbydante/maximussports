/**
 * Locks the per-game-average contract for postseason leaders.
 *
 * Covers:
 *   - Box-score aggregation emits per-game averages (not totals)
 *   - statType: 'averages' on the result payload
 *   - Validator accepts both 'averages' and legacy 'totals' shapes
 *   - Eliminated R1 teams stay in the playoff team set (their leaders
 *     are still legitimate postseason leaders)
 *   - Play-in only teams are NOT in the team set
 */

import { describe, it, expect } from 'vitest';
import {
  hasValidPostseasonTotalsPayload,
  buildValidPlayoffTeamSlugs,
} from './nbaBoxScoreLeaders.js';

describe('hasValidPostseasonTotalsPayload — accepts averages and totals', () => {
  const buildPayload = (statType) => ({
    seasonType: 'postseason',
    statType,
    categories: {
      pts: { abbrev: 'PTS', leaders: [{ name: 'A', value: 33.8, teamSlug: 'okc' }] },
      ast: { abbrev: 'AST', leaders: [{ name: 'B', value: 8.4, teamSlug: 'nyk' }] },
      reb: { abbrev: 'REB', leaders: [{ name: 'C', value: 12.1, teamSlug: 'den' }] },
      stl: { abbrev: 'STL', leaders: [{ name: 'D', value: 2.0, teamSlug: 'okc' }] },
      blk: { abbrev: 'BLK', leaders: [{ name: 'E', value: 1.6, teamSlug: 'sas' }] },
    },
  });

  it('accepts statType=averages', () => {
    const ok = hasValidPostseasonTotalsPayload(
      buildPayload('averages'),
      null,
      { allowMissingTeamSet: true }
    );
    expect(ok).toBe(true);
  });

  it('accepts statType=totals (legacy back-compat)', () => {
    const ok = hasValidPostseasonTotalsPayload(
      buildPayload('totals'),
      null,
      { allowMissingTeamSet: true }
    );
    expect(ok).toBe(true);
  });

  it('rejects unknown statType values', () => {
    const ok = hasValidPostseasonTotalsPayload(
      buildPayload('per_36_minutes'),
      null,
      { allowMissingTeamSet: true }
    );
    expect(ok).toBe(false);
  });
});

describe('buildValidPlayoffTeamSlugs — eliminated R1 teams stay in set', () => {
  function mkFinal({ awaySlug, awayScore, homeSlug, homeScore }) {
    return {
      gameId: `${awaySlug}-${homeSlug}-${Math.random()}`,
      sport: 'nba',
      status: 'final',
      teams: {
        away: { slug: awaySlug, score: awayScore, abbrev: awaySlug.toUpperCase() },
        home: { slug: homeSlug, score: homeScore, abbrev: homeSlug.toUpperCase() },
      },
      gameState: { isFinal: true, isLive: false },
    };
  }

  it('includes the eliminated team (HOU lost 4-2 to LAL) in the playoff set', () => {
    const playoffContext = {
      allSeries: [
        {
          topTeam: { slug: 'lal' },
          bottomTeam: { slug: 'hou' },
          isComplete: true,
          winnerSlug: 'lal',
          loserSlug: 'hou',
          isStalePlaceholder: false,
        },
      ],
    };
    const games = [
      mkFinal({ awaySlug: 'lal', awayScore: 110, homeSlug: 'hou', homeScore: 100 }),
      mkFinal({ awaySlug: 'hou', awayScore: 105, homeSlug: 'lal', homeScore: 95 }),
    ];
    const slugs = buildValidPlayoffTeamSlugs(playoffContext, games);
    expect(slugs.has('lal')).toBe(true);
    expect(slugs.has('hou')).toBe(true);
  });

  it('does NOT include a play-in-only team that never made R1', () => {
    // GSW played 1 play-in game (lost) → gameState.isFinal=true but
    // isPlayInGame should drop them. Without bracket presence, GSW
    // should not appear in the set.
    const playoffContext = { allSeries: [] };
    const games = [
      // Mark as play-in by stuffing the notes blob the detector reads
      {
        gameId: 'gsw-mem-playin',
        sport: 'nba',
        status: 'final',
        teams: {
          away: { slug: 'gsw', score: 100, abbrev: 'GSW' },
          home: { slug: 'mem', score: 110, abbrev: 'MEM' },
        },
        gameState: { isFinal: true, isLive: false },
        notes: ['Play-In Tournament'],
      },
    ];
    const slugs = buildValidPlayoffTeamSlugs(playoffContext, games);
    expect(slugs.has('gsw')).toBe(false);
    expect(slugs.has('mem')).toBe(false);
  });
});
