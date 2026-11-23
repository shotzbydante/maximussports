import { describe, it, expect } from 'vitest';
import { buildDailyBrief } from './model.js';
import { input } from './fixture.nov23.js';
import { getSubject, renderHTML, renderText } from '../templates/theDailyBrief.js';

describe('the Daily Brief, Monday 23 November 2026', () => {
  const brief = buildDailyBrief(input);

  it('leads with football: last night first, then tonight', () => {
    expect(brief.headline).toBe('49ers 35, Vikings 10. Bengals at Commanders tonight.');
    expect(brief.subject).toMatch(/^The Daily Brief: 49ers 35, Vikings 10/);
    expect(brief.nfl.yesterday).toBeTruthy();
    expect(brief.nfl.today.games).toHaveLength(1);
  });

  it('reports our calls as they were graded, wins and losses alike', () => {
    expect(brief.dek).toContain('recommended picks went 1-1');
    expect(brief.dek).toContain('leans went 15-16');
    const html = renderHTML({ dailyBrief: brief });
    expect(html).toContain('Under 49');
    expect(html).toContain('Under 40.5');
    expect(html).toMatch(/Lost by 0\.5 points: the hook/);
  });

  it('never says we had the 49ers: our side leans on that game were Minnesota', () => {
    const text = renderText({ dailyBrief: brief });
    expect(text).toMatch(/MIN \+3\.5.*lost/i);
    expect(text).toMatch(/Under 46\.5.*won/i);
  });

  it('puts the NBA second', () => {
    const html = renderHTML({ dailyBrief: brief });
    expect(html.indexOf('>NFL<')).toBeGreaterThan(-1);
    expect(html.indexOf('>NBA<')).toBeGreaterThan(html.indexOf('>NFL<'));
    expect(brief.nba.tonight.pickCount).toBe(5);
  });

  it('carries none of the old template\'s out-of-season copy', () => {
    const html = renderHTML({ dailyBrief: brief });
    expect(html).not.toMatch(/playoff race|playoff intensity|scorecard activates|broad MLB coverage/i);
  });
});

describe('the Daily Brief when sources are missing', () => {
  it('is marked empty with nothing to report, so the send is skipped', () => {
    const brief = buildDailyBrief({ now: input.now });
    expect(brief.empty).toBe(true);
    expect(getSubject({})).toBe('The Daily Brief');
  });

  it('still builds with the NBA alone', () => {
    const brief = buildDailyBrief({ now: input.now, nba: input.nba });
    expect(brief.empty).toBe(false);
    expect(brief.nfl).toBeNull();
    expect(renderHTML({ dailyBrief: brief })).toContain('>NBA<');
  });
});
