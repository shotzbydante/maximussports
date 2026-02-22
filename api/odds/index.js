/**
 * Vercel Serverless Function: proxy The Odds API (NCAA basketball).
 * GET /api/odds
 * Params: ?date=YYYY-MM-DD (optional), ?team=slug (optional - filter by team, client-normalized)
 * Requires ODDS_API_KEY env var.
 * Response: { games: [{ gameId, homeTeam, awayTeam, commenceTime, spread, total, moneyline, sportsbook }] }
 */

const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds';

// Simple in-memory cache: key -> { data, expires }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(params) {
  return JSON.stringify(params);
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
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

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Odds API not configured (ODDS_API_KEY)' });
  }

  try {
    const dateParam = req.query?.date;
    const teamParam = req.query?.team;

    const cacheKey = getCacheKey({ date: dateParam, team: teamParam });
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
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

    const url = `${ODDS_BASE}?${params.toString()}`;
    const oddsRes = await fetch(url);

    const remaining = oddsRes.headers.get('x-requests-remaining');
    const used = oddsRes.headers.get('x-requests-used');

    if (!oddsRes.ok) {
      const errBody = await oddsRes.text();
      console.error('Odds API error:', oddsRes.status, errBody);
      throw new Error(`Odds API failed: ${oddsRes.status}`);
    }

    const raw = await oddsRes.json();
    if (!Array.isArray(raw)) {
      throw new Error('Unexpected Odds API response');
    }

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

    const result = {
      games,
      meta: remaining != null ? { requestsRemaining: parseInt(remaining, 10), requestsUsed: parseInt(used, 10) } : undefined,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('Odds API proxy error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch odds' });
  }
}
