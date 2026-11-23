import { describe, it, expect } from 'vitest';
import { buildNflDaily, buildHits, isThanksgiving } from './daily.js';
import { buildNflCaption } from './buildNflCaption.js';

const now = new Date('2026-11-23T14:00:00Z'); // Monday morning
const pick = (o) => ({ id: o.label, slateDate: '2026-11-22', awayAbbrev: 'NO', homeAbbrev: 'CHI', awayTeam: 'saints', homeTeam: 'bears', market: 'total', price: -110, pickRole: 'tracking', finalScore: 'NO 13, CHI 21', ...o });
const scorecard = { slates: [
  { date: '2026-11-23', picks: [pick({ label: 'Over 54', status: 'pending', slateDate: '2026-11-23' })] },
  { date: '2026-11-22', picks: [
    pick({ label: 'NO +11.5', status: 'won', market: 'runline', review: { by: 3.5 } }),
    pick({ label: 'Under 49', status: 'won', pickRole: 'hero', review: { by: 15 } }),
    pick({ label: 'Under 40.5', status: 'lost', pickRole: 'hero', review: { by: -0.5 } }),
    pick({ label: 'NO +520', status: 'lost', market: 'moneyline' }),
  ] },
] };
const team = (abbrev) => ({ abbrev, slug: abbrev.toLowerCase(), logo: null });
const game = (id, away, home, startTime, o = {}) => ({ id, away: team(away), home: team(home), startTime, status: 'upcoming', kickoffDay: 'Thu', kickoffTime: '4:30 PM ET', spreadHome: -3, spreadLabel: `${home} -3`, total: 47.5, picks: [], ...o });
const tonight = game('1', 'CIN', 'WSH', '2026-11-24T01:15:00Z', { kickoffDay: 'Mon', kickoffTime: '8:15 PM ET' });
const nextGames = [
  game('2', 'GB', 'DET', '2026-11-26T17:30:00Z'),
  game('3', 'KC', 'DAL', '2026-11-26T21:30:00Z'),
  game('4', 'NYJ', 'MIA', '2026-11-29T18:00:00Z', { spreadHome: -13, spreadLabel: 'MIA -13' }),
];

describe('the NFL daily post', () => {
  it('lists only the calls that won, recommended picks first', () => {
    const h = buildHits(scorecard, now);
    expect(h.dayName).toBe('Sunday');
    expect(h.rows.map((r) => r.label)).toEqual(['Under 49', 'NO +11.5']);
    expect(h.count).toBe(2);
    expect(JSON.stringify(h)).not.toMatch(/Under 40\.5|NO \+520/);
  });

  it('never states a record on the strength of wins alone, and points at the full one', () => {
    const daily = buildNflDaily({ scorecard, games: [tonight], nextGames, now });
    const c = buildNflCaption({ section: 'nfl-daily', week: 11, slateLabel: 'Week 11', daily });
    expect(c.longCaption).not.toMatch(/\d+-0\b|undefeated|perfect/i);
    expect(c.longCaption).toContain('Full record, losses included: maximussports.ai/record');
    expect(c.longCaption).toContain('1-800-GAMBLER');
    expect(c.longCaption).not.toMatch(/\bfalse\b|undefined|null/);
  });

  it('finds tonight and the games to circle, Thanksgiving first', () => {
    const daily = buildNflDaily({ scorecard, games: [tonight], nextGames, now });
    expect(daily.tonight.window).toBe('Monday night');
    expect(daily.ahead.thanksgivingGames).toBe(2);
    expect(daily.ahead.games.map((g) => g.window).slice(0, 2)).toEqual(['Thanksgiving', 'Thanksgiving']);
    expect(isThanksgiving('2026-11-26T21:30:00Z')).toBe(true);
    expect(isThanksgiving('2026-11-19T21:30:00Z')).toBe(false);
  });

  it('skips old wins and stays quiet when there is nothing to say', () => {
    expect(buildHits(scorecard, new Date('2026-11-28T14:00:00Z'))).toBeNull();
    const empty = buildNflDaily({ scorecard: null, games: [], nextGames: [], now });
    expect(empty.ready).toBe(false);
    expect(buildNflCaption({ section: 'nfl-daily', daily: empty })).toBeNull();
  });
});
