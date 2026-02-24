/**
 * Compute ATS leaders (best/worst) from rankings + odds-history + schedules.
 * Used by /api/home/slow and by /api/home/fast warmer.
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
 * Fetches rankings, odds history, team IDs, then computes ATS per team and returns best/worst.
 * @returns {Promise<{ best: array, worst: array }>}
 */
export async function computeAtsLeadersFromSources() {
  const today = toDateStr(new Date());
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);

  const [oddsHistoryData, teamIdsData, rankingsData] = await Promise.all([
    fetchOddsHistorySource(SEASON_START, today),
    fetchTeamIdsSource(),
    fetchRankingsSource(),
  ]);

  const oddsHistoryGames = oddsHistoryData?.games || [];
  const slugToId = teamIdsData?.slugToId || {};
  const rankings = rankingsData?.rankings || [];
  if (rankings.length === 0 || oddsHistoryGames.length === 0) {
    return { best: [], worst: [] };
  }

  const slugToIdMerged = { ...slugToId, ...buildSlugToIdFromRankings({ rankings }) };
  const teamSlugs = [];
  for (const r of rankings.slice(0, 18)) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
    if (slug && slugToIdMerged[slug]) {
      const team = getTeamBySlug(slug);
      teamSlugs.push({ slug, name: team?.name ?? r.teamName });
    }
  }

  const results = await Promise.all(
    teamSlugs.map(async ({ slug, name }) => {
      const teamId = slugToIdMerged[slug];
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
