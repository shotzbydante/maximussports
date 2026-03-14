-- Bracketology: user bracket picks storage
-- Supports multiple brackets per user per year (extensible),
-- but v1 UI only manages one active bracket.

CREATE TABLE IF NOT EXISTS user_brackets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year          integer NOT NULL DEFAULT 2026,
  bracket_name  text NOT NULL DEFAULT 'My Bracket',
  picks         jsonb NOT NULL DEFAULT '{}',
  pick_origins  jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by user + year
CREATE INDEX IF NOT EXISTS idx_user_brackets_user_year
  ON user_brackets (user_id, year);

-- RLS
ALTER TABLE user_brackets ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own brackets
CREATE POLICY "Users can manage own brackets"
  ON user_brackets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_brackets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_brackets_updated_at
  BEFORE UPDATE ON user_brackets
  FOR EACH ROW
  EXECUTE FUNCTION update_user_brackets_updated_at();
