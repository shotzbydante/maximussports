/**
 * Date chunking for Odds API history (max 31 days per request).
 */

/** NCAA basketball season start */
export const SEASON_START = '2025-11-01';

/**
 * Split date range into chunks of maxDays (default 31).
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @param {number} maxDays - max days per chunk (default 31)
 * @returns {Array<{ from: string, to: string }>}
 */
export function chunkDateRange(from, to, maxDays = 31) {
  const chunks = [];
  let start = new Date(from);
  const end = new Date(to);

  while (start <= end) {
    const chunkStart = new Date(start);
    const chunkEnd = new Date(start);
    chunkEnd.setDate(chunkEnd.getDate() + (maxDays - 1));
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      from: chunkStart.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });

    start = new Date(chunkEnd);
    start.setDate(start.getDate() + 1);
  }

  return chunks;
}
