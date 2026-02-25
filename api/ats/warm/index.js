/**
 * GET /api/ats/warm — Cron warm-up for ATS leaders cache.
 * Computes full-league ATS leaders (with fallback), writes to shared cache, returns count.
 * Call every 5–10 min via Vercel cron.
 */

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { computeAtsLeadersFromSources } from '../../home/atsLeaders.js';

export default async function handler(req, res) {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isDev) {
    console.log('[api/ats/warm] request', req.method, req.url || req.originalUrl || '');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await computeAtsLeadersFromSources();
    const { unavailableReason, ...ats } = result;
    setAtsLeaders(ats);
    const atsLeadersCount = (ats.best?.length || 0) + (ats.worst?.length || 0);
    if (isDev) {
      console.log('[api/ats/warm] success', { atsLeadersCount, source: ats.source, sourceLabel: ats.sourceLabel });
    }
    return res.status(200).json({
      ok: true,
      atsLeadersCount,
      source: ats.source ?? null,
      sourceLabel: ats.sourceLabel ?? null,
      ...(unavailableReason ? { unavailableReason } : {}),
    });
  } catch (err) {
    console.error('[api/ats/warm] error:', err?.message);
    if (err?.stack) console.error('[api/ats/warm] stack', err.stack);
    const cached = getAtsLeaders();
    const atsLeadersCount = (cached.best?.length || 0) + (cached.worst?.length || 0);
    return res.status(200).json({
      ok: false,
      error: err?.message,
      atsLeadersCount,
    });
  }
}
