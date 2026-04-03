/**
 * GET /api/mlb/team/schedule?teamId=XX — MLB team schedule via ESPN API.
 * Returns shaped events with opponent info, scores, gamecast URLs.
 */

import { createCache, coalesce } from '../../_cache.js';
import { enrichGamesWithOdds } from '../live/_odds.js';
import { espnIdToSlug } from '../live/_normalize.js';
import { MLB_TEAMS } from '../../../src/sports/mlb/teams.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams';

// Map ESPN abbreviation (uppercase) → our slug (lowercase)
const abbrevToSlug = Object.fromEntries(
  MLB_TEAMS.map(t => [t.abbrev.toUpperCase(), t.slug])
);
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

  // Extract broadcast/network — ESPN schedule API nests broadcasts in multiple possible locations
  const broadcasts = comp?.broadcasts || comp?.geoBroadcasts || ev?.competitions?.[0]?.broadcasts || [];
  let network = null;
  if (Array.isArray(broadcasts) && broadcasts.length > 0) {
    // broadcasts can be: [{ names: ['ESPN'] }] or [{ media: { shortName: 'ESPN' }, ... }]
    const first = broadcasts[0];
    if (first?.names?.[0]) {
      network = first.names[0];
    } else if (first?.media?.shortName) {
      network = first.media.shortName;
    } else if (typeof first === 'string') {
      network = first;
    }
  }

  // Extract odds/betting data — ESPN schedule API includes odds on competition object
  const espnOdds = comp?.odds?.[0] || null;
  let spread = null;
  let spreadDisplay = null;
  let total = null;
  let totalDisplay = null;

  if (espnOdds) {
    if (espnOdds.spread != null) {
      const s = parseFloat(espnOdds.spread);
      if (!isNaN(s)) { spread = s; spreadDisplay = s > 0 ? `+${s}` : `${s}`; }
    }
    if (espnOdds.overUnder != null) {
      const t = parseFloat(espnOdds.overUnder);
      if (!isNaN(t)) { total = t; totalDisplay = `O/U ${t}`; }
    }
  }

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
    network,
    spread,
    spreadDisplay,
    total,
    totalDisplay,
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
      let events = rawEvents.map((ev) => shapeEvent(ev, teamId));
      const teamRecord = data?.team?.recordSummary || null;

      // Enrich upcoming games with odds from The Odds API
      // Convert schedule events to the canonical shape enrichGamesWithOdds expects,
      // then merge odds back into the schedule event shape.
      const teamSlug = espnIdToSlug[String(teamId)] || null;
      if (teamSlug) {
        try {
          const upcoming = events.filter(e => !e.isFinal);
          if (upcoming.length > 0) {
            // Build canonical game objects for odds matching
            const canonicalGames = upcoming.map(ev => {
              const oppSlug = abbrevToSlug[ev.opponentAbbrev?.toUpperCase()] || ev.opponentAbbrev?.toLowerCase() || '';
              return {
                gameId: ev.id,
                teams: {
                  home: { slug: ev.homeAway === 'home' ? teamSlug : oppSlug },
                  away: { slug: ev.homeAway === 'away' ? teamSlug : oppSlug },
                },
                market: {},
              };
            });
            const enriched = await enrichGamesWithOdds(canonicalGames);
            // Merge odds back into schedule events
            const oddsMap = new Map();
            for (const g of enriched) {
              if (g.market?.pregameSpread != null || g.market?.pregameTotal != null) {
                oddsMap.set(g.gameId, g);
              }
            }
            events = events.map(ev => {
              const enrichedGame = oddsMap.get(ev.id);
              if (!enrichedGame) return ev;
              const sp = enrichedGame.market?.pregameSpread;
              const tot = enrichedGame.market?.pregameTotal;
              return {
                ...ev,
                spread: sp ?? ev.spread,
                spreadDisplay: sp != null ? (sp > 0 ? `+${sp}` : `${sp}`) : ev.spreadDisplay,
                total: tot ?? ev.total,
                totalDisplay: tot != null ? `O/U ${tot}` : ev.totalDisplay,
              };
            });
          }
        } catch { /* odds enrichment is best-effort */ }
      }

      return { events, teamRecord };
    });

    cache.set(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ events: [], error: err?.message });
  }
}
