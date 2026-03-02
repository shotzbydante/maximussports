-- ============================================================
-- Maximus Sports — Supabase Row Level Security (RLS) Policies
-- ============================================================
-- Apply via: Supabase Dashboard → SQL Editor → paste + run
-- Or via Supabase CLI: supabase db push
--
-- Prerequisite: Auth is enabled and auth.uid() is available.
-- All tables must have RLS enabled before policies take effect.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. profiles
--    Users may read/write only their own profile row.
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: users manage own row"
  ON profiles
  FOR ALL
  USING      (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 2. user_teams
--    Users may read/write only rows where user_id = their uid.
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_teams: users manage own rows"
  ON user_teams
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 3. user_preferences
--    Users may read/write only their own preference row.
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences: users manage own row"
  ON user_preferences
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 4. user_pins
--    Cross-device pinned teams sync.
--    Schema:
--      id         uuid  DEFAULT gen_random_uuid() PRIMARY KEY
--      user_id    uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
--      team_slug  text  NOT NULL
--      created_at timestamptz DEFAULT now()
--      UNIQUE (user_id, team_slug)
-- ────────────────────────────────────────────────────────────

-- Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS user_pins (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_slug  text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, team_slug)
);

ALTER TABLE user_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_pins: users manage own rows"
  ON user_pins
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- Optional: index for fast per-user lookups
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_teams_user_id    ON user_teams    (user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_uid  ON user_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_user_pins_user_id     ON user_pins     (user_id);
