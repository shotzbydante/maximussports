/**
 * Cross-sport logo resolution — invariant tests.
 *
 * Locks the fix for the "NBA Celtics showing the Red Sox logo" bug: slug
 * collisions must NEVER cause a sport-agnostic component to return another
 * sport's asset.
 */

import { describe, it, expect } from 'vitest';
import { resolveTeamLogo, getNbaEspnLogoUrl, hasTeamLogo } from './teamLogo.js';

describe('resolveTeamLogo — cross-sport collisions', () => {
  const COLLISIONS = ['bos', 'phi', 'cle', 'atl', 'mia', 'det', 'min', 'tor', 'mil', 'hou'];

  it('NBA bos resolves to an NBA logo URL, not MLB', () => {
    const url = resolveTeamLogo({ sport: 'nba', slug: 'bos' });
    expect(url).toBeTruthy();
    expect(url).toMatch(/teamlogos\/nba\//);
    expect(url).not.toMatch(/\/logos\/mlb\//);
  });

  it('MLB bos resolves to an MLB logo, not NBA', () => {
    const url = resolveTeamLogo({ sport: 'mlb', slug: 'bos' });
    expect(url).toBe('/logos/mlb/bos.png');
    expect(url).not.toMatch(/teamlogos\/nba\//);
  });

  it('NBA phi → 76ers path, not Phillies', () => {
    const url = resolveTeamLogo({ sport: 'nba', slug: 'phi' });
    expect(url).toMatch(/teamlogos\/nba\/500\/20\.png/); // 76ers ESPN id = 20
    expect(url).not.toMatch(/\/logos\/mlb\//);
  });

  it('MLB phi → Phillies path, not 76ers', () => {
    const url = resolveTeamLogo({ sport: 'mlb', slug: 'phi' });
    expect(url).toBe('/logos/mlb/phi.png');
  });

  for (const slug of COLLISIONS) {
    it(`colliding slug "${slug}" returns distinct URLs for NBA vs MLB`, () => {
      const nba = resolveTeamLogo({ sport: 'nba', slug });
      const mlb = resolveTeamLogo({ sport: 'mlb', slug });
      expect(nba).toBeTruthy();
      expect(mlb).toBeTruthy();
      expect(nba).not.toEqual(mlb);
      expect(nba).toMatch(/teamlogos\/nba\//);
      expect(mlb).toMatch(/\/logos\/mlb\//);
    });
  }
});

describe('resolveTeamLogo — sport context resolution', () => {
  it('reads sport from pick.sport when not passed explicitly', () => {
    const pick = { sport: 'nba', matchup: { awayTeam: { slug: 'bos' } } };
    const url = resolveTeamLogo({ pick, slug: 'bos' });
    expect(url).toMatch(/teamlogos\/nba\//);
  });

  it('reads sport from team.sport when pick is absent', () => {
    const url = resolveTeamLogo({ team: { sport: 'nba', slug: 'bos' }, slug: 'bos' });
    expect(url).toMatch(/teamlogos\/nba\//);
  });

  it('explicit sport arg wins over pick.sport (safety override)', () => {
    const pick = { sport: 'mlb', matchup: { awayTeam: { slug: 'bos' } } };
    const url = resolveTeamLogo({ sport: 'nba', pick, slug: 'bos' });
    expect(url).toMatch(/teamlogos\/nba\//);
  });
});

describe('resolveTeamLogo — no cross-sport fallback', () => {
  it('returns null when sport is missing — never guesses', () => {
    expect(resolveTeamLogo({ slug: 'bos' })).toBeNull();
    expect(resolveTeamLogo({ sport: null, slug: 'bos' })).toBeNull();
  });

  it('returns null for an unsupported sport', () => {
    expect(resolveTeamLogo({ sport: 'nfl', slug: 'bos' })).toBeNull();
  });

  it('returns null for an unknown slug in a known sport', () => {
    expect(resolveTeamLogo({ sport: 'nba', slug: 'xxx' })).toBeNull();
    expect(resolveTeamLogo({ sport: 'mlb', slug: 'xxx' })).toBeNull();
  });

  it('rejects a wrong-sport team.logo fallback (MLB slot, NBA-style URL)', () => {
    const team = { slug: 'xxx', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/2.png' };
    const url = resolveTeamLogo({ sport: 'mlb', slug: 'xxx', team });
    expect(url).toBeNull();
  });

  it('rejects a wrong-sport team.logo fallback (NBA slot, MLB-style URL)', () => {
    const team = { slug: 'xxx', logo: '/logos/mlb/xxx.png' };
    const url = resolveTeamLogo({ sport: 'nba', slug: 'xxx', team });
    expect(url).toBeNull();
  });

  it('accepts a correctly-scoped team.logo fallback when slug is unknown', () => {
    const team = { slug: 'xxx', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/99.png' };
    const url = resolveTeamLogo({ sport: 'nba', slug: 'xxx', team });
    expect(url).toMatch(/teamlogos\/nba\//);
  });
});

describe('getNbaEspnLogoUrl', () => {
  it('returns null for empty/unknown slugs', () => {
    expect(getNbaEspnLogoUrl(null)).toBeNull();
    expect(getNbaEspnLogoUrl('')).toBeNull();
    expect(getNbaEspnLogoUrl('xxx')).toBeNull();
  });
  it('returns an ESPN CDN URL for a known NBA slug', () => {
    expect(getNbaEspnLogoUrl('bos')).toMatch(/teamlogos\/nba\/500\/2\.png/);
    expect(getNbaEspnLogoUrl('lal')).toMatch(/teamlogos\/nba\/500\/13\.png/);
  });
});

describe('hasTeamLogo', () => {
  it('true for known sport+slug pair', () => {
    expect(hasTeamLogo({ sport: 'nba', slug: 'bos' })).toBe(true);
    expect(hasTeamLogo({ sport: 'mlb', slug: 'bos' })).toBe(true);
  });
  it('false when no sport context', () => {
    expect(hasTeamLogo({ slug: 'bos' })).toBe(false);
  });
  it('false for unknown slug', () => {
    expect(hasTeamLogo({ sport: 'nba', slug: 'xxx' })).toBe(false);
  });
});
