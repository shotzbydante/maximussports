/**
 * GET /api/mlb/debug/home
 * Lightweight diagnostics for MLB Home data hydration.
 * Returns JSON with status of critical MLB Home submodules.
 * Safe to open directly in browser. No secrets exposed.
 */

import { getJson } from '../../_globalCache.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';

// Minimal team list for diagnostics
const DIAG_TEAMS = [
  { slug: 'nyy', espnId: '10', name: 'New York Yankees' },
  { slug: 'bos', espnId: '2', name: 'Boston Red Sox' },
  { slug: 'lad', espnId: '19', name: 'Los Angeles Dodgers' },
  { slug: 'sf', espnId: '26', name: 'San Francisco Giants' },
  { slug: 'col', espnId: '27', name: 'Colorado Rockies' },
];

async function checkSchedule(team) {
  try {
    const r = await fetch(`${ESPN_BASE}/teams/${team.espnId}/schedule?season=2026`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { status: 'error', httpStatus: r.status };
    const d = await r.json();
    const events = d?.events || [];
    const record = d?.team?.recordSummary || null;
    const finals = events.filter(e => {
      const comp = e.competitions?.[0];
      return comp?.status?.type?.completed;
    });
    const upcoming = events.filter(e => {
      const comp = e.competitions?.[0];
      return !comp?.status?.type?.completed;
    });
    return {
      status: 'ok',
      teamRecord: record,
      totalEvents: events.length,
      completedGames: finals.length,
      upcomingGames: upcoming.length,
      nextGame: upcoming[0] ? {
        date: upcoming[0].date,
        name: upcoming[0].shortName || upcoming[0].name,
      } : null,
    };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

async function checkVideo(slug) {
  try {
    const freshKey = `yt:mlb:team:${slug}:fresh:v3`;
    const cached = await getJson(freshKey).catch(() => null);
    if (cached?.items?.length > 0) {
      return {
        status: 'ok_cached',
        count: cached.items.length,
        topVideo: {
          title: cached.items[0].title,
          channel: cached.items[0].channelTitle,
          published: cached.items[0].publishedAt,
        },
      };
    }
    return { status: 'no_cache', count: 0 };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const t0 = Date.now();

  // Check each diagnostic team in parallel
  const teamResults = await Promise.all(
    DIAG_TEAMS.map(async (team) => {
      const [schedule, video] = await Promise.all([
        checkSchedule(team),
        checkVideo(team.slug),
      ]);
      return {
        slug: team.slug,
        name: team.name,
        schedule,
        video,
      };
    })
  );

  // Check briefing endpoint
  let briefingStatus = 'unknown';
  try {
    const r = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/mlb/chat/homeSummary`, {
      signal: AbortSignal.timeout(3000),
    });
    briefingStatus = r.ok ? 'ok' : `error_${r.status}`;
  } catch {
    briefingStatus = 'fetch_failed';
  }

  // Check odds endpoint
  let oddsStatus = 'unknown';
  try {
    const r = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/mlb/odds/championship`, {
      signal: AbortSignal.timeout(3000),
    });
    oddsStatus = r.ok ? 'ok' : `error_${r.status}`;
  } catch {
    oddsStatus = 'fetch_failed';
  }

  const result = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    modules: {
      briefing: briefingStatus,
      odds: oddsStatus,
      pinnedTeams: 'client_side',
      seasonModelHero: 'static',
      pennantWatch: oddsStatus,
    },
    teams: teamResults,
  };

  return res.status(200).json(result);
}
