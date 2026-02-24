/**
 * GET /api/ats/warm — Cron warm-up for ATS leaders cache.
 * Computes full-league ATS leaders (with fallback), writes to shared cache, returns count.
 * Call every 5–10 min via Vercel cron.
 */

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { computeAtsLeadersFromSources } from '../../home/atsLeaders.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await computeAtsLeadersFromSources();
    const { unavailableReason, ...ats } = result;
    setAtsLeaders(ats);
    const atsLeadersCount = (ats.best?.length || 0) + (ats.worst?.length || 0);
    return res.status(200).json({
      ok: true,
      atsLeadersCount,
      source: ats.source ?? null,
      sourceLabel: ats.sourceLabel ?? null,
      ...(unavailableReason ? { unavailableReason } : {}),
    });
  } catch (err) {
    console.error('[api/ats/warm] error:', err?.message);
    const cached = getAtsLeaders();
    const atsLeadersCount = (cached.best?.length || 0) + (cached.worst?.length || 0);
    return res.status(200).json({
      ok: false,
      error: err?.message,
      atsLeadersCount,
    });
  }
}
