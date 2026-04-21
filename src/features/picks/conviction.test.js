/**
 * resolveConviction / resolveBetScoreDisplay contracts.
 *
 * The invariant: when a pick has no usable score, the helper returns null so
 * the UI HIDES the badge rather than showing a "0" pill.
 */

import { describe, it, expect } from 'vitest';
import { resolveConviction, resolveBetScoreDisplay, resolveBetScoreTotal } from './conviction.js';

describe('resolveConviction', () => {
  it('returns null for null/undefined pick', () => {
    expect(resolveConviction(null)).toBeNull();
    expect(resolveConviction(undefined)).toBeNull();
  });

  it('uses pick.conviction.score when present', () => {
    expect(resolveConviction({ conviction: { score: 87 } })).toBe(87);
  });

  it('falls back to pick.betScore.total × 100 when conviction absent', () => {
    expect(resolveConviction({ betScore: { total: 0.82 } })).toBe(82);
  });

  it('falls back to v1 confidenceScore × 100 when neither present', () => {
    expect(resolveConviction({ confidenceScore: 0.74 })).toBe(74);
  });

  it('returns null when score is 0 (no silent zero badge)', () => {
    expect(resolveConviction({ conviction: { score: 0 } })).toBe(0);
    // But zero bet_score total yields null — we do not render a 0 badge:
    expect(resolveConviction({ betScore: { total: 0 } })).toBeNull();
    expect(resolveConviction({ confidenceScore: 0 })).toBeNull();
  });

  it('returns null when all sources are non-numeric/missing', () => {
    expect(resolveConviction({})).toBeNull();
    expect(resolveConviction({ betScore: null })).toBeNull();
    expect(resolveConviction({ confidenceScore: 'n/a' })).toBeNull();
  });

  it('clamps to [0, 100]', () => {
    expect(resolveConviction({ conviction: { score: 150 } })).toBe(100);
    expect(resolveConviction({ conviction: { score: -20 } })).toBe(0);
  });
});

describe('resolveBetScoreTotal', () => {
  it('returns null when absent or ≤ 0', () => {
    expect(resolveBetScoreTotal(null)).toBeNull();
    expect(resolveBetScoreTotal({})).toBeNull();
    expect(resolveBetScoreTotal({ betScore: { total: 0 } })).toBeNull();
  });
  it('returns the raw 0–1 value when valid', () => {
    expect(resolveBetScoreTotal({ betScore: { total: 0.73 } })).toBeCloseTo(0.73);
  });
  it('falls back to confidenceScore', () => {
    expect(resolveBetScoreTotal({ confidenceScore: 0.64 })).toBeCloseTo(0.64);
  });
});

describe('resolveBetScoreDisplay', () => {
  it('returns null when score unavailable (never 0)', () => {
    expect(resolveBetScoreDisplay({})).toBeNull();
  });
  it('rounds to 0–100', () => {
    expect(resolveBetScoreDisplay({ betScore: { total: 0.829 } })).toBe(83);
  });
});
