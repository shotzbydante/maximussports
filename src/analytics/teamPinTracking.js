/**
 * teamPinTracking — canonical analytics for all team pin/unpin actions.
 *
 * ALL surfaces that pin/unpin teams MUST use these helpers instead of
 * calling track() directly. This ensures consistent event names,
 * property shapes, and person property updates across:
 *   - NCAAM Home
 *   - MLB Home
 *   - Settings / My Teams
 *   - Team Detail pages
 *   - Onboarding
 *   - Future NBA surfaces
 *
 * Event taxonomy:
 *   team_pin_added           — successful pin
 *   team_pin_removed         — successful unpin
 *   team_pin_attempt_blocked — blocked by free-tier limit
 *
 * Person properties maintained:
 *   favorite_teams           — CSV of all pinned slugs (all sports)
 *   favorite_mlb_teams       — CSV of MLB-only pinned slugs
 *   favorite_nfl_teams       — CSV of NFL-only pinned slugs
 *   favorite_ncaam_teams     — CSV of NCAAM-only pinned slugs
 *   team_count               — total pinned teams
 *   mlb_team_count           — MLB pinned count
 *   nfl_team_count           — NFL pinned count
 *   ncaam_team_count         — NCAAM pinned count
 */

import { track, setUserProperties } from './index.js';
import { NFL_SLUGS } from '../sports/nfl/teams.js';

const MLB_SLUG_SET = new Set([
  'nyy','bos','tor','tb','bal','cle','min','det','cws','kc',
  'hou','sea','tex','laa','oak','atl','nym','phi','mia','wsh',
  'chc','mil','stl','pit','cin','lad','sd','sf','ari','col',
]);

/**
 * Determine the sport for a team slug.
 *
 * NFL slugs are nicknames ('bills') and never collide with the others. NBA
 * slugs are abbreviations that overlap MLB's ('bos', 'det'), so a bare slug
 * cannot identify an NBA team: callers on NBA surfaces must say so, see
 * resolvePinSport.
 */
export function getTeamSport(slug) {
  if (NFL_SLUGS.has(slug)) return 'nfl';
  if (MLB_SLUG_SET.has(slug)) return 'mlb';
  // Default to NCAAM for long slugs (michigan-wolverines, etc.)
  return 'ncaam';
}

const SURFACE_SPORT = /^(nfl|nba|mlb|ncaam)_/;

/**
 * Sport for a pin action: what the caller said, else the surface it came from
 * ('nfl_home', 'nba_team_detail'), else a guess from the slug.
 */
export function resolvePinSport(slug, opts = {}) {
  if (opts.sport) return opts.sport;
  const fromSurface = SURFACE_SPORT.exec(opts.surface || '');
  if (fromSurface) return fromSurface[1];
  return getTeamSport(slug);
}

/**
 * Track a successful team pin.
 *
 * @param {string} slug — team slug
 * @param {object} opts
 * @param {string} opts.surface — 'home' | 'settings' | 'onboarding' | 'team_intel' | 'modal'
 * @param {string} [opts.planTier] — 'free' | 'pro'
 * @param {number} [opts.teamCountAfter] — total pinned teams after add
 * @param {number} [opts.graceRemaining] — grace window remaining
 * @param {string[]} [opts.allSlugs] — all current pinned slugs (for person props)
 */
export function trackTeamPinAdded(slug, opts = {}) {
  const sport = resolvePinSport(slug, opts);
  console.log(`[teamPinTracking] pin added slug=${slug} sport=${sport} surface=${opts.surface || 'unknown'}`);
  track('team_pin_added', {
    team_slug: slug,
    sport,
    surface: opts.surface || 'unknown',
    plan_tier: opts.planTier || null,
    team_count_after: opts.teamCountAfter ?? null,
    grace_remaining: opts.graceRemaining ?? null,
  });

  // Update person properties if we have the full slug list
  if (opts.allSlugs) {
    updateTeamPersonProperties(opts.allSlugs);
  }
}

