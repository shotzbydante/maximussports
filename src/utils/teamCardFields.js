/**
 * Shared normalized field model for pinned team cards and team page overview.
 *
 * Consolidates record, ATS, conference finish, and tournament status into
 * a single flat object so both surfaces render the same data without
 * duplicating transformation logic.
 */

import { getTeamSeed, getTeamRegion, isBracketOfficial, getTournamentPhase, getRoundLabel, getActiveRound } from './tournamentHelpers';
import { getTeamBySlug } from '../data/teams';

const NCAA_TOURNEY_START = '2026-03-17';

// ── NCAA tournament event detection ────────────────────────────────

function isLikelyNcaaTournamentEvent(ev) {
  if (!ev.date) return false;
  const dateStr = ev.date.slice(0, 10);
  if (dateStr < NCAA_TOURNEY_START) return false;

  if (ev.seasonType === 3 || ev.seasonType === '3') return true;

  const combined = `${ev.eventName || ''} ${(ev.notes || []).join(' ')}`.toLowerCase();
  if (/\bncaa\b|march madness|round of \d+|sweet 16|elite 8|final four/.test(combined)) return true;

  if (ev.seasonType == null) return true;
  return false;
}

// ── Conference tournament detection ────────────────────────────────

const CONF_TOURNEY_RE = /\b(tournament|tourney|championship)\b/i;
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
  if (isLikelyNcaaTournamentEvent(ev)) return false;

  if ((ev.seasonType === 3 || ev.seasonType === '3') && ev.date && ev.date.slice(0, 10) < NCAA_TOURNEY_START) {
    return true;
  }

  const name = (ev.eventName || '').toLowerCase();
  const notesStr = (ev.notes || []).join(' ').toLowerCase();
  const combined = `${name} ${notesStr}`;
  const conf = (confName || '').toLowerCase();

  if (conf && combined.includes(conf) && CONF_TOURNEY_RE.test(combined)) return true;
  if (CONF_TOURNEY_RE.test(name) && (ev.seasonType === 3 || ev.seasonType === '3')) return true;
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

// ── Season record ──────────────────────────────────────────────────

/**
 * Parse a "W-L" record string from ESPN's recordSummary field.
 * Returns { w, l } or null.
 */
function parseRecordSummary(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)-(\d+)/);
  if (!m) return null;
  return { w: Number(m[1]), l: Number(m[2]) };
}

/**
 * Compute season record from events before NCAA tournament.
 * Fallback when ESPN recordSummary is unavailable.
 */
function computeSeasonRecordFromEvents(events) {
  const past = (events || []).filter(
    (e) => e.isFinal && e.ourScore != null && e.oppScore != null &&
      e.date && e.date.slice(0, 10) < NCAA_TOURNEY_START
  );
  if (past.length === 0) return null;
  let w = 0, l = 0;
  past.forEach((e) => { if (Number(e.ourScore) > Number(e.oppScore)) w++; else l++; });
  return { w, l };
}

// ── ATS resolution ─────────────────────────────────────────────────

/**
 * Resolve ATS (Last 10 pre-NCAA games).
 * Batch API provides `preNcaaLast10` computed on the server from
 * full schedule + odds history. Falls back to last30 or season.
 */
function resolveAtsLast10(batchAts, cacheAts) {
  const pn = batchAts?.preNcaaLast10;
  if (pn && pn.total > 0) return { w: pn.w, l: pn.l, total: pn.total };

  const l30 = batchAts?.last30;
  if (l30 && l30.total > 0) return { w: l30.w, l: l30.l, total: l30.total };

  const season = batchAts?.season;
  if (season && season.total > 0) return { w: season.w, l: season.l, total: season.total };

  const c = cacheAts;
  if (c && c.total > 0) return { w: c.w ?? c.wins ?? 0, l: c.l ?? c.losses ?? 0, total: c.total };
  return null;
}

