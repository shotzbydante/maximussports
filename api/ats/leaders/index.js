/**
 * GET /api/ats/leaders?window=last30|last7|season
 * KV-only: return immediately. If stale > 30m, still return data with confidence low.
 * When KV missing, return warming payload with nextAction and refreshEndpoint.
 */

import { getJson, getWithMeta, getAtsLeadersKeyForWindow } from '../../_globalCache.js';

const VALID_WINDOWS = ['last30', 'last7', 'season'];
const STALE_30M_SEC = 30 * 60;
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function getServerKickBaseUrl() {
  try {
    const p = process.env?.VERCEL_PROJECT_PRODUCTION_URL;
    if (p && typeof p === 'string') return p.startsWith('http') ? p : `https://${p}`;
    const v = process.env?.VERCEL_URL;
    if (v && typeof v === 'string') return v.startsWith('http') ? v : `https://${v}`;
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const windowParam = (req.query?.window || 'last30').toLowerCase();
  const window = VALID_WINDOWS.includes(windowParam) ? windowParam : 'last30';
  const key = getAtsLeadersKeyForWindow(window);

  const meta = await getWithMeta(key);
  if (meta?.value) {
    const ageSeconds = meta.ageSeconds;
    const hasAge = ageSeconds != null;
    const source = meta.stale ? 'kv_stale' : 'kv_hit';
    const isOld = hasAge && ageSeconds > STALE_30M_SEC;
    const atsMeta = {
      ...(meta.value.atsMeta ?? {}),
      source,
      stage: source,
      ...(hasAge && { cacheAgeSec: ageSeconds }),
      ...(!hasAge && { confidence: 'low', reason: 'unknown_age' }),
      ...(isOld && { confidence: 'low', reason: 'stale' }),
    };
    if (isDev) console.log('[ats] leaders kv_hit', { window, age: ageSeconds, stale: meta.stale });
    const kickBase = getServerKickBaseUrl();
    if (isOld && kickBase) {
      fetch(`${kickBase}/api/ats/refresh?window=${window}`, { method: 'POST' }).catch(() => {});
    } else if (isOld && isDev) {
      console.log('[ats] skip server kick (no VERCEL_URL/VERCEL_PROJECT_PRODUCTION_URL)');
    }
    return res.status(200).json({
      atsLeaders: meta.value.atsLeaders ?? { best: [], worst: [] },
      atsMeta,
      atsWindow: window,
      seasonWarming: meta.value.seasonWarming ?? false,
    });
  }

  const raw = await getJson(key);
  if (raw && (raw.atsLeaders?.best?.length || raw.atsLeaders?.worst?.length)) {
    const generatedAt = raw.atsMeta?.generatedAt;
    const ageSeconds = generatedAt != null
      ? Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000)
      : null;
    const hasAge = ageSeconds != null;
    const isOld = hasAge && ageSeconds > STALE_30M_SEC;
    if (isDev) console.log('[ats] leaders kv_hit (raw)', { window, age: ageSeconds });
    return res.status(200).json({
      atsLeaders: raw.atsLeaders,
      atsMeta: {
        ...(raw.atsMeta ?? {}),
        source: 'kv_hit',
        stage: 'kv_hit',
        ...(hasAge && { cacheAgeSec: ageSeconds }),
        ...(!hasAge && { confidence: 'low', reason: 'unknown_age' }),
        ...(isOld && { confidence: 'low', reason: 'stale' }),
      },
      atsWindow: window,
      seasonWarming: raw.seasonWarming ?? false,
    });
  }

  if (isDev) console.log('[ats] leaders warming', { window });
  const kickBase = getServerKickBaseUrl();
  if (isDev) console.log('[ats] kick refresh window=%s baseUrl=%s', window, kickBase || 'none');
  if (kickBase) {
    fetch(`${kickBase}/api/ats/refresh?window=${window}`, { method: 'POST' }).catch(() => {});
  }
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
      refreshEndpoint: `/api/ats/refresh?window=${window}`,
    },
    atsWindow: window,
    seasonWarming: false,
  });
}
