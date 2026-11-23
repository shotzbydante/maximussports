/**
 * Onboarding analytics: every event from "saw the signup form" to "left the
 * finish screen", in one place so the funnel can be read off this file.
 *
 * ─── THE FUNNEL, IN ORDER ────────────────────────────────────────────────
 *
 *  signup_viewed            signed-out signup form shown        (lib/analytics/posthog.js)
 *  signup_started           chose Google or email               (lib/analytics/posthog.js)
 *    signup_email_sent      confirmation email request accepted
 *    signup_email_failed    that request failed (reason: server, network, timeout)
 *    signup_code_submitted  typed the emailed code on the sign-up page
 *    signup_code_failed     the code was wrong, expired or could not be checked
 *    signup_code_verified   the code confirmed the address; setup follows
 *    signup_open_browser_clicked  in an app's browser, chose Safari or Chrome instead
 *    signup_email_invalid   typed something that is not an email
 *  auth_account_created     first sign-in, account exists       (context/AuthContext.jsx)
 *  onboarding_started       setup opened
 *  onboarding_step_view     a step was shown         step_name: password | teams | emails | avatar | done
 *  onboarding_step_submit   a step was finished      success: true | false
 *  onboarding_step_skipped  a step was skipped       step_name: password | avatar
 *  onboarding_completed     setup saved              (lib/analytics/posthog.js; the conversion)
 *  onboarding_next_action   where they went from the finish screen
 *
 * Inside the steps:
 *  onboarding_sport_tab_selected   teams step, switched sport
 *  onboarding_team_toggled         teams step, picked or removed a team
 *  onboarding_team_limit_hit       teams step, tried a 4th team on the free plan
 *  email_choice_toggled            emails step or Settings      surface: onboarding | settings
 *  avatar_changed                  avatar step or Settings      surface: onboarding | settings
 *  onboarding_username_issue       avatar step, username rejected
 *
 * ─── PROPERTIES ──────────────────────────────────────────────────────────
 *
 * Every step event carries step_name (stable), step_number (0 to 4, always a
 * number) and method (google | email). `step` is the value these events have
 * sent since March ('password', 1, 2, 3) and is kept so older charts still work.
 *
 * onboarding_step_submit also carries seconds_on_step, and what was chosen:
 *   teams   team_count, primary_team, primary_sport, sports, nfl_team_count,
 *           ncaam_team_count, mlb_team_count
 *   emails  email_choices ("daily,nfl"), email_choice_count, email_<id> for
 *           each choice, email_changed_from_default
 *   avatar  avatar_sport, avatar_robot_color, avatar_uniform_color,
 *           avatar_has_number, avatar_has_name, avatar_customized, skipped
 *
 * The avatar step's submit fires once, after the profile is saved: success
 * true with the server's team count, or success false with an error_code.
 *
 * Nothing in this file sends the username, the display name, the email
 * address or the jersey number itself.
 */
import { track, setUserProperties } from './index';
import { AVATAR_SKINS, AVATAR_UNIFORMS, DEFAULT_AVATAR } from '../brand/avatar';
import { sportOfSlug } from '../utils/teamSports';
import { EMAIL_OPTIONS, SIGNUP_PREFS, isOptionOn } from '../features/account/emailOptions';

/** step_name -> position in the flow, and the value older events sent as `step`. */
export const ONBOARDING_STEPS = {
  password: { number: 0, legacy: 'password' },
  teams:    { number: 1, legacy: 1 },
  emails:   { number: 2, legacy: 2 },
  avatar:   { number: 3, legacy: 3 },
  done:     { number: 4, legacy: 'done' },
};

const state = { userId: null, method: null, startedAt: null, stepShownAt: {} };
const now = () => Date.now();
const secondsSince = (t) => (t ? Math.max(0, Math.round((now() - t) / 1000)) : null);

function stepProps(name) {
  const s = ONBOARDING_STEPS[name];
  return { step: s.legacy, step_name: name, step_number: s.number, method: state.method };
}

