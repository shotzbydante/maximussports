/**
 * Maximus Sports — PostHog Semantic Analytics Helpers
 *
 * Thin wrapper around src/analytics/index.js providing named, type-safe
 * functions for the auth / onboarding / favorites instrumentation.
 * All functions are safe no-ops if analytics is disabled or PostHog hasn't
 * loaded yet. Critical events are buffered by the analytics layer until
 * PostHog is ready, so they are never silently dropped.
 *
 * ─── EVENT SCHEMA ────────────────────────────────────────────────────────────
 *
 *  signup_viewed            — unauthenticated settings panel becomes visible
 *
 *  signup_started           — user initiates auth (Google OAuth or email link)
 *    props: method            "google" | "email"
 *
 *  auth_account_created     — NEW: source-of-truth for real account creation
 *    fires from: AuthContext on first-ever sign-in (before onboarding)
 *    props: method            "google" | "email"
 *
 *  account_created          — backward-compat alias (fires alongside auth_account_created)
 *    migrate dashboards to auth_account_created
 *
 *  onboarding_completed     — user finishes the onboarding wizard
 *    props: method, username, team_count, teams
 *
 *  account_create_skipped   — user dismisses the signup gate
 *    props: reason (string)
 *
 *  login_success            — returning user authenticates
 *    props: provider (string)
 *
 *  favorite_teams_updated   — user saves a changed team list
 *    props: count (number), slugs_csv (string)
 *
 * ─── PERSON PROPERTIES (set via posthog.identify) ────────────────────────────
 *
 *  username               string   — chosen @handle
 *  email                  string   — Supabase auth email
 *  favorite_teams         string   — comma-separated team slugs
 *  plan                   string   — "free" for now
 *  signup_source          string   — auth provider
 *  onboarding_completed   boolean  — true after wizard finish
 *  utm_source, utm_medium, utm_campaign, referrer, referral_code
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { identify, alias, track, setUserProperties } from '../../analytics/index';

const DEV = import.meta.env.DEV;

function dbg(...args) {
  if (DEV) console.log('[PostHog]', ...args);
}

/**
 * Read the referral code stored by /join?ref=UUID, if any.
 */
function getStoredReferralCode() {
  try { return localStorage.getItem('ms_referral_code') || null; } catch { return null; }
}

/**
 * Capture UTM params + referrer from the current page URL / document.
 * Safe to call at any time — returns nulls for missing values.
 */
function captureAcquisitionProps() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source:   params.get('utm_source')   || null,
      utm_medium:   params.get('utm_medium')    || null,
      utm_campaign: params.get('utm_campaign')  || null,
      referrer:     (document.referrer || '').slice(0, 200) || null,
      referral_code: getStoredReferralCode(),
    };
  } catch { return {}; }
}

/**
 * Build the canonical person-property object from Supabase user + profile + teams.
 * Includes acquisition props (UTM, referrer, referral code) for funnel analysis.
 * @param {{ id: string, email?: string, app_metadata?: object, user_metadata?: object }} user
 * @param {{ username?: string } | null} profile
 * @param {string[]} teamSlugs
 * @returns {Record<string, string | null>}
 */
function buildPersonProps(user, profile, teamSlugs = []) {
  const acq = captureAcquisitionProps();
  return {
    username:       profile?.username ?? user?.user_metadata?.full_name ?? null,
    email:          user?.email ?? null,
    favorite_teams: teamSlugs.length > 0 ? teamSlugs.join(',') : null,
    plan:           'free',
    signup_source:  user?.app_metadata?.provider ?? null,
    ...acq,
  };
}

/**
 * Identify the current user in PostHog with full person properties.
 * Handles anonymous-to-identified aliasing automatically.
 *
 * Call on:
 *   1. Onboarding wizard completion  (new user)
 *   2. Settings page load            (returning user, via PremiumProfile effect)
 *   3. Favorite teams change
 *
 * @param {{ id: string, email?: string, user_metadata?: object }} user
 * @param {{ username?: string } | null} profile
 * @param {string[]} teamSlugs
 */
export function identifyUser(user, profile, teamSlugs = []) {
  if (!user?.id) return;
  alias(user.id); // merge anonymous session before identifying
  const personProps = buildPersonProps(user, profile, teamSlugs);
  dbg('identify', user.id, Object.keys(personProps));
  identify(user.id, personProps);
}

