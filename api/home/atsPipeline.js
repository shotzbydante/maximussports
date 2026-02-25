/**
 * Single shared ATS pipeline. getAtsLeadersPipeline() used by /api/home, /api/home/fast, /api/home/slow.
 * Default ATS window = Last 30. Windowed KV keys: last30, last7, season.
 * Reads from KV first; on miss computes quick real (last30/last7) or proxy; writes to KV. Never overwrites KV with EMPTY.
 * Prefer FULL > real FALLBACK > proxy FALLBACK > EMPTY. Returns atsMeta with cacheNote: kv_hit | kv_stale | computed_quick_real | computed_proxy.
 */

import { coalesce } from '../_cache.js';
import { getAtsLeaders, setAtsLeaders, getAtsLeadersMaybeStale } from './cache.js';
import { getWithMeta, setJson, getJson, getAtsLeadersKeyForWindow, MAX_TTL_SECONDS } from '../_globalCache.js';
import { computeRealAtsQuickRecent } from './atsQuickReal.js';
import { computeFastFallbackFromRankingsOnly } from './atsFastFallback.js';

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

/** Never write EMPTY to KV. Never overwrite FULL or good FALLBACK with EMPTY. */
async function writeAtsToKvIfValid(key, best, worst, atsMeta) {
  const status = atsMeta?.status ?? (best?.length || worst?.length ? 'FULL' : 'EMPTY');
  if (status === 'EMPTY' && !(best?.length || worst?.length)) return;
  const existing = await getJson(key);
  const existingStatus = existing?.atsMeta?.status;
  if (status === 'EMPTY' && (existingStatus === 'FULL' || existingStatus === 'FALLBACK') && (existing?.atsLeaders?.best?.length || existing?.atsLeaders?.worst?.length)) return;
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
  await setJson(key, payload, { exSeconds: MAX_TTL_SECONDS });
}

/**
 * Get ATS leaders for a window. Default atsWindow = last30.
 * Reads from KV (window key) first; on miss: last30/last7 = quick real then proxy; season = read-only (best-effort), else serve last30 with "Season warming".
 * Always returns atsMeta with cacheNote: kv_hit | kv_stale | computed_quick_real | computed_proxy.
 * @param {{ pinnedSlugs?: string[], atsWindow?: 'last30'|'last7'|'season' }} options
 */
export async function getAtsLeadersPipeline(options = {}) {
  const { pinnedSlugs = [], atsWindow = 'last30' } = options;
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  const kvKey = getAtsLeadersKeyForWindow(atsWindow);

  const kvEntry = await getWithMeta(kvKey);
  if (kvEntry?.value) {
    const cacheNote = kvEntry.stale ? 'kv_stale' : 'kv_hit';
    if (DEBUG_ATS) console.log('[atsPipeline] KV', atsWindow, cacheNote, { ageSeconds: kvEntry.ageSeconds });
    const result = kvPayloadToResult(kvEntry.value, cacheNote);
    result.atsWindow = atsWindow;
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

  if (atsWindow === 'season') {
    const last30Key = getAtsLeadersKeyForWindow('last30');
    const last30Entry = await getWithMeta(last30Key);
    if (last30Entry?.value && (last30Entry.value.atsLeaders?.best?.length || last30Entry.value.atsLeaders?.worst?.length)) {
      const result = kvPayloadToResult(last30Entry.value, last30Entry.stale ? 'kv_stale' : 'kv_hit');
      result.atsWindow = 'last30';
      result.seasonWarming = true;
      if (result.atsMeta) result.atsMeta.cacheNote = result.atsMeta.cacheNote || 'season_warming';
      return result;
    }
    const pipelineResult = await getAtsLeadersPipeline({ pinnedSlugs, atsWindow: 'last30' });
    pipelineResult.atsWindow = 'last30';
    pipelineResult.seasonWarming = true;
    if (pipelineResult.atsMeta) pipelineResult.atsMeta.cacheNote = pipelineResult.atsMeta.cacheNote || 'season_warming';
    return pipelineResult;
  }

  const coalesceKey = `ats:leaders:${atsWindow}`;
  const windowDays = atsWindow === 'last7' ? 7 : 30;
  try {
    const result = await coalesce(coalesceKey, async () => {
      let out = await computeRealAtsQuickRecent({ windowDays, pinnedSlugs });
      const quickHasLeaders = (out.best?.length || 0) + (out.worst?.length || 0) > 0 && out.status !== 'EMPTY';
      if (!quickHasLeaders) {
        out = await computeFastFallbackFromRankingsOnly();
      }
      const best = out.best || [];
      const worst = out.worst || [];
      const cacheNoteVal = quickHasLeaders ? 'computed_quick_real' : 'computed_proxy';
      await writeAtsToKvIfValid(kvKey, best, worst, {
        status: out.status,
        confidence: out.confidence ?? 'low',
        reason: out.reason ?? null,
        sourceLabel: out.sourceLabel ?? null,
        generatedAt: out.generatedAt ?? new Date().toISOString(),
      });
      setAtsLeaders({
        best,
        worst,
        source: out.source ?? null,
        sourceLabel: out.sourceLabel ?? null,
        status: out.status,
        reason: out.reason ?? null,
        confidence: out.confidence ?? 'low',
        generatedAt: out.generatedAt ?? new Date().toISOString(),
      });
      return { ...out, cacheNote: cacheNoteVal, unavailableReason: out.reason ?? null };
    });
    const best = result.best || [];
    const worst = result.worst || [];
    const cacheNote = result.cacheNote ?? 'computed_proxy';
    if (isDev) console.log('[atsPipeline]', atsWindow, cacheNote, { best: best.length, worst: worst.length, status: result.status });
    return {
      best,
      worst,
      atsWindow,
      sourceLabel: result.sourceLabel ?? null,
      source: result.source ?? null,
      status: result.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY'),
      reason: result.reason ?? result.unavailableReason ?? null,
      generatedAt: result.generatedAt ?? new Date().toISOString(),
      atsMeta: buildAtsMeta(result, false, false, cacheNote),
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
        atsWindow,
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
      atsWindow,
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
