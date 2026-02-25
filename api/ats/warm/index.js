/**
 * GET /api/ats/warm — Warm LAST 30 first: team ATS (same source as pinned cards) → write KV; if fail, proxy fallback → write KV. Never write EMPTY.
 */

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { setJson, getJson, getAtsLeadersKeyForWindow, MAX_TTL_SECONDS } from '../../_globalCache.js';
import { computeAtsLeadersFromTeamAts } from '../../home/atsLeadersFromTeamAts.js';
import { computeFastFallbackFromRankingsOnly } from '../../home/atsFastFallback.js';

const LAST30_KEY = getAtsLeadersKeyForWindow('last30');

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

  let kvWriteOk = false;
  let kvReadOk = false;
  let cacheNote = null;

  try {
    let result = await computeAtsLeadersFromTeamAts({ windowDays: 30, teamSlugs: [] });
    const teamAtsHasLeaders = (result.best?.length || 0) + (result.worst?.length || 0) > 0 && result.status !== 'EMPTY';
    if (!teamAtsHasLeaders) {
      result = await computeFastFallbackFromRankingsOnly();
    }
    const bestCount = result.best?.length ?? 0;
    const worstCount = result.worst?.length ?? 0;
    setAtsLeaders(result);
    if (result.status !== 'EMPTY' || bestCount > 0 || worstCount > 0) {
      try {
        const payload = {
          atsLeaders: { best: result.best || [], worst: result.worst || [] },
          atsMeta: {
            status: result.status ?? 'FALLBACK',
            confidence: result.confidence ?? 'low',
            reason: result.reason ?? null,
            sourceLabel: result.sourceLabel ?? null,
            generatedAt: result.generatedAt ?? new Date().toISOString(),
          },
        };
        await setJson(LAST30_KEY, payload, { exSeconds: MAX_TTL_SECONDS });
        kvWriteOk = true;
      } catch (kvErr) {
        console.warn('[api/ats/warm] KV write failed (in-memory updated):', kvErr?.message);
      }
    }
    cacheNote = teamAtsHasLeaders ? 'computed_recent_team_ats' : 'computed_proxy';
    if (isDev) {
      console.log('[api/ats/warm] success', { status: result.status, bestCount, worstCount, sourceLabel: result.sourceLabel, confidence: result.confidence, kvWriteOk });
    }
    return res.status(200).json({
      ok: true,
      status: result.status,
      bestCount,
      worstCount,
      sourceLabel: result.sourceLabel ?? null,
      confidence: result.confidence ?? 'low',
      kvWriteOk,
      kvReadOk,
      cacheNote,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (err) {
    console.error('[api/ats/warm] error:', err?.message);
    if (err?.stack) console.error('[api/ats/warm] stack', err.stack);
    let bestCount = 0;
    let worstCount = 0;
    let status = 'EMPTY';
    let sourceLabel = null;
    let confidence = 'low';
    let reason = err?.message ?? 'warm_failed';
    const cached = getAtsLeaders();
    if ((cached.best?.length || 0) + (cached.worst?.length || 0) > 0) {
      bestCount = cached.best?.length ?? 0;
      worstCount = cached.worst?.length ?? 0;
      status = cached.atsMeta?.status ?? 'FALLBACK';
      sourceLabel = cached.atsMeta?.sourceLabel ?? null;
      confidence = cached.atsMeta?.confidence ?? 'low';
      reason = cached.atsMeta?.reason ?? reason;
    } else {
      try {
        const kvVal = await getJson(LAST30_KEY);
        kvReadOk = true;
        if (kvVal?.atsLeaders) {
          const b = kvVal.atsLeaders.best || [];
          const w = kvVal.atsLeaders.worst || [];
          bestCount = b.length;
          worstCount = w.length;
          if (bestCount + worstCount > 0) {
            status = kvVal.atsMeta?.status ?? 'FALLBACK';
            sourceLabel = kvVal.atsMeta?.sourceLabel ?? null;
            confidence = kvVal.atsMeta?.confidence ?? 'low';
            reason = kvVal.atsMeta?.reason ?? reason;
          }
        }
      } catch (kvErr) {
        console.warn('[api/ats/warm] KV read failed:', kvErr?.message);
      }
    }
    return res.status(200).json({
      ok: false,
      error: err?.message,
      status,
      bestCount,
      worstCount,
      sourceLabel,
      confidence,
      reason,
      kvWriteOk,
      kvReadOk,
      ...(cacheNote ? { cacheNote } : {}),
    });
  }
}