/**
 * Fire when a brand-new authenticated account is detected (first-ever sign-in).
 * Called from AuthContext — fires BEFORE onboarding.
 *
 * This is the source-of-truth event for "new account created in Supabase."
 * Also fires legacy `account_created` so existing dashboards keep working.
 *
 * @param {{ id: string, email?: string, app_metadata?: object, user_metadata?: object }} user
 * @param {{ method?: string }} [options]
 */
export function trackAuthAccountCreated(user, { method = 'unknown' } = {}) {
  if (!user?.id) return;
  identifyUser(user, null, []);
  const acq = captureAcquisitionProps();
  const props = {
    method,
    referral_code: acq.referral_code,
    utm_source: acq.utm_source,
    utm_medium: acq.utm_medium,
    utm_campaign: acq.utm_campaign,
    referrer: acq.referrer,
  };
  dbg('trackAuthAccountCreated', props);
  track('auth_account_created', props);
  track('account_created', { ...props, _source: 'auth' });
}

/**
 * Fire when the onboarding wizard is fully completed and saved to the DB.
 * Identifies the user with complete profile + team properties, then fires event.
 * Also sets the onboarding_completed person property for dashboards.
 *
 * @param {{ id: string, email?: string, user_metadata?: object, app_metadata?: object }} user
 * @param {{ username?: string } | null} profile
 * @param {string[]} teamSlugs
 * @param {{ method?: string }} [options]
 */
export function trackOnboardingCompleted(user, profile, teamSlugs = [], { method = 'google' } = {}) {
  if (!user?.id) return;
  identifyUser(user, profile, teamSlugs);
  setUserProperties({ onboarding_completed: true });
  const acq = captureAcquisitionProps();
  dbg('trackOnboardingCompleted', { method, username: profile?.username, teams: teamSlugs.length });
  track('onboarding_completed', {
    method,
    username: profile?.username || null,
    team_count: teamSlugs.length,
    teams: teamSlugs.join(',') || null,
    referral_code: acq.referral_code,
    utm_source: acq.utm_source,
    utm_campaign: acq.utm_campaign,
    referrer: acq.referrer,
  });
}

/**
 * @deprecated Use trackOnboardingCompleted for wizard completion.
 * auth_account_created now fires from AuthContext at auth time.
 */
export function trackAccountCreated(user, profile, teamSlugs = [], opts = {}) {
  trackOnboardingCompleted(user, profile, teamSlugs, opts);
}

/**
 * Call when the user explicitly dismisses the signup gate (e.g. "Continue without
 * signing in" button on the WelcomeModal).
 *
 * @param {{ reason?: string }} [options]
 */
export function trackAccountCreateSkipped({ reason = 'unknown' } = {}) {
  dbg('trackAccountCreateSkipped', { reason });
  track('account_create_skipped', { reason });
}

/**
 * Call when a returning user successfully authenticates.
 * Identifies them with current profile + teams, then fires login_success.
 *
 * @param {{ id: string, email?: string, user_metadata?: object }} user
 * @param {{ username?: string } | null} profile
 * @param {string[]} teamSlugs
 * @param {{ provider?: string }} [options]
 */
export function trackLoginSuccess(user, profile, teamSlugs = [], { provider = 'google' } = {}) {
  if (!user?.id) return;
  identifyUser(user, profile, teamSlugs);
  dbg('trackLoginSuccess', { provider, username: profile?.username });
  track('login_success', { provider });
}

/**
 * Call whenever the user's pinned team list changes (add or remove).
 * Updates the favorite_teams person property and fires the event.
 *
 * @param {string} userId
 * @param {string[]} teamSlugs — the complete new list after the change
 */
export function trackFavoriteTeamsUpdated(userId, teamSlugs = []) {
  if (!userId) return;
  const slugsCsv = teamSlugs.join(',') || null;
  dbg('trackFavoriteTeamsUpdated', { userId, count: teamSlugs.length, slugsCsv });
  setUserProperties({ favorite_teams: slugsCsv });
  track('favorite_teams_updated', { count: teamSlugs.length, slugs_csv: slugsCsv ?? '' });
}

/**
 * Call when the unauthenticated settings panel becomes visible.
 * Helps track top-of-funnel signup exposure.
 */
