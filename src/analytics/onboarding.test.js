/**
 * Tests for the onboarding funnel events: the properties each step sends,
 * and that nothing personal (username, name, jersey number) leaves the device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./index.js', () => ({ track: vi.fn(), setUserProperties: vi.fn() }));

import { track, setUserProperties } from './index.js';
import {
  ONBOARDING_STEPS, teamProps, emailProps, avatarProps, signupMethod,
  trackOnboardingStarted, trackStepViewed, trackStepSubmitted, trackStepFailed, trackStepSkipped,
  trackAvatarChange, trackEmailChoiceToggled, trackNextAction, setOnboardingPersonProps, _resetOnboardingAnalytics,
} from './onboarding.js';
import { SIGNUP_PREFS } from '../features/account/emailOptions.js';
import { DEFAULT_AVATAR } from '../brand/avatar.js';

const untouched = { sport: 'football', skin: DEFAULT_AVATAR.robotColor, uniform: DEFAULT_AVATAR.uniformColor, number: '', name: '' };
const events = (name) => track.mock.calls.filter(([n]) => n === name).map(([, p]) => p);

beforeEach(() => { vi.clearAllMocks(); _resetOnboardingAnalytics(); });

describe('what was chosen', () => {
  it('counts teams by sport and names the primary', () => {
    expect(teamProps(['49ers', 'chiefs', 'nyy'])).toEqual({
      team_count: 3, primary_team: '49ers', primary_sport: 'nfl', sports: 'nfl,mlb',
      nfl_team_count: 2, ncaam_team_count: 0, mlb_team_count: 1,
    });
    expect(teamProps([])).toMatchObject({ team_count: 0, primary_team: null, sports: null });
  });

  it('describes the email choices and whether the defaults were changed', () => {
    expect(emailProps(SIGNUP_PREFS)).toMatchObject({
      email_choices: 'daily,nfl', email_choice_count: 2, email_daily: true, email_nfl: true,
      email_ncaam: false, email_mlb: false, email_teams: false, email_changed_from_default: false,
    });
    const none = Object.fromEntries(Object.keys(SIGNUP_PREFS).map((k) => [k, false]));
    expect(emailProps(none)).toMatchObject({ email_choices: 'none', email_choice_count: 0, email_changed_from_default: true });
    // Following a college team starts Your Teams on; leaving it alone is not a change.
    const withTeams = { ...SIGNUP_PREFS, ncaam_team_digest: true };
    expect(emailProps(withTeams, withTeams)).toMatchObject({ email_choices: 'daily,nfl,teams', email_changed_from_default: false });
  });

  it('describes the avatar by colour name, never by what was typed', () => {
    const a = avatarProps({ sport: 'hockey', skin: '#22c55e', uniform: '#dc2626', number: '45', name: 'Dante D' });
    expect(a).toEqual({
      avatar_sport: 'hockey', avatar_robot_color: 'green', avatar_uniform_color: 'red',
      avatar_has_number: true, avatar_has_name: true, avatar_customized: true,
    });
    expect(JSON.stringify(a)).not.toMatch(/45|Dante/);
  });

  it('an untouched avatar is not customized, and a sport change alone does not count', () => {
    expect(avatarProps(untouched).avatar_customized).toBe(false);
    expect(avatarProps({ ...untouched, sport: 'soccer' }).avatar_customized).toBe(false);
    expect(avatarProps({ ...untouched, uniform: '#dc2626' }).avatar_customized).toBe(true);
  });

  it('reads the signup method from the auth provider', () => {
    expect(signupMethod({ app_metadata: { provider: 'google' } })).toBe('google');
    expect(signupMethod({ app_metadata: { provider: 'email' } })).toBe('email');
    expect(signupMethod(null)).toBe('email');
  });
});

describe('step events', () => {
  it('every step event carries a stable name, a numeric position and the method', () => {
    trackOnboardingStarted({ user: { id: 'u1', app_metadata: { provider: 'google' } }, entryStep: 'teams' });
    trackOnboardingStarted({ user: { id: 'u1', app_metadata: { provider: 'google' } }, entryStep: 'teams' });
    for (const name of Object.keys(ONBOARDING_STEPS)) trackStepViewed(name);
    const views = events('onboarding_step_view');
    expect(views.map((v) => v.step_name)).toEqual(['password', 'teams', 'emails', 'avatar', 'done']);
    expect(views.map((v) => v.step_number)).toEqual([0, 1, 2, 3, 4]);
    for (const v of views) expect(v.method).toBe('google');
    // The value older charts filter on is unchanged.
    expect(views.map((v) => v.step)).toEqual(['password', 1, 2, 3, 'done']);
    // Opening setup is counted once, however many times the wizard renders.
    expect(events('onboarding_started')).toHaveLength(1);
    expect(events('onboarding_started')[0]).toMatchObject({ method: 'google', entry_step: 'teams' });
  });

  it('a finished step and a failed step share one event, told apart by success', () => {
    trackStepViewed('teams');
    trackStepSubmitted('teams', teamProps(['bills']));
    trackStepFailed('avatar', 'username_taken_on_save');
    const [ok, failed] = events('onboarding_step_submit');
    expect(ok).toMatchObject({ step_name: 'teams', success: true, team_count: 1, primary_sport: 'nfl' });
    expect(typeof ok.seconds_on_step).toBe('number');
    expect(failed).toMatchObject({ step_name: 'avatar', success: false, error_code: 'username_taken_on_save' });
  });

  it('records skips and where people go from the finish screen', () => {
    trackStepSkipped('avatar');
    trackNextAction('nfl_picks');
    expect(events('onboarding_step_skipped')[0]).toMatchObject({ step_name: 'avatar', step_number: 3 });
    expect(events('onboarding_next_action')[0]).toMatchObject({ destination: 'nfl_picks', step_name: 'done' });
  });
});

describe('inside the steps', () => {
  it('reports each avatar control that changed, once', () => {
    trackAvatarChange('onboarding', untouched, { ...untouched, uniform: '#dc2626' });
    trackAvatarChange('onboarding', untouched, { ...untouched, sport: 'hockey', skin: '#22c55e' });
    expect(events('avatar_changed').map((e) => [e.control, e.value])).toEqual([
      ['uniform_color', 'red'], ['sport', 'hockey'], ['robot_color', 'green'],
    ]);
  });

  it('typing a number or a name reports the fill, not the keystrokes or the text', () => {
    trackAvatarChange('onboarding', untouched, { ...untouched, number: '4' });
    trackAvatarChange('onboarding', { ...untouched, number: '4' }, { ...untouched, number: '45' });
    trackAvatarChange('onboarding', untouched, { ...untouched, name: 'D' });
    trackAvatarChange('onboarding', { ...untouched, name: 'D' }, { ...untouched, name: 'Dante' });
    const sent = events('avatar_changed');
    expect(sent.map((e) => [e.control, e.value])).toEqual([['number', 'set'], ['name', 'set']]);
    expect(JSON.stringify(sent)).not.toMatch(/45|Dante/);
  });

  it('labels where an avatar or email change happened', () => {
    trackAvatarChange('settings', untouched, { ...untouched, uniform: '#dc2626' });
    trackEmailChoiceToggled({ surface: 'settings', choice: 'nfl', on: false });
    trackEmailChoiceToggled({ surface: 'onboarding', choice: 'daily', on: true });
    expect(events('avatar_changed')[0]).toMatchObject({ surface: 'settings' });
    expect(events('avatar_changed')[0].step_name).toBeUndefined();
    const [inSettings, inSetup] = events('email_choice_toggled');
    expect(inSettings).toEqual({ surface: 'settings', choice: 'nfl', on: false });
    expect(inSetup).toMatchObject({ surface: 'onboarding', choice: 'daily', on: true, step_name: 'emails' });
  });

  it('sets person properties that describe the setup', () => {
    setOnboardingPersonProps({ teamSlugs: ['49ers'], prefs: SIGNUP_PREFS, avatar: { ...untouched, uniform: '#dc2626' } });
    expect(setUserProperties).toHaveBeenCalledWith(expect.objectContaining({
      primary_team: '49ers', primary_sport: 'nfl', email_choices: 'daily,nfl',
      avatar_sport: 'football', avatar_uniform_color: 'red', avatar_customized: true,
    }));
  });
});
