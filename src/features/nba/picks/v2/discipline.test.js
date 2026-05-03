/**
 * NBA picks discipline — unit tests for the post-build calibration layer
 * introduced after the 2026-05-02 audit (docs/nba-playoff-picks-model-audit-v1.md).
 *
 * Each test isolates ONE rule so a future regression points at the rule
 * that broke, not the test rig.
 */

import { describe, it, expect } from 'vitest';
import {
  applyDiscipline,
  multiFactorSupport,
  isMarketOnlyDriver,
  isFavoriteSide,
  labelFromScore,
  NBA_DISCIPLINE_DEFAULTS,
} from './discipline.js';

const config = { discipline: NBA_DISCIPLINE_DEFAULTS };

function mkPick(overrides = {}) {
  return {
    id: 'g1-runline-home',
    sport: 'nba',
    gameId: 'g1',
    tier: null,
    market: { type: 'runline', line: -3.5, priceAmerican: null },
    selection: { side: 'home', team: 'BOS' },
    matchup: { startTime: null },
    conviction: { label: 'Strong', score: 73 },
    betScore: {
      total: 0.73,
      components: {
        edgeStrength: 0.95,
        modelConfidence: 0.30,
        situationalEdge: 0.55,
        marketQuality: 0.85,
      },
      weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
    },
    rationale: { headline: '', bullets: [] },
    flags: {},
    ...overrides,
  };
}

describe('labelFromScore', () => {
  it.each([
    [0.86, 'Top Play'],
    [0.85, 'Top Play'],
    [0.84, 'Strong'],
    [0.70, 'Strong'],
    [0.69, 'Solid'],
    [0.55, 'Solid'],
    [0.54, 'Lean'],
    [0.0,  'Lean'],
  ])('total %s → "%s"', (total, expected) => {
    expect(labelFromScore(total)).toBe(expected);
  });
});

describe('isFavoriteSide', () => {
  it('runline negative line is favorite', () => {
    expect(isFavoriteSide(mkPick({ market: { type: 'runline', line: -8 } }))).toBe(true);
  });
  it('runline positive line is underdog', () => {
    expect(isFavoriteSide(mkPick({ market: { type: 'runline', line: +8 } }))).toBe(false);
  });
  it('moneyline negative price is favorite', () => {
    expect(isFavoriteSide(mkPick({ market: { type: 'moneyline', priceAmerican: -160 } }))).toBe(true);
  });
});

describe('multiFactorSupport', () => {
  it('returns false when only edge is high', () => {
    const c = { modelConfidence: 0.20, situationalEdge: 0.50, marketQuality: 0.40 };
    expect(multiFactorSupport(c)).toBe(false);
  });
  it('returns true when conf + market are both elevated', () => {
    const c = { modelConfidence: 0.55, situationalEdge: 0.40, marketQuality: 0.85 };
    expect(multiFactorSupport(c)).toBe(true);
  });
});

describe('isMarketOnlyDriver', () => {
  it('flags low conf + neutral situational as market-only', () => {
    expect(isMarketOnlyDriver({ modelConfidence: 0.30, situationalEdge: 0.55 })).toBe(true);
  });
  it('does not flag when situational is elevated', () => {
    expect(isMarketOnlyDriver({ modelConfidence: 0.30, situationalEdge: 0.65 })).toBe(false);
  });
});

