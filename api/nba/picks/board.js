/**
 * GET /api/nba/picks/board
 * NBA picks board — fetches upcoming games with odds, classifies picks.
 * Mirrors MLB picks/board pattern.
 */

import { createCache, coalesce } from '../../_cache.js';
import { fetchScoreboard } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';

const cache = createCache(2 * 60 * 1000);
const CACHE_KEY = 'nba:picks:board';

function classifyPick(game) {
  const picks = [];
  const m = game.model || {};
  const mkt = game.market || {};
  const away = game.teams?.away;
  const home = game.teams?.home;
  if (!away || !home) return picks;

  const edge = m.pregameEdge ?? 0;
  const absEdge = Math.abs(edge);
  const conf = m.confidence ?? 0;
  const spread = mkt.pregameSpread;
  const total = mkt.pregameTotal;
  const ml = mkt.moneyline;

  // Confidence tier
  const tier = absEdge >= 2.5 ? 'high' : absEdge >= 1.0 ? 'medium' : 'low';

  // Pick 'Ems — moneyline pick
  if (absEdge >= 0.8 && ml != null) {
    const side = edge > 0 ? 'home' : 'away';
    const team = side === 'home' ? home : away;
    const mlVal = side === 'home' ? ml : (ml > 0 ? -ml : Math.abs(ml));
    picks.push({
      id: `${game.gameId}-pickems`,
      gameId: game.gameId,
      category: 'pickEms',
      confidence: tier,
      matchup: { awayTeam: away, homeTeam: home, startTime: game.startTime },
      pick: {
        label: `${team.abbrev} ${mlVal > 0 ? '+' : ''}${mlVal}`,
        side,
        explanation: `Model sees ${absEdge.toFixed(1)}-point edge for ${team.shortName || team.name}`,
        topSignals: [`${absEdge.toFixed(1)}pt edge`, `${Math.round(conf * 100)}% confidence`],
      },
      market: { spread, total, moneyline: ml },
    });
  }

  // ATS — spread pick
  if (absEdge >= 1.2 && spread != null) {
    const side = edge > 0 ? 'home' : 'away';
    const team = side === 'home' ? home : away;
    const spreadVal = side === 'home' ? spread : -spread;
    picks.push({
      id: `${game.gameId}-ats`,
      gameId: game.gameId,
      category: 'ats',
      confidence: tier,
      matchup: { awayTeam: away, homeTeam: home, startTime: game.startTime },
      pick: {
        label: `${team.abbrev} ${spreadVal > 0 ? '+' : ''}${spreadVal}`,
        side,
        explanation: `Model projects cover by ${Math.abs(absEdge - Math.abs(spread)).toFixed(1)} points`,
        topSignals: [`${spreadVal > 0 ? '+' : ''}${spreadVal} spread`, `${tier} conviction`],
      },
      market: { spread, total, moneyline: ml },
    });
  }

  // Value Leans — softer moneyline
  if (absEdge >= 0.4 && absEdge < 1.5 && ml != null) {
    const side = edge > 0 ? 'home' : 'away';
    const team = side === 'home' ? home : away;
    picks.push({
      id: `${game.gameId}-leans`,
      gameId: game.gameId,
      category: 'leans',
      confidence: 'low',
      matchup: { awayTeam: away, homeTeam: home, startTime: game.startTime },
      pick: {
        label: `Lean ${team.abbrev}`,
        side,
        explanation: `Slight ${absEdge.toFixed(1)}-point model lean`,
        topSignals: ['Value lean', `${absEdge.toFixed(1)}pt edge`],
      },
      market: { spread, total, moneyline: ml },
    });
  }

  // Game Totals
  if (total != null && m.fairTotal != null) {
    const totalEdge = m.fairTotal - total;
    const absTotalEdge = Math.abs(totalEdge);
    if (absTotalEdge >= 1.5) {
      const overUnder = totalEdge > 0 ? 'Over' : 'Under';
      const totalTier = absTotalEdge >= 4 ? 'high' : absTotalEdge >= 2.5 ? 'medium' : 'low';
      picks.push({
        id: `${game.gameId}-totals`,
        gameId: game.gameId,
        category: 'totals',
        confidence: totalTier,
        matchup: { awayTeam: away, homeTeam: home, startTime: game.startTime },
        pick: {
          label: `${overUnder} ${total}`,
          side: overUnder.toLowerCase(),
          explanation: `Model projects ${Math.abs(totalEdge).toFixed(1)} points ${overUnder === 'Over' ? 'above' : 'below'} the line`,
          topSignals: [`O/U ${total}`, `${totalTier} conviction`],
        },
        market: { spread, total, moneyline: ml },
      });
    }
  }

  return picks;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  try {
    let games = await coalesce(CACHE_KEY + ':fetch', fetchScoreboard);
    games = await enrichGamesWithOdds(games).catch(() => games);

    // Filter to upcoming/scheduled only
    const upcoming = games.filter(g => g.status === 'upcoming');

    // Classify picks
    const allPicks = [];
    for (const game of upcoming) {
      allPicks.push(...classifyPick(game));
    }

    // Group by category, cap at 5 per column
    const categories = { pickEms: [], ats: [], leans: [], totals: [] };
    for (const pick of allPicks) {
      if (categories[pick.category] && categories[pick.category].length < 5) {
        categories[pick.category].push(pick);
      }
    }

    const payload = {
      categories,
      meta: {
        totalGames: upcoming.length,
        totalPicks: allPicks.length,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(CACHE_KEY, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ categories: { pickEms: [], ats: [], leans: [], totals: [] }, meta: { error: err?.message } });
  }
}
