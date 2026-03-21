/**
 * GET /api/mlb/team/schedule?teamId=XX — MLB team schedule via ESPN API.
 * Returns shaped events with opponent info, scores, gamecast URLs.
 */

import { createCache, coalesce } from '../../_cache.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams';
const cache = createCache(5 * 60 * 1000);

function getGameStatus(status) {
  const state = status?.type?.state;
  if (state === 'post') return 'final';
  if (state === 'in') return 'in_progress';
  return 'scheduled';
}

function shapeEvent(ev, teamId) {
  const comp = ev?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const us = competitors.find((c) => String(c.id) === String(teamId));
  const them = competitors.find((c) => String(c.id) !== String(teamId));
  const status = comp?.status || ev?.status;
  const gameStatus = getGameStatus(status);

  let gamecastUrl = null;
  if (Array.isArray(ev.links)) {
    const gc = ev.links.find((l) => l.href && Array.isArray(l.rel) && l.rel.some((r) => r === 'gamecast' || r === 'summary'));
    if (gc) gamecastUrl = gc.href;
  }
  if (!gamecastUrl && ev.id) {
    gamecastUrl = `https://www.espn.com/mlb/game/_/gameId/${ev.id}`;
  }

  const seasonType = ev.season?.type ?? comp?.season?.type ?? null;

  return {
    id: ev.id,
    date: ev.date || comp?.date || null,
    opponent: them?.team?.displayName || them?.team?.shortDisplayName || 'TBD',
    opponentAbbrev: them?.team?.abbreviation || null,
    opponentLogo: them?.team?.logo || null,
    opponentId: them?.id || null,
    homeAway: us?.homeAway || 'home',
    ourScore: us?.score != null ? Number(us.score) : null,
    oppScore: them?.score != null ? Number(them.score) : null,
    isFinal: gameStatus === 'final',
    gameStatus,
    gamecastUrl,
    venue: comp?.venue?.fullName || null,
    network: comp?.broadcasts?.[0]?.names?.[0] || null,
    seasonType,
    seasonTypeName: seasonType === 1 ? 'preseason' : seasonType === 2 ? 'regular' : seasonType === 3 ? 'postseason' : null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId required' });

  const cacheKey = `mlb:schedule:${teamId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const result = await coalesce(cacheKey, async () => {
      const year = new Date().getFullYear();
      const url = `${ESPN_BASE}/${teamId}/schedule?season=${year}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`ESPN MLB schedule: ${r.status}`);
      const data = await r.json();
      const rawEvents = data?.events || [];
      const events = rawEvents.map((ev) => shapeEvent(ev, teamId));
      const teamRecord = data?.team?.recordSummary || null;
      return { events, teamRecord };
    });

    cache.set(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ events: [], error: err?.message });
  }
}