describe('R1 — low confidence cap', () => {
  it('caps a "Strong" pick to "Lean" when confidence ≤ 0.35 with no multi-factor support', () => {
    const out = applyDiscipline(mkPick({
      betScore: {
        total: 0.73,
        components: { edgeStrength: 0.95, modelConfidence: 0.33, situationalEdge: 0.55, marketQuality: 0.40 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out).not.toBeNull();
    expect(out.conviction.label).toBe('Lean');
    expect(out.flags.lowConfidenceCapped).toBe(true);
  });

  it('does NOT cap when low confidence is offset by multi-factor support', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'moneyline', priceAmerican: 130 },
      selection: { side: 'away' },
      betScore: {
        total: 0.78,
        components: { edgeStrength: 0.80, modelConfidence: 0.34, situationalEdge: 0.65, marketQuality: 0.90 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out.flags.lowConfidenceCapped).toBeUndefined();
  });
});

describe('R2 — single-driver / market-only cap', () => {
  it('caps a market-only pick to "Lean" and labels it', () => {
    const out = applyDiscipline(mkPick({
      betScore: {
        total: 0.72,
        components: { edgeStrength: 0.95, modelConfidence: 0.30, situationalEdge: 0.55, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out.flags.marketOnlyLean).toBe(true);
    expect(out.conviction.label).toBe('Lean');
  });

  it('never produces a Top Play from a single-driver pick', () => {
    const out = applyDiscipline(mkPick({
      betScore: {
        total: 0.95,                       // very high score from edge alone
        components: { edgeStrength: 1.0, modelConfidence: 0.30, situationalEdge: 0.55, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out.conviction.label).not.toBe('Top Play');
  });
});

describe('R3 — spread discipline', () => {
  it('caps |spread| ≥ 12 to Lean without multi-factor support', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -14 },
      betScore: {
        total: 0.88,
        components: { edgeStrength: 1.0, modelConfidence: 0.30, situationalEdge: 0.55, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out.conviction.label).toBe('Lean');
    expect(out.flags.heavySpreadCapped).toBe(true);
  });

  it('suppresses |spread| ≥ 8 with low confidence and no multi-factor', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -8 },
      betScore: {
        total: 0.73,
        components: { edgeStrength: 0.95, modelConfidence: 0.30, situationalEdge: 0.55, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out).toBeNull();          // suppressed entirely
  });

  it('publishes |spread| ≥ 8 when multi-factor support exists', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -8 },
      betScore: {
        total: 0.78,
        components: { edgeStrength: 0.85, modelConfidence: 0.55, situationalEdge: 0.65, marketQuality: 0.90 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out).not.toBeNull();
  });

  it('spread requires more than edge alone — caps a single-driver spread to Lean', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -3.5 },
      betScore: {
        total: 0.66,
        components: { edgeStrength: 0.85, modelConfidence: 0.20, situationalEdge: 0.50, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true }, config);
    expect(out.flags.spreadEdgeOnly).toBe(true);
    expect(out.conviction.label).toBe('Lean');
  });
});

describe('R6 — injury data unavailable', () => {
  it('caps a favorite spread pick below Top Play and applies a haircut', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -3.5 },
      betScore: {
        total: 0.90,
        components: { edgeStrength: 0.95, modelConfidence: 0.55, situationalEdge: 0.65, marketQuality: 0.90 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: false }, config);
    expect(out.conviction.label).not.toBe('Top Play');
    expect(out.flags.injuryDataAvailable).toBe(false);
  });

  it('does NOT haircut underdog picks', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: +3.5 },
      betScore: {
        total: 0.78,
        components: { edgeStrength: 0.85, modelConfidence: 0.55, situationalEdge: 0.65, marketQuality: 0.90 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: false }, config);
    // Underdog → no Strong cap from R6
    expect(out.flags.injuryDataAvailable).toBe(false);
    expect(out.betScore.total).toBeGreaterThan(0.7);
  });
});

describe('R7 — Game 7 / elimination logic', () => {
  it('suppresses a home favorite ≥ 5 in a Game 7 with no multi-factor support', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -8 },
      selection: { side: 'home' },
      betScore: {
        total: 0.73,
        components: { edgeStrength: 0.95, modelConfidence: 0.30, situationalEdge: 0.55, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true, isElimination: true, isGameSeven: true }, config);
    expect(out).toBeNull();
  });

  it('caps a Game 7 fav with multi-factor support to Solid + applies home haircut', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -8 },
      selection: { side: 'home' },
      betScore: {
        total: 0.85,
        components: { edgeStrength: 0.85, modelConfidence: 0.55, situationalEdge: 0.65, marketQuality: 0.90 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: true, isElimination: true, isGameSeven: true }, config);
    expect(out).not.toBeNull();
    expect(out.flags.gameSeven).toBe(true);
    expect(out.flags.elimination).toBe(true);
    expect(out.flags.eliminationHomeHaircut).toBe(true);
    expect(out.conviction.label).not.toBe('Top Play');
  });
});

