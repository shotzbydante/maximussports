/**
 * Single shared ATS pipeline. getAtsLeadersPipeline() used by /api/home, /api/home/fast, /api/home/slow, /api/ats/warm.
 * Returns atsMeta (status FULL|FALLBACK|EMPTY, reason, sourceLabel) so UI can show empty state instead of loading forever.
 */

import { coalesce } from '../_cache.js';
import { getAtsLeaders, setAtsLeaders, getAtsLeadersMaybeStale } from './cache.js';
import { computeAtsLeadersFromSources } from './atsLeaders.js';

const ATS_COALESCE_KEY = 'ats:leaders';
const WARM_DEADLINE_MS = 10000;

function buildAtsMeta(result, fromCache = false, stale = false) {
  const status = result?.status ?? (result?.best?.length || result?.worst?.length ? 'FULL' : 'EMPTY');
  return {
    status,
    reason: result?.reason ?? result?.unavailableReason ?? null,
    sourceLabel: result?.sourceLabel ?? null,
    generatedAt: result?.generatedAt ?? new Date().toISOString(),
    fromCache: !!fromCache,
    stale: !!stale,
  };
}

/**
 * Compute ATS from sources and write to cache (including EMPTY with reason). Used by warm and on cache miss.
 */
async function computeAndSet() {
  const result = await computeAtsLeadersFromSources();
  const best = result.best || [];
  const worst = result.worst || [];
  const status = result.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY');
  const generatedAt = new Date().toISOString();
  const payload = {
    best,
    worst,
    source: result.source ?? null,
    sourceLabel: result.sourceLabel ?? null,
    status,
    reason: result.reason ?? result.unavailableReason ?? null,
    generatedAt,
  };
  setAtsLeaders(payload);
  return { ...payload, unavailableReason: result.unavailableReason };
}

/**
 * Get ATS leaders. Serves from cache when available; optionally compute (e.g. for cron warm).
 * Always returns atsMeta (status FULL|FALLBACK|EMPTY, reason) so UI never shows infinite loading.
 * @param {{ warm?: boolean }} options - warm: true = compute and populate cache (for /api/ats/warm); enforces deadline.
 */
export async function getAtsLeadersPipeline(options = {}) {
  const { warm = false } = options;
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

  if (warm) {
    if (isDev) console.log('[atsPipeline] warm: computing with deadline', WARM_DEADLINE_MS, 'ms');
    const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('ats_timeout')), WARM_DEADLINE_MS));
    try {
      const result = await Promise.race([computeAndSet(), deadline]);
      const count = (result.best?.length || 0) + (result.worst?.length || 0);
      if (isDev) console.log('[atsPipeline] warm done', { count, status: result.status, sourceLabel: result.sourceLabel });
      return {
        best: result.best || [],
        worst: result.worst || [],
        sourceLabel: result.sourceLabel ?? null,
        source: result.source ?? null,
        status: result.status ?? 'EMPTY',
        reason: result.reason ?? result.unavailableReason ?? null,
        generatedAt: result.generatedAt ?? new Date().toISOString(),
        atsMeta: buildAtsMeta(result, false, false),
        fromCache: false,
      };
    } catch (err) {
      if (isDev) console.log('[atsPipeline] warm timeout or error', err?.message);
      const emptyPayload = { best: [], worst: [], status: 'EMPTY', reason: err?.message === 'ats_timeout' ? 'odds_history_timeout' : (err?.message || 'warm_failed'), sourceLabel: null, generatedAt: new Date().toISOString() };
      setAtsLeaders(emptyPayload);
      return { ...emptyPayload, atsMeta: buildAtsMeta(emptyPayload, false, false), fromCache: false };
    }
  }

  const cached = getAtsLeaders();
  const hasCachedData = (cached.best?.length || 0) + (cached.worst?.length || 0) > 0;
  const hasCachedMeta = cached.atsMeta?.status != null;
  if (hasCachedData || hasCachedMeta) {
    if (isDev) console.log('[atsPipeline] cache hit', { best: cached.best?.length, worst: cached.worst?.length, status: cached.atsMeta?.status });
    return {
      best: cached.best || [],
      worst: cached.worst || [],
      sourceLabel: cached.sourceLabel ?? null,
      source: cached.source ?? null,
      status: cached.atsMeta?.status ?? (hasCachedData ? 'FULL' : 'EMPTY'),
      reason: cached.atsMeta?.reason ?? null,
      generatedAt: cached.atsMeta?.generatedAt ?? null,
      atsMeta: cached.atsMeta ?? buildAtsMeta(cached, true, false),
      fromCache: true,
    };
  }

  try {
    const result = await coalesce(ATS_COALESCE_KEY, computeAndSet);
    const best = result.best || [];
    const worst = result.worst || [];
    if (isDev) console.log('[atsPipeline] computed', { best: best.length, worst: worst.length, status: result.status });
    return {
      best,
      worst,
      sourceLabel: result.sourceLabel ?? null,
      source: result.source ?? null,
      status: result.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY'),
      reason: result.reason ?? result.unavailableReason ?? null,
      generatedAt: result.generatedAt ?? new Date().toISOString(),
      atsMeta: buildAtsMeta(result, false, false),
      fromCache: false,
      unavailableReason: result.unavailableReason,
    };
  } catch (err) {
    if (isDev) console.log('[atsPipeline] compute failed, serving stale if any', err?.message);
    const stale = getAtsLeadersMaybeStale();
    if (stale && (stale.atsMeta || (stale.best?.length || 0) + (stale.worst?.length || 0) > 0)) {
      return {
        best: stale.best || [],
        worst: stale.worst || [],
        sourceLabel: stale.sourceLabel ?? null,
        source: stale.source ?? null,
        status: stale.atsMeta?.status ?? 'FULL',
        reason: stale.atsMeta?.reason ?? null,
        generatedAt: stale.atsMeta?.generatedAt ?? null,
        atsMeta: stale.atsMeta ?? buildAtsMeta(stale, true, true),
        fromCache: true,
        stale: true,
        ageMs: stale.ageMs,
      };
    }
    const emptyMeta = buildAtsMeta({ status: 'EMPTY', reason: err?.message || 'computation_failed', sourceLabel: null }, false, false);
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
