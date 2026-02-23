/**
 * Fetches dynamic Home synopsis from /api/summary (non-streaming).
 * @param {Object} options
 * @param {boolean} [options.force=false] - Bypass cache (force regenerate)
 * @returns {Promise<{ summary: string }>}
 */
export async function fetchSummary(options = {}) {
  const params = new URLSearchParams();
  if (options.force) params.set('force', 'true');
  const qs = params.toString();
  const url = qs ? `/api/summary?${qs}` : '/api/summary';
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetches data-status counts for summary (no stream, no OpenAI).
 * Use for "Show data status" toggle or verification.
 * @returns {Promise<{ scoresCount, rankingsCount, oddsCount, oddsHistoryCount, headlinesCount, sampleScore, sampleHeadline, dataStatusLine }>}
 */
export async function fetchSummaryDebug() {
  const res = await fetch('/api/summary?debug=true');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
