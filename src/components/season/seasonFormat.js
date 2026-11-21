/**
 * Formatting helpers shared by the season recap surfaces.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format a calendar date string ("2026-10-28") as "October 28, 2026".
 * Parsed by hand so the viewer's time zone can never shift the day.
 */
export function formatSeasonDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return '';
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** Inline style that tints a season surface with the sport's accent color. */
export function accentStyle(workspace) {
  const accent = workspace?.theme?.accent;
  return accent ? { '--season-accent': accent } : undefined;
}

/** "Brewers" from "Milwaukee Brewers" — the form used in short status lines. */
export function shortTeamName(name) {
  if (!name) return '';
  const KEEP_TWO = ['Red Sox', 'White Sox', 'Blue Jays'];
  const twoWord = KEEP_TWO.find((n) => name.endsWith(n));
  return twoWord || name.split(' ').pop();
}
