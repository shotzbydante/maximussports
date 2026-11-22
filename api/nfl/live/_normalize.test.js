import { describe, it, expect } from 'vitest';
import { parseEspnOdds, normalizeEvent } from './_normalize.js';
import { parseOddsEvent, mergeOdds } from './_odds.js';
import { rankLiveGames } from './_scoring.js';

/** ESPN's current odds shape (nested open/close objects). */
const NEW_ODDS = {
  provider: { name: 'DraftKings' },
  details: 'BUF -16.5',
  overUnder: 44.5,
  spread: -16.5,
  awayTeamOdds: { favorite: false, underdog: true },
  homeTeamOdds: { favorite: true, underdog: false },
  moneyline: {
    home: { close: { odds: '-1640' }, open: { odds: '-600' } },
    away: { close: { odds: '+920' }, open: { odds: '+440' } },
  },
  pointSpread: {
    home: { close: { line: '-16.5', odds: '-107' }, open: { line: '-11.5', odds: '-110' } },
    away: { close: { line: '+16.5', odds: '-112' }, open: { line: '+11.5', odds: '-110' } },
  },
  total: {
    over: { close: { line: 'o44.5', odds: '-114' }, open: { line: 'o47.5', odds: '-110' } },
    under: { close: { line: 'u44.5', odds: '-105' }, open: { line: 'u47.5', odds: '-110' } },
  },
};

function event({ state = 'pre', completed = false, homeScore = '0', awayScore = '0', odds = [NEW_ODDS], extra = {} } = {}) {
  return {
    id: '401873070',
    date: '2026-11-22T18:00Z',
    week: { number: 11 },
    season: { year: 2026, type: 2 },
    links: [{ rel: ['summary', 'desktop', 'event'], href: 'https://www.espn.com/nfl/game/_/gameId/401873070/dolphins-bills' }],
    competitions: [{
      neutralSite: false,
      venue: { fullName: 'Highmark Stadium', address: { city: 'Orchard Park' }, indoor: false },
      broadcasts: [{ market: 'national', names: ['CBS'] }],
      status: { period: 0, displayClock: '0:00', type: { state, completed, shortDetail: '11/22 - 1:00 PM EST', description: 'Scheduled' } },
      odds,
      competitors: [
        { homeAway: 'home', score: homeScore, team: { id: '2', abbreviation: 'BUF', displayName: 'Buffalo Bills' }, records: [{ name: 'overall', type: 'total', summary: '8-1' }] },
        { homeAway: 'away', score: awayScore, team: { id: '15', abbreviation: 'MIA', displayName: 'Miami Dolphins' }, records: [{ name: 'overall', type: 'total', summary: '2-8' }] },
      ],
      ...extra,
    }],
  };
}

describe('parseEspnOdds', () => {
  it('reads the nested open/close shape as a home line', () => {
    const o = parseEspnOdds(NEW_ODDS, { homeAbbrev: 'BUF', awayAbbrev: 'MIA' });
    expect(o.spreadHome).toBe(-16.5);
    expect(o.openSpreadHome).toBe(-11.5);
    expect(o.total).toBe(44.5);
    expect(o.openTotal).toBe(47.5);
    expect(o.moneyline).toEqual({ home: -1640, away: 920 });
    expect(o.provider).toBe('DraftKings');
  });

  it('reads the legacy shape and signs the spread from the favourite flags', () => {
    const awayFav = parseEspnOdds({
      spread: 3.5, overUnder: 41,
      homeTeamOdds: { favorite: false, moneyLine: 150 },
      awayTeamOdds: { favorite: true, moneyLine: -175 },
    }, { homeAbbrev: 'LV', awayAbbrev: 'KC' });
    expect(awayFav.spreadHome).toBe(3.5);
    expect(awayFav.moneyline).toEqual({ home: 150, away: -175 });

    const homeFav = parseEspnOdds({ spread: 3.5, homeTeamOdds: { favorite: true }, awayTeamOdds: { favorite: false } });
    expect(homeFav.spreadHome).toBe(-3.5);
  });

  it('falls back to the details string, then gives up rather than guess', () => {
    expect(parseEspnOdds({ spread: 3, details: 'KC -3' }, { homeAbbrev: 'LV', awayAbbrev: 'KC' }).spreadHome).toBe(3);
    expect(parseEspnOdds({ spread: 3, details: 'LV -3' }, { homeAbbrev: 'LV', awayAbbrev: 'KC' }).spreadHome).toBe(-3);
    expect(parseEspnOdds({ spread: 3 }, { homeAbbrev: 'LV', awayAbbrev: 'KC' }).spreadHome).toBeNull();
    expect(parseEspnOdds(null).spreadHome).toBeNull();
  });

  it('treats EVEN as +100', () => {
    const o = parseEspnOdds({ moneyline: { home: { close: { odds: 'EVEN' } }, away: { close: { odds: '-120' } } } });
    expect(o.moneyline).toEqual({ home: 100, away: -120 });
  });
});

