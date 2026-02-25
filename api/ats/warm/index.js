/**
 * GET /api/ats/warm — Fast fallback warm (~1–2s). No odds history or per-team schedule.
 * Uses only rankings + team IDs; produces proxy leaderboard so Home never shows empty.
 * Cache gets FALLBACK with confidence "low". Cron every 5–10 min.
 */

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { computeFastFallbackFromRankingsOnly } from '../../home/atsFastFallback.js';

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
    const result = await computeFastFallbackFromRankingsOnly();
    const bestCount = result.best?.length ?? 0;
    const worstCount = result.worst?.length ?? 0;
    setAtsLeaders(result);
    if (isDev) {
      console.log('[api/ats/warm] success', { status: result.status, bestCount, worstCount, sourceLabel: result.sourceLabel, confidence: result.confidence });
    }
    return res.status(200).json({
      ok: true,
      status: result.status,
      bestCount,
      worstCount,
      sourceLabel: result.sourceLabel ?? null,
      confidence: result.confidence ?? 'low',
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
      confidence: cached.atsMeta?.confidence ?? 'low',
      reason: cached.atsMeta?.reason ?? err?.message ?? 'warm_failed',
    });
  }
}
