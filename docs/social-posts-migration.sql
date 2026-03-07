-- ============================================================
-- Social Posts — Supabase migration
-- Run once in the Supabase SQL editor.
-- ============================================================

-- 1. Core table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Platform / lifecycle
  platform                text        NOT NULL DEFAULT 'instagram',
  lifecycle_status        text        NOT NULL DEFAULT 'draft'
                            CHECK (lifecycle_status IN ('draft','pending','posted','failed')),

  -- Content metadata
  content_type            text,
  title                   text,

  -- Caption — both the live version and the immutable snapshot
  caption                 text,
  caption_snapshot        text,

  -- Image — both the live URL and the immutable snapshot URL
  image_url               text,
  image_snapshot_url      text,
  asset_version           text,

  -- Timestamps
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  posted_at               timestamptz,

  -- Instagram API identifiers
  creation_id             text,
  published_media_id      text,

  -- Status / error detail
  status_detail           text,
  error_message           text,

  -- Source context (for audit trail)
  team_slug               text,
  team_name               text,
  content_studio_section  text,
  generated_by            text,
  template_type           text,

  -- Audit metadata
  triggered_by            text,
  route_used              text,
  response_stage          text
);

-- 2. Updated-at trigger
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_social_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_posts_updated_at ON social_posts;

CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_social_posts_updated_at();

-- 3. Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_posts_platform         ON social_posts (platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_lifecycle_status ON social_posts (lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at       ON social_posts (created_at DESC);

-- 4. Row-Level Security
-- ─────────────────────────────────────────────────────────────
-- Enable RLS so anonymous users cannot read post history.
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no policy needed for server-side code.
-- The only RLS policy needed is a read policy for the admin frontend session.
-- Replace the email below with your Supabase auth user email / user ID as needed.
CREATE POLICY "admin can read social posts"
  ON social_posts
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'dantedicicco@gmail.com'
  );

CREATE POLICY "service role full access"
  ON social_posts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Supabase Storage bucket
-- ─────────────────────────────────────────────────────────────
-- Run this once in Storage → New bucket, OR via the Supabase JS admin client.
-- Public bucket so Instagram API can fetch the image URL server-to-server.
--
-- If using the dashboard: Storage → New bucket → Name: social-assets → Public: ON
--
-- If using SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-assets', 'social-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — allow service role to upload/download freely.
CREATE POLICY "service role storage full access"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'social-assets')
  WITH CHECK (bucket_id = 'social-assets');
