-- ============================================================
-- Maximus Sports — Subscription / Billing Schema Migration
-- ============================================================
-- Apply via: Supabase Dashboard → SQL Editor → paste + run
-- Safe to run on existing databases — uses IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS guards throughout.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Add subscription fields to profiles table
--
--    All columns use safe defaults so existing rows are
--    unaffected (they become free-plan users automatically).
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_tier              text        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text        DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_last4   text,
  ADD COLUMN IF NOT EXISTS payment_method_brand   text;


-- ────────────────────────────────────────────────────────────
-- 2. Add a check constraint so plan_tier stays valid
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_plan_tier_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_plan_tier_check
        CHECK (plan_tier IN ('free', 'pro'));
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- 3. Index for fast Stripe customer_id lookups
--    (webhook reconciliation: stripe_customer_id → user row)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 4. RLS note
--    The existing "profiles: users manage own row" policy
--    (FOR ALL USING id = auth.uid()) already covers these new
--    columns for user reads/writes.
--
--    The webhook endpoint uses the SERVICE ROLE key (bypasses
--    RLS) to update subscription fields server-side — this is
--    intentional and correct.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 5. Backfill: set all existing profiles to free plan
--    (safe no-op if column just defaulted to 'free')
-- ────────────────────────────────────────────────────────────

UPDATE profiles
  SET plan_tier = 'free'
  WHERE plan_tier IS NULL OR plan_tier NOT IN ('free', 'pro');


-- ────────────────────────────────────────────────────────────
-- 6. user_pins table (if not already applied from rls.sql)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_pins (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_slug  text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, team_slug)
);

ALTER TABLE user_pins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_pins' AND policyname = 'user_pins: users manage own rows'
  ) THEN
    CREATE POLICY "user_pins: users manage own rows"
      ON user_pins FOR ALL
      USING      (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_pins_user_id ON user_pins (user_id);
