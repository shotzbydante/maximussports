/**
 * GET /api/ats/warmFull — Season FULL compute only. Writes to ats:leaders:season:v1 only on FULL success. Do not overwrite good data on failure.
 */

export const config = { maxDuration: 30 };

import { getAtsLeaders, setAtsLeaders } from '../../home/cache.js';
import { getJson, setJson, MAX_TTL_SECONDS, LAST_KNOWN_TTL_SECONDS } from '../../_globalCache.js';
import { getFreshKey, getLastKnownKey } from '../_lib/atsKeys.js';
import { computeAtsLeadersFromSources } from '../../home/atsLeaders.js';

const SEASON_KEY = getFreshKey('season');
const FULL_DEADLINE_MS = 28000;

export default async function handler(req, res) {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isDev) {
    console.log('[api/ats/warmFull] request', req.method, req.url || req.originalUrl || '');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('warmFull_timeout')), FULL_DEADLINE_MS));

  try {
    const result = await Promise.race([computeAtsLeadersFromSources(), deadline]);
    const bestCount = result.best?.length ?? 0;
    const worstCount = result.worst?.length ?? 0;
    const status = result.status ?? (bestCount + worstCount > 0 ? 'FULL' : 'EMPTY');

    if (status === 'FULL' && (bestCount > 0 || worstCount > 0)) {
      const payload = {
        best: result.best || [],
        worst: result.worst || [],
        source: result.source ?? null,
        sourceLabel: result.sourceLabel ?? 'Full league ATS',
        status: 'FULL',
        reason: 'full_league_odds_history',
        confidence: 'high',
        generatedAt: new Date().toISOString(),
      };
      setAtsLeaders(payload);
      try {
        const kvPayload = {
          atsLeaders: { best: payload.best, worst: payload.worst },
          atsMeta: {
            status: 'FULL',
            confidence: 'high',
            reason: payload.reason,
            sourceLabel: payload.sourceLabel,
            generatedAt: payload.generatedAt,
          },
        };
        await setJson(SEASON_KEY, kvPayload, { exSeconds: MAX_TTL_SECONDS });
        // Also persist long-lived lastKnown so /api/ats/leaders can fall back after expiry.
        const lastKnownKey = getLastKnownKey('season');
        if (lastKnownKey) {
          await setJson(lastKnownKey, kvPayload, { exSeconds: LAST_KNOWN_TTL_SECONDS }).catch((e) => {
            console.warn('[api/ats/warmFull] lastKnown write failed:', e?.message);
          });
        }
      } catch (kvErr) {
        console.warn('[api/ats/warmFull] KV write failed (in-memory updated):', kvErr?.message);
      }
      if (isDev) {
        console.log('[api/ats/warmFull] KV updated with FULL (season)', { bestCount, worstCount });
      }
      return res.status(200).json({
        ok: true,
        status: 'FULL',
        bestCount,
        worstCount,
        sourceLabel: payload.sourceLabel,
        confidence: 'high',
        reason: payload.reason,
      });
    }

    return res.status(200).json({
      ok: true,
      status: status ?? 'EMPTY',
      bestCount,
      worstCount,
      sourceLabel: result.sourceLabel ?? null,
      confidence: result.confidence ?? 'low',
      reason: result.reason ?? result.unavailableReason ?? null,
      cached: false,
    });
  } catch (err) {
    if (isDev) {
      console.log('[api/ats/warmFull] timeout or error', err?.message);
    }
    let bestCount = 0;
    let worstCount = 0;
    let status = 'EMPTY';
    let sourceLabel = null;
    let confidence = 'low';
    let reason = err?.message ?? 'warmFull_failed';
    const cached = getAtsLeaders();
    if ((cached.best?.length || 0) + (cached.worst?.length || 0) > 0) {
      bestCount = cached.best?.length ?? 0;
      worstCount = cached.worst?.length ?? 0;
      status = cached.atsMeta?.status ?? 'FALLBACK';
      sourceLabel = cached.atsMeta?.sourceLabel ?? null;
      confidence = cached.atsMeta?.confidence ?? 'low';
      reason = cached.atsMeta?.reason ?? reason;
    } else {
      try {
        const kvVal = await getJson(SEASON_KEY);
        if (kvVal?.atsLeaders) {
          const b = kvVal.atsLeaders.best || [];
          const w = kvVal.atsLeaders.worst || [];
          bestCount = b.length;
          worstCount = w.length;
          if (bestCount + worstCount > 0) {
            status = kvVal.atsMeta?.status ?? 'FALLBACK';
            sourceLabel = kvVal.atsMeta?.sourceLabel ?? null;
            confidence = kvVal.atsMeta?.confidence ?? 'low';
            reason = kvVal.atsMeta?.reason ?? reason;
          }
        }
      } catch (kvErr) {
        console.warn('[api/ats/warmFull] KV read failed:', kvErr?.message);
      }
    }
    return res.status(200).json({
      ok: false,
      error: err?.message,
      status,
      bestCount,
      worstCount,
      sourceLabel,
      confidence,
      reason,
      cached: bestCount + worstCount > 0,
    });
  }
}
