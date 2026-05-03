/**
 * Daily refresh — date resolution invariants for the NBA scorecard.
 *
 * The /api/nba/picks/scorecard endpoint defaults to `yesterdayET()` and
 * walks back through history when yesterday isn't graded. These tests
 * pin the resolver helpers so a future change can't accidentally
 * hard-code a date or introduce a UTC drift.
 *
 * No date is hard-coded in these assertions — every test patches the
 * system clock to a known UTC instant and asserts the ET-day output.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { todayET, yesterdayET, etDateCompact, etDayFromISO } from './dateWindows.js';

describe('dateWindows — daily-refresh anchor helpers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('todayET rolls forward as the system clock advances', () => {
    vi.setSystemTime(new Date('2026-05-04T13:00:00Z'));    // 9 AM ET
    expect(todayET()).toBe('2026-05-04');
    vi.setSystemTime(new Date('2026-05-05T13:00:00Z'));
    expect(todayET()).toBe('2026-05-05');
  });

  it('yesterdayET returns ET-yesterday even during the late-night UTC window', () => {
    // 02:30 UTC on May 5 = 22:30 ET on May 4 — UTC says today=May 5,
    // ET says today=May 4 → yesterday=May 3. The helper must use ET.
    vi.setSystemTime(new Date('2026-05-05T02:30:00Z'));
    expect(yesterdayET()).toBe('2026-05-03');
  });

  it('yesterdayET during ET morning is straightforward (today − 1 day)', () => {
    vi.setSystemTime(new Date('2026-05-04T13:00:00Z'));    // 9 AM ET on May 4
    expect(yesterdayET()).toBe('2026-05-03');
  });

  it('etDateCompact(yesterdayET) produces the YYYYMMDD form ESPN expects', () => {
    vi.setSystemTime(new Date('2026-05-04T13:00:00Z'));
    expect(etDateCompact(yesterdayET())).toBe('20260503');
  });

  it('etDayFromISO collapses an ISO timestamp to its ET calendar day', () => {
    expect(etDayFromISO('2026-05-04T22:30:00Z')).toBe('2026-05-04');     // 6:30 PM ET
    expect(etDayFromISO('2026-05-05T02:30:00Z')).toBe('2026-05-04');     // 10:30 PM ET
    expect(etDayFromISO('2026-05-05T04:00:00Z')).toBe('2026-05-05');     // midnight ET on May 5
  });

  it('etDayFromISO passes through plain YYYY-MM-DD inputs', () => {
    expect(etDayFromISO('2026-05-01')).toBe('2026-05-01');
  });
});

describe('scorecard endpoint — daily refresh contract (no hard-coded date)', () => {
  it('the endpoint source defers to yesterdayET (not a literal date)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '..', 'nba', 'picks', 'scorecard.js'), 'utf8');
    // Default-date resolution must call yesterdayET() — a hard-coded
    // YYYY-MM-DD literal would freeze the daily refresh.
    expect(src).toMatch(/yesterdayET\(\)/);
    // Should NOT contain a YYYY-MM-DD literal anywhere (the regex
    // intentionally excludes the regex source itself by checking for
    // string literals only).
    const literalDateInString = /['"`]20\d\d-\d\d-\d\d['"`]/g;
    const matches = src.match(literalDateInString) || [];
    expect(matches, `Hard-coded date strings found: ${matches.join(', ')}`).toEqual([]);
  });

  it('the endpoint advertises a daily-safe Cache-Control', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '..', 'nba', 'picks', 'scorecard.js'), 'utf8');
    // Edge cache for at most ~30 s and must-revalidate so the day-rollover
    // is reflected within at most one cache window.
    expect(src).toMatch(/Cache-Control[^\n]*s-maxage=\d+/);
    expect(src).toMatch(/must-revalidate/);
    expect(src).toMatch(/max-age=0/);
  });
});
