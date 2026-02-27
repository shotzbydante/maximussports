/**
 * Shared UI helpers for ATS Leaderboard so Home and Insights show the same loading/warming behavior.
 */

/**
 * Whether to show the blue progress/loading UI (progress bar + status text).
 * True when: no data and warming, or has data but is proxy fallback.
 * @param {{ best?: any[], worst?: any[] }} leaders
 * @param {{ reason?: string, status?: string, source?: string, cacheNote?: string, confidence?: string, sourceLabel?: string } | null} meta
 * @returns {boolean}
 */
export function shouldShowAtsLoading(leaders, meta) {
  const best = leaders?.best ?? [];
  const worst = leaders?.worst ?? [];
  const hasData = best.length > 0 || worst.length > 0;
  if (meta?.reason === 'ats_data_warming' && !hasData) return true;
  // Stale/lastKnown data is valid — show it as-is rather than a loading state.
  if (meta?.source === 'kv_last_known' || meta?.stage === 'kv_last_known') return false;
  const status = meta?.status ?? (hasData ? 'FULL' : 'EMPTY');
  const isRealTeamAts = meta?.cacheNote === 'computed_recent_team_ats' || (meta?.sourceLabel && meta.sourceLabel.includes('recent ATS'));
  const isProxy = !isRealTeamAts && status === 'FALLBACK' && (meta?.confidence === 'low' || (meta?.sourceLabel && meta.sourceLabel.toLowerCase().includes('fallback')));
  return hasData && isProxy;
}

/**
 * Whether to show the empty state (no data, not warming). Used so we don't show
 * "ATS not available" when we're showing the warming progress UI.
 * @param {{ best?: any[], worst?: any[] }} leaders
 * @param {{ reason?: string, status?: string } | null} meta
 * @returns {boolean}
 */
export function shouldShowAtsEmptyState(leaders, meta) {
  const best = leaders?.best ?? [];
  const worst = leaders?.worst ?? [];
  const hasData = best.length > 0 || worst.length > 0;
  const status = meta?.status ?? (hasData ? 'FULL' : 'EMPTY');
  const isEmpty = status === 'EMPTY' || (!hasData && meta != null);
  return isEmpty && meta?.reason !== 'ats_data_warming';
}
