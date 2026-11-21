/**
 * GET /api/nfl/injuries            → counts for every team
 * GET /api/nfl/injuries?team=slug  → that team's full report
 */

import { getNflInjuries, summarizeTeamInjuries } from '../_lib/nflInjuries.js';
import { getNflTeamBySlug } from '../../src/sports/nfl/teams.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slug = String(req.query?.team || '').trim().toLowerCase();
  if (slug && !getNflTeamBySlug(slug)) return res.status(404).json({ error: 'Unknown team' });

  const data = await getNflInjuries();
  const base = { generatedAt: data.generatedAt, stale: !!data.stale, ok: data.ok !== false };

  if (slug) {
    const injuries = data.teams[slug] || [];
    return res.status(200).json({ ...base, team: slug, injuries, summary: summarizeTeamInjuries(injuries) });
  }

  const teams = {};
  for (const [teamSlug, list] of Object.entries(data.teams)) teams[teamSlug] = summarizeTeamInjuries(list);
  return res.status(200).json({ ...base, teams });
}
