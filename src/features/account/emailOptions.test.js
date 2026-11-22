import { describe, it, expect } from 'vitest';
import { EMAIL_OPTIONS, SIGNUP_PREFS, isOptionOn, toggleOption, groupOptions } from './emailOptions';
import { DEFAULT_EMAIL_PREFS, resolvePreferences } from '../../../api/_lib/emailDefaults.js';
import { EMAIL_REGISTRY } from '../../../api/_lib/emailPipeline.js';

const opt = (id) => EMAIL_OPTIONS.find((o) => o.id === id);

describe('email options', () => {
  it('offers five choices, not one per server email type', () => {
    expect(EMAIL_OPTIONS.map((o) => o.id)).toEqual(['daily', 'nfl', 'ncaam', 'mlb', 'teams']);
  });

  it('covers every email the server can send, each exactly once', () => {
    const owned = EMAIL_OPTIONS.flatMap((o) => o.keys).sort();
    const sendable = Object.values(EMAIL_REGISTRY).map((e) => e.prefKey).sort();
    expect(owned).toEqual(sendable);
    expect(Object.keys(SIGNUP_PREFS).sort()).toEqual(sendable);
    expect(Object.keys(DEFAULT_EMAIL_PREFS).sort()).toEqual(sendable);
  });

  it('starts a new account on the daily brief and NFL picks only', () => {
    expect(EMAIL_OPTIONS.filter((o) => isOptionOn(SIGNUP_PREFS, o)).map((o) => o.id)).toEqual(['daily', 'nfl']);
  });

  it('moves a choice’s keys together', () => {
    const on = toggleOption(SIGNUP_PREFS, opt('mlb'));
    expect(on).toMatchObject({ mlb_briefing: true, mlb_picks: true, mlb_team_digest: false });
    expect(toggleOption(on, opt('mlb'))).toMatchObject({ mlb_briefing: false, mlb_picks: false });
  });

  it('reads a half-on legacy state as on, and switches all of it off', () => {
    const legacy = { ...SIGNUP_PREFS, mlb_briefing: true, mlb_picks: false };
    expect(isOptionOn(legacy, opt('mlb'))).toBe(true);
    expect(toggleOption(legacy, opt('mlb'))).toMatchObject({ mlb_briefing: false, mlb_picks: false });
  });

  it('puts an out-of-season sport under offseason', () => {
    const { current, offseason } = groupOptions();
    expect(current.map((o) => o.id)).toContain('nfl');
    expect([...current, ...offseason]).toHaveLength(EMAIL_OPTIONS.length);
    expect(offseason.every((o) => o.workspace)).toBe(true);
  });
});

describe('NFL picks for accounts created before it existed', () => {
  it('follows the daily brief when no choice is stored', () => {
    expect(resolvePreferences({ global_briefing: true }).nfl_picks).toBe(true);
    expect(resolvePreferences({ global_briefing: false }).nfl_picks).toBe(false);
  });
  it('never overrides a stored choice', () => {
    expect(resolvePreferences({ global_briefing: true, nfl_picks: false }).nfl_picks).toBe(false);
    expect(resolvePreferences({ global_briefing: false, nfl_picks: true }).nfl_picks).toBe(true);
  });
  it('is on for an account with nothing stored, like the daily brief', () => {
    expect(resolvePreferences({}).nfl_picks).toBe(true);
  });
});
