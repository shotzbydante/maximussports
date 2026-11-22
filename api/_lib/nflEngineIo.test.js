import { describe, it, expect } from 'vitest';
import { summarizeHours, parseGoogleHours, parseNwsPeriods } from './nflWeather.js';
import { resolvePicks, dedupeLatestPerMarket } from './nflPicksStore.js';
import { picksToLock } from './nflPicksBuilder.js';
import { buildDecision } from '../cron/nfl/build-picks.js';
import { seasonForDate, nflverseWeek, buildModelFromRows } from './nflModelData.js';
import { attachEngine } from './nflSlate.js';
import { parseOddsEvent } from '../nfl/live/_odds.js';
import { isGameIndoors, getNflVenue, NFL_VENUES } from '../../src/sports/nfl/venues.js';
import { NFL_TEAMS } from '../../src/sports/nfl/teams.js';
import { league, game, KC, LV } from '../../src/features/nfl/picks/v2/fixtures.js';

const HOUR = 3_600_000;

describe('weather parsing', () => {
  const kickoff = Date.parse('2026-11-22T18:00:00Z');

  it('converts Google’s metric units and summarises the game window', () => {
    const hours = parseGoogleHours({ forecastHours: [17, 18, 19, 20, 21, 22].map((h, i) => ({
      interval: { startTime: `2026-11-22T${h}:00:00Z` },
      temperature: { degrees: 0, unit: 'CELSIUS' },
      wind: { speed: { value: 20 + i * 4, unit: 'KILOMETERS_PER_HOUR' }, gust: { value: 50, unit: 'KILOMETERS_PER_HOUR' } },
      precipitation: { probability: { percent: 10 * i } },
    })) });
    const s = summarizeHours(hours, kickoff, kickoff - 20 * HOUR);
    expect(s.tempF).toBe(32);
    expect(s.windMph).toBeCloseTo(36 * 0.621371, 1);      // peak sustained wind during the game: 21:00
    expect(s.gustMph).toBeCloseTo(31.1, 1);
    expect(s.precipPct).toBe(40);
    expect(s.hoursOut).toBe(20);
    expect(s.hoursCovered).toBe(4);
  });
  it('accepts imperial values without converting twice', () => {
    const [h] = parseGoogleHours({ forecastHours: [{ interval: { startTime: '2026-11-22T18:00:00Z' }, temperature: { degrees: 40, unit: 'FAHRENHEIT' }, wind: { speed: { value: 12, unit: 'MILES_PER_HOUR' } } }] });
    expect(h).toMatchObject({ tempF: 40, windMph: 12, gustMph: null });
  });
  it('reads the National Weather Service’s text wind ranges', () => {
    const hours = parseNwsPeriods({ properties: { periods: [
      { startTime: '2026-11-22T13:00:00-05:00', temperature: 38, temperatureUnit: 'F', windSpeed: '10 to 15 mph', probabilityOfPrecipitation: { value: 20 } },
      { startTime: '2026-11-22T14:00:00-05:00', temperature: 36, temperatureUnit: 'F', windSpeed: '18 mph', windGust: '30 mph', probabilityOfPrecipitation: { value: null } },
    ] } });
    expect(hours[0]).toMatchObject({ tempF: 38, windMph: 15, precipPct: 20 });
    expect(hours[1]).toMatchObject({ windMph: 18, gustMph: 30, precipPct: null });
    expect(summarizeHours(hours, kickoff).windMph).toBe(18);
  });
  it('returns nothing when no forecast hour covers kickoff', () => {
    expect(summarizeHours([{ startMs: kickoff - 10 * HOUR, tempF: 50, windMph: 5 }], kickoff)).toBeNull();
    expect(summarizeHours([], kickoff)).toBeNull();
    expect(parseGoogleHours(null)).toEqual([]);
    expect(parseNwsPeriods({})).toEqual([]);
  });
});