describe('normalizeEvent', () => {
  it('normalizes a scheduled game with slugs, week, records and market', () => {
    const g = normalizeEvent(event());
    expect(g.gameId).toBe('401873070');
    expect(g.sport).toBe('nfl');
    expect(g.status).toBe('upcoming');
    expect(g.week).toBe(11);
    expect(g.teams.home).toMatchObject({ slug: 'bills', abbrev: 'BUF', record: '8-1' });
    expect(g.teams.away).toMatchObject({ slug: 'dolphins', abbrev: 'MIA', record: '2-8' });
    expect(g.teams.home.logo).toContain('/nfl/500/buf.png');
    expect(g.market).toMatchObject({ pregameSpread: -16.5, pregameTotal: 44.5, openSpread: -11.5, openTotal: 47.5 });
    expect(g.betting).toEqual({ spreadDisplay: 'BUF -16.5', totalDisplay: 'O/U 44.5' });
    expect(g.broadcast.network).toBe('CBS');
    expect(g.links.gamecastUrl).toContain('401873070');
  });

  it('marks finals and carries the score', () => {
    const g = normalizeEvent(event({ state: 'post', completed: true, homeScore: '31', awayScore: '10', odds: [] }));
    expect(g.status).toBe('final');
    expect(g.gameState.isFinal).toBe(true);
    expect(g.teams.home.score).toBe(31);
    expect(g.teams.away.score).toBe(10);
    expect(g.market.pregameSpread).toBeNull();
  });

  it('does not treat a postponed game as final', () => {
    const g = normalizeEvent(event({ state: 'post', completed: false }));
    expect(g.status).toBe('postponed');
    expect(g.gameState.isFinal).toBe(false);
  });

  it('reads the live situation: quarter, clock, possession and red zone', () => {
    const ev = event({ state: 'in', homeScore: '14', awayScore: '10', extra: { situation: { possession: '15', downDistanceText: '2nd & 7 at BUF 18', isRedZone: true } } });
    ev.competitions[0].status = { period: 3, displayClock: '8:42', type: { state: 'in', completed: false, shortDetail: '8:42 - 3rd', description: 'In Progress' } };
    const g = normalizeEvent(ev);
    expect(g.status).toBe('live');
    expect(g.gameState).toMatchObject({ periodLabel: 'Q3 8:42', possession: 'away', isRedZone: true, downDistance: '2nd & 7 at BUF 18' });
  });

  it('returns null for an event with no competition', () => {
    expect(normalizeEvent({ id: '1' })).toBeNull();
    expect(normalizeEvent(null)).toBeNull();
  });
});

describe('consensus odds', () => {
  const oddsEvent = {
    home_team: 'Buffalo Bills',
    away_team: 'Miami Dolphins',
    commence_time: '2026-11-22T18:00:00Z',
    bookmakers: [
      { markets: [
        { key: 'spreads', outcomes: [{ name: 'Buffalo Bills', point: -16.5 }, { name: 'Miami Dolphins', point: 16.5 }] },
        { key: 'totals', outcomes: [{ name: 'Over', point: 44.5 }, { name: 'Under', point: 44.5 }] },
        { key: 'h2h', outcomes: [{ name: 'Buffalo Bills', price: -1600 }, { name: 'Miami Dolphins', price: 900 }] },
      ] },
      { markets: [
        { key: 'spreads', outcomes: [{ name: 'Miami Dolphins', point: 17 }, { name: 'Buffalo Bills', point: -17 }] },
        { key: 'totals', outcomes: [{ name: 'Over', point: 45 }] },
        { key: 'h2h', outcomes: [{ name: 'Miami Dolphins', price: 950 }, { name: 'Buffalo Bills', price: -1800 }] },
      ] },
      { markets: [
        { key: 'spreads', outcomes: [{ name: 'Buffalo Bills', point: -16.5 }] },
      ] },
    ],
  };

  it('takes the median across books for each market, by team name not position', () => {
    const p = parseOddsEvent(oddsEvent);
    expect(p).toMatchObject({ homeSlug: 'bills', awaySlug: 'dolphins', spreadHome: -16.5, total: 45, booksCount: 3 });
    expect(p.moneyline.home).toBeLessThan(-1600);
    expect(p.moneyline.home).toBeGreaterThan(-1800);
    expect(p.moneyline.away).toBeGreaterThan(900);
    expect(parseOddsEvent({ home_team: 'Springfield Atoms', away_team: 'Miami Dolphins' })).toBeNull();
  });

  it('merges onto the matching game and keeps the ESPN opening line', () => {
    const [g] = mergeOdds([normalizeEvent(event())], [parseOddsEvent(oddsEvent)]);
    expect(g.market).toMatchObject({ pregameSpread: -16.5, pregameTotal: 45, booksCount: 3, source: 'consensus', openSpread: -11.5 });
    expect(g.betting.totalDisplay).toBe('O/U 45');
  });

  it('will not price this week from a rematch weeks away', () => {
    const later = { ...parseOddsEvent(oddsEvent), commenceTime: '2026-12-27T18:00:00Z', spreadHome: -3 };
    const [g] = mergeOdds([normalizeEvent(event())], [later]);
    expect(g.market.pregameSpread).toBe(-16.5);
    expect(g.market.source).toBe('espn');
  });
});

describe('rankLiveGames', () => {
  it('scores every game, writes an insight, and honours the sort mode', () => {
    const early = normalizeEvent(event());
    const late = { ...normalizeEvent(event()), gameId: 'late', startTime: '2026-11-23T01:20Z' };
    const ranked = rankLiveGames([late, early], 'startTime');
    expect(ranked.map((g) => g.gameId)).toEqual(['401873070', 'late']);
    for (const g of ranked) {
      expect(g.signals.importanceScore).toBeGreaterThanOrEqual(0);
      expect(g.signals.importanceScore).toBeLessThanOrEqual(100);
      expect(typeof g.insight.headline).toBe('string');
    }
  });
});
