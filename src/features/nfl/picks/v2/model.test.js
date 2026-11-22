import { describe, it, expect } from 'vitest';
import { buildRatings, weeksAgo, isBefore, RATING_PARAMS } from './ratings.js';
import { buildQbTable, indexQbWeeks, teamQbMix, qbAdjustment, qbValue, QB_PARAMS } from './qb.js';
import { projectGame, totalEnvironment } from './project.js';
import { buildUnitGrades, unitMismatches } from './units.js';
import { gameSituations, kickoffEtHour, SITUATION_RECORDS } from './situations.js';
import { analyzeGame, resolveStarter, toNflverse, normName } from './engine.js';
import { league, game, books, KC, LV, BUF, SF } from './fixtures.js';

const STRENGTH = { KC: 6, BUF: 4, SF: 2, DET: 0, CHI: -2, LV: -4, NYJ: -6, MIA: 0 };
const data = league({ strengths: STRENGTH, weeks: 8 });
const asOf = { season: 2026, week: 9 };

describe('ratings', () => {
  const ratings = buildRatings({ ...data, asOf });

  it('orders teams by strength and centres on zero', () => {
    expect(ratings.teams.KC.rating).toBeGreaterThan(ratings.teams.DET.rating);
    expect(ratings.teams.DET.rating).toBeGreaterThan(ratings.teams.NYJ.rating);
    const sum = Object.values(ratings.teams).reduce((a, t) => a + t.rating, 0);
    expect(Math.abs(sum)).toBeLessThan(0.5);
    expect(ratings.epaCoverage).toBe(1);
  });
  it('uses only games played before the week being rated', () => {
    const early = buildRatings({ ...data, asOf: { season: 2026, week: 3 } });
    expect(early.games).toBeLessThan(ratings.games);
    expect(Math.abs(early.teams.KC.rating)).toBeLessThan(Math.abs(ratings.teams.KC.rating));
    expect(isBefore({ season: 2026, week: 9 }, asOf)).toBe(false);
    expect(isBefore({ season: 2025, week: 18 }, asOf)).toBe(true);
  });
  it('carries last season as a fading prior instead of starting every team at average', () => {
    const last = league({ season: 2025, strengths: STRENGTH, weeks: 8 });
    const week1 = buildRatings({ games: [...last.games, ...data.games], teamWeeks: [...last.teamWeeks, ...data.teamWeeks], asOf: { season: 2026, week: 1 } });
    expect(week1.teams.KC.rating).toBeGreaterThan(0.3);
    expect(week1.teams.KC.rating).toBeGreaterThan(week1.teams.NYJ.rating + 1);
    expect(week1.teams.KC.games).toBe(0);
    expect(weeksAgo({ season: 2025, week: 18 }, { season: 2026, week: 1 })).toBe(1 + (RATING_PARAMS.seasonSpanWeeks - 18) + RATING_PARAMS.offseasonWeeks);
  });
  it('falls back to points when EPA is missing and says so', () => {
    const noEpa = buildRatings({ games: data.games, teamWeeks: [], asOf });
    expect(noEpa.epaCoverage).toBe(0);
    expect(noEpa.teams.KC.rating).toBeGreaterThan(noEpa.teams.LV.rating);
  });
  it('returns an empty table with no finals', () => {
    expect(buildRatings({ games: [], teamWeeks: [], asOf }).teams).toEqual({});
  });
});

