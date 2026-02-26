/**
 * POST /api/ats/refresh?window=last30|last7|season
 * Compute ATS leaders and write to KV. Lock prevents stampede; in-memory inFlight dedupes per instance.
 * Never computes synchronously in GET /api/ats/leaders.
 */

import { getJson, setJson, tryAcquireLock, getAtsLeadersKeyForWindow } from '../../_globalCache.js';
import { computeAtsLeadersForRefresh, writeAtsToKvIfValid } from '../../home/atsPipeline.js';

const VALID_WINDOWS = ['last30', 'last7', 'season'];
const LOCK_KEY_PREFIX = 'ats:leaders:refresh_lock:';
const LOCK_TTL_SEC = 60;
const COMPUTE_TIMEOUT_MS = 9000;
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

const inFlight = new Map();

function timeoutMs(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const windowParam = (req.query?.window || 'last30').toLowerCase();
  const window = VALID_WINDOWS.includes(windowParam) ? windowParam : 'last30';
  const lockKey = `${LOCK_KEY_PREFIX}${window}`;
  const kvKey = getAtsLeadersKeyForWindow(window);

  if (inFlight.has(window)) {
    if (isDev) console.log('[ats] refresh locked (inFlight)', { window });
    return res.status(202).json({ status: 'locked', window });
  }

  const acquired = await tryAcquireLock(lockKey, LOCK_TTL_SEC);
  if (!acquired) {
    if (isDev) console.log('[ats] refresh start locked', { window });
    return res.status(202).json({ status: 'locked', window });
  }

  const start = Date.now();
  inFlight.set(window, true);
  if (isDev) console.log('[ats] refresh start', { window });

  try {
    const computeWindow = window === 'season' ? 'last30' : window;
    const result = await Promise.race([
      computeAtsLeadersForRefresh({ atsWindow: computeWindow }),
      timeoutMs(COMPUTE_TIMEOUT_MS),
    ]);
    const elapsedMs = Date.now() - start;

    const best = result.best || [];
    const worst = result.worst || [];
    const hasData = best.length > 0 || worst.length > 0;

    if (hasData) {
      await writeAtsToKvIfValid(kvKey, best, worst, {
        status: result.status,
        confidence: result.confidence ?? 'low',
        reason: result.reason ?? null,
        sourceLabel: result.sourceLabel ?? null,
        generatedAt: result.generatedAt ?? new Date().toISOString(),
      }, result.cacheNote ?? 'computed_recent_team_ats');
      if (isDev) console.log('[ats] refresh success', { window, best: best.length, worst: worst.length, elapsedMs });
      return res.status(200).json({ status: 'ok', window, elapsedMs });
    }

    const existing = await getJson(kvKey);
    const hasStale = existing && (existing.atsLeaders?.best?.length || existing.atsLeaders?.worst?.length);
    if (isDev) console.log('[ats] refresh fail (no data)', { window, used: hasStale ? 'stale' : 'none', elapsedMs });
    return res.status(200).json({
      status: 'failed',
      window,
      used: hasStale ? 'stale' : 'none',
      elapsedMs,
    });
  } catch (err) {
    const elapsedMs = Date.now() - start;
    const existing = await getJson(kvKey).catch(() => null);
    const hasStale = existing && (existing.atsLeaders?.best?.length || existing.atsLeaders?.worst?.length);
    if (isDev) console.log('[ats] refresh fail', { window, error: err?.message, used: hasStale ? 'stale' : 'none', elapsedMs });
    return res.status(200).json({
      status: 'failed',
      window,
      used: hasStale ? 'stale' : 'none',
      error: err?.message,
      elapsedMs,
    });
  } finally {
    inFlight.delete(window);
  }
}
