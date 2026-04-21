/**
 * Sport-aware team logo resolver — the SINGLE source of truth for every UI
 * surface that renders a team logo.
 *
 * Why this exists:
 *   Slugs collide across sports — `bos` is both the Red Sox and the Celtics;
 *   `phi` is both the Phillies and the 76ers; `cle`, `atl`, `mia`, `det`,
 *   `min`, `tor`, `mil`, `hou` also collide. Any helper that resolves a logo
 *   from a slug ALONE (like getMlbEspnLogoUrl) is unsafe inside a
 *   sport-agnostic component and will leak cross-sport assets.
 *
 * Rule:
 *   The resolver ALWAYS requires the sport context. If the sport cannot be
 *   determined, the function returns `null` — it NEVER silently falls back
 *   to another sport's asset path.
 *
 * Usage:
 *   resolveTeamLogo({ sport: 'nba', slug: 'bos' })   → NBA Celtics logo
 *   resolveTeamLogo({ sport: 'mlb', slug: 'bos' })   → MLB Red Sox logo
 *   resolveTeamLogo({ sport: null, slug: 'bos' })    → null (never guess)
 *   resolveTeamLogo({ sport: 'nba', slug: 'xyz' })   → null
 *
 *   resolveTeamLogo({ sport, pick })                  // convenience form
 *       - picks carry `sport` stamped by the builder; falls back to
 *         explicit `sport` arg when missing
 */

import { getMlbEspnLogoUrl } from './espnMlbLogos.js';
import { NBA_ESPN_IDS } from '../sports/nba/teams.js';

const SUPPORTED_SPORTS = new Set(['mlb', 'nba']);

/** ESPN CDN URL for an NBA logo — 500px PNG. Returns null for unknown slugs. */
export function getNbaEspnLogoUrl(slug) {
  if (!slug) return null;
  const eid = NBA_ESPN_IDS[String(slug).toLowerCase()];
  if (!eid) return null;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${eid}.png`;
}

/**
 * The one resolver every UI surface should use.
 *
 * @param {object} args
 * @param {'mlb'|'nba'|null|undefined} args.sport — required context
 * @param {string|null} args.slug
 * @param {object} [args.team]  — convenience: team object with sport/slug/logo
 * @param {object} [args.pick]  — convenience: pick object with sport
 * @param {string} [args.fallbackUrl] — opt-in fallback when resolver returns
 *                                      null (e.g. an explicit `team.logo` URL
 *                                      that was stamped by the backend). The
 *                                      fallback is only used when the team
 *                                      object itself carries a logo URL —
 *                                      never a cross-sport asset.
 * @returns {string|null}
 */
export function resolveTeamLogo({ sport, slug, team, pick, fallbackUrl } = {}) {
  // Resolve sport context — explicit arg > pick.sport > team.sport
  const resolvedSport =
    (sport && String(sport).toLowerCase())
    || (pick?.sport && String(pick.sport).toLowerCase())
    || (team?.sport && String(team.sport).toLowerCase())
    || null;

  // Refuse to guess — no cross-sport fallback
  if (!resolvedSport || !SUPPORTED_SPORTS.has(resolvedSport)) {
    return fallbackUrl || null;
  }

  const resolvedSlug = slug || team?.slug || null;
  const teamLogo = team?.logo || null;

  if (resolvedSport === 'mlb') {
    const url = getMlbEspnLogoUrl(resolvedSlug);
    if (url) return url;
    // Only accept team.logo fallback if it looks like an MLB asset
    if (teamLogo && /logos\/mlb\/|\/mlb\//i.test(teamLogo)) return teamLogo;
    return fallbackUrl || null;
  }

  if (resolvedSport === 'nba') {
    const url = getNbaEspnLogoUrl(resolvedSlug);
    if (url) return url;
    // Only accept team.logo fallback if it looks like an NBA asset
    if (teamLogo && /teamlogos\/nba\/|\/nba\//i.test(teamLogo)) return teamLogo;
    return fallbackUrl || null;
  }

  return fallbackUrl || null;
}

/** True iff a logo exists for this sport+slug pair. */
export function hasTeamLogo({ sport, slug }) {
  return resolveTeamLogo({ sport, slug }) != null;
}