/** google | email, from the Supabase user. */
export function signupMethod(user) {
  const provider = user?.app_metadata?.provider;
  return provider && provider !== 'email' ? provider : 'email';
}

/* ── What was chosen, as flat properties ─────────────────────────────────── */

export function teamProps(slugs = []) {
  const sports = slugs.map(sportOfSlug);
  const count = (sport) => sports.filter((s) => s === sport).length;
  return {
    team_count: slugs.length,
    primary_team: slugs[0] || null,
    primary_sport: sports[0] || null,
    sports: [...new Set(sports.filter(Boolean))].join(',') || null,
    nfl_team_count: count('nfl'),
    ncaam_team_count: count('ncaam'),
    mlb_team_count: count('mlb'),
  };
}

/** `startedWith` is what the step showed before the person touched it (it depends on the teams they follow). */
export function emailProps(prefs = {}, startedWith = SIGNUP_PREFS) {
  const ids = (p) => EMAIL_OPTIONS.filter((o) => isOptionOn(p, o)).map((o) => o.id);
  const on = ids(prefs);
  return {
    email_choices: on.join(',') || 'none',
    email_choice_count: on.length,
    ...Object.fromEntries(EMAIL_OPTIONS.map((o) => [`email_${o.id}`, on.includes(o.id)])),
    email_changed_from_default: on.join(',') !== ids(startedWith).join(','),
  };
}

const colourId = (list, hex) => list.find((c) => c.hex === String(hex || '').toLowerCase())?.id || 'custom';

/** `avatar` is the studio's value: { sport, skin, uniform, number, name }. */
export function avatarProps(avatar = {}) {
  const robot = colourId(AVATAR_SKINS, avatar.skin);
  const uniform = colourId(AVATAR_UNIFORMS, avatar.uniform);
  const hasNumber = String(avatar.number ?? '') !== '';
  return {
    avatar_sport: avatar.sport || null,
    avatar_robot_color: robot,
    avatar_uniform_color: uniform,
    avatar_has_number: hasNumber,
    avatar_has_name: String(avatar.name || '').trim() !== '',
    // Changed anything you can see on the mascot. Sport does not count: it follows the first team.
    avatar_customized: hasNumber
      || robot !== colourId(AVATAR_SKINS, DEFAULT_AVATAR.robotColor)
      || uniform !== colourId(AVATAR_UNIFORMS, DEFAULT_AVATAR.uniformColor),
  };
}

/* ── Signup form ─────────────────────────────────────────────────────────── */

export function trackSignupEmailSent({ resend = false } = {}) { track('signup_email_sent', { resend }); }
export function trackSignupEmailFailed({ resend = false, reason = 'server' } = {}) { track('signup_email_failed', { resend, reason }); }
export function trackSignupCodeSubmitted({ embedded = false } = {}) { track('signup_code_submitted', { embedded }); }
export function trackSignupCodeFailed({ reason = 'other', embedded = false } = {}) { track('signup_code_failed', { reason, embedded }); }
export function trackSignupCodeVerified({ embedded = false } = {}) { track('signup_code_verified', { embedded }); }
export function trackSignupEmailInvalid() { track('signup_email_invalid', {}); }

/* ── Setup ───────────────────────────────────────────────────────────────── */

/**
 * Setup opened. `entryStep` is where it began: password (email signups) or
 * teams (Google). Call it while the wizard first renders, before any step
 * mounts, so the first step view already knows the method. Safe to call
 * again: it fires once per person per page load.
 */
export function trackOnboardingStarted({ user, entryStep }) {
  if (!user?.id || state.userId === user.id) return;
  state.userId = user.id;
  state.method = signupMethod(user);
  state.startedAt = now();
  state.stepShownAt = {};
  let resumed = false;
  try {
    resumed = sessionStorage.getItem('mx_onboarding_started') === '1';
    sessionStorage.setItem('mx_onboarding_started', '1');
  } catch { /* private mode */ }
  track('onboarding_started', { method: state.method, entry_step: entryStep, resumed });
}

