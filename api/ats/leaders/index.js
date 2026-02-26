/**
 * GET /api/ats/leaders?window=last30|last7|season
 * Stale-while-revalidate: read KV and return immediately (kv_hit or kv_stale).
 * If KV is missing, return lightweight empty payload (HTTP 200); do NOT block to compute ATS.
 */

import { getJson, getWithMeta, getAtsLeadersKeyForWindow } from '../../_globalCache.js';

const VALID_WINDOWS = ['last30', 'last7', 'season'];

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
    const source = meta.stale ? 'kv_stale' : 'kv_hit';
    return res.status(200).json({
      atsLeaders: meta.value.atsLeaders ?? { best: [], worst: [] },
      atsMeta: {
        ...(meta.value.atsMeta ?? {}),
        source,
        stage: source,
      },
      atsWindow: window,
      seasonWarming: meta.value.seasonWarming ?? false,
    });
  }

  const raw = await getJson(key);
  if (raw && (raw.atsLeaders?.best?.length || raw.atsLeaders?.worst?.length)) {
    return res.status(200).json({
      atsLeaders: raw.atsLeaders,
      atsMeta: { ...(raw.atsMeta ?? {}), source: 'kv_hit', stage: 'kv_hit' },
      atsWindow: window,
      seasonWarming: raw.seasonWarming ?? false,
    });
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
    },
    atsWindow: window,
    seasonWarming: false,
  });
}
