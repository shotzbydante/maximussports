/**
 * Game lines (spread, total, moneyline) for the NCAAM slate, for server-side
 * writers: the home briefing and team summaries.
 *
 * One Odds API request returns every upcoming game, so the result is shared
 * through KV for 15 minutes rather than fetched per team. That caps this at
 * four requests an hour no matter how many briefings or team pages regenerate.
 *
 * Matching is deliberately strict: a wrong line in published copy is worse
 * than no line, so a game is only matched when the team names agree after
 * light normalisation. Unmatched games simply carry no line.
 */

import { getJson, setJson } from '../_globalCache.js';
import { fetchOddsSource } from '../_sources.js';

const KV_KEY = 'odds:slate:ncaab:v1';
const TTL_SECONDS = 15 * 60;

/** Lowercase, strip punctuation and unify the common Saint/State abbreviations. */
export function normTeamName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\bst\.?(?=\s)/g, (m, offset) => (offset === 0 ? 'saint' : 'state'))
    .replace(/[.,()&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamNamesMatch(a, b) {
  const na = normTeamName(a);
  const nb = normTeamName(b);
  return na !== '' && na === nb;
}

function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

function toLine(g) {
  const homeSpread = typeof g.homeSpread === 'number' ? g.homeSpread : null;
  const awaySpread = typeof g.awaySpread === 'number' ? g.awaySpread : (homeSpread != null ? -homeSpread : null);
  const total = g.total != null && g.total !== '' ? String(g.total) : null;
  const moneyline = g.moneyline || null;
  if (homeSpread == null && total == null && moneyline == null) return null;
  return {
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    commenceTime: g.commenceTime || null,
    homeSpread,
    awaySpread,
    total,
    moneyline,
  };
}

/**
 * Lines for every upcoming NCAAM game the Odds API lists. Cache-first.
 * Never throws; returns [] when lines cannot be had.
 */
export async function getNcaamSlateLines() {
  try {
    const cached = await getJson(KV_KEY).catch(() => null);
    if (Array.isArray(cached?.games) && cached.games.length > 0) return cached.games;

    const result = await fetchOddsSource();
    const games = (result?.games ?? []).map(toLine).filter(Boolean);
    if (games.length > 0) {
      await setJson(KV_KEY, { games, updatedAt: new Date().toISOString() }, { exSeconds: TTL_SECONDS }).catch(() => {});
    }
    return games;
  } catch (err) {
    console.warn('[slateOdds] line fetch failed:', err?.message);
    return [];
  }
}

/** The line for a specific matchup, or null. Home and away must both match. */
export function findMatchupLine(lines, homeTeam, awayTeam) {
  if (!Array.isArray(lines)) return null;
  return lines.find((g) => teamNamesMatch(g.homeTeam, homeTeam) && teamNamesMatch(g.awayTeam, awayTeam)) || null;
}

/** The earliest game that has not started yet involving this team, or null. */
export function findNextLineForTeam(lines, teamName, now = Date.now()) {
  if (!Array.isArray(lines)) return null;
  const upcoming = lines
    .filter((g) => teamNamesMatch(g.homeTeam, teamName) || teamNamesMatch(g.awayTeam, teamName))
    .filter((g) => !g.commenceTime || new Date(g.commenceTime).getTime() > now)
    .sort((a, b) => new Date(a.commenceTime || 0) - new Date(b.commenceTime || 0));
  return upcoming[0] || null;
}

/**
 * A line phrased for a prompt, with no ambiguity about which side the spread
 * belongs to. Returns null when the game has nothing to quote.
 *   { spread: 'Duke Blue Devils -12.5', total: '148.5' }
 * The moneyline is left out: the source does not label which price is whose.
 */
export function describeLine(line) {
  if (!line) return null;
  const out = {};
  if (line.homeSpread != null) {
    out.spread = line.homeSpread === 0
      ? 'pick’em'
      : line.homeSpread < 0
        ? `${line.homeTeam} ${signed(line.homeSpread)}`
        : `${line.awayTeam} ${signed(line.awaySpread ?? -line.homeSpread)}`;
  }
  if (line.total != null) out.total = line.total;
  return Object.keys(out).length > 0 ? out : null;
}

/** American odds as copy should show them: "+750", "-110". */
export function formatAmerican(american) {
  if (typeof american !== 'number' || !Number.isFinite(american)) return null;
  return american > 0 ? `+${american}` : String(american);
}

/** Implied probability of American odds, as a percentage with one decimal. */
export function impliedPct(american) {
  if (typeof american !== 'number' || american === 0) return null;
  const p = american < 0 ? -american / (-american + 100) : 100 / (american + 100);
  return Math.round(p * 1000) / 10;
}

/** A team's title price from a championship odds map keyed by slug, or null. */
export function titleOddsFor(championshipOdds, slug) {
  const entry = championshipOdds?.[slug];
  const american = entry?.bestChanceAmerican ?? entry?.american;
  const odds = formatAmerican(american);
  return odds ? { odds, impliedPct: impliedPct(american) } : null;
}
