-- ============================================================================
-- Username Uniqueness Migration
-- ============================================================================
-- Ensures usernames are globally unique at the database level.
-- Safe to run on an existing database — uses IF NOT EXISTS.
-- ============================================================================

-- Create a unique index on the username column (case-insensitive)
-- This prevents two users from having the same username regardless of casing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
  ON profiles (LOWER(username))
  WHERE username IS NOT NULL;
