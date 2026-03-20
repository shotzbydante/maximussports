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
 * Detect whether an event is a conference tournament game from ESPN metadata.
 *
 * Uses enriched fields from `fetchScheduleSource`: eventName, seasonType, notes.
 * ESPN conference tournament games typically have:
 *   - seasonType 3 (postseason) with a date before NCAA tournament
 *   - eventName containing "{Conference} Tournament" (e.g., "SEC Tournament - Semifinal")
 *   - notes containing the conference tournament name
 */
const CONF_TOURNEY_RE = /\b(tournament|tourney|conf\.\s*tourn)/i;
const CHAMPIONSHIP_RE = /\b(championship|final(?:s)?)\b/i;
const ROUND_PATTERNS = [
  { re: /\bchampionship\b/i, label: 'Championship' },
  { re: /\bfinals?\b/i, label: 'Final' },
  { re: /\bsemifinals?\b/i, label: 'Semifinals' },
  { re: /\bquarterfinals?\b/i, label: 'Quarterfinals' },
  { re: /\bsecond\s*round\b/i, label: 'Second Round' },
  { re: /\bfirst\s*round\b/i, label: 'First Round' },
];

function isConfTourneyEvent(ev, confName) {
  const name = (ev.eventName || '').toLowerCase();
  const notesStr = (ev.notes || []).join(' ').toLowerCase();
  const combined = `${name} ${notesStr}`;
  const conf = (confName || '').toLowerCase();

  if (conf && combined.includes(conf) && CONF_TOURNEY_RE.test(combined)) return true;
  if (CONF_TOURNEY_RE.test(name) && ev.seasonType === 3) return true;
  if (CONF_TOURNEY_RE.test(notesStr)) return true;
  return false;
}

function extractRoundLabel(ev) {
  const combined = `${ev.eventName || ''} ${(ev.notes || []).join(' ')}`;
  for (const { re, label } of ROUND_PATTERNS) {
    if (re.test(combined)) return label;
  }
  return null;
}

/**
 * Derive conference finish from schedule events.
 *
 * Priority:
 *   1. Conference tournament finish (from enriched ESPN event metadata)
 *   2. Regular-season conference placement (from conference record if detectable)
 *   3. Non-qualification signal (team had no conf tourney games despite season ending)
 *   4. null — no confident data
 *
 * @returns {{ label: string|null, source: string|null, confidence: string|null }}
 */
function deriveConferenceFinish(events, team) {
  if (!events?.length || !team) return { label: null, source: null, confidence: null };

  const confName = team.conference || '';

  // ── 1. Conference tournament finish ──────────────────────────────
  const confTourneyGames = events
    .filter((e) => e.isFinal && isConfTourneyEvent(e, confName))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (confTourneyGames.length > 0) {
    const lastGame = confTourneyGames[0];
    const won = Number(lastGame.ourScore) > Number(lastGame.oppScore);
    const roundLabel = extractRoundLabel(lastGame);
    const isChampionship = CHAMPIONSHIP_RE.test(lastGame.eventName || '') ||
                           CHAMPIONSHIP_RE.test((lastGame.notes || []).join(' '));

    if (isChampionship && won) {
      return { label: `Won ${confName} Tournament`, source: 'conference_tournament', confidence: 'high' };
    }
    if (isChampionship && !won) {
      return { label: `${confName} Tournament Runner-Up`, source: 'conference_tournament', confidence: 'high' };
    }
    if (roundLabel) {
      return { label: `Reached ${confName} ${roundLabel}`, source: 'conference_tournament', confidence: 'high' };
    }
    return { label: `${confName} Tournament`, source: 'conference_tournament', confidence: 'medium' };
  }

  // ── 2. Regular-season conference placement ───────────────────────
  // ESPN schedule events don't directly expose standings rank, but if the
  // season is over (has a significant number of finals) and we can compute
  // conference W-L from events where both teams are conference opponents,
  // we still can't derive placement without the full conference standings.
  // Leave as null — only claim what we can confidently prove.

  // ── 3. Non-qualification ─────────────────────────────────────────
  // If the season appears to have ended (late in the year with many finals)
  // and no conference tournament games were found, the team may not have
  // qualified. Only assert this with high confidence when:
  //   - We're past conference tournament season (mid-March+)
  //   - The team has a substantial number of completed games
  //   - No conf tourney events were detected
  const now = new Date();
  const isMarchPlus = now.getMonth() >= 2 && now.getDate() >= 10;
  const finishedGames = events.filter((e) => e.isFinal);
  const hasSubstantialSeason = finishedGames.length >= 20;
  const hasPostseasonEvents = events.some((e) => e.seasonType === 3 && e.isFinal);

  if (isMarchPlus && hasSubstantialSeason && !hasPostseasonEvents) {
    return { label: `Did not qualify for ${confName || 'conference'} tournament`, source: 'non_qualifier', confidence: 'medium' };
  }

  // ── 4. No confident data ─────────────────────────────────────────
  return { label: null, source: null, confidence: null };
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
  const confFinish = deriveConferenceFinish(events, team);

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
    conferenceFinish: confFinish.label,
    conferenceFinishSource: confFinish.source,
    conferenceFinishConfidence: confFinish.confidence,
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
