import { describe, it, expect } from 'vitest';
import { FOLLOW_SPORTS, sportOfSlug, splitBySport, teamBySlug } from './teamSports';

describe('teamSports', () => {
  it('leads with football', () => {
    expect(FOLLOW_SPORTS.map((s) => s.id)).toEqual(['nfl', 'ncaam', 'mlb']);
    expect(FOLLOW_SPORTS[0].teams).toHaveLength(32);
  });

  it('has no slug shared between sports', () => {
    const seen = new Map();
    const clashes = [];
    for (const sport of FOLLOW_SPORTS) {
      for (const t of sport.teams) {
        if (seen.has(t.slug)) clashes.push(`${t.slug}: ${seen.get(t.slug)} and ${sport.id}`);
        seen.set(t.slug, sport.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('resolves a slug to its sport', () => {
    expect(sportOfSlug('chiefs')).toBe('nfl');
    expect(sportOfSlug('nyy')).toBe('mlb');
    expect(sportOfSlug('not-a-team')).toBeNull();
    expect(teamBySlug('49ers')).toMatchObject({ name: 'San Francisco 49ers', sport: 'nfl' });
  });

  it('splits a mixed list and drops unknown slugs', () => {
    expect(splitBySport(['chiefs', 'nyy', 'zzz', 'bills'])).toEqual({ nfl: ['chiefs', 'bills'], ncaam: [], mlb: ['nyy'] });
  });
});