describe('venues', () => {
  it('has a venue, coordinates and a time zone for every team', () => {
    for (const t of NFL_TEAMS) {
      const v = getNflVenue(t.abbrev);
      expect(v, t.abbrev).toBeTruthy();
      expect(v.lat).toBeGreaterThan(24);
      expect(v.lat).toBeLessThan(49);
      expect(v.lon).toBeLessThan(-66);
      expect(v.lon).toBeGreaterThan(-125);
      expect([0, 1, 2, 3]).toContain(v.tz);
    }
    expect(Object.keys(NFL_VENUES)).toHaveLength(32);
  });
  it('lets ESPN’s per-game roof flag win, then the schedule, then the stadium', () => {
    expect(isGameIndoors({ homeAbbrev: 'DAL', espnIndoor: false })).toBe(false);     // retractable roof, open
    expect(isGameIndoors({ homeAbbrev: 'BUF', espnIndoor: true })).toBe(true);
    expect(isGameIndoors({ homeAbbrev: 'DAL', nflverseRoof: 'closed' })).toBe(true);
    expect(isGameIndoors({ homeAbbrev: 'DAL' })).toBeNull();                         // retractable, nothing known
    expect(isGameIndoors({ homeAbbrev: 'DET' })).toBe(true);
    expect(isGameIndoors({ homeAbbrev: 'GB' })).toBe(false);
    expect(isGameIndoors({ homeAbbrev: 'GB', neutralSite: true })).toBeNull();       // not played at Lambeau
  });
});

describe('odds parsing', () => {
  it('keeps each book’s own line and both prices alongside the consensus', () => {
    const ev = {
      home_team: 'Kansas City Chiefs', away_team: 'Las Vegas Raiders', commence_time: '2026-11-22T18:00:00Z',
      bookmakers: [
        { key: 'draftkings', title: 'DraftKings', last_update: '2026-11-22T12:00:00Z', markets: [
          { key: 'spreads', last_update: '2026-11-22T11:58:00Z', outcomes: [{ name: 'Kansas City Chiefs', point: -3, price: -115 }, { name: 'Las Vegas Raiders', point: 3, price: -105 }] },
          { key: 'totals', outcomes: [{ name: 'Over', point: 44.5, price: -108 }, { name: 'Under', point: 44.5, price: -112 }] },
          { key: 'h2h', outcomes: [{ name: 'Kansas City Chiefs', price: -160 }, { name: 'Las Vegas Raiders', price: 140 }] },
        ] },
        { key: 'fanduel', title: 'FanDuel', markets: [
          { key: 'spreads', outcomes: [{ name: 'Kansas City Chiefs', point: -3.5, price: 100 }, { name: 'Las Vegas Raiders', point: 3.5, price: -120 }] },
        ] },
        { key: 'empty', title: 'Empty', markets: [] },
      ],
    };
    const out = parseOddsEvent(ev);
    expect(out).toMatchObject({ homeSlug: 'chiefs', awaySlug: 'raiders', booksCount: 3, total: 44.5 });
    expect(out.books).toHaveLength(2);
    expect(out.books[0]).toMatchObject({
      key: 'draftkings', title: 'DraftKings',
      spread: { homeLine: -3, homePrice: -115, awayPrice: -105, lastUpdate: '2026-11-22T11:58:00Z' },
      total: { line: 44.5, overPrice: -108, underPrice: -112 },
      h2h: { home: -160, away: 140 },
    });
    expect(out.books[1].spread).toMatchObject({ homeLine: -3.5, homePrice: 100, awayPrice: -120 });
    expect(out.books[1].total).toBeUndefined();
  });
});

