/**
 * Shared ET-aware date helpers for scorecard / settlement / performance
 * pipelines. All picks tables are keyed by ET calendar date — every caller
 * must resolve "yesterday" / "today" consistently or rows disappear.
 *
 *   todayET()                  → 'YYYY-MM-DD' (ET calendar date right now)
 *   yesterdayET()              → 'YYYY-MM-DD' (ET yesterday)
 *   daysAgoFromYesterdayET(n)  → 'YYYY-MM-DD' (ET-yesterday minus n days)
 *   etDateCompact(ymd)         → 'YYYYMMDD' compacted form for ESPN endpoints
 *
 * Why this file exists:
 *   Subtracting 1 day with `date.setDate(date.getDate() - 1)` then calling
 *   `.toISOString().slice(0,10)` returns the UTC calendar date, not the ET
 *   date. For any ET time between 20:00 the previous day and 00:00 today,
 *   UTC is one calendar day ahead of ET — a 4-to-5-hour daily window where
 *   the UTC-yesterday differs from the ET-yesterday. During that window,
 *   every scorecard/performance lookup that uses UTC misses the row.
 */

const ET_TZ = 'America/New_York';
const ET_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatET(d) {
  // en-CA produces YYYY-MM-DD
  try { return ET_FMT.format(d); }
  catch { return new Date(d).toISOString().slice(0, 10); }
}

export function todayET(now = new Date()) {
  return formatET(now);
}

export function yesterdayET(now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatET(d);
}

/** Shift the ET-yesterday anchor back by `n` additional days. */
export function daysAgoFromYesterdayET(n, now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1 - n);
  return formatET(d);
}

/** Turn 'YYYY-MM-DD' into 'YYYYMMDD' for ESPN scoreboard endpoints. */
export function etDateCompact(ymd) {
  return (ymd || '').replace(/-/g, '');
}
