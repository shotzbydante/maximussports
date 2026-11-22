import { describe, it, expect } from 'vitest';
import { nbaPickSummary, maximusPicks, leanPicks, bestPerGame, rankMarket, totalSample, recordText } from './pickSummary.js';
import { nbaNickname, splitNbaTeamMentions, statusText } from '../../../components/nba/home/nbaFormat';

const matchup = { awayTeam: { slug: 'okc' }, homeTeam: { slug: 'mia' } };
const total = {
  id: 'g1-total-over', gameId: 'g1', pickRole: 'hero', tier: 'tier1', matchup,
  market: { type: 'total', line: 226 }, selection: { side: 'over', label: 'Over 226' }, conviction: { score: 82 },
  totalDebug: { fairTotal: 243.4, marketTotal: 226, delta: 17.4 },
  awayTeamForm: { sample: 3, recentTotalAvg: 234.33 }, homeTeamForm: { sample: 2, recentTotalAvg: 252.5 },
};
const spread = {
  id: 'g1-spread-away', gameId: 'g1', pickRole: 'tracking', tier: 'tier3', matchup,
  market: { type: 'runline', line: 4.5 }, selection: { side: 'away', label: 'OKC +4.5' }, conviction: { score: 55 },
  spreadDebug: { projectedHomeMargin: 3.4, awayCoverEdge: 1.1, homeCoverEdge: -1.1 },
};
const ml = {
  id: 'g1-moneyline-away', gameId: 'g1', pickRole: 'tracking', tier: 'tracking', matchup,
  market: { type: 'moneyline', priceAmerican: 155 }, selection: { side: 'away', label: 'OKC +155' }, conviction: { score: 49 },
  modelProb: 0.42, impliedProb: 0.378,
};
const other = { ...spread, id: 'g2-spread-home', gameId: 'g2', conviction: { score: 60 } };

describe('nbaPickSummary', () => {
  it('grounds a total in each team’s recent scoring and says how many games', () => {
    expect(nbaPickSummary(total)).toBe(
      'The Thunder’s last 3 games averaged 234 points and the Heat’s last 2 averaged 253, against a total of 226.',
    );
  });
  it('falls back to the projected total when team form is missing', () => {
    expect(nbaPickSummary({ ...total, awayTeamForm: null })).toBe('Recent scoring projects this game at 243.4 points, 17.4 above the total of 226.');
  });
  it('explains a side from the moneyline against the spread', () => {
    expect(nbaPickSummary(spread)).toBe('The moneyline prices the Heat as about a 3.4-point favorite, and the Thunder are getting +4.5, 1.1 points of room.');
  });
  it('explains a moneyline from the win chance the spread implies', () => {
    expect(nbaPickSummary(ml)).toBe('The spread implies the Thunder win 42% of the time, and +155 needs 38%.');
  });
  it('never invents a reason', () => {
    expect(nbaPickSummary({ market: { type: 'total' }, matchup })).toBe('');
    expect(nbaPickSummary(null)).toBe('');
  });
});

describe('board helpers', () => {
  const board = { fullSlatePicks: [ml, spread, total, other] };
  it('takes Maximus’s picks from the pick role, not the tier', () => {
    expect(maximusPicks(board).map((p) => p.id)).toEqual(['g1-total-over']);
    expect(leanPicks(board).map((p) => p.id)).toEqual(['g2-spread-home', 'g1-spread-away', 'g1-moneyline-away']);
  });
  it('has no picks when the board has none', () => {
    expect(maximusPicks({ fullSlatePicks: [spread, ml] })).toEqual([]);
    expect(maximusPicks(null)).toEqual([]);
  });
  it('ranks one call per game with a pick leading its game', () => {
    expect(bestPerGame(board.fullSlatePicks).map((p) => p.id)).toEqual(['g1-total-over', 'g2-spread-home']);
    expect(rankMarket(board.fullSlatePicks, 'runline').map((p) => p.id)).toEqual(['g2-spread-home', 'g1-spread-away']);
  });
  it('reports the smaller recent-form sample', () => {
    expect(totalSample(total)).toBe(2);
    expect(totalSample(spread)).toBeNull();
  });
  it('formats a record', () => {
    expect(recordText({ won: 3, lost: 1, push: 0 })).toBe('3-1');
    expect(recordText({ won: 0, lost: 0, push: 0 })).toBeNull();
  });
});

