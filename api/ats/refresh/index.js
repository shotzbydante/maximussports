/**
 * GET|POST /api/ats/refresh?window=last30|last7|season[&debug=1]
 *
 * Compute ATS leaders and write BOTH fresh key and lastKnown key to KV.
 * Accepts GET (for internal kicks / manual testing) and POST.
 * ?debug=1  — return detailed execution info in response body (never in normal requests).
 *
 * Lock behaviour:
 *   - Checks KV availability first; if KV is down returns kv_unavailable (not "locked").
 *   - Lock TTL = 30 s (down from 60 s) to reduce stuck-lock window.
 *   - If lock is held AND lastKnown is missing, emits a console.warn so it shows in Vercel logs.
 */

import { getJson, setJson, tryAcquireLock, isKvAvailable, MAX_TTL_SECONDS, LAST_KNOWN_TTL_SECONDS } from '../../_globalCache.js';
import { normalizeWindow, getFreshKey, getLastKnownKey } from '../../_lib/atsKeys.js';
import { computeAtsLeadersForRefresh } from '../../home/atsPipeline.js';
import { getQueryParam } from '../../_requestUrl.js';

const LOCK_KEY_PREFIX = 'ats:leaders:refresh_lock:';
const LOCK_TTL_SEC = 30;
const COMPUTE_TIMEOUT_MS = 9000;

const inFlight = new Map();

function timeoutMs(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const win = normalizeWindow(getQueryParam(req, 'window', 'last30'));
  const debug = getQueryParam(req, 'debug', '') === '1';
  const lockKey = `${LOCK_KEY_PREFIX}${win}`;
  const freshKey = getFreshKey(win);
  const lkKey = getLastKnownKey(win);

  // Boolean-only env flags — never expose raw values
  const e = process.env ?? {};
  const kvEnv = {
    hasKvRestUrl: Boolean(e.KV_REST_API_URL),
    hasKvRestToken: Boolean(e.KV_REST_API_TOKEN),
    hasKvUrl: Boolean(e.KV_URL),
    hasRedisUrl: Boolean(e.REDIS_URL),
    hasUpstashRestUrl: Boolean(e.UPSTASH_REDIS_REST_URL),
    hasUpstashRestToken: Boolean(e.UPSTASH_REDIS_REST_TOKEN),
  };
  const runtime = { node: process.version };

  const dbg = { win, freshKey, lkKey, kvEnv, runtime };

  // ── in-flight dedup (per instance) ───────────────────────────────────────
  if (inFlight.has(win)) {
    console.log('[ats/refresh] locked (in_flight)', { win });
    return res.status(202).json({ status: 'locked', reason: 'in_flight', win, ...(debug ? dbg : {}) });
  }

  // ── KV health check — distinguish "KV down" from "lock held" ─────────────
  const kvOk = await isKvAvailable();
  if (!kvOk) {
    console.warn('[ats/refresh] KV unavailable', { win });
    return res.status(200).json({ status: 'kv_unavailable', win, ...(debug ? dbg : {}) });
  }

  // ── distributed lock ──────────────────────────────────────────────────────
  const acquired = await tryAcquireLock(lockKey, LOCK_TTL_SEC);
  if (!acquired) {
    const lk = await getJson(lkKey);
    const hasLk = !!(lk?.atsLeaders?.best?.length || lk?.atsLeaders?.worst?.length);
    if (!hasLk) {
      // Data gap: lock is held but we have no fallback to show users — needs investigation
      console.warn('[ats/refresh] lock held + lastKnown MISSING', { win, lockKey });
    } else {
      console.log('[ats/refresh] lock held (has lastKnown)', { win });
    }
    return res.status(202).json({
      status: 'locked',
      reason: 'lock_held',
      win,
      ...(debug ? { ...dbg, hasLastKnown: hasLk, lockKey } : {}),
    });
  }

  dbg.lockAcquired = true;
  const start = Date.now();
  inFlight.set(win, true);

  try {
    const computeWindow = win === 'season' ? 'last30' : win;
    dbg.computeWindow = computeWindow;

    const result = await Promise.race([
      computeAtsLeadersForRefresh({ atsWindow: computeWindow }),
      timeoutMs(COMPUTE_TIMEOUT_MS),
    ]);
    const elapsedMs = Date.now() - start;

    const best = result.best || [];
    const worst = result.worst || [];
    const hasData = best.length > 0 || worst.length > 0;

    dbg.bestCount = best.length;
    dbg.worstCount = worst.length;
    dbg.hasData = hasData;
    dbg.elapsedMs = elapsedMs;

    if (hasData) {
      const payload = {
        atsLeaders: { best, worst },
        atsMeta: {
          status: result.status ?? 'FALLBACK',
          confidence: result.confidence ?? 'low',
          reason: result.reason ?? null,
          sourceLabel: result.sourceLabel ?? null,
          generatedAt: result.generatedAt ?? new Date().toISOString(),
          cacheNote: result.cacheNote ?? 'computed_recent_team_ats',
        },
      };

      // Write fresh key
      const freshWriteOk = await setJson(freshKey, payload, { exSeconds: MAX_TTL_SECONDS })
        .then(() => true)
        .catch((e) => { console.warn('[ats/refresh] freshKey write failed:', e?.message); return false; });

      // Write lastKnown key directly — belt-and-suspenders independent of writeAtsToKvIfValid guards
      const lkWriteOk = await setJson(lkKey, payload, { exSeconds: LAST_KNOWN_TTL_SECONDS })
        .then(() => true)
        .catch((e) => { console.warn('[ats/refresh] lastKnown write failed:', e?.message); return false; });

      dbg.freshWriteOk = freshWriteOk;
      dbg.lkWriteOk = lkWriteOk;

      console.log('[ats/refresh] success', { win, best: best.length, worst: worst.length, freshWriteOk, lkWriteOk, elapsedMs });
      return res.status(200).json({ status: 'ok', win, elapsedMs, ...(debug ? dbg : {}) });
    }

    console.log('[ats/refresh] compute returned no data', { win, elapsedMs });
    return res.status(200).json({ status: 'no_data', win, elapsedMs, ...(debug ? dbg : {}) });
  } catch (err) {
    const elapsedMs = Date.now() - start;
    console.warn('[ats/refresh] error', { win, error: err?.message, elapsedMs });
    return res.status(200).json({
      status: 'error',
      win,
      error: err?.message,
      elapsedMs,
      ...(debug ? dbg : {}),
    });
  } finally {
    inFlight.delete(win);
  }
}
