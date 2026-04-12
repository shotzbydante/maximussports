-- ═══════════════════════════════════════════════════════════════════
-- Migration: Add team_adds_since_limit to profiles table
--
-- Purpose: Tracks how many "replacement" team adds a free user has
-- made after reaching the 3-team limit. Resets when they drop below 3.
-- Used by /api/teams/pin endpoint for server-side limit enforcement.
--
-- Safe to run on existing tables — defaults to 0 for all users.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS team_adds_since_limit integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.team_adds_since_limit IS
  'Tracks replacement team adds after hitting the free-tier 3-team cap. '
  'Resets to 0 when team count drops below 3. Used by /api/teams/pin.';
