/**
 * Email date context — single canonical source for all date resolution
 * across email templates, data assemblers, and tests.
 *
 * Product timezone: America/Los_Angeles. Sports calendars in this product
 * roll over at midnight PT, NOT midnight UTC. Using `new Date().toISOString()`
 * for sports dates causes off-by-one errors when emails generate after
 * midnight UTC but before midnight PT (e.g. 11:45 PM PT on May 2 = 06:45
 * UTC May 3 → naive UTC slice yields "May 3" but the product day is still
 * May 2).
 *
 * Both production (run-daily) and test (send-test) MUST call this function
 * to guarantee identical date handling. Tests can override `now` for
 * deterministic results.
 */

const PRODUCT_TZ = 'America/Los_Angeles';

/**
 * Convert a Date to a YYYY-MM-DD string in the product timezone.
 * Uses Intl.DateTimeFormat which is the only safe way to extract
 * calendar fields in a specific timezone.
 */
function ymdInTz(date, tz = PRODUCT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA produces YYYY-MM-DD format directly
  return fmt.format(date);
}

/**
 * Build a Date representing the start (00:00) of a YYYY-MM-DD string
 * in the product timezone. Used for "previous day" arithmetic.
 */
function ymdToDate(ymd) {
  // Parse as a local date, but we only need the day arithmetic — return UTC noon
  // to avoid DST edge cases when subtracting days.
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function ymdMinusDays(ymd, days) {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() - days);
  return ymdInTz(d);
}

/**
 * Resolve the canonical date context for an email send.
 *
 * @param {object} [opts]
 * @param {Date} [opts.now] — override current time for tests
 * @param {string} [opts.tz] — override timezone (default America/Los_Angeles)
 * @returns {{
 *   timezone: string,
 *   sendDate: string,        // YYYY-MM-DD in product TZ at send time
 *   briefingDate: string,    // currently same as sendDate
 *   yesterdayDate: string,   // sendDate - 1 day in product TZ
 *   sportsDataDate: string,  // ESPN-format YYYYMMDD for yesterday's results
 *   briefingDateLabel: string, // "Sunday, May 3" formatted in product TZ
 *   nowIso: string,
 * }}
 */
export function resolveEmailDateContext(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const tz = opts.tz || PRODUCT_TZ;

  const sendDate = ymdInTz(now, tz);
  const briefingDate = sendDate;
  const yesterdayDate = ymdMinusDays(sendDate, 1);
  const sportsDataDate = yesterdayDate.replace(/-/g, '');

  // Human-readable label in product TZ
  const briefingDateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  return {
    timezone: tz,
    sendDate,
    briefingDate,
    yesterdayDate,
    sportsDataDate,
    briefingDateLabel,
    nowIso: now.toISOString(),
  };
}

/**
 * Build an ESPN scoreboard date string (YYYYMMDD) for a target date.
 */
export function espnDateString(ymd) {
  return (ymd || '').replace(/-/g, '');
}
