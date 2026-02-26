/**
 * Shared ATS leaders hook for Home and Odds Insights.
 * GET /api/ats/leaders, optional single POST refresh on warming per window per session,
 * retries at 1200ms and 3500ms. Uses src/api/atsLeaders.js for de-duplication and last-known fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAtsLeaders, fetchAtsRefresh } from '../api/atsLeaders';
import { getAtsLeadersCacheMaybeStale, setAtsLeadersCache } from '../utils/atsLeadersCache';

const VALID_WINDOWS = ['last30', 'last7', 'season'];
const RETRY_DELAY_MS_FIRST = 1200;
const RETRY_DELAY_MS_SECOND = 3500;

function hasAtsData(leaders) {
  return (leaders?.best?.length || 0) + (leaders?.worst?.length || 0) > 0;
}

const ATS_TIER = { FULL: 3, FALLBACK: 2, EMPTY: 0 };
function atsTier(meta) {
  if (!meta?.status) return ATS_TIER.EMPTY;
  if (meta.status === 'FULL') return ATS_TIER.FULL;
  if (meta.status === 'FALLBACK') return meta.confidence === 'medium' ? 2 : 1;
  return ATS_TIER.EMPTY;
}

function chooseAts(currentLeaders, currentMeta, incomingLeaders, incomingMeta) {
  const curHas = hasAtsData(currentLeaders);
  const inHas = hasAtsData(incomingLeaders);
  if (!inHas && curHas) return { leaders: currentLeaders, meta: currentMeta };
  if (!inHas) return { leaders: incomingLeaders ?? { best: [], worst: [] }, meta: incomingMeta ?? currentMeta };
  if (!curHas) return { leaders: incomingLeaders, meta: incomingMeta };
  const curTier = atsTier(currentMeta);
  const inTier = atsTier(incomingMeta);
  if (inTier > curTier) return { leaders: incomingLeaders, meta: incomingMeta };
  return { leaders: currentLeaders, meta: currentMeta };
}

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * @param {{ initialWindow?: 'last30'|'last7'|'season' }} [opts]
 * @returns {{ atsLeaders: { best: any[], worst: any[] }, atsMeta: object | null, atsWindow: string, atsLoading: boolean, seasonWarming: boolean, setAtsWindow: (w: string) => void, onRetry: () => void, onPeriodChange: (w: string) => void }}
 */
