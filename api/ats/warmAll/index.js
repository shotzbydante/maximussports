/**
 * GET/POST /api/ats/warmAll — Proactively warm ATS KV for all windows (last30, last7, season).
 * For each window: acquire same refresh lock as /api/ats/refresh; if acquired, compute and write to KV; else skip.
 * Safe to run multiple times; never throws on partial failure. Used by cron and opportunistic home request.
 */

import { tryAcquireLock, getAtsLeadersKeyForWindow } from '../../_globalCache.js';
import { computeAtsLeadersForRefresh, writeAtsToKvIfValid } from '../../home/atsPipeline.js';

const WINDOWS = ['last30', 'last7', 'season'];
const LOCK_KEY_PREFIX = 'ats:leaders:refresh_lock:';
const LOCK_TTL_SEC = 60;
const COMPUTE_TIMEOUT_MS = 9000;

function timeoutMs(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const results = {};
  for (const window of WINDOWS) {
    const lockKey = `${LOCK_KEY_PREFIX}${window}`;
    const kvKey = getAtsLeadersKeyForWindow(window);
    try {
      const acquired = await tryAcquireLock(lockKey, LOCK_TTL_SEC);
      if (!acquired) {
        results[window] = { status: 'skipped', reason: 'locked' };
        continue;
      }
      const computeWindow = window === 'season' ? 'last30' : window;
      const result = await Promise.race([
        computeAtsLeadersForRefresh({ atsWindow: computeWindow }),
        timeoutMs(COMPUTE_TIMEOUT_MS),
      ]).catch(() => null);
      if (!result) {
        results[window] = { status: 'skipped', reason: 'timeout_or_error' };
        continue;
      }
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
        results[window] = { status: 'ok', bestCount: best.length, worstCount: worst.length };
      } else {
        results[window] = { status: 'skipped', reason: 'no_data' };
      }
    } catch (err) {
      results[window] = { status: 'error', reason: err?.message || 'unknown' };
    }
  }
  return res.status(200).json({ ok: true, results });
}
