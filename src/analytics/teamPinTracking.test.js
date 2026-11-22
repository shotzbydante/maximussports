/**
 * Tests for the sport label on team-follow events.
 *
 * Regression: NFL slugs ('bills') were falling through to the default and
 * being recorded as college basketball teams.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./index.js', () => ({ track: vi.fn(), setUserProperties: vi.fn() }));

import { track, setUserProperties } from './index.js';
import {
  getTeamSport,
  resolvePinSport,
  trackTeamPinAdded,
  updateTeamPersonProperties,
} from './teamPinTracking.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('getTeamSport', () => {
  it('recognises NFL, MLB and college slugs', () => {
    expect(getTeamSport('bills')).toBe('nfl');
    expect(getTeamSport('49ers')).toBe('nfl');
    expect(getTeamSport('nyy')).toBe('mlb');
    expect(getTeamSport('duke-blue-devils')).toBe('ncaam');
  });
});

describe('resolvePinSport', () => {
  it('prefers an explicit sport, then the surface, then the slug', () => {
    expect(resolvePinSport('bos', { sport: 'nba', surface: 'settings' })).toBe('nba');
    expect(resolvePinSport('bos', { surface: 'nba_team_detail' })).toBe('nba');
    expect(resolvePinSport('bos', { surface: 'settings' })).toBe('mlb');
    expect(resolvePinSport('bills', {})).toBe('nfl');
  });
});

describe('trackTeamPinAdded', () => {
  it('labels an NFL follow as NFL', () => {
    trackTeamPinAdded('chiefs', { surface: 'nfl_home', planTier: 'free', teamCountAfter: 1 });
    expect(track).toHaveBeenCalledWith('team_pin_added', expect.objectContaining({
      team_slug: 'chiefs', sport: 'nfl', surface: 'nfl_home',
    }));
  });
});

describe('updateTeamPersonProperties', () => {
  it('splits followed teams by sport, NFL included', () => {
    updateTeamPersonProperties(['bills', 'nyy', 'duke-blue-devils', 'chiefs']);
    expect(setUserProperties).toHaveBeenCalledWith(expect.objectContaining({
      favorite_nfl_teams: 'bills,chiefs',
      favorite_mlb_teams: 'nyy',
      favorite_ncaam_teams: 'duke-blue-devils',
      team_count: 4,
      nfl_team_count: 2,
      mlb_team_count: 1,
      ncaam_team_count: 1,
    }));
  });
});
