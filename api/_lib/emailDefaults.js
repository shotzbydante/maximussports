/**
 * Default email preferences — shared between profile creation and the daily
 * email engine so the opt-in defaults are always consistent.
 *
 * ─── Subscription Model (v2) ────────────────────────────────────────────────
 *
 * GLOBAL (Maximus Sports)
 *   global_briefing        — Daily Global Intel Briefing
 *
 * MLB
 *   mlb_briefing           — Daily MLB Briefing
 *   mlb_team_digest        — Daily MLB Team Digest (pinned teams)
 *   mlb_picks              — Daily MLB Maximus's Picks
 *
 * NCAAM
 *   ncaam_briefing         — Daily NCAAM Briefing
 *   ncaam_team_digest      — Daily NCAAM Team Digest (pinned teams)
 *   ncaam_picks            — Daily NCAAM Maximus's Picks
 *
 * Pattern for future sports:
 *   [sport]_briefing, [sport]_team_digest, [sport]_picks
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DEFAULT_EMAIL_PREFS = {
  // Global
  global_briefing:     true,

  // MLB
  mlb_briefing:        true,
  mlb_team_digest:     false,
  mlb_picks:           false,

  // NCAAM (default off during MLB season / offseason)
  ncaam_briefing:      false,
  ncaam_team_digest:   false,
  ncaam_picks:         false,
};

/**
 * Legacy → v2 preference key mapping.
 * Used at read-time to migrate existing user preferences transparently.
 */
const LEGACY_KEY_MAP = {
  briefing:    'global_briefing',     // "Daily AI Briefing" → "Daily Global Intel Briefing"
  teamAlerts:  'ncaam_team_digest',   // "Pinned Teams Alerts" → "Daily NCAAM Team Digest"
  oddsIntel:   'ncaam_picks',         // "Odds & ATS Intel" → "Daily NCAAM Maximus's Picks"
  newsDigest:  'mlb_briefing',        // "Breaking News Digest" → "Daily MLB Briefing"
  teamDigest:  'mlb_team_digest',     // "Team Digest" → "Daily MLB Team Digest"
};

/**
 * Migrate legacy preference keys to v2 keys at read-time.
 * Returns a new object with only v2 keys. If no legacy keys are found,
 * returns the input unchanged. Never mutates the input.
 *
 * Migration logic:
 *   - If a legacy key exists AND the corresponding v2 key does NOT,
 *     copy the legacy value to the v2 key.
 *   - If both exist, v2 key wins (user already migrated).
 *   - Legacy-only keys (gameDayAlerts, bracketIntel, teamDigestTeams) are dropped.
 *   - ncaam_briefing inherits from briefing if not explicitly set.
 */
export function migratePreferences(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_EMAIL_PREFS };

  const hasLegacy = Object.keys(LEGACY_KEY_MAP).some(k => k in raw);
  if (!hasLegacy) return raw;

  const migrated = { ...raw };

  for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (oldKey in migrated && !(newKey in migrated)) {
      migrated[newKey] = migrated[oldKey];
    }
    delete migrated[oldKey];
  }

  // ncaam_briefing inherits from old briefing value if not set
  if (!('ncaam_briefing' in migrated) && 'briefing' in raw) {
    migrated.ncaam_briefing = raw.briefing;
  }

  // Clean up deprecated keys
  delete migrated.gameDayAlerts;
  delete migrated.bracketIntel;
  delete migrated.teamDigestTeams;

  return migrated;
}

/**
 * Merge stored preferences with defaults, applying migration if needed.
 * This is the canonical way to read a user's effective preferences.
 */
export function resolvePreferences(stored) {
  const migrated = migratePreferences(stored);
  return { ...DEFAULT_EMAIL_PREFS, ...migrated };
}
