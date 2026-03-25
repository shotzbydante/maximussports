/**
 * Shared email content filters for NCAA Men's Tournament.
 *
 * Ensures all email products only include teams/content from the
 * current NCAA Men's Basketball Tournament field.
 * Excludes: women's teams, NIT, CBI, other postseasons.
 *
 * Uses tournamentHelpers as the source of truth for eligible teams.
 */

import { isTournamentTeam, isTournamentWeek } from '../../utils/tournamentHelpers.js';
import { getTeamSlug } from '../../utils/teamSlug.js';

/* ── Women's / non-men's rejection ──────────────────────────── */

const WOMEN_RE = /\bwomen'?s?\b|\bwomens\b|\bwbb\b|\bncaaw\b|\blady\b|\bwnba\b/i;
const NIT_RE = /\bnit\b|\bcbi\b|\bwnit\b|\bcit\b/i;

function isWomensContent(text) {
  return WOMEN_RE.test(text || '');
}

function isNitContent(text) {
  return NIT_RE.test(text || '');
}

/* ── Team eligibility ───────────────────────────────────────── */

/**
 * Check if a team name or slug is in the current men's tournament field.
 * Returns true if the team is confirmed in the field, false otherwise.
 */
export function isEligibleTournamentTeam(nameOrSlug) {
  if (!nameOrSlug) return false;
  // Direct check via tournamentHelpers
  if (isTournamentTeam(nameOrSlug)) return true;
  // Try slug resolution
  const slug = getTeamSlug(nameOrSlug);
  if (slug && isTournamentTeam(slug)) return true;
  return false;
}

/* ── Content filters ────────────────────────────────────────── */

/**
 * Filter ATS leaders/teams to only tournament-eligible teams.
 * @param {Array} teams — ATS team objects with .name or .team
 * @returns {Array} filtered to tournament field only
 */
export function filterTournamentTeams(teams) {
  if (!Array.isArray(teams)) return [];
  if (!isTournamentWeek()) return teams; // outside tournament, allow all
  return teams.filter(t => {
    const name = t.name || t.team || '';
    if (isWomensContent(name)) return false;
    return isEligibleTournamentTeam(name);
  });
}

/**
 * Filter game objects to only tournament-relevant games.
 * @param {Array} games — game objects with awayTeam/homeTeam or winner/loser
 * @returns {Array} filtered games
 */
export function filterTournamentGames(games) {
  if (!Array.isArray(games)) return [];
  if (!isTournamentWeek()) return games;
  return games.filter(g => {
    const away = g.awayTeam || g.loser || '';
    const home = g.homeTeam || g.winner || '';
    return isEligibleTournamentTeam(away) || isEligibleTournamentTeam(home);
  });
}

/**
 * Filter headlines to tournament-relevant, men's-only content.
 * Rejects women's, NIT, and non-tournament filler.
 * @param {Array} headlines — news items with .title
 * @returns {Array} filtered headlines
 */
export function filterTournamentHeadlines(headlines) {
  if (!Array.isArray(headlines)) return [];
  return headlines.filter(h => {
    const title = h.title || '';
    if (isWomensContent(title)) return false;
    if (isNitContent(title)) return false;
    return true;
  });
}

/**
 * Filter model signals/picks to tournament-eligible matchups.
 * @param {Array} signals — pick objects with .matchup, .homeTeam, .awayTeam
 * @returns {Array} filtered signals
 */
export function filterTournamentSignals(signals) {
  if (!Array.isArray(signals)) return [];
  if (!isTournamentWeek()) return signals;
  return signals.filter(s => {
    const matchup = s.matchup || '';
    if (isWomensContent(matchup)) return false;
    const away = s.awayTeam || s.team1 || '';
    const home = s.homeTeam || s.team2 || '';
    return isEligibleTournamentTeam(away) || isEligibleTournamentTeam(home);
  });
}
