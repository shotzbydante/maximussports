import { describe, it, expect } from 'vitest';
import { parseStandings } from './nflStandings.js';
import { dedupeLatestPerMarket } from './nflPicksStore.js';
import { splitBoardBySlateDate } from './nflPicksBuilder.js';
import { attachModel } from './nflSlate.js';
import { simulateNflSeason } from '../../src/features/nfl/season/simulateSeason.js';
import { NFL_TEAMS } from '../../src/sports/nfl/teams.js';

function entry(id, abbr, { w, l, t = 0, pf, pa, seed, streak = 'W1' }) {
  return {
    team: { id, abbreviation: abbr },
    stats: [
      { name: 'wins', type: 'wins', value: w },
      { name: 'losses', type: 'losses', value: l },
      { name: 'ties', type: 'ties', value: t },
      { name: 'pointsFor', type: 'pointsfor', value: pf },
      { name: 'pointsAgainst', type: 'pointsagainst', value: pa },
      { name: 'playoffSeed', type: 'playoffseed', value: seed },
      { name: 'streak', type: 'streak', value: 1, displayValue: streak },
      { name: 'overall', type: 'total', summary: `${w}-${l}`, displayValue: `${w}-${l}` },
      { name: 'Home', type: 'home', summary: '3-1', displayValue: '3-1' },
      { name: 'Road', type: 'road', summary: '5-0', displayValue: '5-0' },
      { name: 'vs. Div.', type: 'vsdiv', displayValue: '1-1' },
    ],
  };
}

describe('parseStandings', () => {
  const data = {
    children: [
      {
        abbreviation: 'AFC', name: 'American Football Conference',
        standings: { season: 2026, entries: [
          entry('2', 'BUF', { w: 8, l: 1, pf: 287, pa: 199, seed: 1, streak: 'W5' }),
          entry('15', 'MIA', { w: 2, l: 8, pf: 170, pa: 260, seed: 14, streak: 'L3' }),
          entry('17', 'NE', { w: 5, l: 4, t: 1, pf: 210, pa: 205, seed: 7 }),
          entry('20', 'NYJ', { w: 5, l: 5, pf: 190, pa: 200, seed: 9 }),
        ] },
      },
      { abbreviation: 'NFC', standings: { entries: [entry('21', 'PHI', { w: 7, l: 3, pf: 250, pa: 200, seed: 2 })] } },
    ],
  };
  const { teams, season } = parseStandings(data);

  it('maps ESPN entries to slugs with record, scoring, seed and splits', () => {
    expect(season).toBe(2026);
    expect(teams.bills).toMatchObject({
      record: '8-1', wins: 8, losses: 1, pct: 0.889, pointsFor: 287, pointsAgainst: 199, pointDiff: 88,
      playoffSeed: 1, streak: 'W5', conference: 'AFC', division: 'AFC East', homeRecord: '3-1', roadRecord: '5-0',
    });
    expect(teams.eagles.conference).toBe('NFC');
  });

  it('counts a tie as half a win and shows it in the record', () => {
    expect(teams.patriots.record).toBe('5-4-1');
    expect(teams.patriots.pct).toBe(0.55);
  });

  it('ranks each division and writes the standing label', () => {
    expect(teams.bills.standing).toBe('1st in AFC East');
    expect(teams.patriots.divisionRank).toBe(2);
    expect(teams.jets.divisionRank).toBe(3);
    expect(teams.dolphins.standing).toBe('4th in AFC East');
  });

  it('returns all 32 teams even when the feed is missing some', () => {
    expect(Object.keys(teams)).toHaveLength(32);
    expect(teams.chiefs).toMatchObject({ record: '0-0', games: 0, playoffSeed: null });
    expect(Object.keys(parseStandings(null).teams)).toHaveLength(32);
  });
});