function resolveAtsFull(batchAts, cacheAts) {
  const b = batchAts?.total > 0 ? batchAts : null;
  const c = cacheAts?.total > 0 ? cacheAts : null;
  if (b && c) return b.total >= c.total ? b : c;
  return b || c || null;
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
  const hasSubstantialSeason = finishedGames.length >= 15;
  const hasNcaaGames = events.some((e) => e.isFinal && isLikelyNcaaTournamentEvent(e));

  if (isMarchPlus && hasSubstantialSeason && confTourneyGames.length === 0 && !hasNcaaGames) {
    return { label: `Did not qualify for ${confName || 'conf.'} tournament`, source: 'non_qualifier', confidence: 'medium' };
  }

  return { label: null, source: null, confidence: null };
}

// ── Tournament status ──────────────────────────────────────────────

function deriveTournamentStatus(slug, events) {
  const seed = getTeamSeed(slug);
  const isInField = seed != null;
  const bracketOfficial = isBracketOfficial();

  if (!bracketOfficial) {
    if (isInField) return { label: `Projected ${seed}-seed`, status: 'projected', roundLabel: null, lastGame: null, nextNcaaGame: null };
    return { label: null, status: 'pre_selection', roundLabel: null, lastGame: null, nextNcaaGame: null };
  }

  if (!isInField) {
    return { label: 'Did not make tournament', status: 'not_in_field', roundLabel: null, lastGame: null, nextNcaaGame: null };
  }

  const allNcaa = (events || []).filter((e) => isLikelyNcaaTournamentEvent(e));

  const completedNcaa = allNcaa
    .filter((e) => e.isFinal && e.ourScore != null && e.oppScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const scheduledNcaa = allNcaa
    .filter((e) => !e.isFinal)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lostGame = completedNcaa.find(
    (e) => Number(e.ourScore) < Number(e.oppScore)
  );

  if (lostGame) {
    const gamesBeforeLoss = completedNcaa.filter(
      (e) => new Date(e.date) <= new Date(lostGame.date)
    ).length;
    const roundName = getRoundLabel(gamesBeforeLoss);
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
      nextNcaaGame: null,
    };
  }

  const wins = completedNcaa.length;
  const nextRoundNum = wins + 1;
  const nextRoundLabel = getRoundLabel(nextRoundNum);

  const nextSched = scheduledNcaa[0] || null;
  const nextNcaaGame = nextSched ? {
    opponent: nextSched.opponent || 'TBD',
    date: nextSched.date,
    status: nextSched.status || 'Scheduled',
    homeAway: nextSched.homeAway,
    broadcast: nextSched.broadcast || null,
    gamecastUrl: nextSched.gamecastUrl || null,
    opponentLogo: nextSched.opponentLogo || null,
    opponentId: nextSched.opponentId || null,
  } : null;

  const lastWin = completedNcaa[0] || null;

  return {
    label: `Next: ${nextRoundLabel}`,
    status: 'active',
    roundLabel: nextRoundLabel,
    lastGame: lastWin ? {
      opponent: lastWin.opponent,
      ourScore: lastWin.ourScore,
      oppScore: lastWin.oppScore,
      date: lastWin.date,
      won: true,
    } : null,
    nextNcaaGame,
  };
}

// ── Main normalizer ────────────────────────────────────────────────

export function normalizeTeamCardFields(slug, batchSlot, cacheAts = null) {
  const team = getTeamBySlug(slug);
  const events = batchSlot?.schedule?.events || [];

  const espnRecord = parseRecordSummary(batchSlot?.schedule?.teamRecord);
  const computedRecord = computeSeasonRecordFromEvents(events);
  const seasonRecord = espnRecord || computedRecord;

  const confFinish = deriveConferenceFinish(events, team);

  const batchAts = batchSlot?.ats || {};
  const seasonAts = batchAts.season || null;
  const fullAts = resolveAtsFull(seasonAts, cacheAts);
  const atsRecord = fullAts
    ? { w: fullAts.w ?? fullAts.wins ?? 0, l: fullAts.l ?? fullAts.losses ?? 0, p: fullAts.p ?? fullAts.pushes ?? 0, total: fullAts.total ?? 0, coverPct: fullAts.coverPct ?? null }
    : null;

  const atsLast10 = resolveAtsLast10(batchAts, cacheAts);

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
    nextNcaaGame: tournament.nextNcaaGame,
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
