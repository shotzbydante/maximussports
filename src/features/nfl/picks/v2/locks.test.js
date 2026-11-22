import { describe, it, expect } from 'vitest';
import { applyLocks, closingLineValue, ticketProbs } from './locks.js';
import { fairMarginFromSpread } from './distribution.js';
import { summarizePerformance, addPerformance, presentPerformance, pickRoleOf } from './performance.js';

function pick(gameId, type, side, { role = 'tracking', tier = 'tracking', ev = -0.04, line = 3, price = -110 } = {}) {
  return {
    id: `${gameId}-${type}-${side}`, gameId, sport: 'nfl', tier, pickRole: role, ev,
    market: { type, line: type === 'moneyline' ? null : line, priceAmerican: price },
    selection: { side, label: `${side} ${line}` },
    conviction: { label: 'Lean', score: role === 'hero' ? 70 : 40 }, betScore: { total: role === 'hero' ? 0.7 : 0.4 },
    rationale: { headline: 'h', bullets: ['why'], pickRole: role }, flags: {},
    matchup: { startTime: '2026-11-22T18:00:00Z' },
  };
}
function board(picks, fair = { margin: -3.3, total: 44.5, homeWin: 0.4 }) {
  const ids = [...new Set(picks.map((p) => p.gameId))];
  const hero = picks.filter((p) => p.pickRole === 'hero');
  return {
    sport: 'nfl', week: 12,
    tiers: { tier1: hero.filter((p) => p.tier === 'tier1'), tier2: hero.filter((p) => p.tier === 'tier2'), tier3: hero.filter((p) => p.tier === 'tier3') },
    fullSlatePicks: picks, heroPicks: hero, trackingPicks: picks.filter((p) => p.pickRole !== 'hero'),
    byGame: ids.map((gameId) => ({ gameId, fair, picks: {} })),
    meta: { picksPublished: hero.length }, categories: {},
  };
}
const lockRow = (p, { lockedAt = '2026-11-21T15:00:00Z', tier = 'tier2', book = 'BetMGM' } = {}) => ({
  game_id: p.gameId, market_type: p.market.type, selection_side: p.selection.side,
  line_value: p.market.line, price_american: p.market.priceAmerican, tier, book,
  locked_at: lockedAt, expected_value: 0.03, payload: { ...p, tier, pickRole: 'hero' },
});

describe('applyLocks', () => {
  it('returns the board unchanged when nothing is locked', () => {
    const b = board([pick('g1', 'runline', 'home')]);
    expect(applyLocks(b, []).fullSlatePicks).toBe(b.fullSlatePicks);
    expect(applyLocks(b, []).meta.lockedPicks).toBe(0);
  });

  it('keeps showing the locked ticket after the board has moved off it', () => {
    // Saturday: LV +3.5 was recommended. Sunday: the fresh build leans the other way.
    const locked = pick('g1', 'runline', 'away', { role: 'hero', tier: 'tier2', ev: 0.03, line: 3.5 });
    const b = board([pick('g1', 'runline', 'home'), pick('g1', 'total', 'over'), pick('g1', 'moneyline', 'home')]);
    const out = applyLocks(b, [lockRow(locked)]);
    expect(out.heroPicks.map((p) => p.id)).toEqual(['g1-runline-away']);
    expect(out.tiers.tier2).toHaveLength(1);
    expect(out.fullSlatePicks.map((p) => p.id)).not.toContain('g1-runline-home');
    expect(out.byGame[0].picks.runline.id).toBe('g1-runline-away');
    expect(out.byGame[0].picks.total.id).toBe('g1-total-over');
    expect(out.meta).toMatchObject({ lockedPicks: 1, picksPublished: 1 });
    const p = out.heroPicks[0];
    expect(p.lock).toMatchObject({ line: 3.5, price: -110, book: 'BetMGM', evAtLock: 0.03 });
    expect(typeof p.lock.evNow).toBe('number');
    expect(p.rationale.bullets[0]).toMatch(/^Locked .* at -110 \(BetMGM\)\. This is the ticket that gets graded\./);
    expect(out.topPick.id).toBe('g1-runline-away');
  });

  it('does not add a second side bet to a game that already has one locked', () => {
    const locked = pick('g1', 'runline', 'away', { role: 'hero', tier: 'tier3', ev: 0.02, line: 3.5 });
    const fresh = pick('g1', 'moneyline', 'away', { role: 'hero', tier: 'tier2', ev: 0.03, price: 150 });
    const out = applyLocks(board([fresh, pick('g1', 'total', 'over')]), [lockRow(locked, { tier: 'tier3' })]);
    expect(out.heroPicks.map((p) => p.id)).toEqual(['g1-runline-away']);
    expect(out.byGame[0].picks.moneyline).toMatchObject({ pickRole: 'tracking', lowSignalReason: 'same_side', tier: 'tracking' });
  });

  it('keeps the earliest lock, ignores tracking locks, and drops locks on games that have kicked off', () => {
    const first = pick('g1', 'total', 'under', { role: 'hero', tier: 'tier1', ev: 0.05, line: 45.5 });
    const later = pick('g1', 'total', 'over', { role: 'hero', tier: 'tier3', ev: 0.02, line: 43.5 });
    const gone = pick('g9', 'total', 'over', { role: 'hero', tier: 'tier1', ev: 0.05 });
    const rows = [
      lockRow(later, { lockedAt: '2026-11-22T10:00:00Z', tier: 'tier3' }),
      lockRow(first, { lockedAt: '2026-11-21T10:00:00Z', tier: 'tier1' }),
      lockRow(gone, { tier: 'tier1' }),
      { ...lockRow(pick('g1', 'runline', 'home')), tier: 'tracking' },
    ];
    const out = applyLocks(board([pick('g1', 'total', 'over'), pick('g1', 'runline', 'home')]), rows);
    expect(out.heroPicks.map((p) => p.id)).toEqual(['g1-total-under']);
    expect(out.byGame[0].picks.runline).toMatchObject({ id: 'g1-runline-home', pickRole: 'tracking' });
  });

  it('respects the per-tier cap for new picks without dropping locked ones', () => {
    const locks = ['a', 'b', 'c'].map((g) => lockRow(pick(g, 'total', 'under', { role: 'hero', tier: 'tier1', ev: 0.05 }), { tier: 'tier1' }));
    const fresh = pick('d', 'total', 'under', { role: 'hero', tier: 'tier1', ev: 0.06 });
    const b = board([...['a', 'b', 'c'].map((g) => pick(g, 'total', 'over')), fresh]);
    const out = applyLocks(b, locks, { maxPerTier: { tier1: 3, tier2: 5, tier3: 6 } });
    expect(out.tiers.tier1).toHaveLength(3);
    expect(out.trackingPicks.find((p) => p.id === 'd-total-under')).toMatchObject({ pickRole: 'tracking', tier: 'tracking' });
  });
});

