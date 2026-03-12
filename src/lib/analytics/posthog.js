/**
 * Maximus Sports — PostHog Semantic Analytics Helpers
 *
 * Thin wrapper around src/analytics/index.js providing named, type-safe
 * functions for the auth / onboarding / favorites instrumentation.
 * All functions are safe no-ops if analytics is disabled or PostHog hasn't
 * loaded yet.
 *
 * ─── EVENT SCHEMA ────────────────────────────────────────────────────────────
 *
 *  signup_viewed          — unauthenticated settings panel becomes visible
 *
 *  account_created        — new user completes the onboarding wizard
 *    props: method (string)  — "google" | "email" | "magic_link"
 *
 *  account_create_skipped — user dismisses the signup gate without signing in
 *    props: reason (string)  — e.g. "welcome_modal_skipped"
 *
 *  login_success          — returning user authenticates successfully
 *    props: provider (string) — "google" | "email"
 *
 *  favorite_teams_updated — user saves a changed team list
 *    props: count (number), slugs_csv (string)
 *
 * ─── PERSON PROPERTIES (set via posthog.identify) ────────────────────────────
 *
 *  username        string   — chosen @handle, e.g. "hoops_fan"
 *  email           string   — Supabase auth email
 *  favorite_teams  string   — comma-separated team slugs, e.g. "kansas,dayton"
 *                             (CSV over array for clean PostHog breakdown UI)
 *  plan            string   — always "free" for now
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { identify, alias, track, setUserProperties } from '../../analytics/index';

const DEV = import.meta.env.DEV;

function dbg(...args) {
  if (DEV) console.log('[PostHog]', ...args);
}

/**
 * Build the canonical person-property object from Supabase user + profile + teams.
 * @param {{ id: string, email?: string, app_metadata?: object, user_metadata?: object }} user
 * @param {{ username?: string } | null} profile
 * @param {string[]} teamSlugs
 * @returns {Record<string, string | null>}
 */
function buildPersonProps(user, profile, teamSlugs = []) {
  return {
    username:       profile?.username ?? user?.user_metadata?.full_name ?? null,
    email:          user?.email ?? null,
    favorite_teams: teamSlugs.length > 0 ? teamSlugs.join(',') : null,
    plan:           'free',
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
 * Call after the onboarding wizard is fully saved to the DB.
 * Identifies the user with full person properties, then fires account_created.
 *
 * @param {{ id: string, email?: string, user_metadata?: object }} user
 * @param {{ username?: string } | null} profile
 * @param {string[]} teamSlugs
 * @param {{ method?: string }} [options]
 */
export function trackAccountCreated(user, profile, teamSlugs = [], { method = 'google' } = {}) {
  if (!user?.id) return;
  identifyUser(user, profile, teamSlugs);
  dbg('trackAccountCreated', { method, username: profile?.username });
  track('account_created', { method });
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
