/**
 * GET /api/ats/warm — Cron warm-up for ATS leaders cache.
 * Calls getAtsLeadersPipeline({ warm: true }) to compute and populate cache; returns JSON summary.
 * No heavy work beyond warming cache. Call every 5–10 min via Vercel cron.
 */

import { getAtsLeaders } from '../../home/cache.js';
import { getAtsLeadersPipeline } from '../../home/atsPipeline.js';

export default async function handler(req, res) {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isDev) {
    console.log('[api/ats/warm] request', req.method, req.url || req.originalUrl || '');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await getAtsLeadersPipeline({ warm: true });
    const bestCount = result.best?.length ?? 0;
    const worstCount = result.worst?.length ?? 0;
    const status = result.status ?? (bestCount + worstCount > 0 ? 'FULL' : 'EMPTY');
    if (isDev) {
      console.log('[api/ats/warm] success', { status, bestCount, worstCount, sourceLabel: result.sourceLabel, reason: result.reason });
    }
    return res.status(200).json({
      ok: true,
      status,
      bestCount,
      worstCount,
      sourceLabel: result.sourceLabel ?? null,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (err) {
    console.error('[api/ats/warm] error:', err?.message);
    if (err?.stack) console.error('[api/ats/warm] stack', err.stack);
    const cached = getAtsLeaders();
    const bestCount = cached.best?.length ?? 0;
    const worstCount = cached.worst?.length ?? 0;
    return res.status(200).json({
      ok: false,
      error: err?.message,
      status: cached.atsMeta?.status ?? 'EMPTY',
      bestCount,
      worstCount,
      sourceLabel: cached.atsMeta?.sourceLabel ?? null,
      reason: cached.atsMeta?.reason ?? err?.message ?? 'warm_failed',
    });
  }
}
