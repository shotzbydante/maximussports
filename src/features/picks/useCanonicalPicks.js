/**
 * useCanonicalPicks — sport-agnostic canonical picks hook.
 *
 *   useCanonicalPicks({ endpoint: '/api/<sport>/picks/built' })
 *
 * Returns the same shape as the MLB hook so the shared PicksSection works
 * uniformly across sports.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { withTopPickCrossReference } from '../mlb/picks/useMlbPicks';

const EMPTY_TIERS = Object.freeze({ tier1: [], tier2: [], tier3: [] });

export function useCanonicalPicks({ endpoint = '/api/mlb/picks/built' } = {}) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => { if (!cancelled) { setPayload(data); setError(null); } })
      .catch(e => { if (!cancelled) setError(e?.message || 'fetch failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, nonce]);

  const tiers = useMemo(() => {
    if (payload?.tiers) return payload.tiers;
    const cats = payload?.categories;
    if (!cats) return EMPTY_TIERS;
    const all = [
      ...(cats.pickEms || []),
      ...(cats.ats || []),
      ...(cats.leans || []),
      ...(cats.totals || []),
    ];
    const sorted = all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    return {
      tier1: sorted.filter(p => p.confidence === 'high').slice(0, 3),
      tier2: sorted.filter(p => p.confidence === 'medium').slice(0, 5),
      tier3: sorted.filter(p => p.confidence === 'low').slice(0, 5),
    };
  }, [payload]);

  const topPick = useMemo(() => {
    return payload?.topPick || tiers.tier1?.[0] || tiers.tier2?.[0] || null;
  }, [payload, tiers]);

  return {
    payload,
    loading,
    error,
    scorecardSummary: payload?.scorecardSummary || null,
    topPick,
    tiers,
    coverage: Array.isArray(payload?.coverage) ? payload.coverage : [],
    meta: payload?.meta || null,
    modelVersion: payload?.modelVersion || null,
    configVersion: payload?.configVersion || null,
    sport: payload?.sport || 'mlb',
    reload,
    // v7 contract surfaces:
    fullSlatePicks: Array.isArray(payload?.fullSlatePicks) ? payload.fullSlatePicks : [],
    heroPicks:      Array.isArray(payload?.heroPicks)      ? payload.heroPicks      : [],
    trackingPicks:  Array.isArray(payload?.trackingPicks)  ? payload.trackingPicks  : [],
    byGame:         Array.isArray(payload?.byGame)         ? payload.byGame         : [],
  };
}

// Re-export cross-reference helper so section can keep importing from this module
export { withTopPickCrossReference };
