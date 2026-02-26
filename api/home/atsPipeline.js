/**
 * Single shared ATS pipeline. getAtsLeadersPipeline() used by /api/home, /api/home/fast, /api/home/slow.
 * Default ATS window = Last 30. Windowed KV keys: last30, last7, season.
 * Reads from KV first; on miss computes quick real (last30/last7) or proxy; writes to KV. Never overwrites KV with EMPTY.
 * Prefer FULL > real FALLBACK > proxy FALLBACK > EMPTY. Returns atsMeta with cacheNote: kv_hit | kv_stale | computed_recent_team_ats | computed_proxy.
 */

import { coalesce } from '../_cache.js';
import { getAtsLeaders, setAtsLeaders, getAtsLeadersMaybeStale } from './cache.js';
import { getWithMeta, setJson, getJson, getAtsLeadersKeyForWindow, MAX_TTL_SECONDS } from '../_globalCache.js';
import { computeAtsLeadersFromTeamAts } from './atsLeadersFromTeamAts.js';
import { computeFastFallbackFromRankingsOnly } from './atsFastFallback.js';

const DEBUG_ATS = process.env.DEBUG_ATS === '1';

function stageFromCacheNote(cacheNote, fromCache, stale) {
  if (fromCache && cacheNote === 'kv_hit') return stale ? 'kv_stale' : 'cache_hit_real';
  if (fromCache && cacheNote === 'kv_stale') return 'kv_stale';
  if (cacheNote === 'computed_recent_team_ats') return 'done';
  if (cacheNote === 'computed_proxy') return 'done';
  if (cacheNote === 'computed_fallback') return 'done';
  if (cacheNote === 'season_warming') return 'done';
  return cacheNote || 'done';
}

function sourceFromCacheNote(cacheNote, fromCache) {
  if (fromCache) return 'kv_hit';
  if (cacheNote === 'computed_proxy') return 'proxy';
  return 'computed';
}

function buildAtsMeta(result, fromCache = false, stale = false, cacheNote = null, startedAt = null) {
  const status = result?.status ?? (result?.best?.length || result?.worst?.length ? 'FULL' : 'EMPTY');
  const confidence = result?.confidence ?? (status === 'FULL' ? 'high' : status === 'FALLBACK' ? 'medium' : 'low');
  const now = Date.now();
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
  meta.stage = stageFromCacheNote(cacheNote, fromCache, stale);
  meta.source = sourceFromCacheNote(cacheNote, fromCache);
  if (startedAt != null) {
    meta.startedAt = new Date(startedAt).toISOString();
    meta.updatedAt = new Date(now).toISOString();
    meta.elapsedMs = now - startedAt;
  }
  if (result?.teamsAttempted != null) meta.teamCountAttempted = result.teamsAttempted;
  if (result?.teamsWithAts != null) meta.teamCountCompleted = result.teamsWithAts;
  return meta;
}

