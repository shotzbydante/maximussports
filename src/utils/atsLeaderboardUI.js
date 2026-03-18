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
  if (meta?.source === 'kv_last_known' || meta?.stage === 'kv_last_known') return false;
  if (meta?.source === 'client_last_known') return false;
  if (hasData) return false;
  const status = meta?.status ?? (hasData ? 'FULL' : 'EMPTY');
  return status === 'EMPTY';
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
