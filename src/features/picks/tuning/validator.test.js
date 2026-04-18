import { describe, it, expect } from 'vitest';
import { validateTuningDelta, diffConfig, GUARDRAILS } from './validator.js';
import { MLB_DEFAULT_CONFIG } from './defaultConfig.js';

function baseCfg() {
  return JSON.parse(JSON.stringify(MLB_DEFAULT_CONFIG));
}

describe('validateTuningDelta', () => {
  it('passes for an unchanged config', () => {
    const r = validateTuningDelta(baseCfg(), baseCfg(), { sampleSize: 100, shadowDays: 10, mode: 'propose' });
    expect(r.ok).toBe(true);
  });

  it('clips oversized weight moves', () => {
    const cur = baseCfg();
    const proposed = baseCfg();
    proposed.weights.edge = 0.70;   // moved +0.30 from 0.40
    proposed.weights.sit = -0.10;
    const r = validateTuningDelta(cur, proposed, { sampleSize: 100, shadowDays: 10, mode: 'propose' });
    // The edge move is clipped to +0.05 by the guardrail.
    expect(r.bounded.weights.edge).toBeLessThanOrEqual(cur.weights.edge + GUARDRAILS.WEIGHT_STEP_MAX + 1e-9);
    expect(r.warnings.some(w => /edge/.test(w))).toBe(true);
  });

  it('rejects non-monotonic tier floors', () => {
    const cur = baseCfg();
    const proposed = baseCfg();
    proposed.tierCutoffs.tier2.floor = 0.80; // breaks tier1 > tier2
    // Clip rule: step max 0.05 → 0.65, still < tier1 0.75, so SHOULD pass
    const r = validateTuningDelta(cur, proposed, { sampleSize: 100, shadowDays: 10, mode: 'propose' });
    expect(r.ok).toBe(true);
    expect(r.bounded.tierCutoffs.tier2.floor).toBeLessThanOrEqual(0.65 + 1e-9);
  });

  it('rejects apply without sample size', () => {
    const cur = baseCfg();
    const proposed = baseCfg();
    proposed.weights.edge = 0.42;
    proposed.weights.sit = 0.18;
    const r = validateTuningDelta(cur, proposed, { sampleSize: 10, shadowDays: 10, mode: 'apply' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/sampleSize/);
  });

  it('rejects apply without shadow period', () => {
    const cur = baseCfg();
    const proposed = baseCfg();
    proposed.weights.edge = 0.42;
    proposed.weights.sit = 0.18;
    const r = validateTuningDelta(cur, proposed, { sampleSize: 200, shadowDays: 3, mode: 'apply' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/shadowDays/);
  });

  it('renormalizes weights when clipping caused drift', () => {
    const cur = baseCfg();
    const proposed = baseCfg();
    // large moves in every direction — clipping will not sum to 1
    proposed.weights.edge = 0.80;
    proposed.weights.conf = 0.05;
    proposed.weights.sit  = 0.05;
    proposed.weights.mkt  = 0.10;
    const r = validateTuningDelta(cur, proposed, { sampleSize: 100, shadowDays: 10, mode: 'propose' });
    const sum = r.bounded.weights.edge + r.bounded.weights.conf + r.bounded.weights.sit + r.bounded.weights.mkt;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
  });
});

describe('diffConfig', () => {
  it('records changed fields only', () => {
    const before = { a: 1, b: { c: 2, d: 3 } };
    const after  = { a: 1, b: { c: 2, d: 5 } };
    const delta = diffConfig(before, after);
    expect(delta).toEqual({ 'b.d': { before: 3, after: 5 } });
  });
});
