/**
 * GET /api/mlb/live/homeFeed
 * Aggregated live intelligence for the MLB Home page.
 * Returns: liveNow, startingSoon, bestEdges, generatedAt
 * Source: ESPN MLB scoreboard + cached odds.
 */

import { createCache, coalesce } from '../../_cache.js';
import { MLB_TEAMS } from '../../../src/sports/mlb/teams.js';
import { rankLiveGames } from './_scoring.js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
const FETCH_TIMEOUT_MS = 8000;
const cache = createCache(30_000); // 30s fresh

const slugByEspnId = Object.fromEntries(MLB_TEAMS.map((t) => [String(t.slug), t]));
const espnIdToSlug = {};
const ESPN_IDS = {
  nyy:'10',bos:'2',tor:'14',tb:'30',bal:'1',cle:'5',min:'9',det:'6',cws:'4',kc:'7',
  hou:'18',sea:'12',tex:'13',laa:'3',oak:'11',atl:'15',nym:'21',phi:'22',mia:'28',wsh:'20',
  chc:'16',mil:'8',stl:'24',pit:'23',cin:'17',lad:'19',sd:'25',sf:'26',ari:'29',col:'27',
};
for (const [slug, eid] of Object.entries(ESPN_IDS)) espnIdToSlug[eid] = slug;

function resolveTeam(comp) {
  const t = comp?.team || {};
  const eid = String(t.id || comp?.id || '');
  const slug = espnIdToSlug[eid] || null;
  const meta = slug ? slugByEspnId[slug] : null;
  return {
    slug,
    name: meta?.name || t.displayName || t.shortDisplayName || 'TBD',
    abbrev: meta?.abbrev || t.abbreviation || '',
    logo: t.logo || (slug ? `https://a.espncdn.com/i/teamlogos/mlb/500/${eid}.png` : null),
    score: comp?.score != null ? Number(comp.score) : null,
  };
}

function normalizeEvent(ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;

  const status = comp.status || ev.status || {};
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';

  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');

  const network = comp.broadcasts?.[0]?.names?.[0] || null;
  let gamecastUrl = null;
  if (Array.isArray(ev.links)) {
    const gc = ev.links.find((l) => l.href && Array.isArray(l.rel) && l.rel.some((r) => r === 'gamecast' || r === 'summary'));
    if (gc) gamecastUrl = gc.href;
  }
  if (!gamecastUrl && ev.id) gamecastUrl = `https://www.espn.com/mlb/game/_/gameId/${ev.id}`;

  const periodLabel = status?.type?.shortDetail || status?.type?.description || null;

  return {
    gameId: ev.id,
    sport: 'mlb',
    status: isLive ? 'live' : isFinal ? 'final' : 'upcoming',
    startTime: ev.date || comp.date || null,
    displayTime: (() => {
      try { return new Date(ev.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
      catch { return ''; }
    })(),
    teams: {
      away: resolveTeam(away),
      home: resolveTeam(home),
    },
    gameState: {
      periodLabel,
      isLive,
      isFinal,
      statusText: status?.type?.description || (isLive ? 'In Progress' : isFinal ? 'Final' : 'Scheduled'),
    },
    market: {
      pregameSpread: null,
      liveSpread: null,
      pregameTotal: null,
      liveTotal: null,
    },
    model: {
      pregameEdge: null,
      liveEdge: null,
      confidence: null,
      fairSpread: null,
      fairTotal: null,
    },
    signals: null, // populated by scoring
    insight: null, // populated by scoring
    links: { gamecastUrl },
    broadcast: { network },
    betting: {
      spreadDisplay: '—',
      totalDisplay: '—',
    },
  };
}

async function fetchScoreboard() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(ESPN_SCOREBOARD, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(normalizeEvent).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  const cacheKey = 'mlb:live:homeFeed';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, _cache: 'hit' });
  }

  const games = await coalesce(cacheKey, fetchScoreboard);
  if (games.length === 0) {
    const stale = cache.getMaybeStale(cacheKey);
    if (stale?.value) return res.status(200).json({ ...stale.value, _cache: 'stale' });
  }

  const ranked = rankLiveGames(games, 'importance');
  const liveNow = ranked.filter((g) => g.status === 'live').slice(0, 6);
  const startingSoon = ranked
    .filter((g) => g.status === 'upcoming' && new Date(g.startTime) - Date.now() < 3 * 3600_000)
    .slice(0, 6);
  const bestEdges = rankLiveGames(games.filter((g) => g.status !== 'final'), 'edge').slice(0, 4);

  const result = {
    liveNow,
    startingSoon,
    bestEdges,
    allGames: ranked.length,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
  };

  if (games.length > 0) cache.set(cacheKey, result);

  return res.status(200).json(result);
}
