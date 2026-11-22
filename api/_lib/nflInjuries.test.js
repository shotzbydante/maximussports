import { describe, it, expect } from 'vitest';
import {
  parseInjuries, summarizeTeamInjuries, normalizeInjuryStatus, attachInjuries,
} from './nflInjuries.js';

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

  it('leaves finished games alone and gives a team with nobody listed an empty summary', () => {
    const [done] = attachInjuries([game({ status: 'final', gameState: { isFinal: true } })], injuries);
    expect(done.injuries).toBeUndefined();
    // "No injuries" and "no report" must not look the same: the engine holds picks on a missing report.
    const [other] = attachInjuries([game({ teams: { away: { slug: 'jets' }, home: { slug: 'bills' } } })], injuries);
    expect(other.injuries.ok).toBe(true);
    expect(other.injuries.away).toMatchObject({ out: 0, total: 0, quarterbackStatuses: [] });
  });

  it('lists every quarterback with a raw status for the picks engine', () => {
    const summary = summarizeTeamInjuries([
      { name: 'Starter', position: 'QB', status: 'questionable', statusLabel: 'Questionable' },
      { name: 'Backup', position: 'QB', status: 'ir', statusLabel: 'Injured reserve' },
      { name: 'Guard', position: 'G', status: 'out', statusLabel: 'Out' },
    ]);
    expect(summary.quarterbackStatuses).toEqual([{ name: 'Starter', status: 'questionable' }, { name: 'Backup', status: 'ir' }]);
    expect(summary.quarterbacks).toEqual([]);
  });

  it('returns the games untouched when there is no report', () => {
    const games = [game()];
    expect(attachInjuries(games, null)).toBe(games);
    expect(attachInjuries(games, { teams: {} })).toBe(games);
  });
});
