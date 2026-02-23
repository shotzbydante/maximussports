/**
 * Optional health check. GET /api/health
 * Returns 200 with { ok: true, timestamp } for monitoring.
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
}