describe('regression — replay of 2026-05-02 bad slate', () => {
  // Each pick mirrors the fields the engine stamps for the failed slate.
  // Ground truth: every pick was a 33%-confidence chalk spread driven by the
  // moneyline-vs-spread arbitrage signal alone. Discipline should demote
  // every one of them.
  const bad = [
    // SAS -14 vs MIN
    {
      id: 'sas-min-spread-home', market: { type: 'runline', line: -14 }, selection: { side: 'home', team: 'SAS' },
      betScore: { total: 0.74, components: { edgeStrength: 1.00, modelConfidence: 0.33, situationalEdge: 0.55, marketQuality: 0.85 } },
    },
    // CLE -3.5 vs TOR
    {
      id: 'cle-tor-spread-away', market: { type: 'runline', line: -3.5 }, selection: { side: 'away', team: 'CLE' },
      betScore: { total: 0.73, components: { edgeStrength: 0.95, modelConfidence: 0.33, situationalEdge: 0.45, marketQuality: 0.85 } },
    },
    // BOS -8 vs PHI Game 7
    {
      id: 'bos-phi-spread-home', market: { type: 'runline', line: -8 }, selection: { side: 'home', team: 'BOS' },
      betScore: { total: 0.73, components: { edgeStrength: 0.95, modelConfidence: 0.33, situationalEdge: 0.55, marketQuality: 0.85 } },
      ctx: { isElimination: true, isGameSeven: true },
    },
    // ORL -15.5 vs DET
    {
      id: 'orl-det-spread-home', market: { type: 'runline', line: -15.5 }, selection: { side: 'home', team: 'ORL' },
      betScore: { total: 0.73, components: { edgeStrength: 1.00, modelConfidence: 0.33, situationalEdge: 0.55, marketQuality: 0.85 } },
    },
    // HOU -3.5 vs LAL
    {
      id: 'hou-lal-spread-away', market: { type: 'runline', line: -3.5 }, selection: { side: 'away', team: 'HOU' },
      betScore: { total: 0.72, components: { edgeStrength: 0.95, modelConfidence: 0.33, situationalEdge: 0.45, marketQuality: 0.85 } },
    },
  ];

  it('every pick is either suppressed OR demoted to "Lean"/"Solid"', () => {
    for (const sample of bad) {
      const ctx = { injuryDataAvailable: false, ...(sample.ctx || {}) };
      const out = applyDiscipline(mkPick({
        id: sample.id, gameId: sample.id,
        market: sample.market, selection: sample.selection,
        betScore: { ...sample.betScore, weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 } },
      }), ctx, config);
      if (out === null) continue;     // suppressed = pass
      expect(out.conviction.label, sample.id).not.toBe('Top Play');
      expect(out.conviction.label, sample.id).not.toBe('Strong');
    }
  });

  it('no replayed pick reaches "Top Play"', () => {
    for (const sample of bad) {
      const ctx = { injuryDataAvailable: false, ...(sample.ctx || {}) };
      const out = applyDiscipline(mkPick({
        market: sample.market, selection: sample.selection,
        betScore: { ...sample.betScore, weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 } },
      }), ctx, config);
      if (out) expect(out.conviction.label).not.toBe('Top Play');
    }
  });

  it('the BOS Game 7 spot is suppressed entirely', () => {
    const out = applyDiscipline(mkPick({
      market: { type: 'runline', line: -8 },
      selection: { side: 'home', team: 'BOS' },
      betScore: {
        total: 0.73,
        components: { edgeStrength: 0.95, modelConfidence: 0.33, situationalEdge: 0.55, marketQuality: 0.85 },
        weights: { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 },
      },
    }), { injuryDataAvailable: false, isElimination: true, isGameSeven: true }, config);
    expect(out).toBeNull();
  });
});
