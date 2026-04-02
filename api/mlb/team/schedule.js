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

/** Extract numeric score from ESPN competitor — handles both string and object formats */
function extractScore(competitor) {
  if (competitor?.score == null) return null;
  // Direct string/number: "5" or 5
  if (typeof competitor.score === 'string' || typeof competitor.score === 'number') {
    const n = Number(competitor.score);
    return isNaN(n) ? null : n;
  }
  // Object format: { value: 5, displayValue: "5" }
  if (typeof competitor.score === 'object') {
    const v = competitor.score.value ?? competitor.score.displayValue;
    if (v != null) { const n = Number(v); return isNaN(n) ? null : n; }
  }
  return null;
}

function shapeEvent(ev, teamId) {
  const comp = ev?.competitions?.[0];
  const competitors = comp?.competitors || [];
  // Match by team ID — ESPN uses string IDs
  const teamIdStr = String(teamId);
  const us = competitors.find((c) => String(c.id) === teamIdStr || String(c.team?.id) === teamIdStr);
  const them = competitors.find((c) => c !== us);
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

  // Extract scores robustly
  const ourScore = extractScore(us);
  const oppScore = extractScore(them);

  // Determine winner for final games
  const isWin = gameStatus === 'final' && ourScore != null && oppScore != null && ourScore > oppScore;
  const isLoss = gameStatus === 'final' && ourScore != null && oppScore != null && ourScore < oppScore;

  return {
    id: ev.id,
    date: ev.date || comp?.date || null,
    opponent: them?.team?.displayName || them?.team?.shortDisplayName || 'TBD',
    opponentAbbrev: them?.team?.abbreviation || null,
    opponentLogo: them?.team?.logo || null,
    opponentId: them?.id || null,
    homeAway: us?.homeAway || 'home',
    ourScore,
    oppScore,
    isWin,
    isLoss,
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

  const teamId = new URL(req.url, 'http://localhost').searchParams.get('teamId');
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
