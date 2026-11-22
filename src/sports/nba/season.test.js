import { describe, it, expect } from 'vitest';
import { nbaSeasonPhase, isNbaPlayoffs } from './season.js';
import { WORKSPACES, WorkspaceId } from '../../workspaces/config.js';

describe('nbaSeasonPhase', () => {
  it('knows the regular season from the playoffs and the offseason', () => {
    expect(nbaSeasonPhase('2026-11-22')).toBe('regular_season');
    expect(nbaSeasonPhase('2027-04-12')).toBe('regular_season');
    expect(nbaSeasonPhase('2027-04-13')).toBe('playoffs');
    expect(nbaSeasonPhase('2027-06-01')).toBe('playoffs');
    expect(nbaSeasonPhase('2026-08-01')).toBe('offseason');
    expect(isNbaPlayoffs('2026-05-10')).toBe(true);
  });
});

describe('NBA bracketology', () => {
  it('is offered only during the playoffs', () => {
    expect(WORKSPACES[WorkspaceId.NBA].capabilities.bracketology).toBe(isNbaPlayoffs());
  });

  it('is gated in the nav, the home shortcut and the route by that one capability', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    expect(read('components/layout/Sidebar.jsx')).toMatch(/hasCapability\('bracketology'\)/);
    expect(read('components/layout/TopNav.jsx')).toMatch(/hasCapability\('bracketology'\)/);
    expect(read('pages/landing/MemberHome.jsx')).toMatch(/WORKSPACES\[WorkspaceId\.NBA\]\.capabilities\.bracketology \? \['Bracket'/);
    expect(read('App.jsx')).toMatch(/WORKSPACES\[WorkspaceId\.NBA\]\.capabilities\.bracketology\s*\? <RouteGate><NbaBracketology \/><\/RouteGate>\s*: <Navigate to="\/nba" replace \/>/);
  });
});
