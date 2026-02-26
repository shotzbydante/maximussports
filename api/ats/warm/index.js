/**
 * GET /api/ats/warm — Warm ATS for a window. ?window=last30|last7 (default last30).
 * Team ATS (same source as pinned cards) → write KV; if fail, proxy fallback → write KV. Never write EMPTY.
 * Early exit: if KV already has real+fresh data for this window, return immediately without recomputing.
 */

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { setJson, getJson, getWithMeta, getAtsLeadersKeyForWindow, MAX_TTL_SECONDS, FRESH_SECONDS } from '../../_globalCache.js';
import { computeAtsLeadersFromTeamAts } from '../../home/atsLeadersFromTeamAts.js';
import { computeFastFallbackFromRankingsOnly } from '../../home/atsFastFallback.js';
import { getQueryParam } from '../../_requestUrl.js';

export default async function handler(req, res) {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  const windowParam = (getQueryParam(req, 'window', 'last30') || 'last30').toLowerCase();
  const window = (windowParam === 'last7') ? 'last7' : 'last30';
  const windowDays = window === 'last7' ? 7 : 30;
  const kvKey = getAtsLeadersKeyForWindow(window);

  if (isDev) {
    console.log('[api/ats/warm] request', req.method, req.url || req.originalUrl || '', { window });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let kvWriteOk = false;
  let kvReadOk = false;
  let cacheNote = null;

  /* Early exit: if KV has real (non-proxy) data and is fresh, skip compute. */
  try {
    const kvEntry = await getWithMeta(kvKey);
    if (kvEntry?.value) {
      const status = kvEntry.value.atsMeta?.status;
      const confidence = kvEntry.value.atsMeta?.confidence;
      const note = kvEntry.value.atsMeta?.cacheNote;
      const isReal = status === 'FULL' || (status === 'FALLBACK' && confidence !== 'low') || note === 'computed_recent_team_ats';
      const isFresh = !kvEntry.stale && kvEntry.ageSeconds < FRESH_SECONDS;
      const hasLeaders = (kvEntry.value.atsLeaders?.best?.length || 0) + (kvEntry.value.atsLeaders?.worst?.length || 0) > 0;
      if (hasLeaders && isReal && isFresh) {
        kvReadOk = true;
        if (isDev) console.log('[api/ats/warm] early exit', { window, status, confidence, ageSeconds: kvEntry.ageSeconds });
        return res.status(200).json({
          ok: true,
          window,
          status: status ?? 'FULL',
          bestCount: kvEntry.value.atsLeaders?.best?.length ?? 0,
          worstCount: kvEntry.value.atsLeaders?.worst?.length ?? 0,
          sourceLabel: kvEntry.value.atsMeta?.sourceLabel ?? null,
          confidence: confidence ?? 'high',
          kvWriteOk: false,
          kvReadOk: true,
          cacheNote: note ?? 'kv_hit',
          earlyExit: true,
        });
      }
    }
  } catch (_) {}

  try {
    let result = await computeAtsLeadersFromTeamAts({ windowDays, teamSlugs: [] });
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
            cacheNote: teamAtsHasLeaders ? 'computed_recent_team_ats' : 'computed_proxy',
          },
        };
        await setJson(kvKey, payload, { exSeconds: MAX_TTL_SECONDS });
        kvWriteOk = true;
      } catch (kvErr) {
        console.warn('[api/ats/warm] KV write failed (in-memory updated):', kvErr?.message);
      }
    }
    cacheNote = teamAtsHasLeaders ? 'computed_recent_team_ats' : 'computed_proxy';
    if (isDev) {
      console.log('[api/ats/warm] success', { window, status: result.status, bestCount, worstCount, sourceLabel: result.sourceLabel, confidence: result.confidence, kvWriteOk });
    }
    return res.status(200).json({
      ok: true,
      window,
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
        const kvVal = await getJson(kvKey);
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
