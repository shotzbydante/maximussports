-- ============================================================================
-- Social RPCs & Triggers Migration
-- ============================================================================
-- Canonical DB-owned side effects for the social graph.
-- The DB is the source of truth for: counter updates, notifications, mutual status.
-- App code calls RPCs and reads resulting state — never mutates counters directly.
--
-- Prerequisites: social-profile-migration.sql, notifications-migration.sql
-- ============================================================================

-- ── 1. Follow trigger (after INSERT on follows) ──────────────────────────────

CREATE OR REPLACE FUNCTION handle_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment counters
  UPDATE profiles SET followers_count = COALESCE(followers_count, 0) + 1,
                      updated_at = now()
  WHERE id = NEW.following_user_id;

  UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1,
                      updated_at = now()
  WHERE id = NEW.follower_user_id;

  -- Check for mutual follow → update friends_count
  IF EXISTS (
    SELECT 1 FROM follows
    WHERE follower_user_id = NEW.following_user_id
      AND following_user_id = NEW.follower_user_id
  ) THEN
    UPDATE profiles SET friends_count = COALESCE(friends_count, 0) + 1 WHERE id = NEW.follower_user_id;
    UPDATE profiles SET friends_count = COALESCE(friends_count, 0) + 1 WHERE id = NEW.following_user_id;
  END IF;

  -- Create new_follower notification
  INSERT INTO notifications (user_id, type, actor_id, is_read)
  VALUES (NEW.following_user_id, 'new_follower', NEW.follower_user_id, false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_insert ON follows;
CREATE TRIGGER on_follow_insert
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION handle_follow_insert();

-- ── 2. Unfollow trigger (after DELETE on follows) ────────────────────────────

CREATE OR REPLACE FUNCTION handle_follow_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Decrement counters (floor at 0)
  UPDATE profiles SET followers_count = GREATEST(0, COALESCE(followers_count, 0) - 1),
                      updated_at = now()
  WHERE id = OLD.following_user_id;

  UPDATE profiles SET following_count = GREATEST(0, COALESCE(following_count, 0) - 1),
                      updated_at = now()
  WHERE id = OLD.follower_user_id;

  -- If was mutual, decrement friends_count
  IF EXISTS (
    SELECT 1 FROM follows
    WHERE follower_user_id = OLD.following_user_id
      AND following_user_id = OLD.follower_user_id
  ) THEN
    UPDATE profiles SET friends_count = GREATEST(0, COALESCE(friends_count, 0) - 1) WHERE id = OLD.follower_user_id;
    UPDATE profiles SET friends_count = GREATEST(0, COALESCE(friends_count, 0) - 1) WHERE id = OLD.following_user_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_delete ON follows;
CREATE TRIGGER on_follow_delete
  AFTER DELETE ON follows
  FOR EACH ROW
  EXECUTE FUNCTION handle_follow_delete();

-- ── 3. follow_user RPC ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.follow_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  INSERT INTO follows (follower_user_id, following_user_id)
  VALUES (auth.uid(), target_user_id)
  ON CONFLICT (follower_user_id, following_user_id) DO NOTHING;
END;
$$;

-- ── 4. unfollow_user RPC ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unfollow_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM follows
  WHERE follower_user_id = auth.uid()
    AND following_user_id = target_user_id;
END;
$$;

-- ── 5. mark_notifications_read RPC ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_notifications_read(notification_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET is_read = true
  WHERE id = ANY(notification_ids)
    AND user_id = auth.uid();
END;
$$;

-- ── 6. Suggested users RPC ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.suggested_users(max_results int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  plan_tier text,
  preferences jsonb,
  followers_count int,
  reason text,
  mutual_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  my_id uuid := auth.uid();
BEGIN
  -- Friends-of-friends ranked by mutual connection count
  RETURN QUERY
  WITH my_following AS (
    SELECT following_user_id FROM follows WHERE follower_user_id = my_id
  ),
  fof AS (
    SELECT f.following_user_id AS uid, COUNT(*) AS cnt
    FROM follows f
    WHERE f.follower_user_id IN (SELECT following_user_id FROM my_following)
      AND f.following_user_id != my_id
      AND f.following_user_id NOT IN (SELECT following_user_id FROM my_following)
    GROUP BY f.following_user_id
    ORDER BY cnt DESC
    LIMIT max_results
  )
  SELECT p.id, p.username, p.display_name, p.plan_tier, p.preferences,
         p.followers_count, 'friends_of_friends'::text AS reason, fof.cnt AS mutual_count
  FROM fof
  JOIN profiles p ON p.id = fof.uid
  WHERE p.username IS NOT NULL OR p.display_name IS NOT NULL;

  -- Backfill with random if fewer than max_results returned
  -- (handled in app code since RETURN QUERY doesn't easily compose)
END;
$$;