describe('closing-line value', () => {
  // The centre of the margin curve for a -4.5 close, as the snapshot stores it.
  const close = { spread_home: -4.5, total: 42.5, fair_margin: fairMarginFromSpread({ line: -4.5 }), fair_total: 42.4, fair_home_win: 0.67 };

  it('credits a spread ticket that beat the close and debits one that did not', () => {
    const good = closingLineValue({ market_type: 'runline', selection_side: 'home', line_value: -3, price_american: -110 }, close);
    expect(good.closingLine).toBe(-4.5);
    expect(good.clvPoints).toBe(1.5);
    expect(good.clvEv).toBeGreaterThan(0.03);
    const bad = closingLineValue({ market_type: 'runline', selection_side: 'away', line_value: 3, price_american: -110 }, close);
    expect(bad.closingLine).toBe(4.5);
    expect(bad.clvPoints).toBe(-1.5);
    expect(bad.clvEv).toBeLessThan(-0.05);
  });
  it('handles totals in both directions and moneylines without a line', () => {
    expect(closingLineValue({ market_type: 'total', selection_side: 'under', line_value: 44.5, price_american: -110 }, close).clvPoints).toBe(2);
    expect(closingLineValue({ market_type: 'total', selection_side: 'over', line_value: 44.5, price_american: -110 }, close).clvPoints).toBe(-2);
    const ml = closingLineValue({ market_type: 'moneyline', selection_side: 'home', line_value: null, price_american: -150 }, close);
    expect(ml.clvPoints).toBeNull();
    expect(ml.clvEv).toBeCloseTo(0.67 * (100 / 150) - 0.33, 3);
  });
  it('returns nulls without a snapshot and reads numeric strings from the database', () => {
    expect(closingLineValue({ market_type: 'total' }, null)).toEqual({ closingLine: null, clvPoints: null, clvEv: null });
    const strings = closingLineValue({ market_type: 'runline', selection_side: 'home', line_value: '-3', price_american: '-110' },
      { spread_home: '-4.5', fair_margin: '5.2' });
    expect(strings.clvPoints).toBe(1.5);
    expect(ticketProbs({ market: 'runline', side: 'home', line: -3, fair: {} })).toBeNull();
  });
});

describe('performance summary', () => {
  const row = (role, status, { price = -110, clvEv = null, clvPoints = null, units } = {}) => ({
    tier: role === 'hero' ? 'tier2' : 'tracking', rationale: { pickRole: role }, price_american: price,
    clv_ev: clvEv, clv_points: clvPoints, pick_results: [{ status, ...(units === undefined ? {} : { units }) }],
  });
  const perf = summarizePerformance([
    row('hero', 'won', { price: 150, clvEv: 0.04, clvPoints: 1 }),
    row('hero', 'lost', { clvEv: -0.02, clvPoints: -0.5 }),
    row('hero', 'push'),
    row('hero', 'pending'),
    row('tracking', 'won', { price: null }),
    row('tracking', 'lost', { units: -1 }),
  ]);

  it('adds up units at each pick’s own price', () => {
    expect(perf.hero).toMatchObject({ won: 1, lost: 1, push: 1, graded: 3, units: 0.5, clvN: 2, beatClose: 1 });
    expect(perf.tracking.units).toBeCloseTo(0.9091 - 1, 2);
  });
  it('presents record, return and closing-line value', () => {
    const hero = presentPerformance(perf.hero);
    expect(hero).toMatchObject({ record: { won: 1, lost: 1, push: 1 }, winPct: 50, units: 0.5, clvSample: 2, beatClosePct: 50 });
    expect(hero.roiPct).toBeCloseTo(16.7, 1);
    expect(hero.clvEvPct).toBe(1);
    expect(hero.clvPoints).toBe(0.25);
    expect(presentPerformance(summarizePerformance([]).hero)).toMatchObject({ winPct: null, roiPct: null, clvEvPct: null });
  });
  it('sums daily summaries into a season', () => {
    const season = addPerformance([perf, perf, null]);
    expect(season.hero.graded).toBe(6);
    expect(season.hero.units).toBe(1);
  });
  it('falls back to the tier when a row has no stored role', () => {
    expect(pickRoleOf({ tier: 'tracking' })).toBe('tracking');
    expect(pickRoleOf({ tier: 'tier1' })).toBe('hero');
  });
});
