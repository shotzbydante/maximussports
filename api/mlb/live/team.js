/**
 * GET /api/mlb/live/team?slug=nyy
 * Returns the team's current live game or next upcoming game with intelligence.
 */

import { createCache, coalesce } from '../../_cache.js';
import { MLB_TEAMS } from '../../../src/sports/mlb/teams.js';
import { rankLiveGames } from './_scoring.js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
const FETCH_TIMEOUT_MS = 8000;
const cache = createCache(30_000);

const ESPN_IDS = {
  nyy:'10',bos:'2',tor:'14',tb:'30',bal:'1',cle:'5',min:'9',det:'6',cws:'4',kc:'7',
  hou:'18',sea:'12',tex:'13',laa:'3',oak:'11',atl:'15',nym:'21',phi:'22',mia:'28',wsh:'20',
  chc:'16',mil:'8',stl:'24',pit:'23',cin:'17',lad:'19',sd:'25',sf:'26',ari:'29',col:'27',
};
const espnIdToSlug = Object.fromEntries(Object.entries(ESPN_IDS).map(([s, e]) => [e, s]));
const slugMeta = Object.fromEntries(MLB_TEAMS.map((t) => [t.slug, t]));

function resolveTeam(comp) {
  const t = comp?.team || {};
  const eid = String(t.id || comp?.id || '');
  const slug = espnIdToSlug[eid] || null;
  const meta = slug ? slugMeta[slug] : null;
  return {
    slug, name: meta?.name || t.displayName || 'TBD',
    abbrev: meta?.abbrev || t.abbreviation || '',
    logo: t.logo || (eid ? `https://a.espncdn.com/i/teamlogos/mlb/500/${eid}.png` : null),
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

  return {
    gameId: ev.id, sport: 'mlb',
    status: isLive ? 'live' : isFinal ? 'final' : 'upcoming',
    startTime: ev.date || comp.date || null,
    displayTime: (() => { try { return new Date(ev.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); } catch { return ''; } })(),
    teams: { away: resolveTeam(away), home: resolveTeam(home) },
    gameState: { periodLabel: status?.type?.shortDetail || status?.type?.description || null, isLive, isFinal, statusText: status?.type?.description || 'Scheduled' },
    market: { pregameSpread: null, liveSpread: null, pregameTotal: null, liveTotal: null },
    model: { pregameEdge: null, liveEdge: null, confidence: null, fairSpread: null, fairTotal: null },
    signals: null, insight: null,
    links: { gamecastUrl },
    broadcast: { network },
    betting: { spreadDisplay: '—', totalDisplay: '—' },
  };
}

async function fetchScoreboard() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(ESPN_SCOREBOARD, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.events || []).map(normalizeEvent).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slug = new URL(req.url, 'http://localhost').searchParams.get('slug') || '';
  const meta = slugMeta[slug];
  if (!meta) return res.status(400).json({ error: 'Unknown slug' });

  const cacheKey = 'mlb:live:scoreboard';
  let games = cache.get(cacheKey) || await coalesce(cacheKey, fetchScoreboard);
  if (games.length > 0) cache.set(cacheKey, games);

  // Find team's game (live first, then upcoming, then final)
  const teamGames = games.filter((g) => g.teams.home.slug === slug || g.teams.away.slug === slug);
  const ranked = rankLiveGames(teamGames, 'importance');
  const live = ranked.find((g) => g.status === 'live');
  const upcoming = ranked.find((g) => g.status === 'upcoming');
  const game = live || upcoming || ranked[0] || null;

  return res.status(200).json({
    teamSlug: slug,
    teamName: meta.name,
    game,
    hasLive: !!live,
    generatedAt: new Date().toISOString(),
  });
}
