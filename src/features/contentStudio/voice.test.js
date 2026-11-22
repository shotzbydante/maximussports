import { describe, it, expect, vi } from 'vitest';
import { findVoiceIssues, ensureResponsibleLine, validateRewrite, RESPONSIBLE_LINE } from './voice';
import { normalizeStudioCaption } from '../mlb/contentStudio/normalizeStudioCaption';
import { runVoicePass } from '../../../api/content-studio/voice-pass.js';
import { todaysNflPlan } from '../nfl/contentStudio/weeklyPlan';

const BASE = `Week 11 picks are in. 3 bets cleared the bar out of 38 markets checked.

1. Under 40.5, ARI @ KC (-105 at DraftKings)
   Fair price -116, offered -105, wins 53.6%, expected value +4.7%.

Full reasoning for every pick: maximussports.ai

${RESPONSIBLE_LINE}`;

describe('findVoiceIssues', () => {
  it('flags promises of an outcome', () => {
    expect(findVoiceIssues('This is the lock of the week')).toEqual(['lock of the…']);
    expect(findVoiceIssues('Guaranteed winner, free money')).toEqual(['guaranteed', 'free money']);
    expect(findVoiceIssues("You can't lose with this risk-free play")).toEqual(["can't lose", 'risk-free']);
  });
  it('allows the words we do use', () => {
    expect(findVoiceIssues('Locked Sat 11:02 PM at -105. Picks are locked before kickoff.')).toEqual([]);
    expect(findVoiceIssues('No bet. The price is fair, so we pass.')).toEqual([]);
  });
});

describe('ensureResponsibleLine', () => {
  it('adds the line once', () => {
    const once = ensureResponsibleLine('A caption.');
    expect(once).toContain('1-800-GAMBLER');
    expect(ensureResponsibleLine(once)).toBe(once);
    expect(ensureResponsibleLine('For entertainment only. Please bet responsibly. 21+')).toBe('For entertainment only. Please bet responsibly. 21+');
  });
});

describe('normalizeStudioCaption voice rules', () => {
  const long = 'Brewers hold first in the NL Central after a 4-1 win over the Rays, and the pennant race tightens behind them.';
  it('appends the 21+ line when a builder forgot it', () => {
    const c = normalizeStudioCaption({ shortCaption: long, hashtags: ['#MLB'] });
    expect(c.ok).toBe(true);
    expect(c.fullCaption).toContain('21+');
    expect(c.fullCaption.endsWith('#MLB')).toBe(true);
  });
  it('refuses a caption that promises a win', () => {
    const c = normalizeStudioCaption({ shortCaption: `${long} Lock of the day.`, hashtags: [] });
    expect(c).toMatchObject({ ok: false, reason: 'banned_phrase', voiceIssues: ['lock of the…'] });
  });
});

describe('validateRewrite', () => {
  it('accepts a rewrite that only changes the words', () => {
    const next = BASE.replace('Week 11 picks are in. 3 bets cleared the bar out of 38 markets checked.', '38 markets. 3 survived. Week 11 is short and sharp.');
    expect(validateRewrite(BASE, next)).toEqual({ ok: true, problems: [] });
  });
  it('rejects an invented or altered number', () => {
    const r = validateRewrite(BASE, BASE.replace('53.6%', '58%'));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('58%');
  });
  it('rejects a dropped link, a dropped 21+ line and hype', () => {
    expect(validateRewrite(BASE, BASE.replace('maximussports.ai', 'our site')).problems).toContain('dropped the site link');
    expect(validateRewrite(BASE, BASE.replace(RESPONSIBLE_LINE, 'Bet responsibly, friends, and enjoy the games this weekend.')).problems.join()).toMatch(/21\+ line/);
    expect(validateRewrite(BASE, `${BASE}\nThis one is a sure thing.`).problems.join()).toMatch(/sure thing/);
  });
});

describe('runVoicePass', () => {
  it('returns the first rewrite that passes', async () => {
    const good = BASE.replace('Week 11 picks are in.', 'Week 11, sorted.');
    const complete = vi.fn().mockResolvedValueOnce(BASE.replace('-105', '-120')).mockResolvedValueOnce(good);
    const r = await runVoicePass(BASE, complete);
    expect(r).toMatchObject({ ok: true, caption: good, attempts: 2 });
    expect(complete.mock.calls[1][0].user).toContain('rejected for');
  });
  it('gives up after two bad rewrites and keeps the original', async () => {
    const r = await runVoicePass(BASE, vi.fn().mockResolvedValue('Guaranteed winner at -999. Free money.'));
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});

describe('todaysNflPlan', () => {
  it('follows the football week in Eastern time', () => {
    expect(todaysNflPlan(new Date('2026-11-24T18:00:00Z'))).toMatchObject({ section: 'nfl-receipts', dayLabel: 'Tuesday' });
    expect(todaysNflPlan(new Date('2026-11-27T18:00:00Z')).section).toBe('nfl-picks');
    expect(todaysNflPlan(new Date('2026-11-22T15:00:00Z')).section).toBe('nfl-slate');   // Sunday 10 AM ET
    expect(todaysNflPlan(new Date('2026-11-23T02:00:00Z')).section).toBe('nfl-review');  // Sunday 9 PM ET
  });
});
