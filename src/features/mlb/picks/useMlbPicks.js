/**
 * useMlbPicks — single canonical data source for every surface that renders
 * Maximus's Picks (Odds Insights, MLB Home, email preview, etc).
 *
 * All surfaces MUST consume picks through this hook so scorecard, topPick,
 * and tier values cannot drift between pages.
 *
 * Shape:
 *   {
 *     payload:            canonical v2 payload from /api/mlb/picks/built (or null),
 *     loading:            boolean,
 *     error:              string|null,
 *     scorecardSummary:   payload.scorecardSummary,
 *     topPick:            payload.topPick || tier1[0] || tier2[0] || null,
 *     tiers:              { tier1:[], tier2:[], tier3:[] },
 *     meta:               payload.meta,
 *     modelVersion:       payload.modelVersion,
 *     configVersion:      payload.configVersion,
 *   }
 *
 * Refetch is simple: call the returned `reload()` to force a fresh fetch.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';

const EMPTY_TIERS = Object.freeze({ tier1: [], tier2: [], tier3: [] });

export function useMlbPicks({ endpoint = '/api/mlb/picks/built' } = {}) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (!cancelled) { setPayload(data); setError(null); } })
      .catch(e => { if (!cancelled) setError(e?.message || 'fetch failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, nonce]);

  const tiers = useMemo(() => {
    if (payload?.tiers) return payload.tiers;
    // Legacy fallback — synthesize tiers from categories if the server hasn't
    // been redeployed yet. Never use for production decisioning; UI only.
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
    meta: payload?.meta || null,
    modelVersion: payload?.modelVersion || null,
    configVersion: payload?.configVersion || null,
    reload,
  };
}

/**
 * Tag picks that share a matchup with the top pick. Pure helper used by UI
 * to dim repeats or show a cross-reference pill.
 */
export function withTopPickCrossReference(picks, topPick) {
  if (!topPick || !Array.isArray(picks)) return picks || [];
  const topGameId = topPick.gameId;
  const topKey = topPick.id;
  return picks.map(p => ({
    ...p,
    _isTopPick: p.id === topKey,
    _sharesTopMatchup: p.gameId === topGameId && p.id !== topKey,
  }));
}
