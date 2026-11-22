/**
 * GET /api/nfl/talent — roster talent for one team or one game.
 *
 *   ?team=49ers                  one team: ranks, position groups, units, starters
 *   ?away=vikings&home=49ers     both teams plus the unit matchups each way
 *
 * Context only. Talent grades put no weight on any fair price.
 */

import { getNflTeamBySlug } from '../../src/sports/nfl/teams.js';
import { getNflTalent, getNflTalentLeague } from '../_lib/nflTalent.js';
import { talentMatchups } from '../../src/features/nfl/picks/v2/talent.js';

const NOTE = 'Roster talent is context. It has not been tested against betting lines and moves no fair price.';

function view(league, slug) {
  const team = getNflTeamBySlug(String(slug || '').toLowerCase());
  const t = team ? league.teams[team.abbrev] : null;
  return t ? { slug: team.slug, name: team.name, nickname: team.nickname, ...t } : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { team, home, away } = req.query || {};
  if (!team && !(home && away)) return res.status(400).json({ error: 'Pass team, or home and away.' });

  const league = await getNflTalentLeague();
  if (!league) return res.status(200).json({ available: false, teams: [] });

  const base = {
    available: true, asOf: league.asOf, week: league.week, teamCount: league.teamCount,
    weights: league.weights, averages: league.averages, note: NOTE,
  };

  if (team) {
    const t = view(league, team);
    if (!t) return res.status(404).json({ error: 'Unknown team.' });
    return res.status(200).json({ ...base, teams: [t] });
  }

  const a = view(league, away);
  const h = view(league, home);
  if (!a || !h) return res.status(404).json({ error: 'Unknown team.' });
  const units = await getNflTalent();
  const matchup = units ? talentMatchups({ home: h.abbrev, away: a.abbrev, talent: units }) : null;
  return res.status(200).json({ ...base, away: a.slug, home: h.slug, teams: [a, h], matchup });
}
