/**
 * Quick real ATS (recent-first): pinned + Top 25, windowed by days, strict timeouts.
 * computeRealAtsQuickRecent(windowDays, pinnedSlugs, maxTeams) — used by /api/ats/warm and /api/home/fast.
 * Early exit per team once enough recent games (8–12); prefer recent odds-history range.
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
const MAX_TEAMS_DEFAULT = 40;
const CONCURRENCY = 6;
const PER_TEAM_TIMEOUT_MS = 1100;
const ODDS_HISTORY_TIMEOUT_MS = 1200;
const OVERALL_DEADLINE_MS = 3500;
const RECENT_GAMES_CAP = 12;

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
 * Build team list: pinned first, then Top 25 from rankings, dedupe, cap maxTeams.
 * @param {{ pinnedSlugs?: string[], rankings?: array, slugToId?: Record<string, string>, maxTeams?: number }}
 */
function buildQuickTeamList({ pinnedSlugs = [], rankings = [], slugToId = {}, maxTeams = MAX_TEAMS_DEFAULT }) {
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
  return out.slice(0, maxTeams);
}

/**
 * Compute ATS for one team in a time window: only games within windowStart..today, early exit after cap games.
 * @param {{ slug: string, name: string, teamId: string }} team
 * @param {object[]} oddsHistoryGames
 * @param {number} deadlineAt
 * @param {Date} windowStart - only games on or after this date
 * @param {number} recentGamesCap - stop after this many recent games per team
 */
async function computeOneTeamAtsInWindow(team, oddsHistoryGames, deadlineAt, windowStart, recentGamesCap = RECENT_GAMES_CAP) {
  if (Date.now() > deadlineAt) return null;
  try {
    const sched = await raceWithTimeout(fetchScheduleSource(team.teamId), PER_TEAM_TIMEOUT_MS);
    const past = (sched?.events || []).filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (past.length === 0) return null;
    const windowStartTime = windowStart.getTime();
    const withDate = [];
    for (const ev of past) {
      if (withDate.length >= recentGamesCap) break;
      const date = ev.date ? new Date(ev.date).getTime() : 0;
      if (date < windowStartTime) continue;
      const oddsMatch = matchOddsHistoryToEvent(ev, oddsHistoryGames, team.name);
      const outcome = computeATSForEvent(ev, oddsMatch, team.name);
      withDate.push({ ev, outcome, date: ev.date });
    }
    const outcomes = withDate.map((d) => d.outcome).filter(Boolean);
    if (outcomes.length === 0) return null;
    const rec = aggregateATS(outcomes);
    if (!rec || rec.total === 0) return null;
    return { slug: team.slug, name: team.name, rec };
  } catch {
    return null;
  }
}

/**
 * Compute ATS for one team: schedule + match to odds history. Uses season record for ranking (legacy).
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

async function runWithConcurrencyWindow(teamList, oddsHistoryGames, deadlineAt, windowStart, recentGamesCap) {
  const results = [];
  for (let i = 0; i < teamList.length; i += CONCURRENCY) {
    if (Date.now() > deadlineAt) break;
    const chunk = teamList.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((t) => computeOneTeamAtsInWindow(t, oddsHistoryGames, deadlineAt, windowStart, recentGamesCap))
    );
    results.push(...chunkResults);
  }
  return results.filter(Boolean);
}

/**
 * Fast "quick real" ATS compute for a recent window (Last 30 or Last 7).
 * Team set: pinned + Top 25, dedupe, cap maxTeams. Early exit per team after ~8–12 recent games.
 * Performance: total deadline ~3.5s, per-request ~800–1200ms, concurrency 6.
 * @param {{ windowDays?: number, pinnedSlugs?: string[], maxTeams?: number }} options
 * @returns {Promise<{ best: array, worst: array, status, reason, sourceLabel, confidence, generatedAt }>}
 */
export async function computeRealAtsQuickRecent({ windowDays = 30, pinnedSlugs = [], maxTeams = MAX_TEAMS_DEFAULT } = {}) {
  const start = Date.now();
  const deadlineAt = start + OVERALL_DEADLINE_MS;
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const today = toDateStr(new Date());
  const fromStr = toDateStr(windowStart);
  if (DEBUG_ATS) console.log('[atsQuickReal] start recent', { windowDays, pinnedSlugs: pinnedSlugs?.length, fromStr, today });

  const [rankingsData, teamIdsData, oddsHistoryResult] = await Promise.all([
    fetchRankingsSource(),
    fetchTeamIdsSource(),
    raceWithTimeout(fetchOddsHistorySource(fromStr, today), ODDS_HISTORY_TIMEOUT_MS).catch(() => ({ games: [] })),
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

  const teamList = buildQuickTeamList({ pinnedSlugs, rankings, slugToId, maxTeams });
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

  const rows = await runWithConcurrencyWindow(teamList, oddsHistoryGames, deadlineAt, windowStart, RECENT_GAMES_CAP);
  const sorted = [...rows]
    .filter((r) => r?.rec?.total > 0)
    .sort((a, b) => {
      const cpA = a.rec?.coverPct ?? 0;
      const cpB = b.rec?.coverPct ?? 0;
      if (cpA !== cpB) return cpB - cpA;
      return (b.rec?.total ?? 0) - (a.rec?.total ?? 0);
    });
  const best = sorted.slice(0, 10).map((r) => ({ slug: r.slug, name: r.name, rec: r.rec, season: r.rec, last30: r.rec, last7: r.rec }));
  const worst = sorted.slice(-10).reverse().map((r) => ({ slug: r.slug, name: r.name, rec: r.rec, season: r.rec, last30: r.rec, last7: r.rec }));
  const elapsed = Date.now() - start;
  if (DEBUG_ATS) console.log('[atsQuickReal] done recent', { windowDays, best: best.length, worst: worst.length, elapsed });

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

  const windowLabel = windowDays === 7 ? 'Last 7' : 'Last 30';
  return {
    best,
    worst,
    status: 'FALLBACK',
    reason: `quick_real_last${windowDays}_pinned_plus_top25`,
    sourceLabel: `Pinned + Top 25 (${windowLabel} real ATS)`,
    confidence: 'medium',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Compute real ATS for pinned + Top 25 (deduped, cap 40). Strict timeouts. Uses season range (legacy).
 * @param {{ pinnedSlugs?: string[] }} options - optional pinned slugs from request
 * @returns {Promise<{ atsLeaders: { best, worst }, atsMeta } | { best, worst, status, reason, sourceLabel, confidence, generatedAt }>}
 */
export async function computeRealAtsQuick({ pinnedSlugs = [] } = {}) {
  return computeRealAtsQuickRecent({ windowDays: 30, pinnedSlugs, maxTeams: MAX_TEAMS_DEFAULT });
}
