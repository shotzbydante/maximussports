/**
 * buildNbaPicks — top-level orchestrator for NBA pick generation.
 * Mirrors MLB buildMlbPicks architecture.
 *
 * Consumes: { games } from /api/nba/picks/board
 * Returns:  { categories: { pickEms, ats, leans, totals }, meta }
 */

import { scoreNbaMatchup } from './scoreNbaMatchup.js';
import { classifyNbaPick } from './classifyNbaPick.js';
import { NBA_PICK_THRESHOLDS, MAX_CANDIDATE_GAMES } from './nbaPickThresholds.js';

const SECTION_TARGET = 5;

function getGameDate(t) {
  if (!t) return '';
  try {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function tomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function matchupKey(g) {
  const away = g.teams?.away?.slug || g.awaySlug || '';
  const home = g.teams?.home?.slug || g.homeSlug || '';
  if (!away || !home) return '';
  return [away, home].sort().join('-vs-');
}
function pickMatchupKey(p) {
  const away = p.matchup?.awayTeam?.slug || '';
  const home = p.matchup?.homeTeam?.slug || '';
  if (!away || !home) return p.gameId || '';
  return [away, home].sort().join('-vs-');
}

/**
 * Normalize a game payload into the shape the scorer/classifier expect.
 */
function normalizeGame(g) {
  if (!g || !g.teams?.away || !g.teams?.home) return null;
  const away = g.teams.away;
  const home = g.teams.home;
  if (!away.slug || !home.slug) return null;
  return {
    gameId: g.gameId,
    startTime: g.startTime,
    network: g.broadcast?.network,
    awayTeam: {
      slug: away.slug,
      abbrev: away.abbrev,
      shortName: away.name,
      name: away.name,
      logo: away.logo,
      record: away.record,
    },
    homeTeam: {
      slug: home.slug,
      abbrev: home.abbrev,
      shortName: home.name,
      name: home.name,
      logo: home.logo,
      record: home.record,
    },
    market: {
      moneyline: g.market?.moneyline,
      pregameSpread: g.market?.pregameSpread,
      pregameTotal: g.market?.pregameTotal,
    },
  };
}

export function buildNbaPicks({ games = [] }) {
  const result = {
    generatedAt: new Date().toISOString(),
    meta: {
      totalCandidates: 0, qualifiedGames: 0, skippedGames: 0,
      gamesWithOdds: 0, gamesMissingOdds: 0,
    },
    categories: { pickEms: [], ats: [], leans: [], totals: [] },
  };

  const td = today();
  const tm = tomorrow();

  // Filter to upcoming only
  const upcoming = games.filter(g => {
    const status = (g.status || '').toLowerCase();
    const isLive = g.gameState?.isLive;
    const isFinal = g.gameState?.isFinal;
    return !isLive && !isFinal && status !== 'final' && status !== 'in_progress';
  });

  const todayGames = upcoming.filter(g => getGameDate(g.startTime) === td);
  const tomorrowGames = upcoming.filter(g => getGameDate(g.startTime) === tm);
  const laterGames = upcoming.filter(g => {
    const d = getGameDate(g.startTime);
    return d !== td && d !== tm;
  });

  const nearKeys = new Set();
  for (const g of [...todayGames, ...tomorrowGames]) {
    const k = matchupKey(g);
    if (k) nearKeys.add(k);
  }

  const laterSorted = [...laterGames].sort((a, b) => {
    const aDupe = matchupKey(a) && nearKeys.has(matchupKey(a)) ? 1 : 0;
    const bDupe = matchupKey(b) && nearKeys.has(matchupKey(b)) ? 1 : 0;
    if (aDupe !== bDupe) return aDupe - bDupe;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  const candidates = [...todayGames, ...tomorrowGames, ...laterSorted].slice(0, MAX_CANDIDATE_GAMES);
  result.meta.totalCandidates = candidates.length;

  const allPicks = [];
  for (const raw of candidates) {
    try {
      const m = normalizeGame(raw);
      if (!m) { result.meta.skippedGames += 1; continue; }

      const hasOdds = m.market.moneyline != null || m.market.pregameSpread != null;
      if (hasOdds) result.meta.gamesWithOdds += 1;
      else result.meta.gamesMissingOdds += 1;

      const score = scoreNbaMatchup(m);
      if (!score) { result.meta.skippedGames += 1; continue; }

      const picks = classifyNbaPick(m, score, NBA_PICK_THRESHOLDS);
      if (!picks.length) continue;

      result.meta.qualifiedGames += 1;
      const gDate = getGameDate(m.startTime);
      for (const p of picks) p._gameDate = gDate;
      allPicks.push(...picks);
    } catch {
      result.meta.skippedGames += 1;
    }
  }

  const sortFn = (a, b) => {
    const ap = a._gameDate === td ? 0 : a._gameDate === tm ? 1 : 2;
    const bp = b._gameDate === td ? 0 : b._gameDate === tm ? 1 : 2;
    if (ap !== bp) return ap - bp;
    const tierOrder = { high: 0, medium: 1, low: 2 };
    const ta = tierOrder[a.confidence] ?? 3;
    const tb = tierOrder[b.confidence] ?? 3;
    if (ta !== tb) return ta - tb;
    return (b.confidenceScore || 0) - (a.confidenceScore || 0);
  };

  const byCat = { pickEms: [], ats: [], leans: [], totals: [] };
  for (const p of allPicks) {
    if (byCat[p.category]) byCat[p.category].push(p);
  }
  for (const k of Object.keys(byCat)) byCat[k].sort(sortFn);

  // Board-level diversity fill
  const boardUsed = new Set();
  for (const key of ['pickEms', 'ats', 'leans', 'totals']) {
    const cands = byCat[key];
    const selected = [];
    const deferred = [];
    for (const p of cands) {
      if (selected.length >= SECTION_TARGET) break;
      const mk = pickMatchupKey(p);
      if (boardUsed.has(mk)) deferred.push(p);
      else { selected.push(p); boardUsed.add(mk); }
    }
    for (const p of deferred) {
      if (selected.length >= SECTION_TARGET) break;
      selected.push(p);
    }
    result.categories[key] = selected;
  }

  return result;
}

export function hasAnyNbaPicks(picks) {
  if (!picks?.categories) return false;
  const c = picks.categories;
  return (c.pickEms?.length > 0 || c.ats?.length > 0 || c.leans?.length > 0 || c.totals?.length > 0);
}
