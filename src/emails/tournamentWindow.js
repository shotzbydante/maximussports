/**
 * Tournament window utilities for email templates.
 *
 * Detects the current phase of the NCAA tournament calendar and provides
 * conditional flags for showing/hiding time-sensitive content blocks.
 *
 * Phases:
 *   pre_tournament  — Selection Sunday through First Four tipoff
 *   first_round     — First Four + Round of 64 + Round of 32
 *   sweet_sixteen   — Sweet 16 + Elite Eight
 *   final_four      — Final Four + Championship
 *   off             — Outside tournament window
 */

const SELECTION_SUNDAY    = '2026-03-15';
const FIRST_FOUR_START    = '2026-03-17';
const FIRST_ROUND_START   = '2026-03-19';
const SECOND_ROUND_END    = '2026-03-22';
const SWEET_16_START      = '2026-03-26';
const ELITE_EIGHT_END     = '2026-03-29';
const FINAL_FOUR          = '2026-04-04';
const CHAMPIONSHIP        = '2026-04-06';
const TOURNAMENT_END      = '2026-04-07';

function toDateNum(str) {
  return Number(str.replace(/-/g, ''));
}

/**
 * Get the current tournament phase.
 * @param {Date} [now] — override for testing
 * @returns {'pre_tournament'|'first_round'|'sweet_sixteen'|'final_four'|'off'}
 */
export function getTournamentPhase(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  const n = toDateNum(d);

  if (n >= toDateNum(SELECTION_SUNDAY) && n < toDateNum(FIRST_FOUR_START)) return 'pre_tournament';
  if (n >= toDateNum(FIRST_FOUR_START) && n < toDateNum(FIRST_ROUND_START)) return 'first_round';
  if (n >= toDateNum(FIRST_ROUND_START) && n <= toDateNum(SECOND_ROUND_END)) return 'first_round';
  if (n >= toDateNum(SWEET_16_START) && n <= toDateNum(ELITE_EIGHT_END)) return 'sweet_sixteen';
  if (n >= toDateNum(FINAL_FOUR) && n <= toDateNum(TOURNAMENT_END)) return 'final_four';
  return 'off';
}

/**
 * Whether the current date falls within the active tournament window
 * (Selection Sunday through the Championship game).
 */
export function isTournamentWeek(now = new Date()) {
  return getTournamentPhase(now) !== 'off';
}

/**
 * Whether we're in the pre-tournament hype window
 * (Selection Sunday through start of First Round games).
 */
export function isPreTournament(now = new Date()) {
  return getTournamentPhase(now) === 'pre_tournament';
}

/**
 * Whether tournament games have started (First Four or later).
 */
export function isTournamentActive(now = new Date()) {
  const phase = getTournamentPhase(now);
  return phase === 'first_round' || phase === 'sweet_sixteen' || phase === 'final_four';
}