describe('nbaFormat', () => {
  it('knows the short names', () => {
    expect(nbaNickname('por')).toBe('Trail Blazers');
    expect(nbaNickname('phi')).toBe('76ers');
    expect(nbaNickname('bos')).toBe('Celtics');
  });
  it('finds team names in copy, case-sensitively', () => {
    expect(splitNbaTeamMentions('The Heat beat the heat.').filter((p) => p.slug).map((p) => p.slug)).toEqual(['mia']);
    expect(splitNbaTeamMentions('OKC +4.5', { abbrev: true })[0]).toEqual({ text: 'OKC', slug: 'okc' });
  });
  it('does not show a date as a live clock', () => {
    expect(statusText({ gameState: { isLive: true, periodLabel: '11/22 - 6:00 PM EST' } })).toBe('Live');
    expect(statusText({ gameState: { isLive: true, periodLabel: '4:12 - 3rd' } })).toBe('4:12 - 3rd');
    expect(statusText({ gameState: { isFinal: true, isOvertime: true, overtimeCount: 1 } })).toBe('Final, overtime');
  });
});

import { linesFor, splitByStart } from './pickSummary.js';

describe('linesFor', () => {
  const market = { pregameSpread: -4.5, pregameTotal: 226, moneyline: { away: 155, home: -185 }, booksCount: 9 };
  it('reads the three markets from the games feed', () => {
    expect(linesFor(total, { market })).toEqual({ spreadHome: -4.5, total: 226, moneyline: { away: 155, home: -185 }, books: 9 });
  });
  it('falls back to the line the pick carries when the game is not in the feed', () => {
    expect(linesFor(total, null)).toEqual({ spreadHome: null, total: 226, moneyline: null, books: null });
    expect(linesFor(spread, null).spreadHome).toBe(-4.5);
    expect(linesFor(ml, null)).toBeNull();
  });
});

describe('splitByStart', () => {
  const board = { fullSlatePicks: [total, { ...total, id: 'g2-total-over', gameId: 'g2' }] };
  const g = (id, status) => ({ gameId: id, status, teams: {} });
  it('keeps a pick on the board until its game tips off', () => {
    const { toPlay, inPlay } = splitByStart(board, [g('g1', 'upcoming'), g('g2', 'live')]);
    expect(toPlay.map((p) => p.id)).toEqual(['g1-total-over']);
    expect(inPlay.map((r) => r.pick.id)).toEqual(['g2-total-over']);
    expect(inPlay[0].pick).toMatchObject({ market: 'total', side: 'over', line: 226, label: 'Over 226' });
  });
  it('adds picks the server carried over, live games first, without repeats', () => {
    const carried = { ...board, startedPicks: [
      { id: 'g3-total-under', gameId: 'g3', market: 'total', side: 'under', line: 219.5, label: 'Under 219.5' },
      { id: 'g2-total-over', gameId: 'g2', market: 'total', side: 'over', line: 226, label: 'Over 226' },
    ] };
    const { inPlay } = splitByStart(carried, [g('g1', 'upcoming'), g('g2', 'live'), g('g3', 'final')]);
    expect(inPlay.map((r) => r.pick.id)).toEqual(['g2-total-over', 'g3-total-under']);
  });
  it('ignores a carried pick whose game is not on today’s slate', () => {
    expect(splitByStart({ startedPicks: [{ id: 'x', gameId: 'old' }] }, [g('g1', 'upcoming')]).inPlay).toEqual([]);
  });
});
