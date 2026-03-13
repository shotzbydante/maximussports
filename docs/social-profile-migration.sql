-- ============================================================================
-- Social Profile Infrastructure Migration
-- ============================================================================
-- Adds social identity, follow relationships, and pick stats to support
-- future public profiles, leaderboards, and social growth features.
--
-- This migration is additive-only — no existing columns are modified.
-- Safe to run on an existing database with populated profiles.
-- ============================================================================

-- ── 1. Extend profiles table with social fields ─────────────────────────────

-- Handle / public identity (handle mirrors username with @ prefix for display)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS handle text;

-- Social counters (denormalized for fast profile reads; derived from follows table)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;

-- Public profile toggle (default off — users opt in when feature activates)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_profile_enabled boolean DEFAULT false;

-- Robot avatar configuration (JSONB: { type, jerseyNumber, jerseyColor, robotColor })
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_config jsonb DEFAULT NULL;

-- ── 2. Follows table ────────────────────────────────────────────────────────
-- Models follow relationships between users.
-- Future integration: feed modules, follower lists, follow suggestions.

CREATE TABLE IF NOT EXISTS follows (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),

  -- Prevent duplicate follows
  CONSTRAINT follows_unique UNIQUE (follower_user_id, following_user_id),
  -- Prevent self-follows
  CONSTRAINT follows_no_self CHECK (follower_user_id != following_user_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_user_id);

-- ── 3. User pick stats table ────────────────────────────────────────────────
-- Aggregated pick performance per user. Updated when picks are graded.
-- Future integration: public profile stats, leaderboard rankings, credibility scores.

CREATE TABLE IF NOT EXISTS user_pick_stats (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  ats_wins        integer DEFAULT 0,
  ats_losses      integer DEFAULT 0,
  pickem_wins     integer DEFAULT 0,
  pickem_losses   integer DEFAULT 0,
  totals_wins     integer DEFAULT 0,
  totals_losses   integer DEFAULT 0,
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_pick_stats_user ON user_pick_stats(user_id);

-- ── 4. Row Level Security ───────────────────────────────────────────────────

-- follows: users can read all follows, insert/delete their own
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "follows_select_all"
  ON follows FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "follows_insert_own"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_user_id);

CREATE POLICY IF NOT EXISTS "follows_delete_own"
  ON follows FOR DELETE
  USING (auth.uid() = follower_user_id);

-- user_pick_stats: users can read all stats (public), only service role updates
ALTER TABLE user_pick_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "pick_stats_select_all"
  ON user_pick_stats FOR SELECT
  USING (true);

-- ── 5. Backfill handle for existing users ───────────────────────────────────
-- Sets handle = username for any existing profiles that have a username
UPDATE profiles
SET handle = username
WHERE username IS NOT NULL AND handle IS NULL;
