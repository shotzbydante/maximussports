/**
 * ATS leaders from team ATS summaries (same data source as pinned team cards).
 * Uses schedule + odds history per team with shared odds-history fetch for the window.
 * Concurrency 6, per-team timeout 800ms, overall deadline 2500ms (last30) / 2000ms (last7).
 * MIN_GAMES: 8 for last30, 5 for last7.
 */

import { fetchRankingsSource, fetchTeamIdsSource, fetchOddsHistorySource, fetchScheduleSource } from '../_sources.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { getSlugFromRankingsName } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { computeATSForEvent, aggregateATS } from '../../src/utils/ats.js';
import { matchOddsHistoryToEvent } from '../../src/api/odds.js';

const DEBUG_ATS = process.env.DEBUG_ATS === '1';
const MAX_TEAMS = 60;
const CONCURRENCY = 6;
const PER_TEAM_TIMEOUT_MS = 700;
const DEADLINE_LAST30_MS = 4200; // internal fallback when no external deadline
const DEADLINE_LAST7_MS = 3200;
const ABS_CAP_MS = 8000; // hard cap — never allow compute to run longer than this
const MIN_GAMES_LAST30 = 8;
const MIN_GAMES_LAST7 = 5;

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
 * Compute ATS for one team in a date window (same logic as api/team/batch.js computeAts).
 * Returns { w, l, p, total, coverPct } for games in [windowStart, now].
 */
function computeAtsForWindow(schedule, oddsHistoryGames, teamName, windowStart) {
  const past = (schedule?.events || []).filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (past.length === 0) return null;
  const windowStartTime = windowStart.getTime();
  const outcomes = past.map((ev) => {
    const odds = matchOddsHistoryToEvent(ev, oddsHistoryGames, teamName);
    return computeATSForEvent(ev, odds, teamName);
  });
  const withDate = past.map((ev, i) => ({ outcome: outcomes[i], date: ev.date }));
  const windowOutcomes = withDate
    .filter((d) => d.date && new Date(d.date).getTime() >= windowStartTime)
    .map((d) => d.outcome)
    .filter((o) => o === 'W' || o === 'L' || o === 'P');
  if (windowOutcomes.length === 0) return null;
  return aggregateATS(windowOutcomes);
}

/**
 * Build team list: pinned first, then Top 25, then rest of TEAMS with resolved IDs (expanded pool for 10/10 reliability). Dedupe, cap MAX_TEAMS.
 */
function buildTeamList(pinnedSlugs = [], rankings = [], slugToId = {}) {
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
  for (const t of TEAMS) {
    if (out.length >= MAX_TEAMS) break;
    if (!t?.slug || !slugToId[t.slug] || seen.has(t.slug)) continue;
    seen.add(t.slug);
    out.push({ slug: t.slug, name: t.name, teamId: slugToId[t.slug] });
  }
  return out.slice(0, MAX_TEAMS);
}

/**
 * Compute ATS leaders from team ATS summaries (same source as pinned cards).
 * @param {{ windowDays: number, teamSlugs?: string[], deadlineAt?: number }} options
 *   deadlineAt — external wall-clock deadline (ms). Overrides internal deadline when later, capped at ABS_CAP_MS.
 * @returns {Promise<{ best: array, worst: array, status: string, confidence: string, reason?: string, sourceLabel?: string, generatedAt: string, teamsAttempted?: number, teamsWithAts?: number, durationMs?: number, processedTeamsCount?: number, budgetExceeded?: boolean }>}
 */
