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
    const atsLeadersCount = (result.best?.length || 0) + (result.worst?.length || 0);
    if (isDev) {
      console.log('[api/ats/warm] success', { atsLeadersCount, sourceLabel: result.sourceLabel });
    }
    return res.status(200).json({
      ok: true,
      atsLeadersCount,
      source: result.source ?? null,
      sourceLabel: result.sourceLabel ?? null,
      ...(result.unavailableReason ? { unavailableReason: result.unavailableReason } : {}),
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
