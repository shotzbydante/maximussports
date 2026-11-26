import { describe, it, expect } from 'vitest';
import { freeLeans } from './pickHelpers';

const T = (h) => new Date(Date.UTC(2026, 10, 26, 18) + h * 3600e3).toISOString();
const pick = (gameId, type, score, hours, extra = {}) => ({
  id: `${gameId}-${type}`, gameId, market: { type }, conviction: { score }, matchup: { startTime: T(hours) }, ...extra,
});

describe('freeLeans', () => {
  const thursday = [
    pick('a', 'runline', 45, 0), pick('a', 'moneyline', 25, 0, { ev: -0.02 }), pick('a', 'total', 35, 0),
    pick('b', 'runline', 41, 3), pick('b', 'moneyline', 25, 3, { ev: -0.01 }),
    pick('c', 'runline', 36, 26), pick('c', 'moneyline', 25, 26, { ev: -0.001 }),
  ];
  const sunday = [pick('s', 'runline', 60, 72), pick('s', 'moneyline', 55, 72)];
  const hero = pick('k', 'total', 71, 7, { pickRole: 'hero' });

  it('tops one recommended pick up to three with the best lean in each other market', () => {
    const out = freeLeans([...thursday, ...sunday], [hero]);
    expect(out.map((p) => p.id)).toEqual(['a-runline', 'c-moneyline']);
  });

  it('keeps to the games kicking off next, not a stronger lean days away', () => {
    const out = freeLeans([...thursday, ...sunday], [hero]);
    expect(out.some((p) => p.gameId === 's')).toBe(false);
  });

  it('uses the whole board when fewer than three games kick off soon', () => {
    const out = freeLeans([pick('a', 'runline', 30, 0), ...sunday], []);
    expect(out.map((p) => p.id)).toEqual(['s-runline', 's-moneyline']);
  });

  it('adds nothing when three picks are already recommended, and skips held-back calls', () => {
    expect(freeLeans(thursday, [hero, hero, hero])).toEqual([]);
    const held = pick('a', 'runline', 90, 0, { lowSignalReason: 'qb_uncertain' });
    expect(freeLeans([held, ...thursday.slice(3)], [hero])[0].id).toBe('b-runline');
  });

  it('copes with an empty board', () => {
    expect(freeLeans([], [])).toEqual([]);
    expect(freeLeans(undefined, undefined)).toEqual([]);
  });
});
