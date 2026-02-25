/**
 * Fast ATS fallback (~1–2s). Uses only rankings + team IDs — no odds history, no per-team schedule.
 * Produces a proxy leaderboard so Home never shows empty when warm runs.
 */

import { fetchRankingsSource, fetchTeamIdsSource } from '../_sources.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { getSlugFromRankingsName } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';

const DEBUG_ATS = process.env.DEBUG_ATS === '1';

/* Use total: 0 so UI shows N/A instead of misleading 0-0. */
const EMPTY_REC = { w: 0, l: 0, p: 0, total: 0, coverPct: null };

/**
 * Build proxy rows from Top 25: same shape as ATS rows but with no ATS data (rec.total = 0).
 * Best = ranks 1–10, worst = ranks 16–25 (by AP rank order).
 */
function buildProxyLeaderboard(rankings, slugToId) {
  const seen = new Set();
  const rows = [];
  for (const r of rankings.slice(0, 25)) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
    if (!slug || !slugToId[slug] || seen.has(slug)) continue;
    seen.add(slug);
    const team = getTeamBySlug(slug);
    rows.push({
      slug,
      name: team?.name ?? r.teamName,
      rank: r.rank,
      season: EMPTY_REC,
      last30: EMPTY_REC,
      last7: EMPTY_REC,
    });
  }
  const best = rows.slice(0, 10);
  const worst = rows.slice(-10).reverse();
  return { best, worst };
}

/**
 * Compute a non-empty fallback leaderboard using only cheap inputs (rankings + team IDs).
 * Completes in ~1–2 seconds. No odds history or per-team schedule calls.
 * @returns {Promise<{ best: array, worst: array, status: 'FALLBACK', reason: string, sourceLabel: string, confidence: 'low' }>}
 */
export async function computeFastFallbackFromRankingsOnly() {
  const start = Date.now();
  if (DEBUG_ATS) console.log('[atsFastFallback] start');
  const [rankingsData, teamIdsData] = await Promise.all([
    fetchRankingsSource(),
    fetchTeamIdsSource(),
  ]);
  const rankings = rankingsData?.rankings || [];
  const slugToId = {
    ...(teamIdsData?.slugToId || {}),
    ...buildSlugToIdFromRankings({ rankings }),
  };
  const fetchMs = Date.now() - start;
  if (DEBUG_ATS) console.log('[atsFastFallback] fetch rankings+teamIds', { rankingsCount: rankings.length, fetchMs });

  if (rankings.length === 0) {
    return {
      best: [],
      worst: [],
      status: 'FALLBACK',
      reason: 'fallback_proxy_no_rankings',
      sourceLabel: 'Top 25 fallback',
      confidence: 'low',
      generatedAt: new Date().toISOString(),
    };
  }

  const { best, worst } = buildProxyLeaderboard(rankings, slugToId);
  const totalMs = Date.now() - start;
  if (DEBUG_ATS) console.log('[atsFastFallback] done', { bestCount: best.length, worstCount: worst.length, totalMs });

  return {
    best,
    worst,
    status: 'FALLBACK',
    reason: 'fallback_proxy_no_ats_records',
    sourceLabel: 'Top 25 fallback',
    confidence: 'low',
    generatedAt: new Date().toISOString(),
  };
}
