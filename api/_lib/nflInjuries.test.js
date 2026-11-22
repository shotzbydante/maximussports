import { describe, it, expect } from 'vitest';
import {
  parseInjuries, summarizeTeamInjuries, normalizeInjuryStatus, attachInjuries,
} from './nflInjuries.js';
import { buildNflPicksV2 } from '../../src/features/nfl/picks/buildNflPicksV2.js';

// Shaped like ESPN's /sports/football/nfl/injuries response (Nov 2026).
const item = (id, name, pos, typeName, status, details) => ({
  id: String(id),
  status,
  date: '2026-11-21T01:38Z',
  shortComment: `${name} update.`,
  athlete: { displayName: name, position: { abbreviation: pos } },
  type: { name: typeName, description: status.toLowerCase() },
  ...(details ? { details } : {}),
});

const FEED = {
  injuries: [
    {
      id: '12', displayName: 'Kansas City Chiefs',
      injuries: [
        item(1, 'Backup Guard', 'G', 'INJURY_STATUS_QUESTIONABLE', 'Questionable', { type: 'Ankle' }),
        item(2, 'Starting Passer', 'QB', 'INJURY_STATUS_OUT', 'Out', { type: 'Shoulder', returnDate: '2026-11-29' }),
        item(3, 'Healthy Center', 'C', 'INJURY_STATUS_ACTIVE', 'Active'),
        item(4, 'Reserve Passer', 'QB', 'INJURY_STATUS_IR', 'Injured Reserve', { type: 'Knee' }),
        item(5, 'Slot Receiver', 'WR', 'INJURY_STATUS_DOUBTFUL', 'Doubtful', { type: 'Not Specified' }),
      ],
    },
    { id: '8', displayName: 'Detroit Lions', injuries: [item(6, 'Edge Rusher', 'DE', 'INJURY_STATUS_OUT', 'Out', { type: 'Hamstring' })] },
    { id: '999', displayName: 'Not A Team', injuries: [item(7, 'Nobody', 'K', 'INJURY_STATUS_OUT', 'Out')] },
  ],
};

describe('parseInjuries', () => {
  const { teams } = parseInjuries(FEED);

  it('keys teams by slug and ignores unknown teams', () => {
    expect(Object.keys(teams).sort()).toEqual(['chiefs', 'lions']);
  });

  it('drops players with no designation', () => {
    expect(teams.chiefs.map((p) => p.name)).not.toContain('Healthy Center');
    expect(teams.chiefs).toHaveLength(4);
  });

  it('sorts most severe first', () => {
    expect(teams.chiefs.map((p) => p.status)).toEqual(['out', 'doubtful', 'ir', 'questionable']);
  });

  it('keeps the body part and hides "Not Specified"', () => {
    const byName = Object.fromEntries(teams.chiefs.map((p) => [p.name, p]));
    expect(byName['Starting Passer'].injury).toBe('Shoulder');
    expect(byName['Starting Passer'].statusLabel).toBe('Out');
    expect(byName['Slot Receiver'].injury).toBeNull();
    expect(byName['Reserve Passer'].statusLabel).toBe('Injured reserve');
  });

  it('survives an empty or missing payload', () => {
    expect(parseInjuries(null)).toEqual({ teams: {} });
    expect(parseInjuries({ injuries: [] })).toEqual({ teams: {} });
  });
});

describe('normalizeInjuryStatus', () => {
  it('falls back to the status text when the type is missing', () => {
    expect(normalizeInjuryStatus({ status: 'Questionable' })).toBe('questionable');
    expect(normalizeInjuryStatus({ status: 'Active' })).toBeNull();
    expect(normalizeInjuryStatus({ status: 'Suspension' })).toBe('other');
  });
});

