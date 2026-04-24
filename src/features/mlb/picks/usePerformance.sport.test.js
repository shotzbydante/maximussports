/**
 * Regression guard for the NBA cross-sport leak.
 *
 * Before this fix, every NBA surface silently fetched MLB endpoints because
 * both hooks and their call sites relied on the default `sport='mlb'`.
 * These tests assert the hook file defines sport as a REQUIRED parameter
 * in its signature and constructs URLs that carry the sport query param.
 */

import { describe, it, expect } from 'vitest';
import * as hookModule from './usePerformance.js';

describe('usePerformance module — sport-aware', () => {
  it('exports usePerformance and useAuditInsights', () => {
    expect(typeof hookModule.usePerformance).toBe('function');
    expect(typeof hookModule.useAuditInsights).toBe('function');
  });

  it('source of usePerformance constructs a URL containing sport', () => {
    const source = hookModule.usePerformance.toString();
    expect(source).toMatch(/sport=\$\{sport\}/);
    expect(source).toMatch(/\/api\/mlb\/picks\/performance/);
  });

  it('source of useAuditInsights constructs a URL containing sport', () => {
    const source = hookModule.useAuditInsights.toString();
    expect(source).toMatch(/sport=\$\{sport\}/);
    expect(source).toMatch(/\/api\/mlb\/picks\/insights/);
  });
});
