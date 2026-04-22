/**
 * Shared game normalization for MLB live intelligence endpoints.
 * Single source of truth — imported by homeFeed, games, team endpoints.
 */

import { MLB_TEAMS, MLB_ESPN_IDS } from '../../../src/sports/mlb/teams.js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
const FETCH_TIMEOUT_MS = 8000;

/* ── ESPN ID ↔ slug mapping ───────────────────────────────────────────────── */

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(MLB_ESPN_IDS)) espnIdToSlug[eid] = slug;

const slugMeta = Object.fromEntries(MLB_TEAMS.map((t) => [t.slug, t]));

export { espnIdToSlug, slugMeta, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS };

/* ── resolveTeam ──────────────────────────────────────────────────────────── */

export function resolveTeam(comp) {
  const t = comp?.team || {};
  const eid = String(t.id || comp?.id || '');
  const slug = espnIdToSlug[eid] || null;
  const meta = slug ? slugMeta[slug] : null;
  return {
    slug,
    name: meta?.name || t.displayName || t.shortDisplayName || 'TBD',
    abbrev: meta?.abbrev || t.abbreviation || '',
    logo: t.logo || (eid ? `https://a.espncdn.com/i/teamlogos/mlb/500/${eid}.png` : null),
    score: comp?.score != null ? Number(comp.score) : null,
  };
}

/* ── normalizeEvent ───────────────────────────────────────────────────────── */

export function normalizeEvent(ev) {
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

  // Extract ESPN-embedded odds when available
  const espnOdds = comp.odds?.[0] || null;
  const hasEspnOdds = espnOdds != null;

  // Parse spread from ESPN
  let pregameSpread = null;
  let pregameTotal = null;
  let moneyline = null;

  if (hasEspnOdds) {
    // ESPN provides spread, overUnder, and sometimes moneyline
    if (espnOdds.spread != null) {
      pregameSpread = parseFloat(espnOdds.spread);
      if (Number.isNaN(pregameSpread)) pregameSpread = null;
    }
    if (espnOdds.overUnder != null) {
      pregameTotal = parseFloat(espnOdds.overUnder);
      if (Number.isNaN(pregameTotal)) pregameTotal = null;
    }
    // ESPN sometimes provides home/away ML
    if (espnOdds.homeTeamOdds?.moneyLine != null) {
      // We store moneyline as the home team ML
      moneyline = espnOdds.homeTeamOdds.moneyLine;
    }
  }

  // Format display strings
  const spreadDisplay = pregameSpread != null
    ? (pregameSpread > 0 ? `+${pregameSpread}` : `${pregameSpread}`)
    : '—';
  const totalDisplay = pregameTotal != null
    ? `O/U ${pregameTotal}`
    : '—';

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
      pregameSpread,
      liveSpread: null,
      pregameTotal,
      liveTotal: null,
      moneyline,
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
      spreadDisplay,
      totalDisplay,
    },
  };
}

/* ── fetchScoreboard ──────────────────────────────────────────────────────── */

/**
 * Fetch ESPN scoreboard for a specific date (YYYYMMDD) or today if omitted.
 */
export async function fetchScoreboard(dateStr) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = dateStr
      ? `${ESPN_SCOREBOARD}?dates=${dateStr}`
      : ESPN_SCOREBOARD;
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(normalizeEvent).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

/**
 * Fetch yesterday's completed games (ET calendar day) — returns only finals.
 *
 * Uses the shared ET-aware dateWindows helper so the settle cron looks up
 * the SAME date that picks_daily_scorecards.slate_date is keyed by.
 *
 * Accepts an optional explicit override so manual triggers can target a
 * specific day: fetchYesterdayFinals({ slateDate: '2026-04-19' }).
 */
export async function fetchYesterdayFinals({ slateDate } = {}) {
  // Lazy import to avoid circular reference with _lib helpers.
  const { yesterdayET, etDateCompact } = await import('../../_lib/dateWindows.js');
  const ymd = slateDate || yesterdayET();
  const dateStr = etDateCompact(ymd);
  const games = await fetchScoreboard(dateStr);
  return games.filter(g => g.gameState?.isFinal || g.status === 'final');
}
