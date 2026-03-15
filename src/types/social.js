/**
 * Social profile types and interfaces.
 *
 * These serve as the canonical shape definitions for the social profile system.
 * Used by useUserProfile, API responses, and UI components.
 *
 * Future integration points:
 *  - Public profile page (GET /api/user/:handle)
 *  - Leaderboard rankings
 *  - Social sharing card generation
 *  - Follow-based feed modules
 */

/**
 * @typedef {Object} UserProfile
 * @property {string}  id
 * @property {string}  username
 * @property {string}  [displayName]
 * @property {string}  [handle]           - @username handle
 * @property {string}  [avatarUrl]        - OAuth avatar or null
 * @property {string}  [favoriteNumber]   - Jersey number (0–99)
 * @property {object}  [avatarConfig]     - Robot customization { type, jerseyNumber, jerseyColor, robotColor }
 * @property {string}  [email]
 * @property {boolean} isPro
 * @property {SocialCounts} social
 * @property {UserPickStats} pickStats
 * @property {boolean} publicProfileEnabled
 */

/**
 * @typedef {Object} SocialCounts
 * @property {number} followers
 * @property {number} following
 * @property {number} friends
 */

/**
 * @typedef {Object} PickRecord
 * @property {number} wins
 * @property {number} losses
 */

/**
 * @typedef {Object} UserPickStats
 * @property {PickRecord} ats
 * @property {PickRecord} pickem
 * @property {PickRecord} totals
 */

/**
 * @typedef {Object} FollowRelationship
 * @property {string} id
 * @property {string} followerUserId
 * @property {string} followingUserId
 * @property {string} createdAt
 */

/**
 * @typedef {Object} PublicProfileSummary
 * @property {string} username
 * @property {string} [displayName]
 * @property {string} [handle]
 * @property {string} [avatarUrl]
 * @property {string} [favoriteNumber]
 * @property {boolean} isPro
 * @property {SocialCounts} social
 * @property {UserPickStats} pickStats
 */

/**
 * @typedef {Object} UserPerformanceSummary
 * @property {UserPickStats} pickStats
 * @property {number} [currentStreak]     - consecutive wins (future)
 * @property {number} [winRate]           - overall win percentage (future)
 */

/**
 * @typedef {Object} ContactInvite
 * @property {string}  id
 * @property {string}  inviterUserId
 * @property {string}  phoneHash
 * @property {string}  createdAt
 * @property {string}  [acceptedAt]
 */

/**
 * @typedef {Object} ReferralTracking
 * @property {string}  id
 * @property {string}  referrerId
 * @property {string}  [referredId]
 * @property {string}  referralCode
 * @property {string}  status         - 'pending' | 'signed_up' | 'completed'
 */

/**
 * @typedef {Object} FriendActivity
 * @property {string}  id
 * @property {string}  userId
 * @property {string}  activityType   - 'pick' | 'bracket_update' | 'upset_hit' | 'win_streak'
 * @property {string}  title
 * @property {string}  [subtitle]
 * @property {object}  [metadata]
 * @property {string}  createdAt
 */

/** Default empty social counts. */
export const EMPTY_SOCIAL_COUNTS = Object.freeze({ followers: 0, following: 0, friends: 0 });

/** Default empty pick stats. */
export const EMPTY_PICK_STATS = Object.freeze({
  ats:    { wins: 0, losses: 0 },
  pickem: { wins: 0, losses: 0 },
  totals: { wins: 0, losses: 0 },
});

/**
 * Build a UserProfile object from raw Supabase profile row + auth user.
 * @param {object} authUser - Supabase auth user
 * @param {object} [profileRow] - profiles table row
 * @returns {UserProfile|null}
 */
export function buildUserProfile(authUser, profileRow) {
  if (!authUser) return null;
  const p = profileRow || {};
  return {
    id:                    authUser.id,
    username:              p.username || '',
    displayName:           p.display_name || p.username || '',
    handle:                p.username ? `@${p.username}` : '',
    avatarUrl:             authUser.user_metadata?.avatar_url || null,
    favoriteNumber:        p.favorite_number ?? null,
    avatarConfig:          p.avatar_config || null,
    email:                 authUser.email || '',
    isPro:                 p.plan_tier === 'pro',
    social:                { ...EMPTY_SOCIAL_COUNTS },
    pickStats:             { ...EMPTY_PICK_STATS },
    publicProfileEnabled:  p.public_profile_enabled ?? false,
  };
}