describe('which stored pick counts', () => {
  const row = (o) => ({ game_id: 'g1', market_type: 'runline', slate_date: '2026-11-22', tier: 'tier2', created_at: '2026-11-21T10:00:00Z', locked_at: null, ...o });

  it('prefers the first locked recommended pick over everything else', () => {
    const picked = resolvePicks([
      row({ id: 'legacy', created_at: '2026-11-22T17:00:00Z' }),
      row({ id: 'track', tier: 'tracking', locked_at: '2026-11-21T18:00:00Z' }),
      row({ id: 'hero-late', locked_at: '2026-11-22T09:00:00Z' }),
      row({ id: 'hero-first', locked_at: '2026-11-21T12:00:00Z' }),
    ]);
    expect(picked.map((p) => p.id)).toEqual(['hero-first']);
  });
  it('falls back to the locked tracking pick, then to the latest unlocked row', () => {
    expect(resolvePicks([row({ id: 'old' }), row({ id: 'track', tier: 'tracking', locked_at: '2026-11-21T18:00:00Z' })]).map((p) => p.id)).toEqual(['track']);
    expect(resolvePicks([row({ id: 'a', created_at: '2026-11-21T10:00:00Z' }), row({ id: 'b', created_at: '2026-11-22T10:00:00Z' })]).map((p) => p.id)).toEqual(['b']);
  });
  it('keeps markets and games separate', () => {
    const out = resolvePicks([row({ id: '1' }), row({ id: '2', market_type: 'total' }), row({ id: '3', game_id: 'g2' })]);
    expect(out.map((p) => p.id).sort()).toEqual(['1', '2', '3']);
    expect(dedupeLatestPerMarket([row({ id: 'a' }), row({ id: 'b', created_at: '2026-11-22T10:00:00Z' })]).map((p) => p.id)).toEqual(['b']);
  });
});

describe('picksToLock', () => {
  const now = Date.parse('2026-11-21T18:00:00Z');
  const p = (gameId, type, { hoursOut = 20, lock = null } = {}) => ({
    id: `${gameId}-${type}`, gameId, market: { type }, lock,
    matchup: { startTime: new Date(now + hoursOut * HOUR).toISOString() },
  });

  it('locks new recommended picks at once and model leans only inside a day of kickoff', () => {
    const board = {
      heroPicks: [p('g1', 'runline'), p('g2', 'total', { hoursOut: 60 })],
      trackingPicks: [p('g1', 'total'), p('g1', 'moneyline'), p('g2', 'runline', { hoursOut: 60 })],
    };
    const { hero, tracking } = picksToLock(board, [], { now });
    expect(hero.map((x) => x.id)).toEqual(['g1-runline', 'g2-total']);
    expect(tracking.map((x) => x.id)).toEqual(['g1-total', 'g1-moneyline']);
  });
  it('never locks the same market twice, or a lean on a market that has a recommended pick', () => {
    const board = {
      heroPicks: [p('g1', 'runline', { lock: { lockedAt: 'x' } }), p('g3', 'total')],
      trackingPicks: [p('g1', 'total'), p('g3', 'runline')],
    };
    const rows = [
      { game_id: 'g1', market_type: 'runline', tier: 'tier2', locked_at: 'x' },
      { game_id: 'g1', market_type: 'total', tier: 'tracking', locked_at: 'y' },
      { game_id: 'g3', market_type: 'runline', tier: 'tier3', locked_at: 'z' },   // a recommended pick the board no longer shows
    ];
    const { hero, tracking } = picksToLock(board, rows, { now });
    expect(hero.map((x) => x.id)).toEqual(['g3-total']);
    expect(tracking).toEqual([]);
  });
  it('never locks a game that has kicked off', () => {
    const board = { heroPicks: [p('g1', 'runline', { hoursOut: -1 })], trackingPicks: [p('g1', 'total', { hoursOut: -1 })] };
    expect(picksToLock(board, [], { now })).toEqual({ hero: [], tracking: [] });
  });
});

