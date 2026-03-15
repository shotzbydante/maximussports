-- ============================================================================
-- Social Graph + Viral Growth Migration
-- ============================================================================
-- Extends the existing social infrastructure with contact invites, referral
-- tracking, friend activity, and leaderboard support.
--
-- Prerequisites: social-profile-migration.sql must be run first.
-- This migration is additive-only — no existing columns are modified.
-- ============================================================================

-- ── 1. Contact invites table ────────────────────────────────────────────────
-- Tracks SMS invitations sent by users to non-Maximus contacts.
-- Phone numbers are stored as SHA-256 hashes only — never raw.

CREATE TABLE IF NOT EXISTS contact_invites (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_hash      text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  accepted_at     timestamptz DEFAULT NULL,

  CONSTRAINT contact_invites_unique UNIQUE (inviter_user_id, phone_hash)
);

CREATE INDEX IF NOT EXISTS idx_contact_invites_inviter ON contact_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_invites_phone ON contact_invites(phone_hash);

-- ── 2. Referral tracking table ──────────────────────────────────────────────
-- Tracks referral link attributions from signup through completion.

CREATE TABLE IF NOT EXISTS referral_tracking (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code   text NOT NULL,
  invite_sent_at  timestamptz DEFAULT now(),
  signup_at       timestamptz DEFAULT NULL,
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'completed')),

  CONSTRAINT referral_tracking_unique UNIQUE (referrer_id, referral_code)
);

CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_tracking(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_code ON referral_tracking(referral_code);

-- ── 3. Friend activity log ──────────────────────────────────────────────────
-- Stores activity events for the friends feed.
-- Types: pick, bracket_update, upset_hit, win_streak

CREATE TABLE IF NOT EXISTS friend_activity (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type   text NOT NULL CHECK (activity_type IN ('pick', 'bracket_update', 'upset_hit', 'win_streak')),
  title           text NOT NULL,
  subtitle        text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_friend_activity_user ON friend_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_friend_activity_created ON friend_activity(created_at DESC);

-- ── 4. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE contact_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "contact_invites_select_own"
  ON contact_invites FOR SELECT
  USING (auth.uid() = inviter_user_id);

CREATE POLICY IF NOT EXISTS "contact_invites_insert_own"
  ON contact_invites FOR INSERT
  WITH CHECK (auth.uid() = inviter_user_id);

ALTER TABLE referral_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "referral_select_own"
  ON referral_tracking FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY IF NOT EXISTS "referral_insert_own"
  ON referral_tracking FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);

ALTER TABLE friend_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "friend_activity_select_following"
  ON friend_activity FOR SELECT
  USING (
    user_id IN (
      SELECT following_user_id FROM follows WHERE follower_user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY IF NOT EXISTS "friend_activity_insert_own"
  ON friend_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── 5. Add friends_count to profiles (denormalized for fast reads) ──────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friends_count integer DEFAULT 0;