export function trackSignupViewed() {
  dbg('trackSignupViewed');
  track('signup_viewed', {});
}

/**
 * Unified signup_started event — fires when the user initiates auth
 * (Google OAuth or email magic link). Bridges the gap between
 * auth_start_* and account_created for funnel analysis.
 *
 * @param {{ method: string }} opts — "google" | "email"
 */
export function trackSignupStarted({ method = 'unknown' } = {}) {
  const acq = captureAcquisitionProps();
  dbg('trackSignupStarted', { method, ...acq });
  track('signup_started', {
    method,
    referral_code: acq.referral_code,
    utm_source: acq.utm_source,
    utm_campaign: acq.utm_campaign,
    referrer: acq.referrer,
  });
}

/* ── Embedded browser / OAuth intercept events ─────────────────── */

/**
 * Fire when Google OAuth is attempted (regardless of browser type).
 * @param {{ provider: string, embedded_browser_detected: boolean, platform: string, referrer: string }} props
 */
export function trackOAuthAttempted(props = {}) {
  const acq = captureAcquisitionProps();
  dbg('trackOAuthAttempted', { ...props, ...acq });
  track('oauth_attempted', { ...props, ...acq });
}

/**
 * Fire when OAuth is blocked due to embedded browser detection.
 * @param {{ provider: string, embedded_source: string, platform: string }} props
 */
export function trackOAuthBlockedEmbedded(props = {}) {
  const acq = captureAcquisitionProps();
  dbg('trackOAuthBlockedEmbedded', { ...props, ...acq });
  track('oauth_blocked_embedded_browser', { ...props, ...acq });
}

/**
 * Fire when the embedded browser modal is shown.
 * @param {{ embedded_source: string, platform: string }} props
 */
export function trackOAuthPromptShown(props = {}) {
  dbg('trackOAuthPromptShown', props);
  track('oauth_prompt_shown', props);
}

/**
 * Fire when user clicks "Open in Safari/Chrome" from the modal.
 * @param {{ embedded_source: string, platform: string }} props
 */
export function trackOAuthOpenBrowserClicked(props = {}) {
  dbg('trackOAuthOpenBrowserClicked', props);
  track('oauth_open_browser_clicked', props);
}

/**
 * Fire when user selects "Use email instead" from the modal.
 * @param {{ embedded_source: string, platform: string }} props
 */
export function trackOAuthEmailFallback(props = {}) {
  dbg('trackOAuthEmailFallback', props);
  track('oauth_email_fallback_selected', props);
}

/**
 * Fire on successful OAuth completion.
 * @param {{ provider: string }} props
 */
export function trackOAuthSuccess(props = {}) {
  dbg('trackOAuthSuccess', props);
  track('oauth_success', props);
}

/**
 * Fire on OAuth error.
 * @param {{ provider: string, error: string }} props
 */
export function trackOAuthError(props = {}) {
  dbg('trackOAuthError', props);
  track('oauth_error', props);
}

/* ── Onboarding carousel events ─────────────────────────────────── */

export function trackWelcomeModalViewed({ step = 1 } = {}) {
  dbg('trackWelcomeModalViewed', { step });
  track('welcome_modal_viewed', { step });
}

export function trackWelcomeModalStepAdvanced({ from_step, to_step } = {}) {
  dbg('trackWelcomeModalStepAdvanced', { from_step, to_step });
  track('welcome_modal_step_advanced', { from_step, to_step });
}

export function trackWelcomeModalSkipped({ step = 1 } = {}) {
  dbg('trackWelcomeModalSkipped', { step });
  track('welcome_modal_skipped', { step });
}

export function trackWelcomeModalSignupClicked({ step = 3 } = {}) {
  dbg('trackWelcomeModalSignupClicked', { step });
  track('welcome_modal_signup_clicked', { step });
}

export function trackWelcomeModalExploreClicked({ step = 3 } = {}) {
  dbg('trackWelcomeModalExploreClicked', { step });
  track('welcome_modal_explore_clicked', { step });
}

export function trackWelcomeModalClosed({ step = 1, method = 'x_button' } = {}) {
  dbg('trackWelcomeModalClosed', { step, method });
  track('welcome_modal_closed', { step, method });
}