describe('scheduled build decision', () => {
  const now = Date.parse('2026-11-22T17:40:00Z');
  const min = (m) => now + m * 60_000;

  it('builds for the closing line when a game is about to kick off', () => {
    expect(buildDecision({ kickoffs: [min(20)], lastAt: min(-9), now })).toMatchObject({ build: true, reason: 'closing_line' });
    expect(buildDecision({ kickoffs: [min(20)], lastAt: min(-3), now })).toMatchObject({ build: false, reason: 'not_due' });
  });
  it('builds hourly inside the lock window and every six hours outside it', () => {
    expect(buildDecision({ kickoffs: [min(600)], lastAt: min(-61), now })).toMatchObject({ build: true, reason: 'lock_window' });
    expect(buildDecision({ kickoffs: [min(600)], lastAt: min(-30), now }).build).toBe(false);
    expect(buildDecision({ kickoffs: [min(6000)], lastAt: min(-200), now }).build).toBe(false);
    expect(buildDecision({ kickoffs: [min(6000)], lastAt: min(-361), now })).toMatchObject({ build: true, reason: 'idle_refresh' });
  });
  it('builds straight away the first time and never with nothing left to play', () => {
    expect(buildDecision({ kickoffs: [min(600)], lastAt: 0, now }).build).toBe(true);
    expect(buildDecision({ kickoffs: [min(-60)], lastAt: 0, now })).toMatchObject({ build: false, reason: 'no_upcoming_games' });
    expect(buildDecision({ kickoffs: [], lastAt: 0, now }).build).toBe(false);
  });
});

describe('model data helpers', () => {
  it('maps dates and ESPN weeks onto nflverse seasons and weeks', () => {
    expect(seasonForDate(new Date('2026-11-22T00:00:00Z'))).toBe(2026);
    expect(seasonForDate(new Date('2027-01-17T00:00:00Z'))).toBe(2026);
    expect(seasonForDate(new Date('2027-03-01T00:00:00Z'))).toBe(2027);
    expect(nflverseWeek({ seasonType: 2, week: 11 })).toBe(11);
    expect(nflverseWeek({ seasonType: 3, week: 1 })).toBe(19);
    expect(nflverseWeek({ seasonType: 3, week: 5 })).toBe(22);
  });

  const strengths = Object.fromEntries(NFL_TEAMS.map((t, i) => [t.abbrev === 'LAR' ? 'LA' : t.abbrev === 'WSH' ? 'WAS' : t.abbrev, (i % 9) - 4]));
  const rows = league({ strengths, weeks: 6 });

  it('builds a week’s model and indexes the schedule by ESPN game id', () => {
    const upcoming = { id: 'next', espnId: '999', season: 2026, week: 7, home: 'KC', away: 'LV', homeScore: null, awayScore: null, divisional: true };
    const later = { id: 'later', espnId: '1000', season: 2026, week: 8, home: 'KC', away: 'DEN', homeScore: null, awayScore: null, divisional: true };
    const model = buildModelFromRows({ ...rows, games: [...rows.games, upcoming, later], asOf: { season: 2026, week: 7 } });
    expect(model.ok).toBe(true);
    expect(Object.keys(model.ratings.teams)).toHaveLength(32);
    expect(model.schedule['999']).toMatchObject({ home: 'KC', away: 'LV' });
    expect(model.nextDivisional.KC).toBe(true);
    expect(model.lastPlayedWeek).toBe(6);
    expect(model.behind).toBe(0);
  });
  it('reports why it is not usable instead of producing half a model', () => {
    const model = buildModelFromRows({ games: rows.games.slice(0, 4), teamWeeks: [], qbWeeks: [], asOf: { season: 2026, week: 7 } });
    expect(model.ok).toBe(false);
    expect(model.reasons.join(' ')).toMatch(/of 32 teams/);
    expect(model.reasons.join(' ')).toMatch(/no quarterback data/);
  });

  it('attaches an engine block to unfinished games and points the model fields at it', () => {
    const model = buildModelFromRows({ ...rows, asOf: { season: 2026, week: 7 } });
    const live = game('g1', LV, KC);
    const done = { ...game('g2', LV, KC), status: 'final', gameState: { isFinal: true }, model: { fairSpread: 1 } };
    const [a, b] = attachEngine([live, done], { model, weather: {} });
    expect(a.engine.projection).toBeTruthy();
    expect(a.model).toMatchObject({ version: 'v2', fairSpread: a.engine.projection.fairSpreadHome, pregameEdge: a.engine.modelGap.side });
    expect(b.engine).toBeUndefined();
    expect(b.model).toEqual({ fairSpread: 1 });
    const [c] = attachEngine([live], { model: { ok: false, reasons: ['down'] }, weather: {} });
    expect(c.engine.flags.dataGap).toBe(true);
    expect(c.model).toBeUndefined();
  });
});
