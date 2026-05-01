/**
 * Hooks for the Performance & Learning + Audit Insights surfaces.
 *
 * Sport-aware: the caller must pass `sport` explicitly when NOT MLB.
 * Default stays MLB for back-compat with existing call sites in MLB-only
 * surfaces; NBA callers must pass `sport: 'nba'`.
 *
 * Endpoint paths are sport-aware too — /api/<sport>/picks/... where it
 * exists, falling back to /api/mlb/picks/... for the endpoints we share
 * across sports.
 */

import { useEffect, useState } from 'react';

function useJson(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e?.message || 'fetch failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);
  return { data, loading, error };
}

/**
 * Performance/insights endpoints exist per-sport at /api/<sport>/picks/...
 * Each accepts a `?sport=` query param and queries the correct sport-scoped
 * rows from Supabase. We prefer the sport-native endpoint so caching and
 * future sport-specific tweaks land on the right surface.
 */
const SPORT_ENDPOINTS = {
  mlb: '/api/mlb/picks',
  nba: '/api/nba/picks',
};

function endpointBase(sport) {
  return SPORT_ENDPOINTS[sport] || '/api/mlb/picks';
}

export function usePerformance({ sport = 'mlb' } = {}) {
  return useJson(`${endpointBase(sport)}/performance?sport=${sport}`);
}

export function useAuditInsights({ sport = 'mlb', days = 30 } = {}) {
  return useJson(`${endpointBase(sport)}/insights?sport=${sport}&days=${days}`);
}
