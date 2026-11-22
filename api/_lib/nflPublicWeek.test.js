/**
 * Tests for the week the logged-out home page shows. These lock: when the
 * board turns over to the next week, which three picks are open, that a
 * pick on any other game never reaches the response, and that no rating
 * or projection does either.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  rolloverAt, nextWeekCandidates, weekLabel, featuredRows, publicWhy, publicGame,
  publicMatchup, ratedQuarterbackOut, buildPublicWeek, resolveDisplayWeek, FEATURED_MAX, MATCHUP_ROWS,
} from './nflPublicWeek.js';

const TEAMS = {
  NO: ['saints', 'New Orleans Saints'], CHI: ['bears', 'Chicago Bears'],
  ARI: ['cardinals', 'Arizona Cardinals'], KC: ['chiefs', 'Kansas City Chiefs'],
  CIN: ['bengals', 'Cincinnati Bengals'], WSH: ['commanders', 'Washington Commanders'],
  BAL: ['ravens', 'Baltimore Ravens'], CAR: ['panthers', 'Carolina Panthers'],
  MIN: ['vikings', 'Minnesota Vikings'], SF: ['49ers', 'San Francisco 49ers'],
};
const side = (abbrev, score = null) => ({
  slug: TEAMS[abbrev][0], name: TEAMS[abbrev][1], abbrev, score, record: '5-5',
  logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbrev.toLowerCase()}.png`,
});

function game(id, away, home, { status = 'upcoming', scores = [null, null], startTime = '2026-11-22T18:00Z', market } = {}) {
  return {
    gameId: id, status, startTime,
    teams: { away: side(away, scores[0]), home: side(home, scores[1]) },
    gameState: { isLive: status === 'live', isFinal: status === 'final', periodLabel: status === 'final' ? 'Final' : status === 'live' ? 'Q3 4:10' : null, possession: 'home' },
    market: market === undefined ? { pregameSpread: -3.5, pregameTotal: 45.5, moneyline: { home: -180, away: 155 } } : market,
    // Everything below is engine output a public tile must not carry.
    model: { fairSpread: -4.4, fairTotal: 47.2, homeWinProb: 0.63, pregameEdge: 0.9 },
    engine: { projection: { total: 47.2 }, fair: { homeWin: 0.63 }, env: { wind: 15 } },
    signals: { importanceScore: 20 },
    venue: { name: 'A Stadium', city: 'Chicago', state: 'IL', indoor: false, neutralSite: false },
    broadcast: { network: 'Fox' },
  };
}

let seq = 0;
function row(gameId, o = {}) {
  seq += 1;
  return {
    id: `r${seq}`, game_id: gameId, market_type: 'total', selection_side: 'under', line_value: '49',
    price_american: -110, tier: 'tier2', book: 'Circa Sports', locked_at: '2026-11-22T04:02:20Z',
    expected_value: '0.048', bet_score: '0.79', created_at: '2026-11-22T04:02:26Z',
    rationale: { headline: 'Under 49: 15 mph wind and -110 at Circa Sports' },
    payload: { selection: { label: 'Under 49' }, conviction: { score: 79 }, fair: { secret: 1 }, betScore: { components: { secret: 1 } } },
    ...o,
  };
}
const lean = (gameId, o = {}) => row(gameId, {
  tier: 'tracking', payload: null, expected_value: '-0.03', bet_score: '0.41', market_type: 'runline',
  selection_side: 'away', line_value: '3.5', price_american: -115,
  rationale: { headline: 'Model lean: Minnesota Vikings +3.5. Ratings make it SF -0.3 against a market of SF -3.5' }, ...o,
});

const WEEK11 = [
  game('g1', 'NO', 'CHI', { status: 'final', scores: [13, 21], market: { pregameSpread: null, pregameTotal: null, moneyline: null } }),
  game('g2', 'ARI', 'KC', { status: 'final', scores: [7, 34], market: { pregameSpread: null, pregameTotal: null, moneyline: null } }),
  game('g3', 'BAL', 'CAR', { status: 'final', scores: [33, 35], market: { pregameSpread: null, pregameTotal: null, moneyline: null } }),
  game('g4', 'MIN', 'SF', { status: 'live', scores: [10, 14], startTime: '2026-11-23T01:20Z' }),
  game('g5', 'CIN', 'WSH', { startTime: '2026-11-24T01:15Z' }),
];
const PAGE = { games: WEEK11, week: 11, seasonType: 2, seasonYear: 2026, byeTeams: ['falcons', 'rams'], ok: true };

describe('rolloverAt', () => {
  it('is 5 AM Eastern on the Tuesday after the last kickoff', () => {
    // Monday night, 8:15 PM Eastern (standard time): Tuesday 5 AM EST is 10:00 UTC.
    expect(new Date(rolloverAt(WEEK11)).toISOString()).toBe('2026-11-24T10:00:00.000Z');
  });

  it('follows daylight saving: 5 AM EDT is 09:00 UTC', () => {
    const sept = [{ startTime: '2026-09-14T17:00Z' }, { startTime: '2026-09-15T00:15Z' }];
    expect(new Date(rolloverAt(sept)).toISOString()).toBe('2026-09-15T09:00:00.000Z');
  });

  it('waits for the following Tuesday when the last game is on a Tuesday night', () => {
    const tuesdayGame = [{ startTime: '2026-11-25T01:00Z' }];   // Tuesday 8 PM Eastern
    expect(new Date(rolloverAt(tuesdayGame)).toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });

  it('has nothing to say about a week with no kickoff times', () => {
    expect(rolloverAt([])).toBeNull();
    expect(rolloverAt([{ startTime: null }])).toBeNull();
  });
});

describe('nextWeekCandidates and weekLabel', () => {
  it('steps through the regular season, into the playoffs and past the Pro Bowl', () => {
    expect(nextWeekCandidates({ week: 11, seasonType: 2, seasonYear: 2026 })).toEqual([{ week: 12, seasonType: 2, year: 2026 }]);
    expect(nextWeekCandidates({ week: 18, seasonType: 2, seasonYear: 2026 })).toEqual([{ week: 1, seasonType: 3, year: 2026 }]);
    expect(nextWeekCandidates({ week: 3, seasonType: 3, seasonYear: 2026 })).toEqual([{ week: 5, seasonType: 3, year: 2026 }]);
    expect(nextWeekCandidates({ week: 5, seasonType: 3, seasonYear: 2026 })).toEqual([]);
    expect(nextWeekCandidates({ week: null, seasonType: null })).toEqual([]);
  });

  it('names the week the way a fan would', () => {
    expect(weekLabel({ week: 11, seasonType: 2 })).toBe('Week 11');
    expect(weekLabel({ week: 1, seasonType: 3 })).toBe('Wild Card');
    expect(weekLabel({ week: 5, seasonType: 3 })).toBe('Super Bowl');
    expect(weekLabel({})).toBe('This week');
  });
});

describe('resolveDisplayWeek', () => {
  const next = { games: [game('n1', 'BAL', 'CAR', { startTime: '2026-11-27T01:15Z' })], week: 12, seasonType: 2, seasonYear: 2026, byeTeams: [], ok: true };

  it('shows the week just played until Tuesday morning', async () => {
    const fetchPage = vi.fn(async () => PAGE);
    const out = await resolveDisplayWeek({ now: Date.parse('2026-11-24T09:59:00Z'), fetchPage });
    expect(out.page.week).toBe(11);
    expect(out.next).toEqual({ week: 12, seasonType: 2 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('turns over to the next week at 5 AM Eastern on Tuesday', async () => {
    const fetchPage = vi.fn(async (args) => (args ? next : PAGE));
    const out = await resolveDisplayWeek({ now: Date.parse('2026-11-24T10:00:00Z'), fetchPage });
    expect(out.page.week).toBe(12);
    expect(fetchPage).toHaveBeenLastCalledWith({ week: 12, seasonType: 2, year: 2026 });
  });

  it('keeps the finished week when nothing is scheduled after it', async () => {
    const fetchPage = vi.fn(async (args) => (args ? { games: [], ok: true } : PAGE));
    const out = await resolveDisplayWeek({ now: Date.parse('2026-11-25T00:00:00Z'), fetchPage });
    expect(out.page.week).toBe(11);
    expect(out.next).toBeNull();
  });

  it('shows whatever ESPN has once its own scoreboard has moved on', async () => {
    const out = await resolveDisplayWeek({ now: Date.parse('2026-11-25T12:00:00Z'), fetchPage: vi.fn(async () => next) });
    expect(out.page.week).toBe(12);
  });
});

describe('featuredRows', () => {
  it('ranks recommended picks by conviction, then value', () => {
    const rows = [
      row('g5', { bet_score: '0.667', expected_value: '0.021', payload: { selection: { label: 'Over 54' }, conviction: { score: 67 } } }),
      row('g2', { expected_value: '0.047', payload: { selection: { label: 'Under 40.5' }, conviction: { score: 79 } } }),
      row('g1', { expected_value: '0.048' }),
    ];
    expect(featuredRows(rows, WEEK11).map((r) => r.game_id)).toEqual(['g1', 'g2', 'g5']);
  });

  it('puts a recommended pick ahead of a stronger-looking lean, and fills up with leans', () => {
    const rows = [
      lean('g4', { bet_score: '0.9' }),
      row('g1', { bet_score: '0.6', payload: { selection: { label: 'Under 49' }, conviction: { score: 60 } } }),
      lean('g3', { bet_score: '0.35' }),
    ];
    const out = featuredRows(rows, WEEK11);
    expect(out.map((r) => r.game_id)).toEqual(['g1', 'g4', 'g3']);
  });

  it('opens one pick per game and never more than three', () => {
    const rows = [
      row('g1'), lean('g1'), lean('g1', { market_type: 'total' }),
      row('g2'), row('g5'), lean('g3'), lean('g4'),
    ];
    const out = featuredRows(rows, WEEK11);
    expect(out).toHaveLength(FEATURED_MAX);
    expect(new Set(out.map((r) => r.game_id)).size).toBe(FEATURED_MAX);
  });

  it('does not count a moneyline lean with no value as a call', () => {
    const noValue = lean('g4', { market_type: 'moneyline', line_value: null, price_american: 150, expected_value: '-0.042', bet_score: '0.9' });
    expect(featuredRows([noValue], WEEK11)).toEqual([]);
    const value = { ...noValue, id: 'v', expected_value: '0.006' };
    expect(featuredRows([value], WEEK11)).toHaveLength(1);
  });

  it('ignores rows that are not locked or belong to another week', () => {
    expect(featuredRows([row('g1', { locked_at: null }), row('other-week')], WEEK11)).toEqual([]);
  });
});

describe('publicWhy', () => {
  it('prefers the engine\'s short reason', () => {
    expect(publicWhy({ payload: { whyShort: 'Lean: wind in the forecast' } })).toBe('Wind in the forecast.');
  });

  it('falls back to what the headline says after the pick', () => {
    expect(publicWhy(row('g1'))).toBe('15 mph wind and -110 at Circa Sports.');
    expect(publicWhy(lean('g4'))).toBe('Ratings make it SF -0.3 against a market of SF -3.5.');
    expect(publicWhy({ rationale: { headline: 'Over 54 at -107 (BetRivers): the market’s fair price is -112' } })).toBe('The market’s fair price is -112.');
    expect(publicWhy({})).toBe('');
  });
});

describe('publicGame', () => {
  it('carries the score, the lines and the venue, and none of the engine\'s output', () => {
    const g = publicGame(WEEK11[3]);
    expect(g).toMatchObject({
      gameId: 'g4', status: 'live', network: 'Fox',
      state: { live: true, final: false, label: 'Q3 4:10', possession: 'home' },
      lines: { spreadHome: -3.5, total: 45.5, moneyline: null, kind: 'live' },
      venue: { city: 'Chicago', state: 'IL', neutralSite: false },
      pick: null,
    });
    expect(g.teams.home).toMatchObject({ abbrev: 'SF', nickname: '49ers', score: 14 });
    const text = JSON.stringify(g);
    for (const secret of ['fairSpread', 'fairTotal', 'homeWinProb', 'pregameEdge', 'projection', 'engine', 'signals', 'model']) {
      expect(text).not.toContain(secret);
    }
  });

  it('shows a finished game against the line it closed at', () => {
    const g = publicGame(WEEK11[0], { close: { spread_home: '-12', total: '48' } });
    expect(g.lines).toEqual({ spreadHome: -12, total: 48, moneyline: null, kind: 'closed' });
    expect(publicGame(WEEK11[0]).lines).toMatchObject({ spreadHome: null, total: null, kind: 'current' });
  });

  it('lists both moneylines before kickoff', () => {
    expect(publicGame(WEEK11[4]).lines).toEqual({ spreadHome: -3.5, total: 45.5, moneyline: { home: -180, away: 155 }, kind: 'current' });
  });
});

// Baltimore at Carolina, Week 11: the unit grades the app had on file.
const UNITS = {
  BAL: { QB: 94.8, 'Pass protection': 77.3, Receivers: 76.9, 'Run game': 78.9, 'Pass rush': 84.2, Coverage: 81.9, 'Run defense': 85.6, 'Pass defense': 83.1, 'Overall talent': 83.6 },
  CAR: { QB: 83.0, 'Pass protection': 81.3, Receivers: 81.5, 'Run game': 81.8, 'Pass rush': 81.1, Coverage: 79.1, 'Run defense': 83.0, 'Pass defense': 80.1, 'Overall talent': 81.4 },
};
const TALENT = {
  teams: UNITS,
  averages: { QB: 81.1, 'Pass protection': 80.6, Receivers: 80.6, 'Run game': 80.9, 'Pass rush': 83.7, Coverage: 80.5, 'Run defense': 82.2, 'Pass defense': 82.1 },
};
const LEAGUE = { teams: {
  BAL: { players: [{ group: 'QB', name: 'Lamar Jackson', score: 94.8 }, { group: 'RB', name: 'Derrick Henry', score: 87.5 }] },
  CAR: { players: [{ group: 'QB', name: 'Bryce Young', score: 83 }] },
} };
const INJURIES = { teams: {
  ravens: [{ name: 'Lamar Jackson', position: 'QB', status: 'ir' }, { name: 'Kedon Slovis', position: 'QB', status: 'out' }],
  panthers: [{ name: 'Haynes King', position: 'QB', status: 'out' }],
} };

describe('publicMatchup', () => {
  const g = WEEK11[2];   // BAL at CAR

  it('lists the biggest unit matchups with who each favours, and no grades', () => {
    const m = publicMatchup(g, { talent: TALENT });
    expect(m.rows).toHaveLength(MATCHUP_ROWS);
    expect(m.rows[0]).toEqual({
      offenseTeam: 'BAL', defenseTeam: 'CAR', offense: 'quarterback', defense: 'pass defense',
      edge: 15.7, size: 'big', favours: 'BAL',
    });
    expect(JSON.stringify(m)).not.toMatch(/Grade|overall|netHome|source/);
  });

  it('leaves out a quarterback matchup when the rated quarterback is out or on injured reserve', () => {
    expect(ratedQuarterbackOut(g.teams.away, { league: LEAGUE, injuries: INJURIES })).toBe(true);
    // A backup or third quarterback being inactive does not count.
    expect(ratedQuarterbackOut(g.teams.home, { league: LEAGUE, injuries: INJURIES })).toBe(false);
    const m = publicMatchup(g, { talent: TALENT, league: LEAGUE, injuries: INJURIES });
    expect(m.rows.some((r) => r.offenseTeam === 'BAL' && r.offense === 'quarterback')).toBe(false);
    expect(m.rows.map((r) => [r.offenseTeam, r.offense, r.size])).toEqual([
      ['BAL', 'run game', 'even'], ['CAR', 'run game', 'even'], ['BAL', 'receivers', 'even'],
    ]);
    // Carolina's own quarterback matchup is still in the running.
    expect(publicMatchup(g, { talent: TALENT, league: LEAGUE, injuries: INJURIES, max: 8 }).rows
      .some((r) => r.offenseTeam === 'CAR' && r.offense === 'quarterback')).toBe(true);
  });

  it('matches names through suffixes and punctuation', () => {
    const league = { teams: { BAL: { players: [{ group: 'QB', name: 'Michael Penix Jr.', score: 80 }] } } };
    const injuries = { teams: { ravens: [{ name: 'Michael Penix Jr', position: 'QB', status: 'doubtful' }] } };
    expect(ratedQuarterbackOut(g.teams.away, { league, injuries })).toBe(true);
    injuries.teams.ravens[0].status = 'questionable';
    expect(ratedQuarterbackOut(g.teams.away, { league, injuries })).toBe(false);
  });

  it('is absent when there are no grades for the game', () => {
    expect(publicMatchup(g, {})).toBeNull();
    expect(publicMatchup(WEEK11[0], { talent: TALENT })).toBeNull();
    expect(publicGame(g).matchup).toBeNull();
  });
});

describe('buildPublicWeek', () => {
  const rows = [
    row('g1', { expected_value: '0.048' }),
    row('g2', { line_value: '40.5', price_american: -105, book: 'DraftKings', expected_value: '0.047', payload: { selection: { label: 'Under 40.5' }, conviction: { score: 79 } } }),
    row('g5', { selection_side: 'over', line_value: '54', price_american: -107, book: 'BetRivers', tier: 'tier3', bet_score: '0.667', expected_value: '0.021', payload: { selection: { label: 'Over 54' }, conviction: { score: 67 } } }),
    lean('g3', { selection_side: 'away', line_value: '2.5', price_american: 100, book: 'Caesars' }),
    lean('g3', { market_type: 'total', selection_side: 'over', line_value: '43.5', price_american: -112, book: 'BetMGM' }),
    lean('g4'),
  ];
  const closes = new Map([['g1', { spread_home: '-12', total: '48' }]]);
  const week = buildPublicWeek({ page: PAGE, rows, closes, next: { week: 12, seasonType: 2 }, now: Date.parse('2026-11-22T22:40:00Z') });

  it('describes the week', () => {
    expect(week).toMatchObject({
      ok: true, week: 11, label: 'Week 11', phase: 'live',
      counts: { live: 1, upcoming: 1, final: 3 },
      featured: 3, locked: 2, nextLabel: 'Week 12',
      rollsAt: '2026-11-24T10:00:00.000Z',
    });
    expect(week.byeTeams.map((t) => t.nickname)).toEqual(['Falcons', 'Rams']);
  });

  it('opens the top three in order, each graded against the score', () => {
    const open = week.games.filter((g) => g.pick);
    expect(open.map((g) => [g.gameId, g.pick.rank, g.pick.label])).toEqual([
      ['g1', 1, 'Under 49'], ['g2', 2, 'Under 40.5'], ['g5', 3, 'Over 54'],
    ]);
    expect(open[0].pick).toMatchObject({
      role: 'recommended', market: 'total', price: -110, book: 'Circa Sports', conviction: 79, value: 0.048,
      why: '15 mph wind and -110 at Circa Sports.',
      result: { state: 'final', verdict: 'won', text: 'Finished with 34 points against a total of 49.' },
    });
    // A loss is shown as a loss.
    expect(open[1].pick.result).toMatchObject({ state: 'final', verdict: 'lost' });
    expect(open[2].pick.result).toMatchObject({ state: 'upcoming', verdict: null });
  });

  it('puts the open picks first, then live, to play and final', () => {
    expect(week.games.map((g) => g.gameId)).toEqual(['g1', 'g2', 'g5', 'g4', 'g3']);
  });

  it('sends nothing about the pick on any other game', () => {
    const closed = week.games.filter((g) => !g.pick);
    expect(closed.map((g) => g.gameId).sort()).toEqual(['g3', 'g4']);
    const text = JSON.stringify(closed);
    // The Ravens and Vikings leans: their lines, prices and books stay on the server.
    for (const leak of ['Caesars', 'BetMGM', '43.5', '2.5', '-115', 'Ratings make it']) {
      expect(text).not.toContain(leak);
    }
  });

  it('never sends a stored pick whole', () => {
    const text = JSON.stringify(week);
    for (const secret of ['payload', 'betScore', 'bet_score', 'components', 'secret', 'expected_value', 'fairSpread', 'homeWinProb']) {
      expect(text).not.toContain(secret);
    }
  });

  it('labels a lean as a lean and gives it no value figure', () => {
    const only = buildPublicWeek({ page: PAGE, rows: [lean('g4')] });
    const pick = only.games.find((g) => g.pick).pick;
    expect(pick).toMatchObject({ role: 'lean', label: 'MIN +3.5', value: null, conviction: 41, team: { abbrev: 'MIN' } });
    expect(pick.result).toMatchObject({ state: 'live', verdict: 'behind' });
    expect(only).toMatchObject({ featured: 1, locked: 4 });
  });

  it('handles a week with no picks locked yet', () => {
    const upcoming = { ...PAGE, week: 12, games: [game('n1', 'BAL', 'CAR', { startTime: '2026-11-27T01:15Z' })] };
    const out = buildPublicWeek({ page: upcoming, rows: [] });
    expect(out).toMatchObject({ phase: 'upcoming', featured: 0, locked: 1, counts: { live: 0, upcoming: 1, final: 0 } });
    expect(out.games[0].pick).toBeNull();
  });

  it('puts the position-group matchups on every game it has grades for, locked or not', () => {
    const out = buildPublicWeek({ page: PAGE, rows, talent: TALENT, league: LEAGUE, injuries: INJURIES });
    const bal = out.games.find((g) => g.gameId === 'g3');
    expect(bal.pick).toBeNull();
    expect(bal.matchup.rows).toHaveLength(MATCHUP_ROWS);
    expect(out.games.find((g) => g.gameId === 'g1').matchup).toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/offenseGrade|defenseGrade|Lamar/);
  });

  it('calls a week final once every game is', () => {
    const done = { ...PAGE, games: WEEK11.slice(0, 3) };
    expect(buildPublicWeek({ page: done, rows }).phase).toBe('final');
  });
});