function kvPayloadToResult(kvValue, cacheNote, ageSeconds = 0) {
  const atsLeaders = kvValue.atsLeaders ?? {};
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  const atsMeta = kvValue.atsMeta ?? {};
  const stale = ageSeconds > 0; // caller passes age from getWithMeta
  const meta = {
    ...atsMeta,
    cacheNote,
    stage: stageFromCacheNote(cacheNote, true, stale),
    source: 'kv_hit',
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

/** Never write EMPTY to KV. Never overwrite FULL or good FALLBACK with EMPTY. Never overwrite real (FULL or medium+ FALLBACK) with proxy (low-confidence FALLBACK). Exported for /api/ats/refresh. */
export async function writeAtsToKvIfValid(key, best, worst, atsMeta, cacheNote) {
  const status = atsMeta?.status ?? (best?.length || worst?.length ? 'FULL' : 'EMPTY');
  if (status === 'EMPTY' && !(best?.length || worst?.length)) return;
  const existing = await getJson(key);
  const existingStatus = existing?.atsMeta?.status;
  const existingConfidence = existing?.atsMeta?.confidence;
  const existingNote = existing?.atsMeta?.cacheNote;
  if (status === 'EMPTY' && (existingStatus === 'FULL' || existingStatus === 'FALLBACK') && (existing?.atsLeaders?.best?.length || existing?.atsLeaders?.worst?.length)) return;
  const isIncomingProxy = cacheNote === 'computed_proxy' || (atsMeta?.confidence === 'low' && (atsMeta?.sourceLabel?.toLowerCase?.().includes('fallback') ?? false));
  const isExistingReal = existingStatus === 'FULL' || (existingStatus === 'FALLBACK' && existingConfidence !== 'low') || existingNote === 'computed_recent_team_ats';
  if (isIncomingProxy && isExistingReal && (existing?.atsLeaders?.best?.length || existing?.atsLeaders?.worst?.length)) return;
  const payload = {
    atsLeaders: { best: best || [], worst: worst || [] },
    atsMeta: {
      status,
      confidence: atsMeta?.confidence ?? 'low',
      reason: atsMeta?.reason ?? null,
      sourceLabel: atsMeta?.sourceLabel ?? null,
      generatedAt: atsMeta?.generatedAt ?? new Date().toISOString(),
      cacheNote: cacheNote ?? null,
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
  const startedAt = Date.now();
  const { pinnedSlugs = [], atsWindow = 'last30' } = options;
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  const kvKey = getAtsLeadersKeyForWindow(atsWindow);

  const kvEntry = await getWithMeta(kvKey);
  if (kvEntry?.value) {
    const cacheNote = kvEntry.stale ? 'kv_stale' : 'kv_hit';
    if (DEBUG_ATS) console.log('[atsPipeline] KV', atsWindow, cacheNote, { ageSeconds: kvEntry.ageSeconds });
    const result = kvPayloadToResult(kvEntry.value, cacheNote, kvEntry.ageSeconds);
    result.atsWindow = atsWindow;
    const meta = result.atsMeta || {};
    meta.startedAt = new Date(startedAt).toISOString();
    meta.updatedAt = new Date().toISOString();
    meta.elapsedMs = Date.now() - startedAt;
    result.atsMeta = meta;
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
      const result = kvPayloadToResult(last30Entry.value, last30Entry.stale ? 'kv_stale' : 'kv_hit', last30Entry.ageSeconds);
      result.atsWindow = 'last30';
      const meta = result.atsMeta || {};
      meta.startedAt = new Date(startedAt).toISOString();
      meta.updatedAt = new Date().toISOString();
      meta.elapsedMs = Date.now() - startedAt;
      result.atsMeta = meta;
      result.seasonWarming = true;
      if (result.atsMeta) result.atsMeta.cacheNote = result.atsMeta.cacheNote || 'season_warming';
      return result;
    }
    const pipelineResult = await getAtsLeadersPipeline({ pinnedSlugs, atsWindow: 'last30' });
    pipelineResult.atsWindow = 'last30';
    pipelineResult.seasonWarming = true;
    if (pipelineResult.atsMeta) {
      pipelineResult.atsMeta.cacheNote = pipelineResult.atsMeta.cacheNote || 'season_warming';
      pipelineResult.atsMeta.stage = 'done';
      pipelineResult.atsMeta.elapsedMs = (pipelineResult.atsMeta.elapsedMs ?? 0) + (Date.now() - startedAt);
    }
    return pipelineResult;
  }

  const coalesceKey = `ats:leaders:${atsWindow}`;
  const windowDays = atsWindow === 'last7' ? 7 : 30;
  try {
    const result = await coalesce(coalesceKey, async () => {
      const pipelineStart = Date.now();
      let out = await computeAtsLeadersFromTeamAts({ windowDays, teamSlugs: pinnedSlugs });
      const teamAtsHasLeaders = (out.best?.length || 0) + (out.worst?.length || 0) > 0 && out.status !== 'EMPTY';
      if (!teamAtsHasLeaders) {
        out = await computeFastFallbackFromRankingsOnly();
      }
      const best = out.best || [];
      const worst = out.worst || [];
      const cacheNoteVal = teamAtsHasLeaders ? 'computed_recent_team_ats' : 'computed_proxy';
      if (DEBUG_ATS) {
        console.log('[atsPipeline]', atsWindow, cacheNoteVal, {
          best: best.length,
          worst: worst.length,
          status: out.status,
          durationMs: Date.now() - pipelineStart,
          teamsWithAts: out.teamsWithAts,
        });
      }
      if (teamAtsHasLeaders || best.length > 0 || worst.length > 0) {
        await writeAtsToKvIfValid(kvKey, best, worst, {
          status: out.status,
          confidence: out.confidence ?? 'low',
          reason: out.reason ?? null,
          sourceLabel: out.sourceLabel ?? null,
          generatedAt: out.generatedAt ?? new Date().toISOString(),
        }, cacheNoteVal);
      }
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
      atsMeta: buildAtsMeta(result, false, false, cacheNote, startedAt),
      fromCache: false,
      unavailableReason: result.unavailableReason,
    };
  } catch (err) {
    if (isDev) console.log('[atsPipeline] compute failed, serving stale if any', err?.message);
    const staleData = getAtsLeadersMaybeStale();
    if (staleData && (staleData.atsMeta || (staleData.best?.length || 0) + (staleData.worst?.length || 0) > 0)) {
      const meta = staleData.atsMeta ?? buildAtsMeta(staleData, true, true, 'kv_stale', startedAt);
      meta.cacheNote = 'kv_stale';
      meta.stage = 'kv_stale';
      meta.source = 'kv_hit';
      meta.elapsedMs = Date.now() - startedAt;
      return {
        best: staleData.best || [],
        worst: staleData.worst || [],
        atsWindow,
        sourceLabel: staleData.sourceLabel ?? null,
        source: staleData.source ?? null,
        status: meta.status ?? 'FULL',
        reason: meta.reason ?? null,
        generatedAt: meta.generatedAt ?? null,
        atsMeta: meta,
        fromCache: true,
        stale: true,
        ageMs: staleData.ageMs,
      };
    }
    const emptyMeta = buildAtsMeta({ status: 'EMPTY', reason: err?.message || 'computation_failed', sourceLabel: null, confidence: 'low' }, false, false, 'computed_fallback', startedAt);
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

/**
 * Compute-only ATS leaders for a window (no KV read). Used by POST /api/ats/refresh.
 * @param {{ atsWindow: 'last30'|'last7'|'season' }}
 * @returns {Promise<{ best: array, worst: array, status: string, confidence: string, reason?: string, sourceLabel?: string, generatedAt: string, cacheNote: string }>}
 */
export async function computeAtsLeadersForRefresh({ atsWindow = 'last30' } = {}) {
  const windowDays = atsWindow === 'last7' ? 7 : 30;
  let out = await computeAtsLeadersFromTeamAts({ windowDays, teamSlugs: [] });
  const teamAtsHasLeaders = (out.best?.length || 0) + (out.worst?.length || 0) > 0 && out.status !== 'EMPTY';
  if (!teamAtsHasLeaders) {
    out = await computeFastFallbackFromRankingsOnly();
  }
  const best = out.best || [];
  const worst = out.worst || [];
  const cacheNote = teamAtsHasLeaders ? 'computed_recent_team_ats' : 'computed_proxy';
  return {
    best,
    worst,
    status: out.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY'),
    confidence: out.confidence ?? 'low',
    reason: out.reason ?? null,
    sourceLabel: out.sourceLabel ?? null,
    generatedAt: out.generatedAt ?? new Date().toISOString(),
    cacheNote,
  };
}
