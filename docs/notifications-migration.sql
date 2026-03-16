-- ============================================================================
-- Notifications Table Migration
-- ============================================================================
-- Stores in-app notifications (new followers, etc.)
-- Apply via: Supabase Dashboard → SQL Editor → paste + run
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  actor_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  data        jsonb       DEFAULT '{}',
  is_read     boolean     DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;

-- RLS: users can read/update their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Inserts are handled by DB triggers (on follow) using SECURITY DEFINER functions