describe('summarizeTeamInjuries', () => {
  const { teams } = parseInjuries(FEED);

  it('counts by status', () => {
    expect(summarizeTeamInjuries(teams.chiefs)).toMatchObject({ out: 1, doubtful: 1, questionable: 1, ir: 1, total: 4 });
  });

  it('flags a quarterback who is out or doubtful, but not one on injured reserve', () => {
    expect(summarizeTeamInjuries(teams.chiefs).quarterbacks).toEqual([{ name: 'Starting Passer', status: 'Out' }]);
    expect(summarizeTeamInjuries(teams.lions).quarterbacks).toEqual([]);
  });
});

describe('attachInjuries', () => {
  const injuries = parseInjuries(FEED);
  const game = (over = {}) => ({
    gameId: 'g1', status: 'upcoming', gameState: {},
    teams: { away: { slug: 'chiefs' }, home: { slug: 'lions' } },
    ...over,
  });

  it('adds a summary for each side', () => {
    const [g] = attachInjuries([game()], injuries);
    expect(g.injuries.away.out).toBe(1);
    expect(g.injuries.home.out).toBe(1);
    expect(g.injuries.away.quarterbacks).toHaveLength(1);
  });

  it('leaves finished games and unknown teams alone', () => {
    const [done] = attachInjuries([game({ status: 'final', gameState: { isFinal: true } })], injuries);
    expect(done.injuries).toBeUndefined();
    const [other] = attachInjuries([game({ teams: { away: { slug: 'jets' }, home: { slug: 'bills' } } })], injuries);
    expect(other.injuries).toBeUndefined();
  });

  it('returns the games untouched when there is no report', () => {
    const games = [game()];
    expect(attachInjuries(games, null)).toBe(games);
    expect(attachInjuries(games, { teams: {} })).toBe(games);
  });
});

describe('quarterback flag in the picks builder', () => {
  const rating = (r, off, def) => ({ rating: r, offense: off, defense: def, games: 10, pointsFor: 240, pointsAgainst: 200, formTrend: 0 });
  const ratings = {
    source: 'results', games: 150, leagueAvgPoints: 22.5,
    teams: { chiefs: rating(8, 5, 3), lions: rating(-2, -1, -1) },
  };
  const baseGame = {
    gameId: 'g1', status: 'upcoming', gameState: {}, week: 12, seasonType: 2,
    startTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    teams: {
      away: { slug: 'chiefs', name: 'Kansas City Chiefs', abbrev: 'KC' },
      home: { slug: 'lions', name: 'Detroit Lions', abbrev: 'DET' },
    },
    venue: {},
    market: { pregameSpread: 3, pregameTotal: 45.5, moneyline: { home: 140, away: -160 }, booksCount: 6 },
  };
  const all = (board) => [board.topPick, ...Object.values(board.tiers).flat(), ...(board.fullSlatePicks || [])].filter(Boolean);

  it('holds every pick on the game to tracking and says why', () => {
    const injuries = { away: { quarterbacks: [{ name: 'Starting Passer', status: 'Out' }] }, home: { quarterbacks: [] } };
    const board = buildNflPicksV2({ games: [{ ...baseGame, injuries }], ratings });
    const picks = all(board);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.lowSignalReason).toBe('qb_injury');
      expect(p.betScore.total).toBeLessThanOrEqual(0.5);
      expect(p.rationale.bullets[0]).toContain('KC QB Starting Passer (out)');
    }
    expect(Object.values(board.tiers).flat()).toHaveLength(0);
    expect(board.meta.qbInjuryGames).toBe(1);
  });

  it('does not touch picks when no quarterback is flagged', () => {
    const injuries = { away: { quarterbacks: [], out: 4 }, home: { quarterbacks: [], out: 2 } };
    const withReport = all(buildNflPicksV2({ games: [{ ...baseGame, injuries }], ratings }));
    const without = all(buildNflPicksV2({ games: [baseGame], ratings }));
    expect(withReport.map((p) => [p.id, p.betScore.total])).toEqual(without.map((p) => [p.id, p.betScore.total]));
    expect(withReport.every((p) => p.lowSignalReason !== 'qb_injury')).toBe(true);
  });
});
