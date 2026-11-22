import { describe, it, expect } from 'vitest';
import { decodePlayers, buildTalentLeague, unitPlayers, tierOf, ordinal, talentSentence, TALENT_GROUPS } from './talentView.js';

const P = 'QB||Brock Purdy|92|4|99|94.4|4|;RB|HB|Christian McCaffrey|97|15|95.3|92|6|1;OT|T|Lane Johnson||9||94|6|;CB||Nate Hobbs|76|||76|75|';

function league() {
  const detail = { asOf: '2026-11-22', week: 11, groups: TALENT_GROUPS, teams: {} };
  const units = { teams: {} };
  for (let i = 0; i < 8; i += 1) {
    const k = `T${i}`;
    detail.teams[k] = { g: TALENT_GROUPS.map((_, j) => 70 + i + j), o: 75 + i, d: 85 - i, p: P };
    units.teams[k] = { QB: 70 + i, 'Pass protection': 80, Receivers: 80, 'Run game': 80, 'Pass rush': 80, Coverage: 80, 'Run defense': 80, 'Pass defense': 80, 'Overall talent': 78 + i };
  }
  return buildTalentLeague({ detail, units });
}

describe('decodePlayers', () => {
  it('reads every field and fills the position from the group when blank', () => {
    const [qb, rb, ot, cb] = decodePlayers(P);
    expect(qb).toMatchObject({ group: 'QB', pos: 'QB', name: 'Brock Purdy', madden: 92, pffRank: 4, production: 99, score: 94.4, groupRank: 4, xFactor: false, tier: 'Elite' });
    expect(rb).toMatchObject({ pos: 'HB', xFactor: true });
    expect(ot).toMatchObject({ madden: null, pffRank: 9, production: null, score: 94 });
    expect(cb).toMatchObject({ pffRank: null, tier: 'Average' });
  });
  it('returns nothing for an empty or missing string', () => {
    expect(decodePlayers('')).toEqual([]);
    expect(decodePlayers(undefined)).toEqual([]);
  });
});

describe('buildTalentLeague', () => {
  it('ranks teams, groups and units and names strengths and weaknesses', () => {
    const L = league();
    expect(L.teamCount).toBe(8);
    expect(L.teams.T7.overall).toEqual({ grade: 85, rank: 1 });
    expect(L.teams.T0.overall.rank).toBe(8);
    expect(L.teams.T0.defense.rank).toBe(1);
    expect(L.teams.T7.groups).toHaveLength(11);
    expect(L.teams.T7.groups[0]).toMatchObject({ group: 'QB', rank: 1, side: 'offense' });
    expect(L.teams.T3.strengths).toHaveLength(3);
    expect(L.teams.T3.weaknesses).toHaveLength(3);
    expect(L.averages.units.QB).toBe(73.5);
  });
  it('shares the better rank on a tie', () => {
    const L = league();
    expect(new Set(Object.values(L.teams).map((t) => t.units.find((u) => u.unit === 'Coverage').rank))).toEqual(new Set([1]));
  });
  it('is null without both rows or with too few teams', () => {
    expect(buildTalentLeague({ detail: null, units: { teams: {} } })).toBeNull();
    expect(buildTalentLeague({ detail: { teams: { A: { g: [], p: '' } } }, units: { teams: { A: {} } } })).toBeNull();
  });
});

describe('helpers', () => {
  it('lists the starters behind a unit, best first', () => {
    const t = league().teams.T1;
    expect(unitPlayers(t, 'Run game').map((p) => p.name)).toEqual(['Lane Johnson', 'Christian McCaffrey']);
    expect(unitPlayers(t, 'Coverage').map((p) => p.name)).toEqual(['Nate Hobbs']);
    expect(unitPlayers(t, 'Nope')).toEqual([]);
  });
  it('tiers scores and writes ordinals', () => {
    expect([tierOf(95), tierOf(80), tierOf(79.9), tierOf(60), tierOf(null)]).toEqual(['Elite', 'Good', 'Average', 'Below average', null]);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 32].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '32nd']);
  });
  it('writes one sentence on strengths and weaknesses', () => {
    const line = talentSentence(league().teams.T7, 'The Test');
    expect(line).toMatch(/^The Test rank 1st of 32 in roster talent/);
    expect(line).toMatch(/Strongest at .*Thinnest at /);
  });
});
