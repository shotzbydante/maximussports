/**
 * Vercel Serverless Function: proxy The Odds API (NCAA basketball).
 * GET /api/odds
 * Params: ?date=YYYY-MM-DD (optional), ?team=slug (optional)
 * Requires ODDS_API_KEY env var. Cache: 10 min. CDN: s-maxage=300, stale-while-revalidate=600.
 */

import { createCache, coalesce } from '../_cache.js';

const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const oddsCache = createCache(CACHE_TTL_MS);

function getCacheKey(params) {
  return `odds:${JSON.stringify(params)}`;
}

function extractOdds(bookmakers) {
  let spread = null;
  let total = null;
  let moneyline = null;
  let sportsbook = null;

  for (const bm of bookmakers || []) {
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads' && mkt.outcomes?.length >= 2) {
        // Away team spread: positive = underdog, negative = favorite
        const awayOutcome = mkt.outcomes.find((o) => o.point != null);
        if (awayOutcome) {
          const pt = awayOutcome.point;
          spread = pt > 0 ? `+${pt}` : String(pt);
          sportsbook = sportsbook || bm.title;
        }
      }
      if (mkt.key === 'totals' && mkt.outcomes?.length >= 2) {
        const over = mkt.outcomes.find((o) => o.name === 'Over');
        if (over?.point != null) {
          total = over.point;
          sportsbook = sportsbook || bm.title;
        }
      }
      if (mkt.key === 'h2h' && mkt.outcomes?.length >= 2) {
        // Odds API h2h uses team names; order is typically away, home
        const outcomes = mkt.outcomes;
        const prices = outcomes.map((o) => o.price != null ? (o.price > 0 ? `+${o.price}` : String(o.price)) : null).filter(Boolean);
        if (prices.length >= 2) {
          moneyline = `${prices[0]} / ${prices[1]}`;
          sportsbook = sportsbook || bm.title;
        }
      }
    }
    if (spread != null && total != null) break;
  }

  return { spread, total, moneyline, sportsbook };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const dateParam = req.query?.date;
  const teamParam = req.query?.team;
  const debug = req.query?.debug === 'true' || req.query?.debug === '1';

  const apiKey = process.env.ODDS_API_KEY;
  const hasOddsKey = !!apiKey;
  if (!apiKey) {
    const payload = { games: [], error: 'missing_key', hasOddsKey: false };
    if (debug) {
      payload.debug = { gamesCount: 0, cacheHit: false, firstGame: null, hasOddsKey: false };
    }
    return res.status(200).json(payload);
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const cacheKey = getCacheKey({ date: dateParam, team: teamParam });
  const cached = oddsCache.get(cacheKey);

  const addDebug = (payload) => {
    if (debug) {
      payload.debug = {
        gamesCount: payload.games?.length ?? 0,
        cacheHit: !!cached,
        firstGame: payload.games?.[0] ? { homeTeam: payload.games[0].homeTeam, awayTeam: payload.games[0].awayTeam, spread: payload.games[0].spread } : null,
        hasOddsKey: true,
        ...(payload.error && { error: payload.error }),
      };
    }
    return payload;
  };

  try {
    if (cached) {
      return res.json(addDebug({ ...cached }));
    }

    const result = await coalesce(cacheKey, async () => {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.time(`[api/odds] ${cacheKey}`);
      }
      const params = new URLSearchParams({
      regions: 'us',
      markets: 'spreads,totals,h2h',
      oddsFormat: 'american',
      dateFormat: 'iso',
      apiKey,
    });

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      params.set('commenceTimeFrom', `${dateParam}T00:00:00Z`);
      params.set('commenceTimeTo', `${dateParam}T23:59:59Z`);
    }

    let raw = null;
    let oddsRes = null;
    const tryMarkets = ['spreads,totals,h2h', 'spreads,totals', 'spreads'];

    for (const markets of tryMarkets) {
      params.set('markets', markets);
      const url = `${ODDS_BASE}?${params.toString()}`;
      oddsRes = await fetch(url);

      if (!oddsRes.ok) {
        const errBody = await oddsRes.text();
        console.error('Odds API error:', oddsRes.status, errBody);
        throw new Error(`Odds API failed: ${oddsRes.status}`);
      }

      raw = await oddsRes.json();
      if (!Array.isArray(raw)) {
        throw new Error('Unexpected Odds API response');
      }
      if (raw.length > 0) break;
    }

    const remaining = oddsRes?.headers?.get?.('x-requests-remaining');
    const used = oddsRes?.headers?.get?.('x-requests-used');

    const games = raw.map((ev) => {
      const { spread, total, moneyline, sportsbook } = extractOdds(ev.bookmakers);
      return {
        gameId: ev.id,
        homeTeam: ev.home_team,
        awayTeam: ev.away_team,
        commenceTime: ev.commence_time,
        spread,
        total: total != null ? String(total) : null,
        moneyline,
        sportsbook: sportsbook || 'Odds API',
      };
    });

      const out = {
        games,
        meta: remaining != null ? { requestsRemaining: parseInt(remaining, 10), requestsUsed: parseInt(used, 10) } : undefined,
      };
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.timeEnd(`[api/odds] ${cacheKey}`);
      }
      return out;
    });

    oddsCache.set(cacheKey, result);
    res.json(addDebug(result));
  } catch (err) {
    console.error('Odds API proxy error:', err.message);
    res.status(200).json(addDebug({ games: [], error: err.message }));
  }
}
