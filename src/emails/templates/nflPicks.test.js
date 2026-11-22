import { describe, it, expect } from 'vitest';
import { getSubject, renderHTML, renderText, nflPicksContent, hasNflPicksContent, yourTeams } from './nflPicks.js';
import { findVoiceIssues } from '../../features/contentStudio/voice.js';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const team = (slug, shortName, name, record) => ({ slug, shortName, name, record, logo: `https://x/${slug}.png` });
const ARI = team('cardinals', 'ARI', 'Arizona Cardinals', '3-7');
const KC = team('chiefs', 'KC', 'Kansas City Chiefs', '7-2');
const MIN = team('vikings', 'MIN', 'Minnesota Vikings', '5-5');
const SF = team('49ers', 'SF', 'San Francisco 49ers', '8-2');
const NYJ = team('jets', 'NYJ', 'New York Jets', '2-8');
const LAC = team('chargers', 'LAC', 'Los Angeles Chargers', '6-4');

const pick = (over) => ({
  sport: 'nfl', pickRole: 'tracking', conviction: { score: 40 }, market: { type: 'total', priceAmerican: -110 },
  book: { title: 'BetMGM' }, displayMetrics: {}, ...over,
});
const rec = pick({
  id: 'r1', gameId: 'g1', pickRole: 'hero', conviction: { score: 79 }, market: { type: 'total', priceAmerican: -105 },
  book: { title: 'DraftKings' }, selection: { label: 'Under 40.5' }, displayMetrics: { edgeValue: '+4.7%' },
  matchup: { awayTeam: ARI, homeTeam: KC, startTime: '2026-11-22T18:00Z' }, why: 'DraftKings paid -105; the fair price was -116.',
});
const lean = pick({
  id: 'l1', gameId: 'g2', selection: { label: 'MIN +3.5' }, market: { type: 'runline', priceAmerican: -112 },
  matchup: { awayTeam: MIN, homeTeam: SF, startTime: '2026-11-23T01:20Z' }, why: 'Lean only, not a recommended bet: ratings SF -0.3, market SF -3.5.',
});
const tracked = pick({
  id: 't1', gameId: 'g3', selection: { label: 'Over 43' },
  matchup: { awayTeam: NYJ, homeTeam: LAC, startTime: '2026-11-22T21:05Z' }, why: 'Tracked only: no lean.',
});
const board = {
  week: 11,
  tiers: { tier1: [], tier2: [rec], tier3: [] },
  fullSlatePicks: [rec, lean, tracked],
  byGame: [
    { gameId: 'g1', awayTeam: ARI, homeTeam: KC, startTime: '2026-11-22T18:00Z', market: { spreadHome: -15.5, total: 40.5 } },
    { gameId: 'g2', awayTeam: MIN, homeTeam: SF, startTime: '2026-11-23T01:20Z', market: { spreadHome: -3.5, total: 46 } },
    { gameId: 'g3', awayTeam: NYJ, homeTeam: LAC, startTime: '2026-11-22T21:05Z', market: { spreadHome: -7, total: 43 } },
  ],
};
const data = (over = {}) => ({ nflPicksBoard: board, now: NOW, displayName: 'Dante', pinnedSlugs: [], ...over });

describe('NFL picks email', () => {
  it('lists the recommended pick and the leans the engine words as leans', () => {
    const c = nflPicksContent(data());
    expect(c).toMatchObject({ week: 11, games: 3 });
    expect(c.picks.map((p) => p.pick)).toEqual(['Under 40.5']);
    expect(c.leans.map((p) => p.pick)).toEqual(['MIN +3.5']); // "Tracked only" is not a lean
  });

  it('leads with the picks and the passes', () => {
    expect(getSubject(data())).toBe('NFL Week 11: 1 pick from Maximus');
    const html = renderHTML(data());
    expect(html).toContain('1 pick. 2 games passed.');
    expect(html).toContain('Under 40.5');
    expect(html).toContain('DraftKings');
    expect(html).toContain('1-800-GAMBLER');
    expect(html).not.toMatch(/undefined|NaN|\[object/);
  });

  it('shows the reader’s teams from their side of the game', () => {
    const rows = nflPicksContent(data({ pinnedSlugs: ['chiefs', 'vikings', 'jets', 'nyy'] })).teams;
    expect(rows.map((r) => r.slug)).toEqual(['chiefs', 'jets', 'vikings']); // by kickoff; the MLB slug is ignored
    expect(rows[0]).toMatchObject({ versus: 'vs Arizona Cardinals', line: 'KC -15.5, total 40.5', call: { kind: 'pick', text: 'Under 40.5 (-105, DraftKings)' } });
    expect(rows[1]).toMatchObject({ versus: 'at Los Angeles Chargers', line: 'NYJ +7, total 43', call: { kind: 'none' } });
    expect(rows[2]).toMatchObject({ versus: 'at San Francisco 49ers', line: 'MIN +3.5, total 46', call: { kind: 'lean', text: 'MIN +3.5' } });
    expect(renderHTML(data({ pinnedSlugs: ['chiefs'] }))).toContain('Your team this week');
    expect(renderHTML(data())).not.toContain('Your team');
    expect(yourTeams(board, [], { now: NOW })).toEqual([]);
  });

  it('drops games that have kicked off', () => {
    const later = Date.parse('2026-11-22T19:00:00Z');
    const c = nflPicksContent(data({ now: later }));
    expect(c.picks).toEqual([]);
    expect(c.games).toBe(2);
    expect(getSubject(data({ now: later }))).toBe('NFL Week 11: no bets yet, 1 lean on the board');
    expect(renderHTML(data({ now: later }))).toContain('No bet clears the bar.');
  });

  it('has nothing to send once every game has started, or with no board', () => {
    expect(hasNflPicksContent(data())).toBe(true);
    expect(hasNflPicksContent(data({ now: Date.parse('2026-11-24T12:00:00Z') }))).toBe(false);
    expect(hasNflPicksContent({ nflPicksBoard: null })).toBe(false);
  });

  it('keeps to the voice rules in every version', () => {
    for (const out of [renderHTML(data()), renderText(data()), getSubject(data())]) expect(findVoiceIssues(out)).toEqual([]);
    expect(renderText(data({ pinnedSlugs: ['chiefs'] }))).toContain('YOUR TEAMS');
  });
});
