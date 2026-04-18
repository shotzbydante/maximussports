/**
 * Bet Score — composite quality score per pick candidate.
 *
 *   betScore = wE·E + wC·C + wS·S + wM·M    ∈ [0, 1]
 *
 * Weights come from the active tuning config; component values come from
 * src/features/mlb/picks/v2/components.js.
 */

import { edgeStrength, modelConfidence, situationalEdge, marketQuality } from './components.js';

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function computeBetScore({ matchup, score, marketType, side, rawEdge, totalDelta, config }) {
  const caps = config?.components?.edge || {};
  const E = edgeStrength(rawEdge, marketType, totalDelta, caps);
  const C = modelConfidence(score);
  const S = situationalEdge(matchup, score, side);
  const M = marketQuality(matchup, marketType, config?.components?.mkt);

  const w = config?.weights || { edge: 0.4, conf: 0.25, sit: 0.2, mkt: 0.15 };
  const total = clamp01(w.edge * E + w.conf * C + w.sit * S + w.mkt * M);

  return {
    total: round3(total),
    components: {
      edgeStrength: round3(E),
      modelConfidence: round3(C),
      situationalEdge: round3(S),
      marketQuality: round3(M),
    },
    weights: { ...w },
  };
}

function round3(v) { return Math.round(v * 1000) / 1000; }
