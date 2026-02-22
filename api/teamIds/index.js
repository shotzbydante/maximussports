/**
 * Vercel Serverless: ESPN teams list → slug → team ID map.
 * GET /api/teamIds
 * Returns { slugToId: { "michigan-wolverines": "130", ... } }.
 * Matches ESPN teams to teams.js slugs via getTeamSlug(displayName).
 */

import { getTeamSlug } from '../../../src/utils/teamSlug.js';

const ESPN_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const espnRes = await fetch(ESPN_TEAMS_URL);
    if (!espnRes.ok) {
      throw new Error(`ESPN fetch failed: ${espnRes.status}`);
    }
    const data = await espnRes.json();

    const slugToId = {};
    const sports = data?.sports || [];
    for (const sport of sports) {
      const leagues = sport?.leagues || [];
      for (const league of leagues) {
        const teams = league?.teams || [];
        for (const t of teams) {
          const team = t?.team || t;
          const id = team?.id ? String(team.id) : null;
          const displayName = team?.displayName || [team?.location, team?.name].filter(Boolean).join(' ');
          const slug = getTeamSlug(displayName);
          if (id && slug) slugToId[slug] = id;
        }
      }
    }

    res.json({ slugToId });
  } catch (err) {
    console.error('TeamIds API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch team IDs' });
  }
}
