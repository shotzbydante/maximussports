import { describe, it, expect } from 'vitest';
import { primaryDriver, relativeStrength } from './pickInsights.js';

function pick({ components = {}, score = 0.8, market = 'moneyline' } = {}) {
  return {
    id: 'x',
    gameId: 'g',
    market: { type: market },
    betScore: { total: score, components },
  };
}

describe('primaryDriver', () => {
  it('returns null when no components', () => {
    expect(primaryDriver({})).toBeNull();
    expect(primaryDriver(null)).toBeNull();
  });

  it('picks the highest component and maps to a human label', () => {
    const d = primaryDriver(pick({ components: { edgeStrength: 0.85, modelConfidence: 0.6, situationalEdge: 0.4, marketQuality: 0.5 } }));
    expect(d.key).toBe('edgeStrength');
    expect(d.bucket).toBe('edge');
    expect(d.label).toMatch(/mispricing/);
  });

  it('returns confidence label when modelConfidence wins', () => {
    const d = primaryDriver(pick({ components: { edgeStrength: 0.5, modelConfidence: 0.92, situationalEdge: 0.4, marketQuality: 0.3 } }));
    expect(d.bucket).toBe('confidence');
    expect(d.label).toMatch(/confidence/);
  });

  it('situationalEdge returns market-specific situation copy', () => {
    const totalsDriver = primaryDriver(pick({
      market: 'total',
      components: { edgeStrength: 0.4, modelConfidence: 0.5, situationalEdge: 0.9, marketQuality: 0.3 },
    }));
    expect(totalsDriver.bucket).toBe('situation');
    expect(totalsDriver.label).toMatch(/park/);
  });

  it('marketQuality returns the market label', () => {
    const d = primaryDriver(pick({ components: { edgeStrength: 0.3, modelConfidence: 0.4, situationalEdge: 0.2, marketQuality: 0.85 } }));
    expect(d.bucket).toBe('market');
    expect(d.label).toMatch(/market alignment/);
  });
});

describe('relativeStrength', () => {
  const scores = [0.92, 0.87, 0.82, 0.79, 0.74, 0.70, 0.65, 0.60, 0.55, 0.50];
  const slate = scores.map((s, i) => pick({ score: s, components: { edgeStrength: s } }));

  it('returns null for empty slate', () => {
    expect(relativeStrength(pick(), [])).toBeNull();
  });

  it('flags the absolute highest as "highest"', () => {
    const r = relativeStrength(slate[0], slate);
    expect(r?.kind).toBe('highest');
  });

  it('flags within-top-10% as top_pct', () => {
    const r = relativeStrength(slate[1], slate);
    expect(r?.kind).toBe('top_pct');
  });

  it('returns null for mid-tier picks', () => {
    const r = relativeStrength(slate[5], slate);
    expect(r).toBeNull();
  });
});
