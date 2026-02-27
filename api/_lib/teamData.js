/**
 * Shared data builder for team chat summary — no self-HTTP calls.
 * Mirrors the logic of /api/team/[slug].js and /api/odds/teamNextLine/[slug].js.
 */

import { fetchRankingsSource, fetchTeamIdsSource, fetchTeamNewsSource, fetchScheduleSource, fetchOddsHistorySource } from '../_sources.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { buildSlugToRankMap } from '../../src/utils/rankingsNormalize.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function isFinal(status) {
  const s = (status || '').toLowerCase();
  return s === 'final' || s.includes('final');
}

/**
 * Build ATS record from schedule events + oddsHistory.
 * Returns { last7, last30, season } each with { w, l, p, total, coverPct }.
 */
function computeAts(events, oddsGames, teamName) {
  if (!Array.isArray(events) || !Array.isArray(oddsGames)) return { last7: null, last30: null, season: null };
  const now = Date.now();
  const MS7 = 7 * 86400000;
  const MS30 = 30 * 86400000;

  // Build spread lookup by opponent + date
  const spreadMap = {};
  for (const g of oddsGames) {
    const key = [g.homeTeam, g.awayTeam, (g.gameDate || '').slice(0, 10)].join('|');
    if (g.spread != null) spreadMap[key] = g.spread;
  }

  const buckets = { last7: { w: 0, l: 0, p: 0 }, last30: { w: 0, l: 0, p: 0 }, season: { w: 0, l: 0, p: 0 } };

  for (const ev of events) {
    if (!isFinal(ev.gameStatus ?? ev.status ?? '')) continue;
    const hs = parseInt(ev.homeScore ?? ev.homeTeamScore, 10);
    const as = parseInt(ev.awayScore ?? ev.awayTeamScore, 10);
    if (isNaN(hs) || isNaN(as)) continue;

    const teamIsHome = (ev.homeTeam || '').toLowerCase().includes((teamName || '').toLowerCase().split(' ')[0]);
    const teamScore = teamIsHome ? hs : as;
    const oppScore = teamIsHome ? as : hs;

    const dateStr = (ev.gameDate || ev.date || '').slice(0, 10);
    const eventMs = new Date(dateStr + 'T12:00:00Z').getTime();
    const ageMs = now - eventMs;

    const spreadKey = [ev.homeTeam, ev.awayTeam, dateStr].join('|');
    const spread = spreadMap[spreadKey] ?? null;

    // Determine ATS result: positive spread = team is underdog
    let atsResult = null;
    if (spread != null) {
      const margin = teamScore - oppScore;
      const withSpread = margin + (teamIsHome ? -spread : spread); // adjust for which side
      if (withSpread > 0) atsResult = 'w';
      else if (withSpread < 0) atsResult = 'l';
      else atsResult = 'p';
    }
    if (!atsResult) continue;

    // Assign to buckets
    if (ageMs < MS7) buckets.last7[atsResult]++;
    if (ageMs < MS30) buckets.last30[atsResult]++;
    buckets.season[atsResult]++;
  }

  function toRec(b) {
    const total = b.w + b.l + b.p;
    if (total === 0) return null;
    const decided = b.w + b.l;
    const coverPct = decided > 0 ? Math.round((b.w / decided) * 100) : null;
    return { w: b.w, l: b.l, p: b.p, total, coverPct };
  }

  return {
    last7: toRec(buckets.last7),
    last30: toRec(buckets.last30),
    season: toRec(buckets.season),
  };
}

/**
 * Build schedule summary: recent (last 5 finals) + upcoming (next 3).
 */
function buildScheduleSummary(events) {
  if (!Array.isArray(events)) return { recent: [], upcoming: [] };
  const recent = events.filter((e) => isFinal(e.gameStatus ?? e.status ?? '')).slice(-5).reverse();
  const upcoming = events.filter((e) => !isFinal(e.gameStatus ?? e.status ?? '')).slice(0, 3);
  return { recent, upcoming };
}

/**
 * Gather all data needed for the team chat summary.
 * Never throws — each section falls back to empty safely.
 */
export async function buildTeamSummaryData(slug) {
  const team = getTeamBySlug(slug);
  const today = toDateStr(new Date());

  const [teamIdsRes, rankingsRes, newsRes] = await Promise.allSettled([
    fetchTeamIdsSource(),
    fetchRankingsSource(),
    fetchTeamNewsSource(slug),
  ]);

  const slugToId = (teamIdsRes.status === 'fulfilled' ? teamIdsRes.value?.slugToId : null) ?? {};
  const teamId = slugToId[slug] ?? null;
  const rankingsRaw = rankingsRes.status === 'fulfilled' ? (rankingsRes.value?.rankings ?? []) : [];
  const teamNews = newsRes.status === 'fulfilled' ? (newsRes.value?.headlines ?? []) : [];

  let scheduleEvents = [];
  let oddsGames = [];

  if (teamId) {
    const [schedRes, histRes] = await Promise.allSettled([
      fetchScheduleSource(teamId),
      fetchOddsHistorySource(SEASON_START, today),
    ]);
    scheduleEvents = schedRes.status === 'fulfilled' ? (schedRes.value?.events ?? []) : [];
    oddsGames = histRes.status === 'fulfilled' ? (histRes.value?.games ?? []) : [];
  }

  const rankMap = buildSlugToRankMap({ rankings: rankingsRaw }, TEAMS);
  const rank = rankMap[slug] ?? null;
  const schedule = buildScheduleSummary(scheduleEvents);
  const ats = computeAts(scheduleEvents, oddsGames, team?.name ?? slug);

  return {
    team: team
      ? { name: team.name, conference: team.conference, oddsTier: team.oddsTier, slug: team.slug }
      : null,
    schedule,
    ats,
    teamNews,
    rank,
    teamId,
    tier: team?.oddsTier ?? null,
  };
}
