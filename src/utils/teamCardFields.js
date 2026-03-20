/**
 * Shared normalized field model for pinned team cards and team page overview.
 *
 * Consolidates record, ATS, conference finish, and tournament status into
 * a single flat object so both surfaces render the same data without
 * duplicating transformation logic.
 */

import { getTeamSeed, getTeamRegion, isBracketOfficial, getTournamentPhase, getRoundLabel, getActiveRound } from './tournamentHelpers';
import { getTeamBySlug } from '../data/teams';

// NCAA tournament window (2026): games on or after March 17 with seasonType 3
const NCAA_TOURNEY_START = '2026-03-17';

function isNcaaTournamentEvent(ev) {
  if (ev.seasonType !== 3) return false;
  if (!ev.date) return false;
  return ev.date.slice(0, 10) >= NCAA_TOURNEY_START;
}

// ── Conference tournament detection ────────────────────────────────

const CONF_TOURNEY_RE = /\b(tournament|tourney)\b/i;
const CHAMPIONSHIP_RE = /\bchampionship\b/i;
const FINAL_RE = /\bfinals?\b/i;
const ROUND_PATTERNS = [
  { re: /\bchampionship\b/i, label: 'Championship' },
  { re: /\bsemifinals?\b/i, label: 'Semifinals' },
  { re: /\bquarterfinals?\b/i, label: 'Quarterfinals' },
  { re: /\bsecond\s*round\b/i, label: 'Second Round' },
  { re: /\bfirst\s*round\b/i, label: 'First Round' },
];

function isConfTourneyEvent(ev, confName) {
  if (isNcaaTournamentEvent(ev)) return false;
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
  if (FINAL_RE.test(combined)) return 'Final';
  return null;
}

// ── Season record (excludes NCAA tournament) ───────────────────────

function computeSeasonRecord(events) {
  const past = (events || []).filter(
    (e) => e.isFinal && e.ourScore != null && e.oppScore != null && !isNcaaTournamentEvent(e)
  );
  if (past.length === 0) return null;
  let w = 0, l = 0;
  past.forEach((e) => { if (Number(e.ourScore) > Number(e.oppScore)) w++; else l++; });
  return { w, l };
}

// ── ATS trend (last 10 non-tournament games) ───────────────────────

function computeAtsLast10(events, batchAts) {
  const past = (events || [])
    .filter((e) => e.isFinal && e.ourScore != null && e.oppScore != null && !isNcaaTournamentEvent(e))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  if (past.length === 0) return null;

  const last30 = batchAts?.last30;
  const season = batchAts?.season;
  if (last30?.total > 0) return { w: last30.w ?? last30.wins ?? 0, l: last30.l ?? last30.losses ?? 0, total: last30.total };
  if (season?.total > 0) {
    const t = Math.min(season.total, 10);
    return { w: Math.min(season.w ?? season.wins ?? 0, t), l: Math.min(season.l ?? season.losses ?? 0, t), total: t };
  }
  return null;
}

// ── Conference finish ──────────────────────────────────────────────

function deriveConferenceFinish(events, team) {
  if (!events?.length || !team) return { label: null, source: null, confidence: null };
  const confName = team.conference || '';

  const confTourneyGames = events
    .filter((e) => e.isFinal && isConfTourneyEvent(e, confName))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (confTourneyGames.length > 0) {
    const lastGame = confTourneyGames[0];
    const won = Number(lastGame.ourScore) > Number(lastGame.oppScore);
    const roundLabel = extractRoundLabel(lastGame);
    const combined = `${lastGame.eventName || ''} ${(lastGame.notes || []).join(' ')}`;
    const isChampGame = CHAMPIONSHIP_RE.test(combined) || FINAL_RE.test(combined);

    if (isChampGame && won) {
      return { label: `Won ${confName} Tournament`, source: 'conference_tournament', confidence: 'high' };
    }
    if (isChampGame && !won) {
      return { label: `${confName} Tournament Runner-Up`, source: 'conference_tournament', confidence: 'high' };
    }
    if (roundLabel) {
      const verb = won ? 'Won' : 'Lost in';
      return { label: `${verb} ${confName} ${roundLabel}`, source: 'conference_tournament', confidence: 'high' };
    }
    return { label: `${confName} Tournament`, source: 'conference_tournament', confidence: 'medium' };
  }

  const now = new Date();
  const isMarchPlus = now.getMonth() >= 2 && now.getDate() >= 10;
  const finishedGames = events.filter((e) => e.isFinal);
  const hasSubstantialSeason = finishedGames.length >= 20;
  const hasNcaaGames = events.some((e) => isNcaaTournamentEvent(e) && e.isFinal);
  const hasConfTourneyGames = confTourneyGames.length > 0;

  if (isMarchPlus && hasSubstantialSeason && !hasConfTourneyGames && !hasNcaaGames) {
    return { label: `Did not qualify for ${confName || 'conf.'} tournament`, source: 'non_qualifier', confidence: 'medium' };
  }

  return { label: null, source: null, confidence: null };
}

