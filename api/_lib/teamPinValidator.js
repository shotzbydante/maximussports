/**
 * teamPinValidator — server-side enforcement of pinned team limits.
 *
 * Free tier: max 3 pinned teams per sport.
 * Pro tier: unlimited.
 *
 * Grace window: after reaching 3, free users get 2 additional
 * "replacement" adds (must remove first). After grace exhausted,
 * further adds are blocked until upgrade.
 *
 * The grace counter (`team_adds_since_limit`) is stored in the
 * profile row and resets when team count drops below 3.
 */

import { getProfileEntitlements, effectivePlanTier } from './entitlements.js';

const FREE_LIMIT = 3;
const GRACE_ADDS = 2;

/**
 * Validate whether a user can add a team.
 *
 * @param {object} profile — Supabase profile row
 * @param {number} currentTeamCount — current pinned teams for the sport
 * @param {number} addCount — number of teams being added (usually 1)
 * @returns {{ allowed: boolean, reason: string|null, graceRemaining: number }}
 */
export function validateTeamAdd(profile, currentTeamCount, addCount = 1) {
  const tier = effectivePlanTier(profile);

  // Pro users: always allowed
  if (tier === 'pro') {
    return { allowed: true, reason: null, graceRemaining: Infinity };
  }

  const entitlements = getProfileEntitlements(profile);
  const limit = entitlements.maxPinnedTeams || FREE_LIMIT;
  const graceUsed = profile?.team_adds_since_limit || 0;
  const graceRemaining = Math.max(0, GRACE_ADDS - graceUsed);

  // Adding >3 at once (e.g., onboarding bulk add): block immediately
  if (addCount > 1 && currentTeamCount + addCount > limit) {
    return { allowed: false, reason: 'limit_exceeded', graceRemaining };
  }

  // Under limit: always allowed
  if (currentTeamCount < limit) {
    return { allowed: true, reason: null, graceRemaining };
  }

  // At or over limit: check grace window
  if (graceUsed < GRACE_ADDS) {
    // Grace add allowed (user presumably removed a team recently)
    return { allowed: true, reason: null, graceRemaining: GRACE_ADDS - graceUsed - 1 };
  }

  // Grace exhausted
  return { allowed: false, reason: 'grace_exceeded', graceRemaining: 0 };
}

/**
 * After a successful team add at/above the limit, increment the grace counter.
 * Call this AFTER the team is persisted.
 *
 * @param {object} sb — Supabase admin client
 * @param {string} userId
 * @param {number} currentCount — team count AFTER the add
 */
export async function incrementGraceCounter(sb, userId, currentCount) {
  if (currentCount < FREE_LIMIT) return; // below limit, no need to track
  try {
    // Increment team_adds_since_limit
    const { data } = await sb.from('profiles')
      .select('team_adds_since_limit')
      .eq('id', userId)
      .maybeSingle();
    const current = data?.team_adds_since_limit || 0;
    await sb.from('profiles')
      .update({ team_adds_since_limit: current + 1, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.warn(`[teamPinValidator] grace counter increment failed for ${userId}:`, err.message);
  }
}

/**
 * After a team removal, check if count dropped below limit and reset grace counter.
 *
 * @param {object} sb — Supabase admin client
 * @param {string} userId
 * @param {number} newCount — team count AFTER the removal
 */
export async function maybeResetGraceCounter(sb, userId, newCount) {
  if (newCount >= FREE_LIMIT) return; // still at/above limit
  try {
    await sb.from('profiles')
      .update({ team_adds_since_limit: 0, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.warn(`[teamPinValidator] grace counter reset failed for ${userId}:`, err.message);
  }
}

/**
 * Get the current team count for a user (all sports combined).
 */
export async function getUserTeamCount(sb, userId) {
  try {
    const { count, error } = await sb.from('user_teams')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Validate a FULL pinned-teams set (used for onboarding bulk insert,
 * full-set replacement, sync hydration).
 *
 * Unlike validateTeamAdd() which considers grace window on single adds,
 * this validator rejects any set that exceeds the hard cap, regardless
 * of grace. Grace only applies to rotational single-add replacement.
 *
 * @param {object} profile — Supabase profile row
 * @param {string[]} nextSlugs — the full resulting set after write
 * @returns {{ allowed: boolean, reason: string|null, limit: number, attemptedCount: number }}
 */
export function validatePinnedTeamsSet(profile, nextSlugs) {
  const tier = effectivePlanTier(profile);
  const attemptedCount = Array.isArray(nextSlugs) ? nextSlugs.length : 0;

  if (tier === 'pro') {
    return { allowed: true, reason: null, limit: Infinity, attemptedCount };
  }

  const entitlements = getProfileEntitlements(profile);
  const limit = entitlements.maxPinnedTeams || FREE_LIMIT;

  if (attemptedCount > limit) {
    return {
      allowed: false,
      reason: 'set_exceeds_limit',
      limit,
      attemptedCount,
    };
  }

  return { allowed: true, reason: null, limit, attemptedCount };
}

/**
 * Diagnostic helper — logs pinned-teams validation decisions so future
 * leaks are immediately visible in logs.
 */
export function logTeamsValidation(surface, payload) {
  try {
    console.log('[PINNED_TEAMS_VALIDATION]', JSON.stringify({
      surface,
      at: new Date().toISOString(),
      ...payload,
    }));
  } catch {
    /* never throw from diagnostics */
  }
}
