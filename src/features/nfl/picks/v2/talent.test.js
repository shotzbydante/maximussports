import { describe, it, expect } from 'vitest';
import { talentMatchups, talentAverages, talentNote } from './talent.js';
import { analyzeGame } from './engine.js';
import { game, KC, LV } from './fixtures.js';

const unit = (v) => ({ QB: v, 'Pass protection': v, Receivers: v, 'Run game': v, 'Pass rush': v, Coverage: v, 'Run defense': v, 'Pass defense': v, 'Overall talent': v });
const talent = { asOf: '2026-11-22', teams: { KC: { ...unit(80), QB: 92 }, LV: { ...unit(80), 'Pass defense': 74 }, BUF: unit(80), SF: unit(80), CHI: unit(80), DET: unit(80), NYJ: unit(80), MIA: unit(80) } };

describe('talent matchups', () => {
  it('measures each unit against league average, offense minus defense', () => {
    const avg = talentAverages(talent.teams);
    expect(avg.QB).toBeCloseTo(81.5, 5);
    const t = talentMatchups({ home: 'KC', away: 'LV', talent });
    const top = t.matchups[0];
    expect(top).toMatchObject({ offenseTeam: 'KC', defenseTeam: 'LV', offense: 'quarterback', defense: 'pass defense', size: 'big', favours: 'KC' });
    expect(Math.abs(top.edge - ((92 - 81.5) - (74 - 79.25)))).toBeLessThan(0.06);
    expect(t.matchups).toHaveLength(8);
    expect(t.leansTo).toBe('KC');
    expect(t.netHome).toBeGreaterThan(10);
  });

  it('calls a small gap even and says nothing about it', () => {
    const flat = { teams: Object.fromEntries(['KC', 'LV', 'BUF', 'SF', 'CHI', 'DET', 'NYJ', 'MIA'].map((c) => [c, unit(80)])) };
    const t = talentMatchups({ home: 'KC', away: 'LV', talent: flat });
    expect(t.matchups.every((m) => m.size === 'even' && m.favours === null)).toBe(true);
    expect(t.leansTo).toBeNull();
    expect(talentNote(t)).toBeNull();
  });

  it('returns nothing for a team with no grades', () => {
    expect(talentMatchups({ home: 'KC', away: 'XXX', talent })).toBeNull();
    expect(talentMatchups({ home: 'KC', away: 'LV', talent: null })).toBeNull();
  });

  it('rides along in the engine block without moving a fair number', () => {
    const g = game('g1', LV, KC);
    const without = analyzeGame({ game: g, model: { ok: false } });
    const withTalent = analyzeGame({ game: g, model: { ok: false }, talent });
    expect(without.talent).toBeNull();
    expect(withTalent.talent.leansTo).toBe('KC');
    expect(withTalent.fair).toEqual(without.fair);
    expect(talentNote(withTalent.talent)).toMatch(/^Roster talent: the biggest position-group edge is KC’s quarterback against LV’s pass defense \(15\.\d points/);
  });
});