describe('quarterbacks', () => {
  const ratings = buildRatings({ ...data, asOf });
  // LV's starter is hurt in week 6; a backup plays weeks 7 and 8, badly.
  const qbWeeks = data.qbWeeks.map((r) => (r.team === 'LV' && r.week >= 7
    ? { ...r, playerId: 'qb-LV-backup', name: 'LV Backup', epa: r.epa - 6 } : r));
  const table = buildQbTable({ qbWeeks, asOf });
  const qbIndex = indexQbWeeks(qbWeeks);

  it('shrinks a small sample toward replacement level', () => {
    const backup = table.byId.get('qb-LV-backup');
    expect(backup.raw).toBeLessThan(backup.value);         // three bad games are not believed in full
    expect(qbValue(table, 'never-played')).toBe(QB_PARAMS.replacementEpa);
  });
  it('knows who produced the games behind the rating', () => {
    const mix = teamQbMix({ team: 'LV', weights: ratings.weights.LV, qbIndex });
    expect(mix.map((q) => q.id).sort()).toEqual(['qb-LV', 'qb-LV-backup']);
    expect(mix.reduce((a, q) => a + q.share, 0)).toBeCloseTo(1, 6);
  });
  it('is exactly zero for a starter who took every snap', () => {
    const adj = qbAdjustment({ team: 'KC', starterId: 'qb-KC', ratings, table, qbIndex });
    expect(adj.points).toBe(0);
    expect(adj.starterShare).toBe(1);
  });
  it('adds points when the better quarterback returns and removes them for the backup', () => {
    const starterBack = qbAdjustment({ team: 'LV', starterId: 'qb-LV', ratings, table, qbIndex });
    const backupStarts = qbAdjustment({ team: 'LV', starterId: 'qb-LV-backup', ratings, table, qbIndex });
    expect(starterBack.points).toBeGreaterThan(0);
    expect(backupStarts.points).toBeLessThan(0);
    expect(backupStarts.starter.plays).toBeLessThan(starterBack.starter.plays);
    const rookie = qbAdjustment({ team: 'LV', starterId: 'never-played', starterName: 'Rookie', ratings, table, qbIndex });
    expect(rookie).toMatchObject({ lowSample: true, starter: { name: 'Rookie', plays: 0 } });
  });
  it('reports an unknown starter without guessing', () => {
    const adj = qbAdjustment({ team: 'LV', starterId: null, ratings, table, qbIndex });
    expect(adj).toMatchObject({ points: 0, known: false });
  });
});

describe('projection', () => {
  const ratings = buildRatings({ ...data, asOf });
  it('favours the better team and gives the home side its edge', () => {
    const home = projectGame({ home: 'KC', away: 'LV', ratings });
    const road = projectGame({ home: 'LV', away: 'KC', ratings });
    const neutral = projectGame({ home: 'KC', away: 'LV', ratings, neutral: true });
    expect(home.margin).toBeGreaterThan(0);
    expect(road.margin).toBeLessThan(0);
    expect(home.margin + road.margin).toBeCloseTo(2 * RATING_PARAMS.hfa, 0);
    expect(neutral.margin).toBeCloseTo(home.margin - RATING_PARAMS.hfa, 1);
    expect(home.fairSpreadHome).toBeCloseTo(-home.margin, 6);
  });
  it('moves the margin and the total by the quarterback points', () => {
    const base = projectGame({ home: 'KC', away: 'LV', ratings });
    const hurt = projectGame({ home: 'KC', away: 'LV', ratings, qb: { home: -4 } });
    expect(hurt.margin).toBeCloseTo(base.margin - 4, 1);
    expect(hurt.total).toBeCloseTo(base.total - 4, 1);
  });
  it('returns null for a team it has no rating for', () => {
    expect(projectGame({ home: 'KC', away: 'XYZ', ratings })).toBeNull();
  });
  it('adds points under a roof and removes them in wind and deep cold', () => {
    expect(totalEnvironment({ indoor: true }).points).toBeGreaterThan(1);
    expect(totalEnvironment({ indoor: false, wind: 5, temp: 60 }).points).toBeLessThan(0);
    const windy = totalEnvironment({ indoor: false, wind: 22, temp: 40 });
    const calm = totalEnvironment({ indoor: false, wind: 8, temp: 40 });
    expect(windy.points).toBeLessThan(calm.points - 3);
    expect(totalEnvironment({ indoor: false, wind: 8, temp: 10 }).points).toBeLessThan(calm.points);
    expect(totalEnvironment({}).points).toBe(0);
    expect(totalEnvironment({ indoor: false, wind: 80 }).points).toBeGreaterThanOrEqual(-6);
  });
});

describe('unit grades', () => {
  const grades = buildUnitGrades({ teamWeeks: data.teamWeeks, asOf });
  it('grades every unit on a 1 to 99 scale centred on 50', () => {
    const all = Object.values(grades).map((g) => g.passOffense.grade);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...all)).toBeLessThanOrEqual(99);
    expect(grades.KC.passOffense.grade).toBeGreaterThan(grades.NYJ.passOffense.grade);
    expect(grades.KC.passOffense).toMatchObject({ source: 'nflverse', rank: 1 });
  });
  it('lists the lopsided matchups, biggest first', () => {
    const mm = unitMismatches({ home: 'KC', away: 'NYJ', grades });
    expect(mm.length).toBeGreaterThan(0);
    expect(Math.abs(mm[0].gap)).toBeGreaterThanOrEqual(Math.abs(mm[mm.length - 1].gap));
    expect(unitMismatches({ home: 'KC', away: 'NYJ', grades: {} })).toEqual([]);
  });
  it('returns empty grades rather than ranking three teams', () => {
    const few = buildUnitGrades({ teamWeeks: data.teamWeeks.filter((t) => ['KC', 'LV'].includes(t.team)), asOf });
    expect(Object.values(few).every((g) => Object.keys(g).length === 0)).toBe(true);
  });
});

