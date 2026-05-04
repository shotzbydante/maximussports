/**
 * Shared game normalization for NBA live intelligence endpoints.
 * Single source of truth — imported by games, team endpoints.
 */

import { NBA_TEAMS, NBA_ESPN_IDS } from '../../../src/sports/nba/teams.js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const FETCH_TIMEOUT_MS = 8000;

const espnIdToSlug = {};
for (const [slug, eid] of Object.entries(NBA_ESPN_IDS)) espnIdToSlug[eid] = slug;

const slugMeta = Object.fromEntries(NBA_TEAMS.map((t) => [t.slug, t]));

export { espnIdToSlug, slugMeta, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS };

export function resolveTeam(comp) {
  const t = comp?.team || {};
  const eid = String(t.id || comp?.id || '');
  const slug = espnIdToSlug[eid] || null;
  const meta = slug ? slugMeta[slug] : null;
  return {
    slug,
    name: meta?.name || t.displayName || t.shortDisplayName || 'TBD',
    abbrev: meta?.abbrev || t.abbreviation || '',
    logo: t.logo || (eid ? `https://a.espncdn.com/i/teamlogos/nba/500/${eid}.png` : null),
    score: comp?.score != null ? Number(comp.score) : null,
  };
}

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
  if (!gamecastUrl && ev.id) gamecastUrl = `https://www.espn.com/nba/game/_/gameId/${ev.id}`;

  const periodLabel = status?.type?.shortDetail || status?.type?.description || null;
  const periodNumber = Number(status?.period);
  // NBA regulation = 4 periods. Anything past 4 is overtime. ESPN sometimes
  // also includes "OT" / "2OT" in the shortDetail for completed games.
  const labelHasOT = /\bot\b/i.test(periodLabel || '') || /overtime/i.test(periodLabel || '');
  const isOvertime = (Number.isFinite(periodNumber) && periodNumber > 4) || labelHasOT;
  const overtimeCount = Number.isFinite(periodNumber) && periodNumber > 4
    ? periodNumber - 4
    : (labelHasOT ? 1 : 0);

  // Per-quarter line scores (when ESPN provides them on the scoreboard
  // payload) — drives comeback / halftime-deficit detection.
  function lineScoresFor(c) {
    const arr = c?.linescores;
    if (!Array.isArray(arr)) return null;
    return arr.map(ls => Number(ls?.value ?? ls?.displayValue ?? 0));
  }
  const homeLine = lineScoresFor(home);
  const awayLine = lineScoresFor(away);

  // Notes/headline text — drives buzzer-beater / game-winner detection
  // (we never want to fabricate this). Joined into a single lowercase
  // blob the narrative builder can pattern-match on.
  function notesBlob() {
    const parts = [];
    const notes = comp?.notes;
    if (Array.isArray(notes)) {
      for (const n of notes) {
        if (typeof n === 'string') parts.push(n);
        else if (n?.headline) parts.push(n.headline);
        else if (n?.text) parts.push(n.text);
      }
    }
    if (Array.isArray(ev?.notes)) {
      for (const n of ev.notes) {
        if (typeof n === 'string') parts.push(n);
        else if (n?.headline) parts.push(n.headline);
        else if (n?.text) parts.push(n.text);
      }
    }
    if (Array.isArray(ev?.competitions?.[0]?.headlines)) {
      for (const h of ev.competitions[0].headlines) {
        if (h?.shortLinkText) parts.push(h.shortLinkText);
        if (h?.description) parts.push(h.description);
      }
    }
    return parts.join(' | ').toLowerCase();
  }
  const notesText = notesBlob();

  const espnOdds = comp.odds?.[0] || null;
  const hasEspnOdds = espnOdds != null;

  let pregameSpread = null;
  let pregameTotal = null;
  // v8: moneyline is `{ away, home }`. Pre-v8 we wrote a single number
  // (just the home ML), which broke the builder's per-side implied
  // probability calc and silently dropped every Pick 'Em pick.
  let moneyline = null;

  if (hasEspnOdds) {
    if (espnOdds.spread != null) {
      pregameSpread = parseFloat(espnOdds.spread);
      if (Number.isNaN(pregameSpread)) pregameSpread = null;
    }
    if (espnOdds.overUnder != null) {
      pregameTotal = parseFloat(espnOdds.overUnder);
      if (Number.isNaN(pregameTotal)) pregameTotal = null;
    }
    const homeMl = espnOdds.homeTeamOdds?.moneyLine ?? null;
    const awayMl = espnOdds.awayTeamOdds?.moneyLine ?? null;
    if (homeMl != null || awayMl != null) {
      moneyline = { home: homeMl, away: awayMl };
    }
  }

  const spreadDisplay = pregameSpread != null
    ? (pregameSpread > 0 ? `+${pregameSpread}` : `${pregameSpread}`)
    : '\u2014';
  const totalDisplay = pregameTotal != null
    ? `O/U ${pregameTotal}`
    : '\u2014';

  return {
    gameId: ev.id,
    sport: 'nba',
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
      period: Number.isFinite(periodNumber) ? periodNumber : null,
      isOvertime,
      overtimeCount,
      isLive,
      isFinal,
      statusText: status?.type?.description || (isLive ? 'In Progress' : isFinal ? 'Final' : 'Scheduled'),
    },
    // Narrative signals — surfaced for buildNbaGameNarrative + HOTP.
    // Intentionally minimal: numbers + lowercase notes blob, no fabricated
    // text. Down-stream code reads what's actually here.
    narrative: {
      isOvertime,
      overtimeCount,
      homeLine,
      awayLine,
      notesText,
    },
    market: { pregameSpread, liveSpread: null, pregameTotal, liveTotal: null, moneyline },
    model: { pregameEdge: null, liveEdge: null, confidence: null, fairSpread: null, fairTotal: null },
    signals: null,
    insight: null,
    links: { gamecastUrl },
    broadcast: { network },
    betting: { spreadDisplay, totalDisplay },
  };
}

export async function fetchScoreboard({ dateStr = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = dateStr ? `${ESPN_SCOREBOARD}?dates=${dateStr}` : ESPN_SCOREBOARD;
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(normalizeEvent).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

/**
 * Fetch yesterday's NBA finals (ET calendar day). Accepts an explicit
 * override so manual reruns / backfills can target a specific day.
 */
export async function fetchYesterdayFinals({ slateDate } = {}) {
  const { yesterdayET, etDateCompact } = await import('../../_lib/dateWindows.js');
  const ymd = slateDate || yesterdayET();
  const dateStr = etDateCompact(ymd);
  const games = await fetchScoreboard({ dateStr });
  return games.filter(g => g.gameState?.isFinal || g.status === 'final');
}
