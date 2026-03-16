import { describe, it, expect } from 'vitest';
import {
  computeProportionalTrimLength,
  computeTrimWindow,
  computeBeatCount,
  getEditPlanTargets,
} from './smartTrim';

describe('computeProportionalTrimLength', () => {
  it('clamps short videos to minimum 8s', () => {
    expect(computeProportionalTrimLength(30)).toBeGreaterThanOrEqual(8);
    expect(computeProportionalTrimLength(30)).toBeLessThanOrEqual(10);
  });

  it('returns ~11s for a 60s source', () => {
    const result = computeProportionalTrimLength(60);
    expect(result).toBeCloseTo(10.8, 0);
  });

  it('returns ~16s for a 90s source', () => {
    const result = computeProportionalTrimLength(90);
    expect(result).toBeCloseTo(16.2, 0);
  });

  it('returns ~18s for a 102s source (1m42s)', () => {
    const result = computeProportionalTrimLength(102);
    expect(result).toBeCloseTo(18.36, 0);
    expect(result).toBeGreaterThan(16);
    expect(result).toBeLessThan(20);
  });

  it('returns ~21-22s for a 120s source', () => {
    const result = computeProportionalTrimLength(120);
    expect(result).toBeGreaterThanOrEqual(21);
    expect(result).toBeLessThanOrEqual(22);
  });

  it('clamps very long videos to max 24s', () => {
    expect(computeProportionalTrimLength(300)).toBe(24);
    expect(computeProportionalTrimLength(600)).toBe(24);
  });

  it('longer sources always produce longer trims', () => {
    const short = computeProportionalTrimLength(30);
    const medium = computeProportionalTrimLength(60);
    const long = computeProportionalTrimLength(102);
    const longer = computeProportionalTrimLength(120);

    expect(medium).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(medium);
    expect(longer).toBeGreaterThan(long);
  });

  it('handles zero/negative/null duration gracefully', () => {
    expect(computeProportionalTrimLength(0)).toBe(8);
    expect(computeProportionalTrimLength(-5)).toBe(8);
    expect(computeProportionalTrimLength(null)).toBe(8);
    expect(computeProportionalTrimLength(undefined)).toBe(8);
  });
});

describe('computeTrimWindow', () => {
  it('returns min and max window sizes', () => {
    const { minWindow, maxWindow } = computeTrimWindow(102);
    expect(minWindow).toBeCloseTo(18.36, 0);
    expect(maxWindow).toBeGreaterThan(minWindow);
    expect(maxWindow).toBeLessThanOrEqual(24);
  });
});

describe('computeBeatCount', () => {
  it('returns 4 beats for short trims', () => {
    expect(computeBeatCount(8)).toBe(4);
    expect(computeBeatCount(10)).toBe(4);
  });

  it('returns 5 beats for medium trims', () => {
    expect(computeBeatCount(12)).toBe(5);
    expect(computeBeatCount(16)).toBe(5);
  });

  it('returns 6 beats for long trims', () => {
    expect(computeBeatCount(20)).toBe(6);
    expect(computeBeatCount(24)).toBe(6);
  });
});

describe('getEditPlanTargets', () => {
  it('returns proportional targets for a 102s video', () => {
    const targets = getEditPlanTargets(102);
    expect(targets.targetDuration).toBeGreaterThan(16);
    expect(targets.targetDuration).toBeLessThan(20);
    expect(targets.maxDuration).toBeGreaterThan(targets.targetDuration);
    expect(targets.beatCount).toBeGreaterThanOrEqual(5);
  });

  it('returns minimum targets for a very short video', () => {
    const targets = getEditPlanTargets(10);
    expect(targets.targetDuration).toBe(8);
    expect(targets.beatCount).toBe(4);
  });
});
