/**
 * Date helpers for Daily Schedule (now → Selection Sunday).
 */

/** Selection Sunday 2026 */
const SELECTION_SUNDAY = new Date('2026-03-15');

/** Format YYYY-MM-DD */
export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get dates from today through Selection Sunday, max N days */
export function getScheduleDates(maxDays = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(SELECTION_SUNDAY);
  end.setHours(0, 0, 0, 0);
  if (today > end) return [];

  const dates = [];
  const cur = new Date(today);
  while (cur <= end && dates.length < maxDays) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Format date for display: "Sat, Mar 15" */
export function formatDateLabel(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
