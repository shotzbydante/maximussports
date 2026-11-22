/**
 * Tests for the route → analytics properties mapping. These labels are what
 * every "usage by sport / page / team" chart is broken down by.
 */

import { describe, it, expect } from 'vitest';
import { describeRoute, sportFromWorkspace } from './routeProps.js';

describe('describeRoute', () => {
  it('labels the landing page', () => {
    expect(describeRoute('/')).toEqual({ page_type: 'landing' });
    expect(describeRoute('')).toEqual({ page_type: 'landing' });
  });

  it('labels each sport home', () => {
    for (const sport of ['ncaam', 'nba', 'mlb', 'nfl']) {
      expect(describeRoute(`/${sport}`)).toEqual({ sport, page_type: 'home' });
    }
  });

  it('labels the NFL section pages', () => {
    expect(describeRoute('/nfl/games')).toEqual({ sport: 'nfl', page_type: 'games' });
    expect(describeRoute('/nfl/teams')).toEqual({ sport: 'nfl', page_type: 'teams' });
    expect(describeRoute('/nfl/insights')).toEqual({ sport: 'nfl', page_type: 'picks' });
    expect(describeRoute('/nfl/news')).toEqual({ sport: 'nfl', page_type: 'news' });
    expect(describeRoute('/nfl/season-model')).toEqual({ sport: 'nfl', page_type: 'season_model' });
  });

  it('pulls the team out of a team page', () => {
    expect(describeRoute('/nfl/teams/bills')).toEqual({ sport: 'nfl', page_type: 'team', team_slug: 'bills' });
    expect(describeRoute('/ncaam/teams/duke-blue-devils'))
      .toEqual({ sport: 'ncaam', page_type: 'team', team_slug: 'duke-blue-devils' });
    expect(describeRoute('/mlb/teams/lad/')).toEqual({ sport: 'mlb', page_type: 'team', team_slug: 'lad' });
  });

  it('labels a matchup page as a game', () => {
    expect(describeRoute('/ncaam/games/duke-vs-unc')).toEqual({ sport: 'ncaam', page_type: 'game' });
  });

  it('gives pages outside a sport a page type and no sport', () => {
    expect(describeRoute('/settings')).toEqual({ page_type: 'settings' });
    expect(describeRoute('/dashboard')).toEqual({ page_type: 'dashboard' });
    expect(describeRoute('/share/abc123')).toEqual({ page_type: 'share' });
    expect(describeRoute('/privacy')).toEqual({ page_type: 'legal' });
  });

  it('falls back to "other" for unknown paths', () => {
    expect(describeRoute('/nfl/something-new')).toEqual({ sport: 'nfl', page_type: 'other' });
    expect(describeRoute('/who-knows')).toEqual({ page_type: 'other' });
  });

  it('ignores case and query strings', () => {
    expect(describeRoute('/NFL/Teams/Bills?x=1')).toEqual({ sport: 'nfl', page_type: 'team', team_slug: 'bills' });
  });
});

describe('sportFromWorkspace', () => {
  it('maps the college basketball workspace id to its sport name', () => {
    expect(sportFromWorkspace('cbb')).toBe('ncaam');
    expect(sportFromWorkspace('nfl')).toBe('nfl');
    expect(sportFromWorkspace('unknown')).toBeNull();
  });
});