export async function computeAtsLeadersFromTeamAts({ windowDays = 30, teamSlugs = [], deadlineAt: externalDeadlineAt = null } = {}) {
  const start = Date.now();
  const localDeadlineMs = windowDays === 7 ? DEADLINE_LAST7_MS : DEADLINE_LAST30_MS;
  // If caller provides a later deadline (more generous budget), honour it — but never exceed ABS_CAP_MS.
  const effectiveDeadlineAt = externalDeadlineAt != null
    ? Math.min(externalDeadlineAt, start + ABS_CAP_MS)
    : start + localDeadlineMs;
  const minGames = windowDays === 7 ? MIN_GAMES_LAST7 : MIN_GAMES_LAST30;
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const today = toDateStr(new Date());
  const fromStr = toDateStr(windowStart);

  if (DEBUG_ATS) console.log('[atsLeadersFromTeamAts] start', { windowDays, teamSlugs: teamSlugs?.length, fromStr, today, effectiveDeadlineMs: effectiveDeadlineAt - start });

  // Bound the odds-history fetch so it doesn't consume the entire budget.
  // Leave at least 1800 ms for the team loop; enforce a 1500 ms floor so we always try.
  const oddsFetchTimeoutMs = Math.max(1500, effectiveDeadlineAt - Date.now() - 1800);

  const [rankingsData, teamIdsData, oddsHistoryResult] = await Promise.all([
    fetchRankingsSource(),
    fetchTeamIdsSource(),
    raceWithTimeout(fetchOddsHistorySource(fromStr, today), oddsFetchTimeoutMs).catch(() => {
      if (DEBUG_ATS) console.log('[atsLeadersFromTeamAts] odds fetch timed out (budget)', { oddsFetchTimeoutMs });
      return { games: [] };
    }),
  ]);

  const rankings = rankingsData?.rankings || [];
  const slugToId = {
    ...(teamIdsData?.slugToId || {}),
    ...buildSlugToIdFromRankings({ rankings }),
  };
  const oddsHistoryGames = oddsHistoryResult?.games || [];
  const oddsGamesCount = oddsHistoryGames.length;
  if (rankings.length === 0) {
    if (DEBUG_ATS) console.log('[atsLeadersFromTeamAts] no rankings');
    return {
      best: [], worst: [], status: 'EMPTY', confidence: 'low',
      reason: 'no_rankings', sourceLabel: null,
      generatedAt: new Date().toISOString(),
      oddsGamesCount, teamsWithAnyAtsCount: 0,
    };
  }
  if (oddsGamesCount === 0) {
    if (DEBUG_ATS) console.log('[atsLeadersFromTeamAts] no odds history');
    return {
      best: [], worst: [], status: 'EMPTY', confidence: 'low',
      reason: 'no_odds_history', sourceLabel: null,
      generatedAt: new Date().toISOString(),
      oddsGamesCount: 0, teamsWithAnyAtsCount: 0,
    };
  }

  const teamList = buildTeamList(teamSlugs, rankings, slugToId);
  if (teamList.length === 0) {
    if (DEBUG_ATS) console.log('[atsLeadersFromTeamAts] no teams resolved');
    return {
      best: [], worst: [], status: 'EMPTY', confidence: 'low',
      reason: 'no_teams', sourceLabel: null,
      generatedAt: new Date().toISOString(),
      oddsGamesCount, teamsWithAnyAtsCount: 0,
    };
  }

  let processedTeams = 0;
  let budgetExceeded = false;
  let teamsWithAnyAts = 0; // teams with total > 0 (before the min-games filter)
  const results = [];
  for (let i = 0; i < teamList.length; i += CONCURRENCY) {
    if (Date.now() > effectiveDeadlineAt) { budgetExceeded = true; break; }
    const chunk = teamList.slice(i, i + CONCURRENCY);
    processedTeams += chunk.length;
    const chunkResults = await Promise.all(
      chunk.map(async (t) => {
        try {
          const sched = await raceWithTimeout(fetchScheduleSource(t.teamId), PER_TEAM_TIMEOUT_MS);
          const rec = computeAtsForWindow(sched, oddsHistoryGames, t.name, windowStart);
          // Track teams that have ANY ATS data (total > 0) before the minimum-games filter
          if (rec && rec.total > 0) teamsWithAnyAts++;
          if (!rec || rec.total < 2) return null;
          return {
            slug: t.slug,
            name: t.name,
            atsWins: rec.w,
            atsLosses: rec.l,
            atsPushes: rec.p ?? 0,
            games: rec.total,
            coverPct: rec.coverPct,
            recordLabel: `${rec.w}-${rec.l}${(rec.p > 0 ? `-${rec.p}` : '')}`,
            rec: { w: rec.w, l: rec.l, p: rec.p ?? 0, total: rec.total, coverPct: rec.coverPct },
            season: rec,
            last30: rec,
            last7: rec,
          };
        } catch {
          return null;
        }
      })
    );
    results.push(...chunkResults);
  }

  /* Include teams with at least 2 games so we can show 10 each when pool allows. Prefer higher game count in sort. */
  const rows = results.filter(Boolean);
  const sorted = [...rows].sort((a, b) => {
    const cpA = a.coverPct ?? 0;
    const cpB = b.coverPct ?? 0;
    if (cpA !== cpB) return cpB - cpA;
    return (b.games ?? 0) - (a.games ?? 0);
  });
  const best = sorted.slice(0, 10);
  const worst = sorted.slice(-10).reverse();
  const durationMs = Date.now() - start;
  const teamsWithAts = rows.length;
  const hasAnyData = best.length > 0 || worst.length > 0;
  // Confidence based on average games-per-team: more games = more reliable ATS signal.
  const avgGames = rows.length > 0
    ? rows.reduce((s, r) => s + (r.games ?? 0), 0) / rows.length
    : 0;
  const confidence = budgetExceeded ? 'low'
    : avgGames >= 6 ? 'high'
    : avgGames >= 4 ? 'medium'
    : rows.length > 0 ? 'low'
    : 'low';
  // PARTIAL: budget cut us off but we still have usable leaders; FULL/FALLBACK/EMPTY otherwise.
  const status = budgetExceeded && hasAnyData
    ? 'PARTIAL'
    : (hasAnyData ? (confidence === 'high' ? 'FULL' : 'FALLBACK') : 'EMPTY');
  const sourceLabel = 'Pinned + Top 25 (recent ATS)';
  const reason = budgetExceeded
    ? 'budget_exceeded'
    : (status !== 'EMPTY' ? 'team_ats_recent' : 'insufficient_sample');

  if (DEBUG_ATS) {
    console.log('[atsLeadersFromTeamAts] done', {
      windowDays,
      teamsAttempted: teamList.length,
      processedTeams,
      teamsWithAts,
      teamsWithAnyAts,
      oddsGamesCount,
      avgGames: Math.round(avgGames * 10) / 10,
      best: best.length,
      worst: worst.length,
      durationMs,
      budgetExceeded,
    });
  }

  return {
    best,
    worst,
    status,
    confidence,
    reason,
    sourceLabel,
    generatedAt: new Date().toISOString(),
    teamsAttempted: teamList.length,
    teamsWithAts,
    durationMs,
    processedTeamsCount: processedTeams,
    budgetExceeded,
    oddsGamesCount,
    teamsWithAnyAtsCount: teamsWithAnyAts,
  };
}
