/**
 * Tests for the line helpers that feed odds into AI copy.
 *
 * The invariant: a line is only attached to a game when the team names agree,
 * and the spread is always phrased with the team it belongs to. A wrong or
 * ambiguous number in published copy is worse than no number.
 */

import { describe, it, expect } from 'vitest';
import {
  normTeamName,
  teamNamesMatch,
  findMatchupLine,
  findNextLineForTeam,
  describeLine,
  formatAmerican,
  impliedPct,
  titleOddsFor,
} from './slateOdds.js';

const LINES = [
  { homeTeam: 'Duke Blue Devils', awayTeam: 'Washington State Cougars', commenceTime: '2026-11-22T00:00:00Z', homeSpread: -12.5, awaySpread: 12.5, total: '148.5', moneyline: '-900 / +600' },
  { homeTeam: 'Villanova Wildcats', awayTeam: 'Michigan Wolverines', commenceTime: '2026-11-22T01:00:00Z', homeSpread: 3, awaySpread: -3, total: '141', moneyline: null },
  { homeTeam: 'UConn Huskies', awayTeam: 'Duke Blue Devils', commenceTime: '2026-11-25T00:00:00Z', homeSpread: -1.5, awaySpread: 1.5, total: '139.5', moneyline: null },
];

describe('team name matching', () => {
  it('ignores case, punctuation and the St./Saint and St/State abbreviations', () => {
    expect(teamNamesMatch("St. John's Red Storm", 'Saint Johns Red Storm')).toBe(true);
    expect(teamNamesMatch('Michigan St Spartans', 'Michigan State Spartans')).toBe(true);
    expect(teamNamesMatch('Texas A&M Aggies', 'texas a m aggies')).toBe(true);
  });

  it('does not match different schools that share a word', () => {
    expect(teamNamesMatch('Michigan Wolverines', 'Michigan State Spartans')).toBe(false);
    expect(teamNamesMatch('Miami Hurricanes', 'Miami (OH) RedHawks')).toBe(false);
    expect(teamNamesMatch('Washington Huskies', 'Washington State Cougars')).toBe(false);
    expect(teamNamesMatch('Duke', 'Duke Blue Devils')).toBe(false);
  });

  it('never matches empty names', () => {
    expect(teamNamesMatch('', '')).toBe(false);
    expect(teamNamesMatch(null, undefined)).toBe(false);
    expect(normTeamName(42)).toBe('');
  });
});

describe('findMatchupLine', () => {
  it('finds a game only when home and away both match', () => {
    expect(findMatchupLine(LINES, 'Duke Blue Devils', 'Washington State Cougars')?.total).toBe('148.5');
    expect(findMatchupLine(LINES, 'Washington State Cougars', 'Duke Blue Devils')).toBeNull();
    expect(findMatchupLine(LINES, 'Duke Blue Devils', 'Army Black Knights')).toBeNull();
    expect(findMatchupLine(null, 'a', 'b')).toBeNull();
  });
});

describe('findNextLineForTeam', () => {
  const before = new Date('2026-11-21T20:00:00Z').getTime();

  it('returns the earliest game that has not started', () => {
    expect(findNextLineForTeam(LINES, 'Duke Blue Devils', before)?.awayTeam).toBe('Washington State Cougars');
  });

  it('skips games already under way', () => {
    const after = new Date('2026-11-22T02:00:00Z').getTime();
    expect(findNextLineForTeam(LINES, 'Duke Blue Devils', after)?.homeTeam).toBe('UConn Huskies');
  });

  it('returns null for a team with no listed game', () => {
    expect(findNextLineForTeam(LINES, 'Gonzaga Bulldogs', before)).toBeNull();
  });
});

describe('describeLine', () => {
  it('names the favourite with its spread', () => {
    expect(describeLine(LINES[0])).toEqual({ spread: 'Duke Blue Devils -12.5', total: '148.5' });
  });

  it('names the away side when the road team is favoured', () => {
    expect(describeLine(LINES[1])).toEqual({ spread: 'Michigan Wolverines -3', total: '141' });
  });

  it('leaves out the moneyline, which the source does not label by side', () => {
    expect(describeLine(LINES[0])).not.toHaveProperty('moneyline');
  });

  it('returns null when there is nothing to quote', () => {
    expect(describeLine(null)).toBeNull();
    expect(describeLine({ homeTeam: 'A', awayTeam: 'B', homeSpread: null, total: null })).toBeNull();
  });
});

describe('title odds formatting', () => {
  it('keeps the plus sign on positive American odds', () => {
    expect(formatAmerican(750)).toBe('+750');
    expect(formatAmerican(-110)).toBe('-110');
    expect(formatAmerican(null)).toBeNull();
  });

  it('computes implied probability', () => {
    expect(impliedPct(600)).toBe(14.3);
    expect(impliedPct(-150)).toBe(60);
    expect(impliedPct(0)).toBeNull();
  });

  it('reads a team price from a championship odds map', () => {
    const odds = { 'duke-blue-devils': { bestChanceAmerican: 750, bestPayoutAmerican: 900 } };
    expect(titleOddsFor(odds, 'duke-blue-devils')).toEqual({ odds: '+750', impliedPct: 11.8 });
    expect(titleOddsFor(odds, 'army-black-knights')).toBeNull();
    expect(titleOddsFor(null, 'duke-blue-devils')).toBeNull();
  });
});
