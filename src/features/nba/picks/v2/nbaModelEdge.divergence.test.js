/**
 * v11 — ML/spread divergence anomaly detection.
 *
 * Pins the production-observed `MIN @ SAS` failure: ML implied MIN
 * ~81%, spread implied MIN ~54.5%. The model must collapse this to a
 * tracking-quality pick and tag it `ml_spread_anomaly` so editorial
 * guardrails can refuse it.
 */

import { describe, it, expect } from 'vitest';
import { pickMoneylineSide, NBA_MODEL_CONSTANTS } from './nbaModelEdge.js';

describe('v11 ML/spread divergence anomaly', () => {
  it('production MIN @ SAS fixture (ML 81% / spread 54.5%) is flagged', () => {
    // ML approximating no-vig away (MIN) ~0.815, home (SAS) ~0.185.
    // -440 raw implied = 0.815. We use -460/+360 to reproduce.
    const r = pickMoneylineSide({ awayMl: -460, homeMl: 410, homeLine: -2.5 });
    expect(r.isAnomaly).toBe(true);
    expect(r.lowSignalReason).toBe('ml_spread_divergence');
    expect(r.modelSource).toBe('ml_spread_anomaly');
    // rawEdge collapsed to noise floor
    expect(Math.abs(r.rawEdge)).toBeLessThanOrEqual(NBA_MODEL_CONSTANTS.ANOMALY_RAW_EDGE_CAP + 1e-9);
    expect(r.isLowConviction).toBe(true);
    expect(r.divergence).toBeGreaterThanOrEqual(NBA_MODEL_CONSTANTS.ML_SPREAD_DIVERGENCE_FLAG);
  });

  it('healthy market alignment is NOT flagged', () => {
    // -7 home favorite priced -290 / +236. ML implies ~0.74 home, spread
    // implies ~0.625 home. Divergence ~0.115 — under the 0.15 threshold.
    const r = pickMoneylineSide({ awayMl: 236, homeMl: -290, homeLine: -7 });
    expect(r.isAnomaly).toBe(false);
    expect(r.modelSource).not.toBe('ml_spread_anomaly');
  });

  it('mild disagreement under threshold passes', () => {
    // Spread -3 implies ~0.554, ML -180/+155 implies ~0.629 home no-vig.
    // Divergence ~0.075.
    const r = pickMoneylineSide({ awayMl: 155, homeMl: -180, homeLine: -3 });
    expect(r.isAnomaly).toBe(false);
  });

  it('no spread → cannot detect divergence (no flag)', () => {
    const r = pickMoneylineSide({ awayMl: 200, homeMl: -240, homeLine: null });
    expect(r.isAnomaly).toBe(false);
    expect(r.divergence).toBeNull();
  });
});