describe('situations', () => {
  const base = { homeAbbrev: 'BUF', awayAbbrev: 'SF', startTime: '2026-11-22T18:00:00Z', spreadHome: -7 };
  const keys = (ctx) => gameSituations(ctx).tags.map((t) => t.key);

  it('reads the kickoff hour in Eastern time', () => {
    expect(kickoffEtHour('2026-11-22T18:00:00Z')).toBe(13);
    expect(kickoffEtHour('2026-09-13T17:00:00Z')).toBe(13);   // daylight time
    expect(kickoffEtHour('nonsense')).toBeNull();
  });
  it('tags a west-coast team in an early eastern kickoff and says the line prices it', () => {
    const out = gameSituations(base);
    const tag = out.tags.find((t) => t.key === 'bodyClock');
    expect(tag).toMatchObject({ team: 'SF', weight: 0 });
    expect(tag.note).toContain('204-209');
    expect(tag.note).toContain('10:00 AM Pacific');
    expect(out.adjustments).toEqual([]);
    expect(keys({ ...base, startTime: '2026-11-22T21:25:00Z' })).not.toContain('bodyClock');
    expect(keys({ ...base, awayAbbrev: 'MIA' })).not.toContain('bodyClock');
  });
  it('tags division road dogs, byes, short weeks, look-ahead spots and first-year coaches', () => {
    expect(keys({ ...base, awayAbbrev: 'MIA', divisional: true })).toContain('divisionRoadDog');
    expect(keys({ ...base, rest: { home: 14, away: 7 } })).toContain('offBye');
    expect(keys({ ...base, rest: { home: 7, away: 4 } })).toContain('shortWeekRoad');
    expect(keys({ ...base, nextIsDivision: { home: true } })).toContain('lookahead');
    expect(keys({ ...base, coaches: { home: { name: 'New Coach', games: 10 }, away: { name: 'Old Coach', games: 160 } } })).toContain('firstYearCoach');
    expect(keys(base)).toEqual(['bodyClock']);
  });
  it('moves the total only for strong wind, outdoors, inside two days', () => {
    const windy = gameSituations({ ...base, env: { indoor: false, wind: 18, hoursOut: 20 } });
    expect(windy.adjustments).toEqual([{ key: 'windUnder', market: 'total', points: -1.2 }]);
    expect(windy.tags.find((t) => t.key === 'windUnder').note).toContain('312-235');
    expect(gameSituations({ ...base, env: { indoor: false, wind: 18, hoursOut: 80 } }).adjustments).toEqual([]);
    expect(gameSituations({ ...base, env: { indoor: false, wind: 12, hoursOut: 20 } }).adjustments).toEqual([]);
    expect(gameSituations({ ...base, env: { indoor: true, wind: 25, hoursOut: 20 } }).adjustments).toEqual([]);
  });
  it('keeps every published record internally consistent', () => {
    for (const r of Object.values(SITUATION_RECORDS)) {
      expect(r.won + r.lost).toBeGreaterThan(200);
      expect(r.recent.won + r.recent.lost).toBeLessThan(r.won + r.lost);
    }
  });
});

