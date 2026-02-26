/**
 * ESPN Bubble Watch teams — re-export from shared data/teams.js (single source of truth).
 * logo: /logos/<slug>.svg (monogram fallback if missing)
 */
import { TEAMS as TEAMS_LIST } from '../../data/teams.js';

export const TEAMS = TEAMS_LIST;

export function getTeamBySlug(slug) {
  return TEAMS.find((t) => t.slug === slug);
}

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];

export function getTeamsGroupedByConference() {
  const byConf = {};
  for (const team of TEAMS) {
    if (!byConf[team.conference]) byConf[team.conference] = {};
    const tier = team.oddsTier;
    if (!byConf[team.conference][tier]) byConf[team.conference][tier] = [];
    byConf[team.conference][tier].push(team);
  }
  for (const conf of Object.keys(byConf)) {
    for (const tier of TIER_ORDER) {
      if (byConf[conf][tier]) byConf[conf][tier].sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  return CONF_ORDER.map((conf) => ({
    conference: conf,
    tiers: byConf[conf] || {},
  }));
}
