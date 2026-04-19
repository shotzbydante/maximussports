/**
 * Hooks for the Performance & Learning + Audit Insights surfaces.
 * Both fetch once per mount and are read-only.
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

export function usePerformance({ sport = 'mlb' } = {}) {
  return useJson(`/api/mlb/picks/performance?sport=${sport}`);
}

export function useAuditInsights({ sport = 'mlb', days = 30 } = {}) {
  return useJson(`/api/mlb/picks/insights?sport=${sport}&days=${days}`);
}
