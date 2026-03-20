/**
 * Shared normalized field model for pinned team cards and team page overview.
 *
 * Consolidates record, ATS, conference finish, and tournament status into
 * a single flat object so both surfaces render the same data without
 * duplicating transformation logic.
 */

import { getTeamSeed, getTeamRegion, isBracketOfficial, getTournamentPhase, getRoundLabel, getActiveRound, getTournamentTeam } from './tournamentHelpers';
import { getTeamBySlug } from '../data/teams';

/**
 * Compute season W–L from schedule events.
 * @returns {{ w: number, l: number } | null}
 */
function computeSeasonRecord(events) {
  const past = (events || []).filter((e) => e.isFinal && e.ourScore != null && e.oppScore != null);
  if (past.length === 0) return null;
  let w = 0, l = 0;
  past.forEach((e) => { if (Number(e.ourScore) > Number(e.oppScore)) w++; else l++; });
  return { w, l };
}

/**
 * Derive conference finish context from schedule events.
 * Looks for conference tournament games (typically late-season neutral-site
 * events with conference opponents). Returns a short label like
 * "Conf. Tourney Champ" or "Conf. Semis" when detectable, otherwise
 * falls back to the team's conference standing if available.
 */
function deriveConferenceFinish(events, team) {
  if (!events?.length || !team) return null;

  const confGames = events
    .filter((e) => e.isFinal && e.isConferenceTournament)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (confGames.length > 0) {
    const lastConfGame = confGames[0];
    const won = Number(lastConfGame.ourScore) > Number(lastConfGame.oppScore);
    if (lastConfGame.isChampionship && won) return 'Conf. Tourney Champ';
    if (lastConfGame.isChampionship && !won) return 'Conf. Tourney Runner-Up';
    const roundNames = ['Final', 'Semifinal', 'Quarterfinal'];
    for (const rn of roundNames) {
      if (lastConfGame.round?.includes(rn) || lastConfGame.shortName?.includes(rn)) {
        return `Conf. ${rn}`;
      }
    }
  }

  return team.conference || null;
}

/**
 * Build a human-readable tournament round / status label.
 *
 * Active tournament teams → "Next: Round of 32", "Next: Sweet 16"
 * Eliminated teams        → "Eliminated: Round of 64"
 * Non-tournament teams    → "Did not make tournament"
 *
 * When we can't determine elimination round from schedule data,
 * we fall back to the current tournament phase context.
 */
function deriveTournamentStatus(slug, events) {
  const seed = getTeamSeed(slug);
  const isInField = seed != null;
  const phase = getTournamentPhase();
  const bracketOfficial = isBracketOfficial();

  if (!bracketOfficial) {
    if (isInField) return { label: `Projected ${seed}-seed`, status: 'projected', roundLabel: null };
    return { label: null, status: 'pre_selection', roundLabel: null };
  }

  if (!isInField) {
    return { label: 'Did not make tournament', status: 'not_in_field', roundLabel: null };
  }

  const tourneyGames = (events || [])
    .filter((e) => e.isFinal && e.isTournament)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const lostTourneyGame = tourneyGames.find(
    (e) => e.ourScore != null && e.oppScore != null && Number(e.ourScore) < Number(e.oppScore)
  );

  if (lostTourneyGame) {
    const roundNum = lostTourneyGame.tournamentRound || null;
    const roundName = roundNum ? getRoundLabel(roundNum) : 'Tournament';
    return { label: `Eliminated: ${roundName}`, status: 'eliminated', roundLabel: roundName };
  }

  const activeRound = getActiveRound(phase);
  const nextRoundLabel = getRoundLabel(activeRound);
  return { label: `Next: ${nextRoundLabel}`, status: 'active', roundLabel: nextRoundLabel };
}

/**
 * Format ATS record from batch or cache data.
 * Prefers batch data when richer; falls back to cache.
 */
function resolveAts(batchAts, cacheAts) {
  const b = batchAts?.total > 0 ? batchAts : null;
  const c = cacheAts?.total > 0 ? cacheAts : null;
  if (b && c) return b.total >= c.total ? b : c;
  return b || c || null;
}

/**
 * Build a normalized team card model.
 *
 * @param {string} slug
 * @param {object} batchSlot  — from pinnedTeamDataBySlug[slug] or team page batch
 * @param {object} [cacheAts] — from getAtsCache(slug)?.season
 * @returns {object} normalized fields
 */
export function normalizeTeamCardFields(slug, batchSlot, cacheAts = null) {
  const team = getTeamBySlug(slug);
  const events = batchSlot?.schedule?.events || [];

  const seasonRecord = computeSeasonRecord(events);
  const conferenceFinish = deriveConferenceFinish(events, team);

  const batchAts = batchSlot?.ats?.season || null;
  const ats = resolveAts(batchAts, cacheAts);
  const atsRecord = ats
    ? { w: ats.w ?? ats.wins ?? 0, l: ats.l ?? ats.losses ?? 0, p: ats.p ?? ats.pushes ?? 0, total: ats.total ?? 0, coverPct: ats.coverPct ?? null }
    : null;

  const tournament = deriveTournamentStatus(slug, events);

  const seed = getTeamSeed(slug);
  const region = getTeamRegion(slug);

  return {
    seasonRecord,
    conferenceFinish,
    atsRecord,
    tournamentStatus: tournament.status,
    tournamentLabel: tournament.label,
    tournamentRoundLabel: tournament.roundLabel,
    seed,
    region,
  };
}

/**
 * Format a record pair as "W–L" or fallback.
 */
export function fmtRecord(rec, fallback = '—') {
  if (!rec || rec.w == null || rec.l == null) return fallback;
  return `${rec.w}–${rec.l}`;
}

/**
 * Format ATS record as "W–L–P" or "W–L" (omitting pushes if zero).
 */
export function fmtAts(ats, fallback = '—') {
  if (!ats || ats.total === 0) return fallback;
  const base = `${ats.w}–${ats.l}`;
  return ats.p > 0 ? `${base}–${ats.p}` : base;
}
