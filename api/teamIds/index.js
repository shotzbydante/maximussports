/**
 * Vercel Serverless: ESPN teams list → slug → team ID map.
 * GET /api/teamIds
 * Returns { slugToId }. With ?debug=true adds missingSlugs, missingCount.
 * Uses TEAM_ID_OVERRIDES first, then ESPN list via getTeamSlug matching.
 */

import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { TEAMS } from '../../src/data/teams.js';

const ESPN_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400';

/** Hardcoded fallback map for ESPN team IDs when ESPN list fails to match. */
const TEAM_ID_OVERRIDES = {
  // Big Ten
  'michigan-wolverines': '130',
  'purdue-boilermakers': '2509',
  'illinois-fighting-illini': '356',
  'nebraska-cornhuskers': '158',
  'michigan-state-spartans': '127',
  'wisconsin-badgers': '275',
  'iowa-hawkeyes': '2294',
  'indiana-hoosiers': '84',
  'ohio-state-buckeyes': '194',
  'ucla-bruins': '26',
  'usc-trojans': '30',
  'washington-huskies': '264',
  // Other conferences / mid-majors
  'uconn-huskies': '41',
  'tulsa-golden-hurricane': '202',
  'liberty-flames': '2335',
  'mcneese-cowboys': '2377',
  'grand-canyon-lopes': '166',
  'dayton-flyers': '2126',
  'south-florida-bulls': '58',
  'belmont-bruins': '2057',
  'nevada-wolf-pack': '2440',
  'boise-state-broncos': '68',
  'santa-clara-broncos': '221',
  'new-mexico-lobos': '167',
  'vcu-rams': '2670',
};

const ALL_SLUGS = TEAMS.map((t) => t.slug);

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

  const debug = req.query?.debug === 'true' || req.query?.debug === '1';

  try {
    const slugToId = {};

    for (const [slug, id] of Object.entries(TEAM_ID_OVERRIDES)) {
      if (ALL_SLUGS.includes(slug)) slugToId[slug] = String(id);
    }

    const espnRes = await fetch(ESPN_TEAMS_URL);
    if (!espnRes.ok) {
      throw new Error(`ESPN fetch failed: ${espnRes.status}`);
    }
    const data = await espnRes.json();

    const sports = data?.sports || [];
    const unmatchedEspnTeams = [];

    for (const sport of sports) {
      const leagues = sport?.leagues || [];
      for (const league of leagues) {
        const teams = league?.teams || [];
        for (const t of teams) {
          const team = t?.team || t;
          const id = team?.id ? String(team.id) : null;
          if (!id) continue;

          const displayName = team?.displayName || '';
          const location = team?.location || '';
          const name = team?.name || '';
          const shortDisplayName = team?.shortDisplayName || '';

          const variants = [
            displayName,
            [location, name].filter(Boolean).join(' '),
            shortDisplayName,
            [shortDisplayName, name].filter(Boolean).join(' '),
          ].filter(Boolean);

          let slug = null;
          for (const v of variants) {
            slug = getTeamSlug(v);
            if (slug) break;
          }

          if (slug) {
            if (!slugToId[slug]) slugToId[slug] = id;
          } else {
            unmatchedEspnTeams.push({ id, displayName, location, name });
          }
        }
      }
    }

    const missingSlugs = ALL_SLUGS.filter((s) => !slugToId[s]);

    if (missingSlugs.length > 0) {
      console.debug('[teamIds] Missing slugs (add to TEAM_ID_OVERRIDES):', missingSlugs);
    }
    if (unmatchedEspnTeams.length > 0) {
      console.debug('[teamIds] Unmatched ESPN teams:', unmatchedEspnTeams);
    }

    const payload = { slugToId };
    if (debug) {
      payload.missingSlugs = missingSlugs;
      payload.missingCount = missingSlugs.length;
    }
    res.json(payload);
  } catch (err) {
    console.error('TeamIds API error:', err.message);
    const fallback = {};
    for (const s of ALL_SLUGS) {
      if (TEAM_ID_OVERRIDES[s]) fallback[s] = TEAM_ID_OVERRIDES[s];
    }
    const missingSlugs = ALL_SLUGS.filter((s) => !fallback[s]);
    const payload = { slugToId: fallback };
    if (debug) payload.missingSlugs = missingSlugs;
    res.status(200).json(payload);
  }
}
