import { TEAMS } from '../data/teams.js';

/**
 * Build a canonical matchup slug from two team slugs.
 * Alphabetical ordering ensures one canonical URL per pair.
 * Format: {teamA}-vs-{teamB}-prediction
 */
export function buildMatchupSlug(slugA, slugB) {
  const sorted = [slugA, slugB].sort();
  return `${sorted[0]}-vs-${sorted[1]}-prediction`;
}

/**
 * Parse a matchup slug into two team slugs.
 * Handles the "-prediction" suffix and the "-vs-" separator.
 * Returns { homeSlug, awaySlug, homeTeam, awayTeam } or null if invalid.
 */
export function parseMatchupSlug(matchupSlug) {
  if (!matchupSlug) return null;
  const clean = matchupSlug
    .replace(/-prediction$/, '')
    .replace(/-betting-intelligence$/, '')
    .replace(/-betting-trends$/, '')
    .replace(/-picks$/, '')
    .replace(/-preview$/, '');

  const vsIdx = clean.indexOf('-vs-');
  if (vsIdx < 0) return null;

  const slugA = clean.slice(0, vsIdx);
  const slugB = clean.slice(vsIdx + 4);

  const teamA = TEAMS.find((t) => t.slug === slugA);
  const teamB = TEAMS.find((t) => t.slug === slugB);

  if (!teamA || !teamB) return null;

  return {
    homeSlug: slugA,
    awaySlug: slugB,
    homeTeam: teamA,
    awayTeam: teamB,
  };
}

/**
 * Build a display-friendly matchup title.
 * e.g. "Duke Blue Devils vs North Carolina Tar Heels"
 */
export function matchupDisplayTitle(teamA, teamB) {
  return `${teamA.name} vs ${teamB.name}`;
}

/**
 * Get a short version of a team name (last word or mascot).
 * e.g. "Duke Blue Devils" → "Duke"
 */
export function shortTeamName(name) {
  if (!name) return '';
  const words = name.split(/\s+/);
  if (words.length <= 2) return words[0];
  return words[0];
}
