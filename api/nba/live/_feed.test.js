/**
 * The NBA games feed: consensus lines are ones a book could post, teams
 * carry their record, and a local call sign is not shown as the network.
 */

import { describe, it, expect } from 'vitest';
import { snapHalf, medianAmerican } from './_odds.js';
import { normalizeEvent, broadcastOf } from './_normalize.js';
import { scoreOf } from '../team/schedule.js';

describe('consensus lines', () => {
  it('snaps a quarter point to the half', () => {
    expect(snapHalf(226.25)).toBe(226.5);
    expect(snapHalf(210.25)).toBe(210.5);
    expect(snapHalf(-4.5)).toBe(-4.5);
    expect(snapHalf(8)).toBe(8);
    expect(snapHalf(null)).toBeNull();
  });

  it('takes the middle moneyline on probability, as a whole price', () => {
    expect(medianAmerican([150, 160])).toBe(155);
    expect(Number.isInteger(medianAmerican([-181, -185, -190, -178]))).toBe(true);
    // Either side of even money the prices cannot simply be averaged.
    expect(medianAmerican([-105, 105])).toBe(-100);
    expect(medianAmerican([])).toBeNull();
  });
});

describe('normalizeEvent', () => {
  const event = {
    id: '1',
    date: '2026-11-22T23:00Z',
    competitions: [{
      status: { type: { state: 'pre' } },
      venue: { fullName: 'Kaseya Center', address: { city: 'Miami', state: 'FL' } },
      broadcasts: [{ market: 'home', names: ['KSBI'] }],
      competitors: [
        { homeAway: 'home', team: { id: '14' }, score: '0', records: [{ name: 'overall', summary: '9-6' }] },
        { homeAway: 'away', team: { id: '25' }, score: '0', records: [{ name: 'overall', summary: '10-6' }] },
      ],
    }],
  };

  it('carries each team’s record', () => {
    const g = normalizeEvent(event);
    expect(g.teams.home).toMatchObject({ slug: 'mia', record: '9-6' });
    expect(g.teams.away).toMatchObject({ slug: 'okc', record: '10-6' });
  });

  it('does not present a local station as the network', () => {
    expect(normalizeEvent(event).broadcast).toEqual({ network: null, local: 'KSBI' });
    expect(broadcastOf({ broadcasts: [{ market: 'home', names: ['KSBI'] }, { market: 'national', names: ['ESPN'] }] }))
      .toEqual({ network: 'ESPN', local: null });
  });
});

describe('team schedule scores', () => {
  it('reads the score object ESPN sends on the team schedule', () => {
    expect(scoreOf({ score: { value: 112, displayValue: '112' } })).toBe(112);
    expect(scoreOf({ score: '97' })).toBe(97);
    expect(scoreOf({})).toBeNull();
  });
});
