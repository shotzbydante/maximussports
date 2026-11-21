/**
 * Shared game normalization for NFL endpoints.
 * Single source of truth — imported by games, picks, season and cron code.
 *
 * Produces the same canonical game object as the MLB and NBA normalizers
 * (teams / gameState / market / model / betting) so shared scoring,
 * settlement and UI code can consume NFL games unchanged, plus a few
 * football-specific fields: week, down and distance, possession, red zone.
 */

import { getNflTeamByEspnId, getNflTeamByAbbrev, getNflLogoUrl } from '../../../src/sports/nfl/teams.js';

export const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
export const FETCH_TIMEOUT_MS = 8000;

/** ESPN season-type ids. */
export const SEASON_TYPE = Object.freeze({ PRE: 1, REGULAR: 2, POST: 3, OFF: 4 });

function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().toLowerCase();
  if (s === 'even' || s === 'ev') return 100;
  // ESPN prefixes totals with o/u ("o44.5") and spreads with a sign.
  const n = parseFloat(s.replace(/^[ou]/, ''));
  return Number.isFinite(n) ? n : null;
}

export function resolveTeam(comp) {
  const t = comp?.team || {};
  const meta = getNflTeamByEspnId(t.id) || getNflTeamByAbbrev(t.abbreviation);
  const record = Array.isArray(comp?.records)
    ? (comp.records.find(r => r.type === 'total' || r.name === 'overall')?.summary ?? null)
    : null;
  return {
    slug: meta?.slug || null,
    name: meta?.name || t.displayName || t.shortDisplayName || 'TBD',
    abbrev: meta?.abbrev || t.abbreviation || '',
    logo: (meta ? getNflLogoUrl(meta.slug) : null) || t.logo || null,
    score: comp?.score != null && comp.score !== '' ? Number(comp.score) : null,
    record,
  };
}

/**
 * Read ESPN's odds block. ESPN has shipped two shapes: an older one with
 * `homeTeamOdds.moneyLine`, and a newer one with nested
 * `moneyline / pointSpread / total` objects carrying open and close
 * numbers. Both are handled; missing pieces come back null.
 *
 * Spreads are returned as the HOME team's line (-3.5 = home favoured).
 */
export function parseEspnOdds(odds, { homeAbbrev, awayAbbrev } = {}) {
  const empty = {
    spreadHome: null, total: null, moneyline: null,
    openSpreadHome: null, openTotal: null, provider: null,
  };
  if (!odds) return empty;

  // ── Spread ──
  let spreadHome = num(odds.pointSpread?.home?.close?.line);
  let openSpreadHome = num(odds.pointSpread?.home?.open?.line);
  if (spreadHome == null) {
    const raw = num(odds.spread);
    if (raw != null) {
      const homeFav = odds.homeTeamOdds?.favorite === true;
      const awayFav = odds.awayTeamOdds?.favorite === true;
      if (homeFav) spreadHome = -Math.abs(raw);
      else if (awayFav) spreadHome = Math.abs(raw);
      else {
        // No favourite flags: fall back to the "KC -3.5" details string.
        const m = typeof odds.details === 'string' && odds.details.match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)/);
        if (m) {
          const line = parseFloat(m[2]);
          if (m[1] === homeAbbrev) spreadHome = line;
          else if (m[1] === awayAbbrev) spreadHome = -line;
        } else if (raw === 0) spreadHome = 0;
      }
    }
  }

  // ── Total ──
  let total = num(odds.overUnder);
  if (total == null) total = num(odds.total?.over?.close?.line);
  const openTotal = num(odds.total?.over?.open?.line);

  // ── Moneyline ──
  let mlHome = num(odds.moneyline?.home?.close?.odds);
  let mlAway = num(odds.moneyline?.away?.close?.odds);
  if (mlHome == null) mlHome = num(odds.homeTeamOdds?.moneyLine);
  if (mlAway == null) mlAway = num(odds.awayTeamOdds?.moneyLine);
  const moneyline = (mlHome != null || mlAway != null) ? { home: mlHome, away: mlAway } : null;

  return {
    spreadHome, total, moneyline, openSpreadHome, openTotal,
    provider: odds.provider?.name || null,
  };
}

