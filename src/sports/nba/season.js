/**
 * Where the NBA calendar is. One place for the dates, read by the briefing
 * endpoint and by any copy that would otherwise talk about the playoffs in
 * November.
 *
 * The regular-season end dates are the day the play-in begins; set the
 * 2027 one from the league calendar when it is published.
 */

const PHASES = [
  // [first day, phase]
  ['2025-10-21', 'regular_season'],
  ['2026-04-14', 'playoffs'],
  ['2026-06-25', 'offseason'],
  ['2026-10-20', 'regular_season'],
  ['2027-04-13', 'playoffs'],
  ['2027-06-25', 'offseason'],
];

/** @returns {'regular_season'|'playoffs'|'offseason'} */
export function nbaSeasonPhase(now = new Date()) {
  const day = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  let phase = 'offseason';
  for (const [from, name] of PHASES) if (day >= from) phase = name;
  return phase;
}

export const isNbaPlayoffs = (now) => nbaSeasonPhase(now) === 'playoffs';
