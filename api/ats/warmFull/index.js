/**
 * GET /api/ats/warmFull — Full-league ATS warm. Uses odds history; may take up to ~30s.
 * Only overwrites cache when result is FULL with non-empty best/worst.
 * Vercel Pro: maxDuration 30s for this route.
 */

export const config = { maxDuration: 30 };

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { computeAtsLeadersFromSources } from '../../home/atsLeaders.js';

const FULL_DEADLINE_MS = 28000;

export default async function handler(req, res) {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isDev) {
    console.log('[api/ats/warmFull] request', req.method, req.url || req.originalUrl || '');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('warmFull_timeout')), FULL_DEADLINE_MS));

  try {
    const result = await Promise.race([computeAtsLeadersFromSources(), deadline]);
    const bestCount = result.best?.length ?? 0;
    const worstCount = result.worst?.length ?? 0;
    const status = result.status ?? (bestCount + worstCount > 0 ? 'FULL' : 'EMPTY');

    if (status === 'FULL' && (bestCount > 0 || worstCount > 0)) {
      const payload = {
        best: result.best || [],
        worst: result.worst || [],
        source: result.source ?? null,
        sourceLabel: result.sourceLabel ?? 'Full league ATS',
        status: 'FULL',
        reason: 'full_league_odds_history',
        confidence: 'high',
        generatedAt: new Date().toISOString(),
      };
      setAtsLeaders(payload);
      if (isDev) {
        console.log('[api/ats/warmFull] cache updated with FULL', { bestCount, worstCount });
      }
      return res.status(200).json({
        ok: true,
        status: 'FULL',
        bestCount,
        worstCount,
        sourceLabel: payload.sourceLabel,
        confidence: 'high',
        reason: payload.reason,
      });
    }

    return res.status(200).json({
      ok: true,
      status: status ?? 'EMPTY',
      bestCount,
      worstCount,
      sourceLabel: result.sourceLabel ?? null,
      confidence: result.confidence ?? 'low',
      reason: result.reason ?? result.unavailableReason ?? null,
      cached: false,
    });
  } catch (err) {
    if (isDev) {
      console.log('[api/ats/warmFull] timeout or error', err?.message);
    }
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
      reason: cached.atsMeta?.reason ?? err?.message ?? 'warmFull_failed',
      cached: bestCount + worstCount > 0,
    });
  }
}