export function normalizeEvent(ev) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;

  const status = comp.status || ev.status || {};
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post' && status?.type?.completed !== false;
  // Postponed / cancelled games report state "post" without completing.
  const isOff = state === 'post' && status?.type?.completed === false;

  const competitors = comp.competitors || [];
  const homeC = competitors.find((c) => c.homeAway === 'home');
  const awayC = competitors.find((c) => c.homeAway === 'away');
  const home = resolveTeam(homeC);
  const away = resolveTeam(awayC);

  const network = comp.broadcasts?.[0]?.names?.[0]
    || comp.geoBroadcasts?.[0]?.media?.shortName
    || null;

  let gamecastUrl = null;
  if (Array.isArray(ev.links)) {
    const gc = ev.links.find((l) => l.href && Array.isArray(l.rel) && l.rel.some((r) => r === 'gamecast' || r === 'summary'));
    if (gc) gamecastUrl = gc.href;
  }
  if (!gamecastUrl && ev.id) gamecastUrl = `https://www.espn.com/nfl/game/_/gameId/${ev.id}`;

  const period = Number(status?.period);
  const periodNumber = Number.isFinite(period) ? period : null;
  const clock = status?.displayClock || null;
  const shortDetail = status?.type?.shortDetail || status?.type?.description || null;
  const isOvertime = (periodNumber != null && periodNumber > 4) || /\bot\b/i.test(shortDetail || '');
  const isHalftime = /half/i.test(status?.type?.description || '') || /half/i.test(shortDetail || '');

  let periodLabel = shortDetail;
  if (isLive) {
    if (isHalftime) periodLabel = 'Halftime';
    else if (isOvertime) periodLabel = clock ? `OT ${clock}` : 'OT';
    else if (periodNumber) periodLabel = clock ? `Q${periodNumber} ${clock}` : `Q${periodNumber}`;
  }

  // In-game situation (only present while live).
  const sit = comp.situation || null;
  let possession = null;
  if (sit?.possession != null) {
    const pid = String(sit.possession);
    if (String(homeC?.team?.id || homeC?.id) === pid) possession = 'home';
    else if (String(awayC?.team?.id || awayC?.id) === pid) possession = 'away';
  }

  const lineScores = (c) => Array.isArray(c?.linescores)
    ? c.linescores.map((ls) => Number(ls?.value ?? ls?.displayValue ?? 0))
    : null;

  const odds = parseEspnOdds(comp.odds?.[0], { homeAbbrev: home.abbrev, awayAbbrev: away.abbrev });
  const pregameSpread = odds.spreadHome;
  const pregameTotal = odds.total;

  const spreadDisplay = pregameSpread != null
    ? `${home.abbrev} ${pregameSpread > 0 ? `+${pregameSpread}` : pregameSpread === 0 ? 'PK' : pregameSpread}`
    : '—';
  const totalDisplay = pregameTotal != null ? `O/U ${pregameTotal}` : '—';

  const headline = comp.headlines?.[0]?.shortLinkText || comp.headlines?.[0]?.description || null;

  return {
    gameId: String(ev.id),
    sport: 'nfl',
    status: isLive ? 'live' : isFinal ? 'final' : isOff ? 'postponed' : 'upcoming',
    startTime: ev.date || comp.date || null,
    week: ev.week?.number ?? null,
    seasonType: ev.season?.type ?? null,
    seasonYear: ev.season?.year ?? null,
    displayTime: (() => {
      try {
        return new Date(ev.date).toLocaleString('en-US', {
          weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
          timeZone: 'America/New_York',
        });
      } catch { return ''; }
    })(),
    teams: { away, home },
    gameState: {
      periodLabel,
      period: periodNumber,
      clock,
      isOvertime,
      isHalftime,
      isLive,
      isFinal,
      statusText: status?.type?.description || (isLive ? 'In Progress' : isFinal ? 'Final' : 'Scheduled'),
      possession,
      downDistance: sit?.downDistanceText || sit?.shortDownDistanceText || null,
      isRedZone: !!sit?.isRedZone,
      lastPlay: sit?.lastPlay?.text || null,
    },
    narrative: {
      isOvertime,
      homeLine: lineScores(homeC),
      awayLine: lineScores(awayC),
      headline,
    },
    market: {
      pregameSpread,
      pregameTotal,
      moneyline: odds.moneyline,
      openSpread: odds.openSpreadHome,
      openTotal: odds.openTotal,
      booksCount: 0,
      source: odds.provider ? 'espn' : null,
    },
    model: { pregameEdge: null, confidence: null, fairSpread: null, fairTotal: null, homeWinProb: null },
    signals: null,
    insight: null,
    venue: {
      name: comp.venue?.fullName || null,
      city: comp.venue?.address?.city || null,
      indoor: comp.venue?.indoor ?? null,
      neutralSite: !!comp.neutralSite,
    },
    links: { gamecastUrl },
    broadcast: { network },
    betting: { spreadDisplay, totalDisplay },
  };
}

