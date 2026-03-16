-- ============================================================================
-- Follower/Following List RPCs
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor
--
-- These functions power /api/user/following and /api/user/followers.
-- They use SECURITY DEFINER to bypass RLS (same pattern as follow_user /
-- unfollow_user), ensuring the query works regardless of RLS policy state.
-- They use auth.uid() internally so only the authenticated user's own
-- social graph is returned — no parameter injection risk.
-- ============================================================================

-- ── get_following ─────────────────────────────────────────────────────────
-- Returns the list of users the current authenticated user follows,
-- with profile data and mutual-follow status, in a single query.

CREATE OR REPLACE FUNCTION get_following()
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  plan_tier text,
  preferences jsonb,
  avatar_config jsonb,
  follow_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.following_user_id                                        AS id,
    COALESCE(p.username, '')                                   AS username,
    COALESCE(p.display_name, p.username, '')                   AS display_name,
    COALESCE(p.plan_tier, 'free')                              AS plan_tier,
    p.preferences,
    p.avatar_config,
    CASE WHEN rf.id IS NOT NULL THEN 'friends'
         ELSE 'following'
    END                                                        AS follow_status
  FROM follows f
  LEFT JOIN profiles p  ON p.id = f.following_user_id
  LEFT JOIN follows  rf ON rf.follower_user_id = f.following_user_id
                       AND rf.following_user_id = auth.uid()
  WHERE f.follower_user_id = auth.uid()
  ORDER BY f.created_at DESC;
$$;

-- ── get_followers ─────────────────────────────────────────────────────────
-- Returns the list of users who follow the current authenticated user,
-- with profile data and mutual-follow status, in a single query.

CREATE OR REPLACE FUNCTION get_followers()
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  plan_tier text,
  preferences jsonb,
  avatar_config jsonb,
  follow_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.follower_user_id                                         AS id,
    COALESCE(p.username, '')                                   AS username,
    COALESCE(p.display_name, p.username, '')                   AS display_name,
    COALESCE(p.plan_tier, 'free')                              AS plan_tier,
    p.preferences,
    p.avatar_config,
    CASE WHEN rf.id IS NOT NULL THEN 'friends'
         ELSE 'follower'
    END                                                        AS follow_status
  FROM follows f
  LEFT JOIN profiles p  ON p.id = f.follower_user_id
  LEFT JOIN follows  rf ON rf.follower_user_id = auth.uid()
                       AND rf.following_user_id = f.follower_user_id
  WHERE f.following_user_id = auth.uid()
  ORDER BY f.created_at DESC;
$$;