export function trackStepViewed(name, extra = {}) {
  state.stepShownAt[name] = now();
  track('onboarding_step_view', { ...stepProps(name), ...extra });
}

export function trackStepSubmitted(name, props = {}) {
  track('onboarding_step_submit', {
    ...stepProps(name), success: true, seconds_on_step: secondsSince(state.stepShownAt[name]), ...props,
  });
}

export function trackStepFailed(name, errorCode, props = {}) {
  track('onboarding_step_submit', {
    ...stepProps(name), success: false, error_code: errorCode, seconds_on_step: secondsSince(state.stepShownAt[name]), ...props,
  });
}

export function trackStepSkipped(name) {
  track('onboarding_step_skipped', { ...stepProps(name), seconds_on_step: secondsSince(state.stepShownAt[name]) });
}

/** Seconds from opening setup to now, for the completion event. */
export function secondsInOnboarding() { return secondsSince(state.startedAt); }

/* Teams step */
export function trackSportTabSelected(sport) { track('onboarding_sport_tab_selected', { ...stepProps('teams'), tab: sport }); }
export function trackTeamToggled({ slug, selected, position }) {
  track('onboarding_team_toggled', { ...stepProps('teams'), team_slug: slug, team_sport: sportOfSlug(slug), selected, position });
}
export function trackTeamLimitHit({ slug, limit }) {
  track('onboarding_team_limit_hit', { ...stepProps('teams'), team_slug: slug, team_sport: sportOfSlug(slug), limit });
}

/* Emails step, and the same switches in Settings */
export function trackEmailChoiceToggled({ surface, choice, on }) {
  track('email_choice_toggled', { surface, choice, on, ...(surface === 'onboarding' ? stepProps('emails') : {}) });
}

/* Avatar step, and Edit your Maximus in Settings */
const CONTROL_VALUE = {
  sport: (v) => v.sport,
  robot_color: (v) => colourId(AVATAR_SKINS, v.skin),
  uniform_color: (v) => colourId(AVATAR_UNIFORMS, v.uniform),
  // What was typed stays on the device; the event says only that the field is filled.
  number: (v) => (String(v.number ?? '') !== '' ? 'set' : 'cleared'),
  name: (v) => (String(v.name || '').trim() !== '' ? 'set' : 'cleared'),
};

/**
 * Compare two studio values and report each control that changed. Typing in
 * the number or name box reports once per fill or clear, not per keystroke.
 */
export function trackAvatarChange(surface, before, after) {
  for (const [control, read] of Object.entries(CONTROL_VALUE)) {
    const was = read(before);
    const is = read(after);
    if (was === is) continue;
    track('avatar_changed', { surface, control, value: is, ...(surface === 'onboarding' ? stepProps('avatar') : {}) });
  }
}

export function trackUsernameIssue(code) { track('onboarding_username_issue', { ...stepProps('avatar'), error_code: code }); }

/** Person properties that describe how this account was set up. */
export function setOnboardingPersonProps({ teamSlugs = [], prefs = {}, avatar = {} }) {
  const t = teamProps(teamSlugs);
  const e = emailProps(prefs);
  const a = avatarProps(avatar);
  setUserProperties({
    primary_team: t.primary_team,
    primary_sport: t.primary_sport,
    team_sports: t.sports,
    email_choices: e.email_choices,
    avatar_sport: a.avatar_sport,
    avatar_robot_color: a.avatar_robot_color,
    avatar_uniform_color: a.avatar_uniform_color,
    avatar_customized: a.avatar_customized,
  });
}

/** Finish screen: where they went next. destination: nfl_picks | home | find_friends | return_to. */
export function trackNextAction(destination) {
  track('onboarding_next_action', { ...stepProps('done'), destination, seconds_on_step: secondsSince(state.stepShownAt.done) });
}

/** For tests: forget who has started. */
export function _resetOnboardingAnalytics() {
  state.userId = null; state.method = null; state.startedAt = null; state.stepShownAt = {};
}
