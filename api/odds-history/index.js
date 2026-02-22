/**
 * Vercel Serverless: proxy The Odds API historical odds (NCAA basketball).
 * GET /api/odds-history
 * Params: ?from=YYYY-MM-DD&to=YYYY-MM-DD (required)
 * Supports long ranges via 31-day chunking; each chunk cached 7 min.
 * Requires ODDS_API_KEY (paid plan for historical).
 * Response: { games: [{ gameId, homeTeam, awayTeam, commenceTime, spread, sportsbook }] }
 */

const ODDS_HISTORY_BASE = 'https://api.the-odds-api.com/v4/historical/sports/basketball_ncaab/odds';

const cache = new Map();
const CACHE_TTL_MS = 7 * 60 * 1000; // 7 min

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

function chunkDateRange(from, to, maxDays = 31) {
  const chunks = [];
  let start = new Date(from);
  const end = new Date(to);

  while (start <= end) {
    const chunkStart = new Date(start);
    const chunkEnd = new Date(start);
    chunkEnd.setDate(chunkEnd.getDate() + (maxDays - 1));
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      from: chunkStart.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });

    start = new Date(chunkEnd);
    start.setDate(start.getDate() + 1);
  }

  return chunks;
}

function getDaysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T12:00:00Z');
  const to = new Date(toStr + 'T12:00:00Z');
  const days = [];
  const cur = new Date(from);
  while (cur <= to) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function extractSpread(bookmakers) {
  for (const bm of bookmakers || []) {
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads' && mkt.outcomes?.length >= 2) {
        const awayOutcome = mkt.outcomes.find((o) => o.point != null);
        if (awayOutcome) {
          const pt = awayOutcome.point;
          const spread = pt > 0 ? `+${pt}` : String(pt);
          return { spread, sportsbook: bm.title || 'Odds API' };
        }
      }
    }
  }
  return { spread: null, sportsbook: null };
}

async function fetchChunk(apiKey, fromStr, toStr) {
  const cacheKey = getCacheKey({ from: fromStr, to: toStr });
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const days = getDaysBetween(fromStr, toStr);
  const gameMap = new Map();

  for (const day of days) {
    const dateParam = `${day}T23:59:59Z`;
    const params = new URLSearchParams({
      regions: 'us',
      markets: 'spreads',
      oddsFormat: 'american',
      dateFormat: 'iso',
      date: dateParam,
      apiKey,
    });
    const url = `${ODDS_HISTORY_BASE}?${params.toString()}`;
    const histRes = await fetch(url);

    if (!histRes.ok) {
      const errBody = await histRes.text();
      console.error('Odds history API error:', histRes.status, errBody);
      if (histRes.status === 402 || histRes.status === 429) {
        throw new Error('Odds API historical requires paid plan or rate limited');
      }
      throw new Error(`Odds history API failed: ${histRes.status}`);
    }

    const raw = await histRes.json();
    const events = Array.isArray(raw) ? raw : raw?.data ?? [];

    for (const ev of events) {
      const { spread, sportsbook } = extractSpread(ev.bookmakers);
      if (spread == null) continue;
      const key = `${ev.id || ''}-${ev.commence_time || ''}`.trim() || `${ev.home_team}-${ev.away_team}-${ev.commence_time}`;
      if (!gameMap.has(key)) {
        gameMap.set(key, {
          gameId: ev.id,
          homeTeam: ev.home_team,
          awayTeam: ev.away_team,
          commenceTime: ev.commence_time,
          spread,
          sportsbook: sportsbook || 'Odds API',
        });
      }
    }
  }

  const games = Array.from(gameMap.values());
  const result = { games };
  setCache(cacheKey, result);
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Odds API not configured (ODDS_API_KEY)' });

  const fromStr = req.query?.from;
  const toStr = req.query?.to;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!fromStr || !toStr || !dateRe.test(fromStr) || !dateRe.test(toStr)) {
    return res.status(400).json({ error: 'Missing or invalid ?from=YYYY-MM-DD&to=YYYY-MM-DD' });
  }

  const fromDate = new Date(fromStr + 'T12:00:00Z');
  const toDate = new Date(toStr + 'T12:00:00Z');
  if (fromDate > toDate) {
    return res.status(400).json({ error: 'from must be <= to' });
  }

  const fullCacheKey = getCacheKey({ from: fromStr, to: toStr });
  const fullCached = getCached(fullCacheKey);
  if (fullCached) return res.json(fullCached);

  try {
    const chunks = chunkDateRange(fromStr, toStr, 31);
    const gameMap = new Map();

    for (const chunk of chunks) {
      const chunkResult = await fetchChunk(apiKey, chunk.from, chunk.to);
      for (const g of chunkResult.games || []) {
        const key = `${g.gameId || ''}-${g.commenceTime || ''}`.trim() || `${g.homeTeam}-${g.awayTeam}-${g.commenceTime}`;
        if (!gameMap.has(key)) gameMap.set(key, g);
      }
    }

    const games = Array.from(gameMap.values());
    const result = { games };
    setCache(fullCacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('Odds history proxy error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch odds history' });
  }
}