/**
 * Fetch one scoreboard page.
 *
 * With no arguments ESPN returns the current NFL week (Thursday through
 * Monday), which is the "slate" everywhere in the NFL workspace.
 *
 * @param {object} [opts]
 * @param {number} [opts.week]        — week number
 * @param {number} [opts.seasonType]  — 1 pre, 2 regular, 3 post
 * @param {number} [opts.year]        — season year
 * @param {string} [opts.dateStr]     — YYYYMMDD (single calendar day)
 * @returns {Promise<{ games: Array, week: number|null, seasonType: number|null, seasonYear: number|null, byeTeams: string[], ok: boolean }>}
 */
export async function fetchScoreboardPage({ week, seasonType, year, dateStr } = {}) {
  const params = new URLSearchParams();
  if (dateStr) params.set('dates', dateStr);
  else {
    if (week != null) params.set('week', String(week));
    if (seasonType != null) params.set('seasontype', String(seasonType));
    if (year != null) params.set('dates', String(year));
  }
  const qs = params.toString();
  const url = qs ? `${ESPN_SCOREBOARD}?${qs}` : ESPN_SCOREBOARD;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return { games: [], week: null, seasonType: null, seasonYear: null, byeTeams: [], ok: false };
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const byeTeams = (data.week?.teamsOnBye || [])
      .map((t) => (getNflTeamByEspnId(t.id) || getNflTeamByAbbrev(t.abbreviation))?.slug)
      .filter(Boolean);
    return {
      games: events.map(normalizeEvent).filter(Boolean),
      week: data.week?.number ?? null,
      seasonType: data.season?.type ?? null,
      seasonYear: data.season?.year ?? null,
      byeTeams,
      ok: true,
    };
  } catch {
    return { games: [], week: null, seasonType: null, seasonYear: null, byeTeams: [], ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Current-week games only (back-compat with the NBA/MLB `fetchScoreboard`). */
export async function fetchScoreboard(opts = {}) {
  const page = await fetchScoreboardPage(opts);
  return page.games;
}

/**
 * Finals for one ET calendar day. Used by the settlement cron, which
 * grades one slate date at a time like the other sports.
 */
export async function fetchYesterdayFinals({ slateDate } = {}) {
  const { yesterdayET, etDateCompact } = await import('../../_lib/dateWindows.js');
  const ymd = slateDate || yesterdayET();
  const page = await fetchScoreboardPage({ dateStr: etDateCompact(ymd) });
  return page.games.filter((g) => g.gameState?.isFinal || g.status === 'final');
}
