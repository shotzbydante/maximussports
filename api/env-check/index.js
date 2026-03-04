/**
 * Runtime env check. GET /api/env-check
 * Returns hasOddsKey and keyLength (never the key itself).
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ODDS_API_KEY || '';
  res.status(200).json({
    hasOddsKey:     !!process.env.ODDS_API_KEY,
    keyLength:      key.length,
    hasYoutubeKey:  !!process.env.YOUTUBE_API_KEY,
  });
}