/**
 * Track a successful team unpin.
 */
export function trackTeamPinRemoved(slug, opts = {}) {
  const sport = resolvePinSport(slug, opts);
  console.log(`[teamPinTracking] pin removed slug=${slug} sport=${sport} surface=${opts.surface || 'unknown'}`);
  track('team_pin_removed', {
    team_slug: slug,
    sport,
    surface: opts.surface || 'unknown',
    plan_tier: opts.planTier || null,
    team_count_after: opts.teamCountAfter ?? null,
  });

  if (opts.allSlugs) {
    updateTeamPersonProperties(opts.allSlugs);
  }
}

/**
 * Track a blocked pin attempt.
 */
export function trackTeamPinBlocked(slug, opts = {}) {
  const sport = resolvePinSport(slug, opts);
  track('team_pin_attempt_blocked', {
    team_slug: slug,
    sport,
    surface: opts.surface || 'unknown',
    reason: opts.reason || 'limit_exceeded',
    plan_tier: opts.planTier || 'free',
    team_count: opts.teamCount ?? null,
  });
}

/**
 * Update person properties with current pinned teams.
 * Call after any pin/unpin action with the full current slug list.
 */
export function updateTeamPersonProperties(allSlugs = []) {
  const nflSlugs = allSlugs.filter(s => getTeamSport(s) === 'nfl');
  const mlbSlugs = allSlugs.filter(s => getTeamSport(s) === 'mlb');
  const ncaamSlugs = allSlugs.filter(s => getTeamSport(s) === 'ncaam');
  console.log(`[teamPinTracking] person props updated: all=${allSlugs.join(',')} mlb=${mlbSlugs.join(',')} nfl=${nflSlugs.join(',')} total=${allSlugs.length}`);

  setUserProperties({
    favorite_teams: allSlugs.length > 0 ? allSlugs.join(',') : null,
    favorite_mlb_teams: mlbSlugs.length > 0 ? mlbSlugs.join(',') : null,
    favorite_nfl_teams: nflSlugs.length > 0 ? nflSlugs.join(',') : null,
    favorite_ncaam_teams: ncaamSlugs.length > 0 ? ncaamSlugs.join(',') : null,
    team_count: allSlugs.length,
    mlb_team_count: mlbSlugs.length,
    nfl_team_count: nflSlugs.length,
    ncaam_team_count: ncaamSlugs.length,
  });
}

/**
 * Track onboarding team selections.
 * Fires one team_pin_added per team, then updates person properties.
 */
export function trackOnboardingTeamsSelected(slugs = [], planTier = 'free') {
  for (const slug of slugs) {
    trackTeamPinAdded(slug, {
      surface: 'onboarding',
      planTier,
      teamCountAfter: slugs.length,
    });
  }
  updateTeamPersonProperties(slugs);
}

/**
 * Refresh PostHog person properties from VALIDATED backend state.
 *
 * Call this after any mutation to user_teams to ensure PostHog reflects
 * the actual persisted count — never optimistic/stale client state.
 *
 * @param {object} sb — Supabase client (authenticated)
 * @param {string} userId
 * @returns {Promise<{ count: number, slugs: string[] } | null>}
 */
export async function refreshTeamPersonPropertiesFromBackend(sb, userId) {
  if (!sb || !userId) return null;
  try {
    const { data, error } = await sb.from('user_teams')
      .select('team_slug')
      .eq('user_id', userId);
    if (error) {
      console.warn('[teamPinTracking] refresh failed:', error.message);
      return null;
    }
    const slugs = (data || []).map(r => r.team_slug).filter(Boolean);
    updateTeamPersonProperties(slugs);
    console.log('[teamPinTracking] person props refreshed from backend:', {
      userId, count: slugs.length, slugs,
    });
    return { count: slugs.length, slugs };
  } catch (err) {
    console.warn('[teamPinTracking] refresh exception:', err?.message);
    return null;
  }
}
