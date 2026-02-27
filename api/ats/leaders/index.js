/**
 * GET /api/ats/leaders?window=last30|last7|season
 * Three-tier KV read — never returns missing when any cached data exists.
 * (1) fresh KV hit  => leaders + meta.source='kv_fresh' | 'kv_stale'
 * (2) lastKnown hit => leaders + meta.source='kv_last_known' + atsStatus='stale'
 * (3) else          => empty + atsStatus='missing' + kicks background refresh
 */

import { getJson, getWithMeta, getAtsLeadersKeyForWindow, getAtsLeadersLastKnownKeyForWindow } from '../../_globalCache.js';
import { getQueryParam, getOriginFromReq } from '../../_requestUrl.js';

const VALID_WINDOWS = ['last30', 'last7', 'season'];
const STALE_KICK_SEC = 30 * 60; // kick refresh after 30 min
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function hasData(leaders) {
  return Array.isArray(leaders?.best) && leaders.best.length > 0
    || Array.isArray(leaders?.worst) && leaders.worst.length > 0;
}

function kickRefresh(origin, win) {
  if (!origin || typeof origin !== 'string') return;
  try {
    fetch(`${origin.replace(/\/$/, '')}/api/ats/refresh?window=${win}`, { method: 'POST' }).catch(() => {});
  } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const windowParam = (getQueryParam(req, 'window', 'last30') || 'last30').toLowerCase();
  const win = VALID_WINDOWS.includes(windowParam) ? windowParam : 'last30';
  const key = getAtsLeadersKeyForWindow(win);
  const lastKnownKey = getAtsLeadersLastKnownKeyForWindow(win);
  const origin = getOriginFromReq(req);

  // ── Tier 1: fresh KV ─────────────────────────────────────────────────────
  const kvEntry = await getWithMeta(key);
  if (kvEntry?.value && hasData(kvEntry.value.atsLeaders)) {
    const ageSec = kvEntry.ageSeconds;
    const source = kvEntry.stale ? 'kv_stale' : 'kv_fresh';
    const isOld = ageSec != null && ageSec > STALE_KICK_SEC;
    const atsMeta = {
      ...(kvEntry.value.atsMeta ?? {}),
      source,
      stage: source,
      ...(ageSec != null ? { cacheAgeSec: ageSec } : { confidence: 'low', reason: 'unknown_age' }),
      ...(isOld ? { confidence: 'low', reason: 'stale' } : {}),
    };
    if (isOld && origin) kickRefresh(origin, win);
    if (isDev) console.log('[ats/leaders]', { win, source, leaders: (kvEntry.value.atsLeaders?.best?.length ?? 0) + (kvEntry.value.atsLeaders?.worst?.length ?? 0), ageSec, status: atsMeta.status });
    return res.status(200).json({
      atsLeaders: kvEntry.value.atsLeaders ?? { best: [], worst: [] },
      atsMeta: { ...atsMeta, ...(isOld && origin ? { kickedBy: 'server' } : {}) },
      atsWindow: win,
      seasonWarming: kvEntry.value.seasonWarming ?? false,
      atsStatus: kvEntry.stale ? 'stale' : 'fresh',
    });
  }

  // ── Tier 2: lastKnown KV ──────────────────────────────────────────────────
  const lastKnownEntry = await getWithMeta(lastKnownKey);
  if (lastKnownEntry?.value && hasData(lastKnownEntry.value.atsLeaders)) {
    const ageSec = lastKnownEntry.ageSeconds;
    const isOld = ageSec != null && ageSec > STALE_KICK_SEC;
    if (isOld && origin) kickRefresh(origin, win);
    const atsMeta = {
      ...(lastKnownEntry.value.atsMeta ?? {}),
      source: 'kv_last_known',
      stage: 'kv_last_known',
      status: lastKnownEntry.value.atsMeta?.status ?? 'FALLBACK',
      reason: 'last_known_fallback',
      confidence: lastKnownEntry.value.atsMeta?.confidence ?? 'low',
      ...(ageSec != null ? { cacheAgeSec: ageSec, staleAgeSec: ageSec } : {}),
    };
    if (isDev) console.log('[ats/leaders]', { win, source: 'kv_last_known', leaders: (lastKnownEntry.value.atsLeaders?.best?.length ?? 0) + (lastKnownEntry.value.atsLeaders?.worst?.length ?? 0), ageSec, status: atsMeta.status });
    return res.status(200).json({
      atsLeaders: lastKnownEntry.value.atsLeaders ?? { best: [], worst: [] },
      atsMeta,
      atsWindow: win,
      seasonWarming: lastKnownEntry.value.seasonWarming ?? false,
      atsStatus: 'stale',
    });
  }

  // ── Tier 3: missing — kick refresh ───────────────────────────────────────
  if (origin) kickRefresh(origin, win);
  if (isDev) console.log('[ats/leaders]', { win, source: 'empty', status: 'missing' });
  return res.status(200).json({
    atsLeaders: { best: [], worst: [] },
    atsMeta: {
      status: 'EMPTY',
      reason: 'ats_data_warming',
      sourceLabel: null,
      confidence: 'low',
      generatedAt: new Date().toISOString(),
      source: 'empty',
      stage: 'empty',
      nextAction: 'refresh',
      refreshEndpoint: `/api/ats/refresh?window=${win}`,
      kickedBy: origin ? 'server' : 'none',
    },
    atsWindow: win,
    seasonWarming: false,
    atsStatus: 'missing',
  });
}
