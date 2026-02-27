/**
 * GET/POST /api/ats/warmAll — Proactively warm ATS KV for all windows (last30, last7, season).
 * For each window: acquire same refresh lock as /api/ats/refresh; if acquired, compute and write to KV; else skip.
 * Writes BOTH fresh key AND lastKnown key directly so /api/ats/leaders always has a fallback.
 * Safe to run multiple times; never throws on partial failure. Used by cron and opportunistic home request.
 */

import { tryAcquireLock, setJson, MAX_TTL_SECONDS, LAST_KNOWN_TTL_SECONDS } from '../../_globalCache.js';
import { normalizeWindow, getFreshKey, getLastKnownKey } from '../_lib/atsKeys.js';
import { computeAtsLeadersForRefresh } from '../../home/atsPipeline.js';

const WINDOWS = ['last30', 'last7', 'season'];
const LOCK_KEY_PREFIX = 'ats:leaders:refresh_lock:';
const LOCK_TTL_SEC = 30;
const COMPUTE_TIMEOUT_MS = 9000;
const BREADCRUMB_KEY = 'ats:warmAll:lastRunTs';
const BREADCRUMB_TTL_SEC = 86400; // 24 h

function timeoutMs(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const results = {};
  let anySuccess = false;

  for (const win of WINDOWS) {
    const lockKey = `${LOCK_KEY_PREFIX}${normalizeWindow(win)}`;
    const freshKey = getFreshKey(win);
    const lkKey = getLastKnownKey(win);

    try {
      const acquired = await tryAcquireLock(lockKey, LOCK_TTL_SEC);
      if (!acquired) {
        results[win] = { status: 'skipped', reason: 'locked' };
        continue;
      }
      const computeWindow = win === 'season' ? 'last30' : win;
      const result = await Promise.race([
        computeAtsLeadersForRefresh({ atsWindow: computeWindow }),
        timeoutMs(COMPUTE_TIMEOUT_MS),
      ]).catch(() => null);

      if (!result) {
        results[win] = { status: 'skipped', reason: 'timeout_or_error' };
        continue;
      }

      const best = result.best || [];
      const worst = result.worst || [];
      const hasData = best.length > 0 || worst.length > 0;

      if (!hasData) {
        results[win] = { status: 'skipped', reason: 'no_data' };
        continue;
      }

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

      const freshOk = await setJson(freshKey, payload, { exSeconds: MAX_TTL_SECONDS })
        .then(() => true).catch(() => false);
      const lkOk = await setJson(lkKey, payload, { exSeconds: LAST_KNOWN_TTL_SECONDS })
        .then(() => true).catch(() => false);

      console.log('[ats/warmAll] wrote', { win, best: best.length, worst: worst.length, freshOk, lkOk });
      results[win] = { status: 'ok', bestCount: best.length, worstCount: worst.length, freshOk, lkOk };
      anySuccess = true;
    } catch (err) {
      results[win] = { status: 'error', reason: err?.message || 'unknown' };
    }
  }

  // Breadcrumb: confirms cron/warmAll ran so we can distinguish "never ran" from "ran but data empty"
  if (anySuccess) {
    await setJson(BREADCRUMB_KEY, Date.now(), { exSeconds: BREADCRUMB_TTL_SEC }).catch(() => {});
  }

  return res.status(200).json({ ok: true, results });
}
