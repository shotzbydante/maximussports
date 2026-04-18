/**
 * Default picks tuning config — seeded in picks_config table via migration.
 * Imported at build time as the fallback when DB read fails or returns null.
 *
 * Kept sport-agnostic: each sport provides its own config record; the shape
 * is shared so the validator and engine can operate across MLB/NBA/future.
 */

export const MLB_DEFAULT_CONFIG = Object.freeze({
  version: 'mlb-picks-tuning-2026-04-17a',
  sport: 'mlb',
  weights: Object.freeze({ edge: 0.40, conf: 0.25, sit: 0.20, mkt: 0.15 }),
  tierCutoffs: Object.freeze({
    tier1: { floor: 0.75, slatePercentile: 0.90 },
    tier2: { floor: 0.60, slatePercentile: 0.70 },
    tier3: { floor: 0.45, slatePercentile: 0.50 },
  }),
  maxPerTier: Object.freeze({ tier1: 3, tier2: 5, tier3: 5 }),
  maxPerGame: 2,
  maxTier1PerGame: 1,
  marketGates: Object.freeze({
    total: { minConfidence: 0.55, minExpectedDelta: 0.35 },
    runline: { minProbSpread: 0.05 },
  }),
  components: Object.freeze({
    edge: { mlCap: 0.10, rlCap: 0.08, totDeltaCap: 1.5 },
    mkt: { minConsensusBooks: 3 },
  }),
});

export const MLB_MODEL_VERSION = 'mlb-picks-v2.0.0';

export function getDefaultConfigForSport(sport) {
  if (sport === 'mlb') return MLB_DEFAULT_CONFIG;
  throw new Error(`No default config for sport=${sport}`);
}