describe('dedupeLatestPerMarket', () => {
  it('keeps one row per game and market: the last one written before kickoff', () => {
    const rows = [
      { id: 1, slate_date: '2026-11-22', game_id: 'g1', market_type: 'runline', selection_side: 'home', line_value: -3, created_at: '2026-11-21T15:00:00Z' },
      // The line moved and the model changed sides.
      { id: 2, slate_date: '2026-11-22', game_id: 'g1', market_type: 'runline', selection_side: 'away', line_value: 4.5, created_at: '2026-11-22T14:00:00Z' },
      { id: 3, slate_date: '2026-11-22', game_id: 'g1', market_type: 'total', selection_side: 'over', line_value: 44, created_at: '2026-11-21T15:00:00Z' },
      { id: 4, slate_date: '2026-11-22', game_id: 'g2', market_type: 'runline', selection_side: 'home', line_value: -7, created_at: '2026-11-21T15:00:00Z' },
    ];
    const kept = dedupeLatestPerMarket(rows).map((r) => r.id).sort();
    expect(kept).toEqual([2, 3, 4]);
    expect(dedupeLatestPerMarket([])).toEqual([]);
  });
});

describe('splitBoardBySlateDate', () => {
  const now = Date.parse('2026-11-21T20:00:00Z'); // Saturday 3pm ET
  const pick = (id, startTime) => ({ id, matchup: { startTime } });
  const board = {
    week: 11, modelVersion: 'm', configVersion: 'c', generatedAt: new Date(now).toISOString(), meta: {},
    tiers: { tier1: [], tier2: [], tier3: [] },
    fullSlatePicks: [
      pick('sun-early', '2026-11-22T18:00:00Z'),
      // Sunday night kicks off after midnight UTC but is still Sunday in ET.
      pick('sun-night', '2026-11-23T01:20:00Z'),
      pick('mon-night', '2026-11-24T01:15:00Z'),
      pick('already-started', '2026-11-21T18:00:00Z'),
    ],
  };
  board.tiers.tier1 = [board.fullSlatePicks[0]];
  board.tiers.tier2 = [board.fullSlatePicks[2]];

  it('groups picks by ET kickoff date and only inside the persist window', () => {
    const groups = splitBoardBySlateDate(board, { now, windowHours: 36 });
    expect(groups.map((g) => g.date)).toEqual(['2026-11-22']);
    expect(groups[0].payload.fullSlatePicks.map((p) => p.id)).toEqual(['sun-early', 'sun-night']);
    expect(groups[0].payload).toMatchObject({ sport: 'nfl', date: '2026-11-22', week: 11 });
    expect(groups[0].payload.tiers.tier1.map((p) => p.id)).toEqual(['sun-early']);
    expect(groups[0].payload.tiers.tier2).toEqual([]);
  });

  it('adds Monday night once it is inside the window, and never a game that has started', () => {
    const groups = splitBoardBySlateDate(board, { now, windowHours: 60 });
    expect(groups.map((g) => g.date).sort()).toEqual(['2026-11-22', '2026-11-23']);
    const all = groups.flatMap((g) => g.payload.fullSlatePicks.map((p) => p.id));
    expect(all).not.toContain('already-started');
  });

  it('returns nothing for an empty board', () => {
    expect(splitBoardBySlateDate({ fullSlatePicks: [] }, { now })).toEqual([]);
    expect(splitBoardBySlateDate(null, { now })).toEqual([]);
  });
});

describe('attachModel', () => {
  it('adds the projection and leaves games untouched when ratings are missing', () => {
    const games = [{
      gameId: '1', teams: { home: { slug: 'chiefs' }, away: { slug: 'raiders' } },
      market: { pregameSpread: -6.5, pregameTotal: 44, moneyline: { home: -280, away: 230 } }, model: {}, venue: {},
    }];
    const ratings = { leaguePpg: 22, teams: { chiefs: { rating: 6, offense: 3, defense: 3 }, raiders: { rating: -4, offense: -2, defense: -2 } } };
    const [g] = attachModel(games, ratings);
    expect(g.model.fairSpread).toBeCloseTo(-11.7, 1);
    expect(g.model.homeWinProb).toBeGreaterThan(0.5);
    expect(g.model.pregameEdge).toBeCloseTo(5.2, 1);
    expect(attachModel(games, null)).toBe(games);
    expect(attachModel(games, { teams: {} })).toBe(games);
  });
});

