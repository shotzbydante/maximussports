/**
 * Which sport a followed team belongs to.
 *
 * user_teams stores a bare slug with no sport column, so the sport is worked
 * out from the slug. NFL slugs are nicknames ("chiefs"), MLB slugs are short
 * codes ("nyy") and college slugs are school names, and the three sets do not
 * overlap (teamSports.test.js checks). NBA is left out on purpose: its slugs
 * are short codes that collide with MLB ("bos"), so an NBA follow cannot be
 * told from an MLB one until user_teams records the sport.
 */
import { TEAMS } from '../data/teams';
import { MLB_TEAMS } from '../sports/mlb/teams';
import { NFL_TEAMS, getNflLogoUrl } from '../sports/nfl/teams';
import { getMlbEspnLogoUrl } from './espnMlbLogos';

const nfl = NFL_TEAMS.map((t) => ({ slug: t.slug, name: t.name, group: t.division, abbrev: t.abbrev, sport: 'nfl', logo: getNflLogoUrl(t.slug) }));
const mlb = MLB_TEAMS.map((t) => ({ slug: t.slug, name: t.name, group: t.division, abbrev: t.abbrev, sport: 'mlb', logo: getMlbEspnLogoUrl(t.slug) }));
// College logos come from the TeamLogo component, which needs the full team record.
const ncaam = TEAMS.map((t) => ({ slug: t.slug, name: t.name, group: t.conference, sport: 'ncaam', logo: null, record: t }));

/** Sports a user can follow teams in, football first. */
export const FOLLOW_SPORTS = [
  { id: 'nfl',   label: 'NFL',                teams: nfl,   search: 'Search NFL teams' },
  { id: 'ncaam', label: 'College basketball', teams: ncaam, search: 'Search by school or conference' },
  { id: 'mlb',   label: 'MLB',                teams: mlb,   search: 'Search MLB teams' },
];

const BY_SLUG = new Map();
// Later sports do not overwrite earlier ones, so a clash would resolve to football first.
for (const sport of FOLLOW_SPORTS) for (const team of sport.teams) if (!BY_SLUG.has(team.slug)) BY_SLUG.set(team.slug, team);

/** { slug, name, group, sport, logo } or null for a slug we do not know. */
export function teamBySlug(slug) {
  return BY_SLUG.get(slug) || null;
}

/** 'nfl' | 'ncaam' | 'mlb' | null */
export function sportOfSlug(slug) {
  return BY_SLUG.get(slug)?.sport || null;
}

/** Split a mixed list of slugs by sport: { nfl: [], ncaam: [], mlb: [] }. Unknown slugs are dropped. */
export function splitBySport(slugs = []) {
  const out = { nfl: [], ncaam: [], mlb: [] };
  for (const slug of slugs) {
    const sport = sportOfSlug(slug);
    if (sport) out[sport].push(slug);
  }
  return out;
}
