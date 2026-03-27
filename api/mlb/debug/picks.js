/**
 * GET /api/mlb/debug/picks
 *
 * Diagnostics for MLB picks pipeline.
 * Shows candidate games, odds join status, scoring, and pick generation details.
 * Safe to open in browser — no secrets exposed.
 */

import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';

async function fetchScoreboardForDate(dateStr) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${ESPN_BASE}?dates=${dateStr}`, { signal: controller.signal });
    if (!r.ok) return { date: dateStr, ok: false, status: r.status, games: [] };
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const games = events.map(normalizeEvent).filter(Boolean);
    return { date: dateStr, ok: true, total: events.length, normalized: games.length, games };
  } catch (err) {
    return { date: dateStr, ok: false, error: err.message, games: [] };
  } finally { clearTimeout(timer); }
}

function getDateStrings(days = 2) {
  const dates = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const t0 = Date.now();
  const dateStrings = getDateStrings(2);

  // Fetch each day
  const dayResults = await Promise.all(dateStrings.map(fetchScoreboardForDate));
  const allGames = dayResults.flatMap(d => d.games);

  // Dedupe
  const seen = new Set();
  const unique = allGames.filter(g => {
    if (seen.has(g.gameId)) return false;
    seen.add(g.gameId);
    return true;
  });

  // Split by status
  const upcoming = unique.filter(g => g.status === 'upcoming');
  const live = unique.filter(g => g.status === 'live');
  const final = unique.filter(g => g.status === 'final');

  // Try odds enrichment on upcoming
  let enriched = upcoming;
  let oddsStatus = 'not_attempted';
  try {
    enriched = await enrichGamesWithOdds(upcoming);
    oddsStatus = 'ok';
  } catch (err) {
    oddsStatus = `error: ${err.message}`;
  }

  // Per-game diagnostic
  const gameDiags = enriched.map(g => ({
    gameId: g.gameId,
    startTime: g.startTime,
    away: g.teams?.away?.slug || 'unknown',
    home: g.teams?.home?.slug || 'unknown',
    awayName: g.teams?.away?.name,
    homeName: g.teams?.home?.name,
    hasMoneyline: g.market?.moneyline != null,
    moneyline: g.market?.moneyline,
    hasSpread: g.market?.pregameSpread != null,
    spread: g.market?.pregameSpread,
    hasTotal: g.market?.pregameTotal != null,
    total: g.market?.pregameTotal,
    modelEdge: g.model?.pregameEdge,
    status: g.status,
  }));

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    dates: dateStrings,
    dayResults: dayResults.map(d => ({
      date: d.date,
      ok: d.ok,
      total: d.total || 0,
      normalized: d.normalized || 0,
      error: d.error || null,
    })),
    summary: {
      totalGames: unique.length,
      upcoming: upcoming.length,
      live: live.length,
      final: final.length,
      withOdds: enriched.filter(g => g.market?.moneyline != null).length,
      withSpread: enriched.filter(g => g.market?.pregameSpread != null).length,
      withTotal: enriched.filter(g => g.market?.pregameTotal != null).length,
      oddsStatus,
    },
    games: gameDiags,
  });
}