describe('simulateNflSeason', () => {
  const standings = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, { wins: 5, losses: 5, ties: 0, pointsFor: 220, pointsAgainst: 220 }]));
  standings.chiefs = { wins: 9, losses: 1, ties: 0, pointsFor: 300, pointsAgainst: 180 };
  standings.raiders = { wins: 1, losses: 9, ties: 0, pointsFor: 160, pointsAgainst: 290 };
  const ratings = { teams: Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, { rating: 0 }])) };
  ratings.teams.chiefs = { rating: 8 };
  ratings.teams.raiders = { rating: -8 };

  // Seven more weeks of 16 games: rotate the pairing each week.
  const slugs = NFL_TEAMS.map((t) => t.slug);
  const remaining = [];
  for (let week = 0; week < 7; week++) {
    for (let i = 0; i < 16; i++) {
      remaining.push({ homeSlug: slugs[i], awaySlug: slugs[16 + ((i + week) % 16)] });
    }
  }

  const sim = simulateNflSeason({ standings, ratings, remaining, sims: 1500, seed: 202611 });

  it('projects wins as wins to date plus expected wins left', () => {
    expect(sim.gamesRemaining).toBe(112);
    expect(sim.teams.chiefs.gamesRemaining).toBe(7);
    expect(sim.teams.chiefs.projectedWins).toBeGreaterThan(13);
    expect(sim.teams.chiefs.projectedWins).toBeLessThanOrEqual(16);
    expect(sim.teams.raiders.projectedWins).toBeLessThan(4);
    const total = Object.values(sim.teams).reduce((a, t) => a + t.projectedWins, 0);
    // Every game produces exactly one win: 160 played + 112 to come.
    expect(total).toBeCloseTo(160 + 112, 0);
  });

  it('fills the bracket exactly: 14 playoff teams, 8 division winners, 2 top seeds', () => {
    const sum = (key) => Object.values(sim.teams).reduce((a, t) => a + t[key], 0);
    expect(sum('playoffPct')).toBeCloseTo(14, 1);
    expect(sum('divisionPct')).toBeCloseTo(8, 1);
    expect(sum('topSeedPct')).toBeCloseTo(2, 1);
  });

  it('separates the strong from the weak and is reproducible for a given seed', () => {
    expect(sim.teams.chiefs.playoffPct).toBeGreaterThan(0.97);
    expect(sim.teams.raiders.playoffPct).toBeLessThan(0.02);
    expect(sim.teams.chiefs.divisionPct).toBeGreaterThan(sim.teams.broncos.divisionPct);
    const again = simulateNflSeason({ standings, ratings, remaining, sims: 1500, seed: 202611 });
    expect(again.teams.bills.playoffPct).toBe(sim.teams.bills.playoffPct);
  });

  it('measures record against scoring margin', () => {
    expect(sim.teams.bills.pythagoreanPct).toBeCloseTo(0.5, 3);
    expect(sim.teams.bills.luck).toBeCloseTo(0, 1);
    // 9-1 on a +120 margin: slightly ahead of the ~77% the scoring supports.
    expect(sim.teams.chiefs.luck).toBeGreaterThan(0);
  });

  it('with no games left, reports the standings as they are', () => {
    const done = simulateNflSeason({ standings, ratings, remaining: [], sims: 50, seed: 1 });
    expect(done.teams.chiefs.projectedWins).toBe(9);
    expect(done.gamesRemaining).toBe(0);
  });
});
