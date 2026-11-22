/**
 * GET /api/nfl/public-week
 *
 * The NFL week for the logged-out home page: every game with its score or
 * lines and its biggest position-group matchups, and the top three picks in full. Calls on the other games are for
 * members and are not in this response at all (see api/_lib/nflPublicWeek.js).
 *
 * The week turns over at 5 AM Eastern on Tuesday. Cached at the edge for a
 * minute, so a busy home page costs one function run a minute.
 */

import { getPublicWeek } from '../_lib/nflPublicWeek.js';

const EMPTY = {
  ok: false, week: null, seasonType: null, seasonYear: null, label: null, phase: null,
  counts: { live: 0, upcoming: 0, final: 0 }, games: [], featured: 0, locked: 0,
  byeTeams: [], rollsAt: null, nextLabel: null,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await getPublicWeek();
    // Scores move while games are on; the rest of the week a longer hold is fine.
    const hold = body.counts?.live > 0 ? 30 : 120;
    res.setHeader('Cache-Control', `public, s-maxage=${hold}, stale-while-revalidate=${hold * 5}`);
    return res.status(200).json(body);
  } catch (err) {
    console.error('[nfl/public-week]', err?.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...EMPTY, generatedAt: new Date().toISOString() });
  }
}