// ── Tournament status ──────────────────────────────────────────────

function deriveTournamentStatus(slug, events) {
  const seed = getTeamSeed(slug);
  const isInField = seed != null;
  const phase = getTournamentPhase();
  const bracketOfficial = isBracketOfficial();

  if (!bracketOfficial) {
    if (isInField) return { label: `Projected ${seed}-seed`, status: 'projected', roundLabel: null, lastGame: null };
    return { label: null, status: 'pre_selection', roundLabel: null, lastGame: null };
  }

  if (!isInField) {
    return { label: 'Did not make tournament', status: 'not_in_field', roundLabel: null, lastGame: null };
  }

  const tourneyGames = (events || [])
    .filter((e) => e.isFinal && isNcaaTournamentEvent(e))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const lostGame = tourneyGames.find(
    (e) => e.ourScore != null && e.oppScore != null && Number(e.ourScore) < Number(e.oppScore)
  );

  if (lostGame) {
    const activeRound = getActiveRound(phase);
    const roundFromPhase = activeRound > 1 ? activeRound - 1 : 1;
    const gamesPlayed = tourneyGames.length;
    const inferredRound = gamesPlayed >= 1 ? gamesPlayed : roundFromPhase;
    const roundName = getRoundLabel(inferredRound);
    return {
      label: `Lost in ${roundName}`,
      status: 'eliminated',
      roundLabel: roundName,
      lastGame: {
        opponent: lostGame.opponent,
        ourScore: lostGame.ourScore,
        oppScore: lostGame.oppScore,
        date: lostGame.date,
        won: false,
      },
    };
  }

  if (tourneyGames.length > 0) {
    const lastWin = tourneyGames[0];
    const activeRound = getActiveRound(phase);
    const nextRoundLabel = getRoundLabel(activeRound);
    return {
      label: `Next: ${nextRoundLabel}`,
      status: 'active',
      roundLabel: nextRoundLabel,
      lastGame: {
        opponent: lastWin.opponent,
        ourScore: lastWin.ourScore,
        oppScore: lastWin.oppScore,
        date: lastWin.date,
        won: true,
      },
    };
  }

  const activeRound = getActiveRound(phase);
  const nextRoundLabel = getRoundLabel(activeRound);
  return { label: `Next: ${nextRoundLabel}`, status: 'active', roundLabel: nextRoundLabel, lastGame: null };
}

// ── ATS resolution ─────────────────────────────────────────────────

function resolveAts(batchAts, cacheAts) {
  const b = batchAts?.total > 0 ? batchAts : null;
  const c = cacheAts?.total > 0 ? cacheAts : null;
  if (b && c) return b.total >= c.total ? b : c;
  return b || c || null;
}

// ── Main normalizer ────────────────────────────────────────────────

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

  const atsLast10 = computeAtsLast10(events, batchSlot?.ats);

  const tournament = deriveTournamentStatus(slug, events);

  const seed = getTeamSeed(slug);
  const region = getTeamRegion(slug);

  return {
    seasonRecord,
    conferenceFinish: confFinish.label,
    conferenceFinishSource: confFinish.source,
    conferenceFinishConfidence: confFinish.confidence,
    atsRecord,
    atsLast10,
    tournamentStatus: tournament.status,
    tournamentLabel: tournament.label,
    tournamentRoundLabel: tournament.roundLabel,
    tournamentLastGame: tournament.lastGame,
    seed,
    region,
  };
}

export function fmtRecord(rec, fallback = '—') {
  if (!rec || rec.w == null || rec.l == null) return fallback;
  return `${rec.w}–${rec.l}`;
}

export function fmtAts(ats, fallback = '—') {
  if (!ats || ats.total === 0) return fallback;
  const base = `${ats.w}–${ats.l}`;
  return ats.p > 0 ? `${base}–${ats.p}` : base;
}

export function fmtAtsLast10(ats, fallback = '—') {
  if (!ats || ats.total === 0) return fallback;
  return `${ats.w}–${ats.l}`;
}
