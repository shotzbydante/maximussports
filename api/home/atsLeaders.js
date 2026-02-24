/**
 * Compute ATS leaders (best/worst) from rankings + odds-history + schedules.
 * Full-league: all teams with resolved IDs. Fallback: Top 25 + Lock + "Should be in" when sparse.
 * Used by /api/home/slow, /api/home/fast warmer, and /api/ats/warm.
 */

import {
  fetchRankingsSource,
  fetchOddsHistorySource,
  fetchTeamIdsSource,
  fetchScheduleSource,
} from '../_sources.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { getSlugFromRankingsName } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { computeATSForEvent, aggregateATS } from '../../src/utils/ats.js';
import { matchOddsHistoryToEvent } from '../../src/api/odds.js';

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute ATS for a list of team slugs. Returns sorted best/worst rows.
 */
async function computeAtsForTeamList(teamSlugs, slugToId, oddsHistoryGames) {
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);

  const results = await Promise.all(
    teamSlugs.map(async ({ slug, name }) => {
      const teamId = slugToId[slug];
      if (!teamId) return null;
      try {
        const sched = await fetchScheduleSource(teamId);
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
        const last30Out = withDate
          .filter(({ date }) => date && new Date(date) >= thirtyAgo)
          .map(({ outcome }) => outcome)
          .filter(Boolean);
        const last7Out = withDate
          .filter(({ date }) => date && new Date(date) >= sevenAgo)
          .map(({ outcome }) => outcome)
          .filter(Boolean);
        return {
          slug,
          name,
          season: aggregateATS(seasonOut),
          last30: aggregateATS(last30Out),
          last7: aggregateATS(last7Out),
        };
      } catch {
        return null;
      }
    })
  );

  const rows = results.filter(Boolean);
  const sorted = [...rows]
    .map((r) => ({ ...r, rec: r.season }))
    .filter((r) => r.rec?.total > 0)
    .sort((a, b) => (b.rec.coverPct ?? 0) - (a.rec.coverPct ?? 0));
  return {
    best: sorted.slice(0, 10),
    worst: sorted.slice(-10).reverse(),
  };
}

/**
 * Full-league team list: all TEAMS that have a resolved slugToId.
 */
function buildFullLeagueTeamSlugs(slugToId) {
  return TEAMS.filter((t) => slugToId[t.slug]).map((t) => ({ slug: t.slug, name: t.name }));
}

/**
 * Fallback: Top 25 (from rankings) + Lock + "Should be in" tiers.
 */
function buildFallbackTeamSlugs(rankings, slugToId) {
  const seen = new Set();
  const out = [];
  for (const r of rankings.slice(0, 25)) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
    if (slug && slugToId[slug] && !seen.has(slug)) {
      seen.add(slug);
      const team = getTeamBySlug(slug);
      out.push({ slug, name: team?.name ?? r.teamName });
    }
  }
  for (const t of TEAMS) {
    if ((t.oddsTier === 'Lock' || t.oddsTier === 'Should be in') && slugToId[t.slug] && !seen.has(t.slug)) {
      seen.add(t.slug);
      out.push({ slug: t.slug, name: t.name });
    }
  }
  return out;
}

/**
 * Fetches rankings, odds history, team IDs; computes ATS for all teams, fallback if sparse.
 * @returns {Promise<{ best: array, worst: array, unavailableReason?: string, source?: string, sourceLabel?: string }>}
 */
export async function computeAtsLeadersFromSources() {
  const today = toDateStr(new Date());
  const [oddsHistoryData, teamIdsData, rankingsData] = await Promise.all([
    fetchOddsHistorySource(SEASON_START, today),
    fetchTeamIdsSource(),
    fetchRankingsSource(),
  ]);

  const oddsHistoryGames = oddsHistoryData?.games || [];
  const slugToId = { ...(teamIdsData?.slugToId || {}), ...buildSlugToIdFromRankings({ rankings: rankingsData?.rankings || [] }) };
  const rankings = rankingsData?.rankings || [];

  if (rankings.length === 0) {
    return { best: [], worst: [], unavailableReason: 'rankings empty' };
  }
  if (oddsHistoryGames.length === 0) {
    return { best: [], worst: [], unavailableReason: 'odds history empty' };
  }

  // 1) Full-league: all teams with resolved IDs
  const fullLeagueSlugs = buildFullLeagueTeamSlugs(slugToId);
  const full = await computeAtsForTeamList(fullLeagueSlugs, slugToId, oddsHistoryGames);
  const hasFull = (full.best?.length || 0) + (full.worst?.length || 0) > 0;

  if (hasFull) {
    return {
      best: full.best,
      worst: full.worst,
      source: 'full',
      sourceLabel: 'Full league',
    };
  }

  // 2) Fallback: Top 25 + Lock + "Should be in"
  const fallbackSlugs = buildFallbackTeamSlugs(rankings, slugToId);
  const fallback = await computeAtsForTeamList(fallbackSlugs, slugToId, oddsHistoryGames);
  const hasFallback = (fallback.best?.length || 0) + (fallback.worst?.length || 0) > 0;

  if (hasFallback) {
    return {
      best: fallback.best,
      worst: fallback.worst,
      source: 'fallback',
      sourceLabel: 'Top 25 / Locks + Should Be In',
    };
  }

  return {
    best: [],
    worst: [],
    unavailableReason: 'odds history empty or no ATS data for any team',
  };
}