describe('analyzeGame', () => {
  const qbWeeks = data.qbWeeks;
  const ratings = buildRatings({ ...data, asOf });
  const model = {
    ok: true, version: 'v2', asOf, ratings,
    qbTable: buildQbTable({ qbWeeks, asOf }), qbIndex: indexQbWeeks(qbWeeks),
    unitGrades: buildUnitGrades({ teamWeeks: data.teamWeeks, asOf }),
    schedule: { g1: { homeQbId: 'qb-KC', homeQbName: 'KC Starter', awayQbId: 'qb-LV', awayQbName: 'LV Starter', divisional: true, homeRest: 7, awayRest: 7, roof: 'outdoors', homeCoach: 'A', awayCoach: 'B' } },
    nextDivisional: {}, coachGames: { A: 200, B: 5 },
  };

  it('makes the market the fair number and reports the model gap beside it', () => {
    const e = analyzeGame({ game: game('g1', LV, KC, { market: { books: books({}, { spread: -9.5 }) } }), model });
    expect(e.ok).toBe(true);
    expect(e.fair.margin).toBe(e.consensus.fairMargin);
    expect(e.fair.total).toBe(e.consensus.fairTotal);
    expect(e.fair.adjustments).toEqual([]);
    expect(e.consensus.spreadHome).toBe(-9.5);
    expect(e.modelGap.side).toBeCloseTo(e.projection.margin - 9.5, 1);
    expect(e.quarterbacks.home).toMatchObject({ starter: 'KC Starter', uncertain: false, points: 0 });
    expect(e.env.indoor).toBe(false);
    expect(e.situations.map((t) => t.key)).toContain('firstYearCoach');
  });
  it('blends the model in only when the config gives it weight', () => {
    const g = game('g1', LV, KC, { market: { books: books({}, { spread: -3 }) } });
    const off = analyzeGame({ game: g, model });
    const on = analyzeGame({ game: g, model, config: { modelWeight: { side: 0.5, total: 0 } } });
    expect(off.modelGap.side).toBeGreaterThan(2);
    expect(on.fair.margin).toBeCloseTo(off.fair.margin + 0.5 * off.modelGap.side, 1);
    expect(on.fair.homeWin).toBeGreaterThan(off.fair.homeWin);
  });
  it('takes the wind adjustment off the fair total', () => {
    const e = analyzeGame({ game: game('g1', LV, KC), model, weather: { tempF: 35, windMph: 20, hoursOut: 12, source: 'nws' } });
    expect(e.fair.total).toBeCloseTo(e.consensus.fairTotal - 1.2, 2);
    expect(e.fair.adjustments).toEqual([{ key: 'windUnder', market: 'total', points: -1.2 }]);
  });
  it('flags a quarterback in doubt and a missing injury report', () => {
    const doubt = analyzeGame({ game: game('g1', LV, KC, { injuries: { ok: true, away: { quarterbackStatuses: [{ name: 'LV Starter', status: 'questionable' }] }, home: { quarterbackStatuses: [] } } }), model });
    expect(doubt.flags.qbUncertain).toBe(true);
    expect(doubt.quarterbacks.away.reason).toContain('questionable');
    const noReport = analyzeGame({ game: game('g1', LV, KC, { injuries: undefined }), model });
    expect(noReport.flags).toMatchObject({ injuryFeedDown: true, qbUncertain: true });
  });
  it('still prices the market when the model is unavailable', () => {
    const e = analyzeGame({ game: game('g1', LV, KC), model: { ok: false, reasons: ['nflverse unavailable'] } });
    expect(e.projection).toBeNull();
    expect(e.flags.dataGap).toBe(true);
    expect(e.fair.margin).toBe(e.consensus.fairMargin);
    expect(e.notes).toEqual(['nflverse unavailable']);
  });
  it('flags a thin market', () => {
    const e = analyzeGame({ game: game('g1', LV, KC, { market: { books: books().slice(0, 2) } }), model });
    expect(e.flags.thinMarket).toBe(true);
    expect(e.ok).toBe(false);
  });
});

describe('resolveStarter', () => {
  const mix = [{ id: 'a', name: 'Alpha One', share: 0.8 }, { id: 'b', name: 'Bravo Two', share: 0.2 }];
  it('trusts the schedule when the report agrees', () => {
    expect(resolveStarter({ team: 'KC', scheduled: { id: 'a', name: 'Alpha One' }, feedOk: true, mix })).toMatchObject({ id: 'a', uncertain: false, source: 'schedule' });
  });
  it('moves to the next man up when the listed starter is out, and marks it uncertain', () => {
    const r = resolveStarter({ team: 'KC', scheduled: { id: 'a', name: 'Alpha One' }, statuses: [{ name: 'Alpha One', status: 'out' }], feedOk: true, mix });
    expect(r).toMatchObject({ id: 'b', uncertain: true, source: 'recent' });
    expect(r.reason).toContain('Alpha One is listed out');
  });
  it('does not hold a game because a backup is hurt', () => {
    expect(resolveStarter({ team: 'KC', scheduled: { id: 'a', name: 'Alpha One' }, statuses: [{ name: 'Bravo Two', status: 'out' }], feedOk: true, mix }).uncertain).toBe(false);
  });
  it('matches names across suffixes and punctuation', () => {
    expect(normName('A.J. Smith Jr.')).toBe(normName('AJ Smith'));
    expect(toNflverse('LAR')).toBe('LA');
    expect(toNflverse('WSH')).toBe('WAS');
    expect(toNflverse('KC')).toBe('KC');
  });
  it('is uncertain with no quarterback on file at all', () => {
    expect(resolveStarter({ team: 'KC', scheduled: null, feedOk: true, mix: [] })).toMatchObject({ id: null, uncertain: true });
  });
});

// Referenced so the fixture teams stay exported for other suites.
void [BUF, SF];
