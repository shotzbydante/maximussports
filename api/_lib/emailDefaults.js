/**
 * Default email preferences — shared between profile creation and the daily
 * email engine so the opt-in defaults are always consistent.
 *
 * Users who have never explicitly set preferences are treated as opted-in to
 * briefing, teamAlerts, and newsDigest. This matches the frontend DEFAULT_PREFS
 * shown in the onboarding wizard (src/pages/Settings.jsx).
 */
export const DEFAULT_EMAIL_PREFS = {
  briefing:        true,
  teamAlerts:      true,
  oddsIntel:       false,
  newsDigest:      true,
  teamDigest:      false,
  teamDigestTeams: [],
};
