/**
 * v15 — displayMetrics tests. Pins the contract the UI consumes.
 */

import { describe, it, expect } from 'vitest';
import { buildDisplayMetrics } from './displayMetrics.js';

function mkPick({
  market = 'runline', side = 'away', line = +10, price = null,
  rawEdge = 0.05, betScore = 0.55,
  modelConfidence = 0.33,
  pickRole = 'tracking',
  modelProb = null, modelSource = null,
  spreadDebug = null, totalDebug = null,
  awayShort = 'MIN', homeShort = 'SAS',
} = {}) {
  return {
    id: `${market}-${Math.random()}`,
    market: { type: market, line, priceAmerican: price },
    selection: { side, label: side === 'away' ? `${awayShort} +${line}` : `${homeShort} ${line >= 0 ? '+' : ''}${line}` },
    rawEdge,
    modelProb, modelSource,
    betScore: { total: betScore, components: { modelConfidence } },
    conviction: { label: betScore >= 0.55 ? 'Solid' : 'Lean' },
    pickRole,
    matchup: {
      awayTeam: { slug: awayShort.toLowerCase(), shortName: awayShort, name: awayShort },
      homeTeam: { slug: homeShort.toLowerCase(), shortName: homeShort, name: homeShort },
    },
    spreadDebug, totalDebug,
  };
}

describe('v15 — Signal Quality replaces Confidence', () => {
  it('signalQualityLabel is "Signal quality", value is %, has explanatory description', () => {
    const dm = buildDisplayMetrics(mkPick({ modelConfidence: 0.33 }));
    expect(dm.signalQualityLabel).toBe('Signal quality');
    expect(dm.signalQualityValue).toBe('33%');
    expect(dm.signalQualityDescription).toMatch(/NOT the probability/i);
    expect(dm.signalQualityDescription).toMatch(/both sides/i);
  });

  it('returns null signal quality when missing', () => {
    const pick = mkPick({ modelConfidence: null });
    pick.betScore.components.modelConfidence = null;
    const dm = buildDisplayMetrics(pick);
    expect(dm.signalQualityValue).toBeNull();
  });
});

describe('v15 — Opposite side explainer (MIN +10 case)', () => {
  it('produces a "Why not SAS −10?" explainer with anti-inverse-probability copy', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'runline', side: 'away', line: +10,
      awayShort: 'MIN', homeShort: 'SAS',
    }));
    expect(dm.oppositeSideLabel).toBe('Why not SAS -10?');
    expect(dm.oppositeSideDescription).toMatch(/does NOT mean SAS/i);
    expect(dm.oppositeSideDescription).toMatch(/inverse probability/i);
  });

  it('for moneyline picks, explainer warns signal quality is symmetric', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'moneyline', side: 'away', price: +138, line: null,
      awayShort: 'DET', homeShort: 'CLE', modelProb: 0.42, modelSource: 'spread',
    }));
    expect(dm.oppositeSideLabel).toBe('Why not CLE?');
    expect(dm.oppositeSideDescription).toMatch(/applies to both sides/i);
  });

  it('for totals picks, explains the lean direction', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'total', side: 'over', line: null,
      totalDebug: { delta: 4.2, marketTotal: 215, fairTotal: 219.2 },
    }));
    expect(dm.oppositeSideLabel).toBe('Why not Under?');
    expect(dm.oppositeSideDescription).toMatch(/inverse probability/i);
  });
});

describe('v15 — Edge label varies by market', () => {
  it('ML uses "Edge" (probability %)', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'moneyline', price: +138, line: null, rawEdge: 0.076,
    }));
    expect(dm.edgeLabel).toBe('Edge');
    expect(dm.edgeValue).toMatch(/%$/);
  });

  it('ATS uses "Cover edge" in pts when spreadDebug present', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'runline', side: 'away', line: +10,
      spreadDebug: { awayCoverEdge: 0.5, homeCoverEdge: -0.5, projectedHomeMargin: 9.5 },
    }));
    expect(dm.edgeLabel).toBe('Cover edge');
    expect(dm.edgeValue).toBe('+0.5 pts');
  });

  it('Totals uses "Fair total Δ" in pts when totalDebug present', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'total', side: 'over',
      totalDebug: { delta: 4.5, marketTotal: 215, fairTotal: 219.5 },
    }));
    expect(dm.edgeLabel).toBe('Fair total Δ');
    expect(dm.edgeValue).toBe('+4.5 pts');
  });
});

describe('v15 — Hit Probability only emitted for credible ML', () => {
  it('ML with modelProb + non-null modelSource emits hitProbability', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'moneyline', price: +138, line: null,
      modelProb: 0.42, modelSource: 'spread',
    }));
    expect(dm.hitProbabilityValue).toBe('42%');
    expect(dm.hitProbabilityLabel).toBe('Model probability');
    expect(dm.hitProbabilityDescription).toMatch(/directional/i);
  });

  it('ATS never emits hitProbability', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'runline', side: 'away', line: +10,
    }));
    expect(dm.hitProbabilityValue).toBeNull();
  });

  it('Totals never emits hitProbability', () => {
    const dm = buildDisplayMetrics(mkPick({
      market: 'total', side: 'over',
      totalDebug: { delta: 3, marketTotal: 215, fairTotal: 218 },
    }));
    expect(dm.hitProbabilityValue).toBeNull();
  });
});

describe('v15 — Role labels', () => {
  it('tracking role explains calibration purpose', () => {
    const dm = buildDisplayMetrics(mkPick({ pickRole: 'tracking' }));
    expect(dm.roleLabel).toBe('Tracking');
    expect(dm.roleDescription).toMatch(/calibration/i);
  });

  it('hero role explains promotion', () => {
    const dm = buildDisplayMetrics(mkPick({ pickRole: 'hero' }));
    expect(dm.roleLabel).toBe('Recommended');
    expect(dm.roleDescription).toMatch(/hero board/i);
  });
});

describe('v15 — Bet score retained', () => {
  it('emits bet score value 0–100', () => {
    const dm = buildDisplayMetrics(mkPick({ betScore: 0.62 }));
    expect(dm.betScoreLabel).toBe('Bet score');
    expect(dm.betScoreValue).toBe('62');
  });
});