export function useAtsLeaders(opts = {}) {
  const initialWindow = VALID_WINDOWS.includes(opts.initialWindow) ? opts.initialWindow : 'last30';

  const cached = getAtsLeadersCacheMaybeStale();
  const hasCached = cached?.data && (cached.data.best?.length || cached.data.worst?.length);
  const initialLeaders = hasCached ? cached.data : { best: [], worst: [] };
  const initialMeta = hasCached ? { status: 'FULL', confidence: 'low', sourceLabel: null } : null;

  const [atsLeaders, setAtsLeadersState] = useState(initialLeaders);
  const [atsMeta, setAtsMeta] = useState(initialMeta);
  const [atsWindow, setAtsWindowState] = useState(initialWindow);
  const [atsLoading, setAtsLoading] = useState(!hasCached);
  const [seasonWarming, setSeasonWarming] = useState(false);

  const stateRef = useRef({ leaders: atsLeaders, meta: atsMeta });
  const refreshAttemptsRef = useRef({ last30: 0, last7: 0, season: 0 });

  useEffect(() => {
    stateRef.current = { leaders: atsLeaders, meta: atsMeta };
  }, [atsLeaders, atsMeta]);

  const applyResult = useCallback((d, currentLeaders, currentMeta, metaOverride = null) => {
    const incomingLeaders = d.atsLeaders ?? { best: [], worst: [] };
    let incomingMeta = d.atsMeta ?? null;
    if (metaOverride && typeof metaOverride === 'object') {
      incomingMeta = incomingMeta ? { ...incomingMeta, ...metaOverride } : { ...metaOverride };
    }
    const { leaders, meta } = chooseAts(currentLeaders, currentMeta, incomingLeaders, incomingMeta);
    setAtsLeadersState({ best: [...(leaders.best || [])], worst: [...(leaders.worst || [])] });
    setAtsMeta(meta ? { ...meta } : null);
    if (d.atsWindow) setAtsWindowState(d.atsWindow);
    if (hasAtsData(leaders)) setAtsLeadersCache(leaders);
    setAtsLoading(false);
    setSeasonWarming(!!d.seasonWarming);
    return d.atsMeta?.reason === 'ats_data_warming' && !hasAtsData(leaders);
  }, []);

  const fetchForWindow = useCallback((window, options = {}) => {
    const { skipRefreshAttempt, signal } = options;
    const w = VALID_WINDOWS.includes(window) ? window : 'last30';
    if (isDev) console.log('[useAtsLeaders] ATS GET start', { window: w });
    return fetchAtsLeaders(w, { signal })
      .then((d) => {
        if (isDev) console.log('[useAtsLeaders] ATS GET end', { window: w, warming: d?.atsMeta?.reason === 'ats_data_warming' });
        if (d?.atsMeta?.reason === 'ats_data_warming' && isDev) console.log('[useAtsLeaders] ATS warming detected', { window: w });
        const cur = stateRef.current;
        const incomingLeaders = d.atsLeaders ?? { best: [], worst: [] };
        const stillWarming = d.atsMeta?.reason === 'ats_data_warming' && !hasAtsData(incomingLeaders);
        const willTriggerRefresh = stillWarming && !skipRefreshAttempt && refreshAttemptsRef.current[w] < 1;
        const metaOverride = willTriggerRefresh ? { kickedBy: 'client' } : null;
        applyResult(d, cur.leaders, cur.meta, metaOverride);
        if (willTriggerRefresh) {
          refreshAttemptsRef.current[w] = 1;
          if (isDev) console.log('[useAtsLeaders] ATS POST refresh attempt', { window: w });
          fetchAtsRefresh(w).catch(() => {});
        }
        return { data: d, stillWarming };
      })
      .catch((err) => {
        if (isDev) console.log('[useAtsLeaders] ATS GET error', { window: w, message: err?.message });
        setAtsLoading(false);
        return { data: null, stillWarming: false };
      });
  }, [applyResult]);

  // Mount: fetch for initial window; if warming, one POST then retry at 1200ms and 3500ms
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    const mountTime = Date.now();
    const windowKey = initialWindow;
    const timeouts = [];

    setAtsLoading(true);
    fetchForWindow(windowKey, { signal: ac.signal })
      .then(({ data, stillWarming }) => {
        if (cancelled || !data) return;
        if (stillWarming) {
          timeouts.push(setTimeout(() => {
            if (cancelled) return;
            if (isDev) console.log('[useAtsLeaders] ATS follow-up GET (1200ms)');
            fetchForWindow(windowKey, { skipRefreshAttempt: true, signal: ac.signal });
          }, Math.max(0, RETRY_DELAY_MS_FIRST - (Date.now() - mountTime))));
          timeouts.push(setTimeout(() => {
            if (cancelled) return;
            if (isDev) console.log('[useAtsLeaders] ATS follow-up GET (3500ms)');
            fetchForWindow(windowKey, { skipRefreshAttempt: true, signal: ac.signal });
          }, Math.max(0, RETRY_DELAY_MS_SECOND - (Date.now() - mountTime))));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      ac.abort();
      timeouts.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only

  const setAtsWindow = useCallback((w) => {
    const win = VALID_WINDOWS.includes(w) ? w : 'last30';
    setAtsWindowState(win);
    setAtsLoading(true);
    fetchForWindow(win).catch(() => {});
  }, [fetchForWindow]);

  const onPeriodChange = useCallback((w) => {
    setAtsWindow(w);
  }, [setAtsWindow]);

  const onRetry = useCallback(() => {
    const w = atsWindow;
    setAtsLoading(true);
    fetchAtsRefresh(w).catch(() => {});
    setTimeout(() => {
      fetchForWindow(w).catch(() => {});
    }, RETRY_DELAY_MS_FIRST);
    setTimeout(() => {
      fetchForWindow(w).catch(() => {});
    }, RETRY_DELAY_MS_SECOND);
  }, [atsWindow, fetchForWindow]);

  return {
    atsLeaders,
    atsMeta,
    atsWindow,
    atsLoading,
    seasonWarming,
    setAtsWindow,
    onRetry,
    onPeriodChange,
  };
}
