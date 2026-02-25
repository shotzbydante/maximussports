/**
 * Quick real ATS: pinned + Top 25 teams only, strict timeouts.
 * Tier 1: real ATS records for a small set (max 40 teams). Used by /api/ats/warm and /api/home/fast.
 */

import { fetchRankingsSource, fetchTeamIdsSource, fetchOddsHistorySource, fetchScheduleSource } from '../_sources.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { getSlugFromRankingsName } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { computeATSForEvent, aggregateATS } from '../../src/utils/ats.js';
import { matchOddsHistoryToEvent } from '../../src/api/odds.js';

const DEBUG_ATS = typeof process !== 'undefined' && process.env?.DEBUG_ATS === '1';
const MAX_TEAMS = 40;
const CONCURRENCY = 4;
const PER_TEAM_TIMEOUT_MS = 1500;
const ODDS_HISTORY_TIMEOUT_MS = 2500;
const OVERALL_DEADLINE_MS = 3500;

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

function raceWithTimeout(promise, ms) {
  return Promise.race([promise, timeout(ms)]);
}

/**
 * Build team list: pinned first, then Top 25 from rankings, dedupe, cap MAX_TEAMS.
 * @param {{ pinnedSlugs?: string[], rankings?: array, slugToId?: Record<string, string> }}
 */
function buildQuickTeamList({ pinnedSlugs = [], rankings = [], slugToId = {} }) {
  const seen = new Set();
  const out = [];
  for (const slug of pinnedSlugs) {
    if (!slug || !slugToId[slug] || seen.has(slug)) continue;
    seen.add(slug);
    const team = getTeamBySlug(slug);
    out.push({ slug, name: team?.name ?? slug, teamId: slugToId[slug] });
  }
  for (const r of (rankings || []).slice(0, 25)) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
    if (!slug || !slugToId[slug] || seen.has(slug)) continue;
    seen.add(slug);
    const team = getTeamBySlug(slug);
    out.push({ slug, name: team?.name ?? r.teamName, teamId: slugToId[slug] });
  }
  return out.slice(0, MAX_TEAMS);
}

/**
 * Compute ATS for one team: schedule + match to odds history. Uses season record for ranking.
 */
async function computeOneTeamAts({ slug, name, teamId }, oddsHistoryGames, deadlineAt) {
  if (Date.now() > deadlineAt) return null;
  try {
    const sched = await raceWithTimeout(fetchScheduleSource(teamId), PER_TEAM_TIMEOUT_MS);
    const past = (sched?.events || []).filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (past.length === 0) return null;
    const outcomes = past.map((ev) => {
      const oddsMatch = matchOddsHistoryToEvent(ev, oddsHistoryGames, name);
      return computeATSForEvent(ev, oddsMatch, name);
    });
    const withDate = past.map((ev, i) => ({ ev, outcome: outcomes[i], date: ev.date }));
    const seasonOut = withDate
      .filter(({ date }) => date && new Date(date) >= new Date(SEASON_START))
      .map(({ outcome }) => outcome)
      .filter(Boolean);
    const season = aggregateATS(seasonOut);
    if (!season || season.total === 0) return null;
    return { slug, name, season, last30: season, last7: season };
  } catch {
    return null;
  }
}

async function runWithConcurrency(teamList, oddsHistoryGames, deadlineAt) {
  const results = [];
  for (let i = 0; i < teamList.length; i += CONCURRENCY) {
    if (Date.now() > deadlineAt) break;
    const chunk = teamList.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((t) => computeOneTeamAts(t, oddsHistoryGames, deadlineAt))
    );
    results.push(...chunkResults);
  }
  return results.filter(Boolean);
}

/**
 * Compute real ATS for pinned + Top 25 (deduped, cap 40). Strict timeouts.
 * @param {{ pinnedSlugs?: string[] }} options - optional pinned slugs from request
 * @returns {Promise<{ atsLeaders: { best, worst }, atsMeta } | { best, worst, status, reason, sourceLabel, confidence, generatedAt }>}
 */
export async function computeRealAtsQuick({ pinnedSlugs = [] } = {}) {
  const start = Date.now();
  const deadlineAt = start + OVERALL_DEADLINE_MS;
  if (DEBUG_ATS) console.log('[atsQuickReal] start', { pinnedSlugs: pinnedSlugs?.length });

  const today = toDateStr(new Date());
  const [rankingsData, teamIdsData, oddsHistoryResult] = await Promise.all([
    fetchRankingsSource(),
    fetchTeamIdsSource(),
    raceWithTimeout(fetchOddsHistorySource(SEASON_START, today), ODDS_HISTORY_TIMEOUT_MS).catch(() => ({ games: [] })),
  ]);

  const rankings = rankingsData?.rankings || [];
  const slugToId = {
    ...(teamIdsData?.slugToId || {}),
    ...buildSlugToIdFromRankings({ rankings }),
  };
  const oddsHistoryGames = oddsHistoryResult?.games || [];
  if (rankings.length === 0) {
    return {
      best: [],
      worst: [],
      status: 'EMPTY',
      reason: 'quick_real_no_rankings',
      sourceLabel: null,
      confidence: 'low',
      generatedAt: new Date().toISOString(),
    };
  }
  if (oddsHistoryGames.length === 0) {
    return {
      best: [],
      worst: [],
      status: 'EMPTY',
      reason: 'quick_real_odds_timeout_or_empty',
      sourceLabel: null,
      confidence: 'low',
      generatedAt: new Date().toISOString(),
    };
  }

  const teamList = buildQuickTeamList({ pinnedSlugs, rankings, slugToId });
  if (teamList.length === 0) {
    return {
      best: [],
      worst: [],
      status: 'EMPTY',
      reason: 'quick_real_no_teams_resolved',
      sourceLabel: null,
      confidence: 'low',
      generatedAt: new Date().toISOString(),
    };
  }

  const rows = await runWithConcurrency(teamList, oddsHistoryGames, deadlineAt);
  const sorted = [...rows]
    .map((r) => ({ ...r, rec: r.season }))
    .filter((r) => r.rec?.total > 0)
    .sort((a, b) => {
      const cpA = a.rec?.coverPct ?? 0;
      const cpB = b.rec?.coverPct ?? 0;
      if (cpA !== cpB) return cpB - cpA;
      return (b.rec?.total ?? 0) - (a.rec?.total ?? 0);
    });
  const best = sorted.slice(0, 10);
  const worst = sorted.slice(-10).reverse();
  const elapsed = Date.now() - start;
  if (DEBUG_ATS) console.log('[atsQuickReal] done', { best: best.length, worst: worst.length, elapsed });

  if (best.length === 0 && worst.length === 0) {
    return {
      best: [],
      worst: [],
      status: 'EMPTY',
      reason: 'quick_real_no_ats_records',
      sourceLabel: null,
      confidence: 'low',
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    best,
    worst,
    status: 'FALLBACK',
    reason: 'quick_real_ats_pinned_plus_top25',
    sourceLabel: 'Pinned + Top 25 (real ATS)',
    confidence: 'medium',
    generatedAt: new Date().toISOString(),
  };
}
