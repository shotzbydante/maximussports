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
 * Both performance and insights endpoints currently live under /api/mlb/picks
 * but accept a `?sport=` query param and query the correct sport-scoped rows
 * from Supabase. Passing sport here ensures NBA pages receive NBA data.
 */
export function usePerformance({ sport = 'mlb' } = {}) {
  return useJson(`/api/mlb/picks/performance?sport=${sport}`);
}

export function useAuditInsights({ sport = 'mlb', days = 30 } = {}) {
  return useJson(`/api/mlb/picks/insights?sport=${sport}&days=${days}`);
}
