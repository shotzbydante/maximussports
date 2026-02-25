/**
 * Single shared ATS pipeline. getAtsLeadersPipeline() used by /api/home, /api/home/fast, /api/home/slow.
 * Reads from KV first; on miss computes fast fallback and writes to KV. Never overwrites KV with EMPTY.
 * Returns atsMeta (status FULL|FALLBACK|EMPTY, reason, sourceLabel, cacheNote) so UI never shows infinite loading.
 */

import { coalesce } from '../_cache.js';
import { getAtsLeaders, setAtsLeaders, getAtsLeadersMaybeStale } from './cache.js';
import { getWithMeta, setJson, ATS_LEADERS_KEY, MAX_TTL_SECONDS } from '../_globalCache.js';
import { computeFastFallbackFromRankingsOnly } from './atsFastFallback.js';

const ATS_COALESCE_KEY = 'ats:leaders';
const DEBUG_ATS = process.env.DEBUG_ATS === '1';

function buildAtsMeta(result, fromCache = false, stale = false, cacheNote = null) {
  const status = result?.status ?? (result?.best?.length || result?.worst?.length ? 'FULL' : 'EMPTY');
  const confidence = result?.confidence ?? (status === 'FULL' ? 'high' : status === 'FALLBACK' ? 'medium' : 'low');
  const meta = {
    status,
    reason: result?.reason ?? result?.unavailableReason ?? null,
    sourceLabel: result?.sourceLabel ?? null,
    confidence,
    generatedAt: result?.generatedAt ?? new Date().toISOString(),
    fromCache: !!fromCache,
    stale: !!stale,
  };
  if (cacheNote) meta.cacheNote = cacheNote;
  return meta;
}

function kvPayloadToResult(kvValue, cacheNote) {
  const atsLeaders = kvValue.atsLeaders ?? {};
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  const atsMeta = kvValue.atsMeta ?? {};
  const meta = {
    ...atsMeta,
    cacheNote,
  };
  return {
    best,
    worst,
    sourceLabel: atsMeta.sourceLabel ?? null,
    source: atsMeta.source ?? null,
    status: atsMeta.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY'),
    reason: atsMeta.reason ?? null,
    generatedAt: atsMeta.generatedAt ?? null,
    atsMeta: meta,
    fromCache: true,
  };
}

/** Never write EMPTY to KV. */
function writeAtsToKvIfValid(best, worst, atsMeta) {
  const status = atsMeta?.status ?? (best?.length || worst?.length ? 'FULL' : 'EMPTY');
  if (status === 'EMPTY' && !(best?.length || worst?.length)) return;
  const payload = {
    atsLeaders: { best: best || [], worst: worst || [] },
    atsMeta: {
      status,
      confidence: atsMeta?.confidence ?? 'low',
      reason: atsMeta?.reason ?? null,
      sourceLabel: atsMeta?.sourceLabel ?? null,
      generatedAt: atsMeta?.generatedAt ?? new Date().toISOString(),
    },
  };
  setJson(ATS_LEADERS_KEY, payload, { exSeconds: MAX_TTL_SECONDS });
}

/**
 * Get ATS leaders. Reads from KV first; on miss computes fast fallback, writes to KV (if not EMPTY), returns.
 * Always returns atsMeta with cacheNote: "kv_hit" | "kv_stale" | "computed_fallback".
 */
export async function getAtsLeadersPipeline() {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

  const kvEntry = await getWithMeta(ATS_LEADERS_KEY);
  if (kvEntry?.value) {
    const cacheNote = kvEntry.stale ? 'kv_stale' : 'kv_hit';
    if (DEBUG_ATS) console.log('[atsPipeline] KV', cacheNote, { ageSeconds: kvEntry.ageSeconds });
    const result = kvPayloadToResult(kvEntry.value, cacheNote);
    setAtsLeaders({
      best: result.best,
      worst: result.worst,
      status: result.status,
      sourceLabel: result.sourceLabel,
      reason: result.reason,
      confidence: result.atsMeta.confidence,
      generatedAt: result.generatedAt,
    });
    return result;
  }

  try {
    const result = await coalesce(ATS_COALESCE_KEY, async () => {
      const fallback = await computeFastFallbackFromRankingsOnly();
      const best = fallback.best || [];
      const worst = fallback.worst || [];
      writeAtsToKvIfValid(best, worst, {
        status: fallback.status,
        confidence: fallback.confidence,
        reason: fallback.reason,
        sourceLabel: fallback.sourceLabel,
        generatedAt: fallback.generatedAt,
      });
      setAtsLeaders({
        best,
        worst,
        source: fallback.source ?? null,
        sourceLabel: fallback.sourceLabel ?? null,
        status: fallback.status,
        reason: fallback.reason ?? null,
        confidence: fallback.confidence ?? 'low',
        generatedAt: fallback.generatedAt ?? new Date().toISOString(),
      });
      return {
        ...fallback,
        unavailableReason: fallback.reason ?? null,
      };
    });
    const best = result.best || [];
    const worst = result.worst || [];
    if (isDev) console.log('[atsPipeline] computed_fallback', { best: best.length, worst: worst.length, status: result.status });
    return {
      best,
      worst,
      sourceLabel: result.sourceLabel ?? null,
      source: result.source ?? null,
      status: result.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY'),
      reason: result.reason ?? result.unavailableReason ?? null,
      generatedAt: result.generatedAt ?? new Date().toISOString(),
      atsMeta: buildAtsMeta(result, false, false, 'computed_fallback'),
      fromCache: false,
      unavailableReason: result.unavailableReason,
    };
  } catch (err) {
    if (isDev) console.log('[atsPipeline] compute failed, serving stale if any', err?.message);
    const stale = getAtsLeadersMaybeStale();
    if (stale && (stale.atsMeta || (stale.best?.length || 0) + (stale.worst?.length || 0) > 0)) {
      const meta = stale.atsMeta ?? buildAtsMeta(stale, true, true);
      meta.cacheNote = 'kv_stale';
      return {
        best: stale.best || [],
        worst: stale.worst || [],
        sourceLabel: stale.sourceLabel ?? null,
        source: stale.source ?? null,
        status: meta.status ?? 'FULL',
        reason: meta.reason ?? null,
        generatedAt: meta.generatedAt ?? null,
        atsMeta: meta,
        fromCache: true,
        stale: true,
        ageMs: stale.ageMs,
      };
    }
    const emptyMeta = buildAtsMeta({ status: 'EMPTY', reason: err?.message || 'computation_failed', sourceLabel: null, confidence: 'low' }, false, false, 'computed_fallback');
    return {
      best: [],
      worst: [],
      sourceLabel: null,
      status: 'EMPTY',
      reason: emptyMeta.reason,
      generatedAt: emptyMeta.generatedAt,
      atsMeta: emptyMeta,
      fromCache: false,
      unavailableReason: err?.message || 'ATS computation failed',
    };
  }
}
