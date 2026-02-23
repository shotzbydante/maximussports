/**
 * Batch endpoint for Home page: scores + odds + rankings + headlines in one round trip.
 * GET /api/home
 * Returns: { scores, odds, rankings, headlines, dataStatus }.
 * Uses internal cache of underlying APIs (scores, odds, rankings, news/aggregate).
 */

function getBaseUrl(req) {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const host = req.headers?.host || 'localhost:3000';
  const proto = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = getBaseUrl(req);

  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    console.time('[api/home] batch');
  }

  try {
    const [scoresRes, oddsRes, rankingsRes, newsRes] = await Promise.all([
      fetch(`${baseUrl}/api/scores`, { headers: { Accept: 'application/json' } }),
      fetch(`${baseUrl}/api/odds`, { headers: { Accept: 'application/json' } }),
      fetch(`${baseUrl}/api/rankings`, { headers: { Accept: 'application/json' } }),
      fetch(`${baseUrl}/api/news/aggregate?includeNational=true`, { headers: { Accept: 'application/json' } }),
    ]);

    const scores = scoresRes.ok ? await scoresRes.json() : [];
    const scoresArray = Array.isArray(scores) ? scores : scores?.games || [];

    let odds = { games: [] };
    if (oddsRes.ok) {
      const o = await oddsRes.json();
      odds = { games: Array.isArray(o?.games) ? o.games : [], error: o?.error, hasOddsKey: o?.hasOddsKey };
    }

    let rankings = { rankings: [] };
    if (rankingsRes.ok) {
      const r = await rankingsRes.json();
      rankings = { rankings: r?.rankings || [] };
    }

    let headlines = [];
    if (newsRes.ok) {
      const n = await newsRes.json();
      headlines = n?.items || [];
    }

    const dataStatus = {
      scoresCount: scoresArray.length,
      rankingsCount: rankings.rankings.length,
      oddsCount: odds.games.length,
      oddsHistoryCount: 0,
      headlinesCount: headlines.length,
      dataStatusLine: [
        `Top 25: ${rankings.rankings.length > 0 ? `OK (${rankings.rankings.length})` : 'MISSING'}`,
        `Scores: ${scoresArray.length > 0 ? `OK (${scoresArray.length})` : 'MISSING'}`,
        `Odds: ${odds.games.length > 0 ? `OK (${odds.games.length})` : 'MISSING'}`,
        `Headlines: ${headlines.length > 0 ? `OK (${headlines.length})` : 'MISSING'}`,
      ].join('. '),
    };

    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd('[api/home] batch');
    }

    res.status(200).json({
      scores: scoresArray,
      odds,
      rankings,
      headlines,
      dataStatus,
    });
  } catch (err) {
    console.error('[api/home] error:', err.message);
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd('[api/home] batch');
    }
    res.status(200).json({
      scores: [],
      odds: { games: [] },
      rankings: { rankings: [] },
      headlines: [],
      dataStatus: {
        scoresCount: 0,
        rankingsCount: 0,
        oddsCount: 0,
        oddsHistoryCount: 0,
        headlinesCount: 0,
        dataStatusLine: 'Batch fetch failed.',
      },
    });
  }
}
