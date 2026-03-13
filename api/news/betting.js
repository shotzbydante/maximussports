/**
 * Betting news endpoint — returns betting-oriented college basketball headlines.
 * GET /api/news/betting
 */

import { fetchBettingNewsSource } from '../_sources.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = await fetchBettingNewsSource();
    return res.status(200).json({
      status: 'ok',
      updatedAt: new Date().toISOString(),
      items: data?.items || [],
    });
  } catch (err) {
    console.error('[api/news/betting] error:', err.message);
    return res.status(200).json({
      status: 'error',
      updatedAt: new Date().toISOString(),
      items: [],
    });
  }
}
