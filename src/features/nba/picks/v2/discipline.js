/**
 * NBA picks discipline — post-build calibration of bet score, conviction, and
 * publish status. Applies the corrections from the 2026-05-02 audit
 * (docs/nba-playoff-picks-model-audit-v1.md):
 *
 *   - Low-confidence cap         → cap label below "Solid" when book/model
 *                                  confidence is weak and no multi-factor support.
 *   - Single-driver / market-only → cap below "Top Play" and label explicitly.
 *   - Spread discipline          → larger spreads need multi-factor support;
 *                                  edge alone never drives a spread pick.
 *   - Injury-data missing        → favorites lose Top Play eligibility and
 *                                  receive a small confidence haircut.
 *   - Game 7 / elimination       → huge favorites suppressed without multi-
 *                                  factor support; home favorites haircut.
 *
 * Each rule sets a `flags.*` marker on the pick so the UI can label honestly.
 */

const LABEL_ORDER = { 'Lean': 0, 'Solid': 1, 'Strong': 2, 'Top Play': 3 };
const LABEL_CEIL = { 'Lean': 0.549, 'Solid': 0.699, 'Strong': 0.849, 'Top Play': 1.0 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round3(v) { return Math.round(v * 1000) / 1000; }

/**
 * Convert a final betScore total into the conviction label band.
 * Mirrors buildNbaPicksV2#convictionLabel — kept here so caps/floors in
 * one place stay consistent.
 */
export function labelFromScore(total) {
  if (total >= 0.85) return 'Top Play';
  if (total >= 0.70) return 'Strong';
  if (total >= 0.55) return 'Solid';
  return 'Lean';
}

/**
 * Multi-factor support: at least two of {confidence, situational, market}
 * components are notably elevated. Edge is intentionally excluded — the whole
 * point is to require evidence beyond raw edge.
 */
export function multiFactorSupport(components, thresholds = {}) {
  const c = components || {};
  const supports = [
    (c.modelConfidence ?? 0) >= (thresholds.confFloor ?? 0.50),
    (c.situationalEdge ?? 0) >= (thresholds.sitFloor  ?? 0.62),
    (c.marketQuality   ?? 0) >= (thresholds.mktFloor  ?? 0.85),
  ];
  return supports.filter(Boolean).length >= 2;
}

/**
 * Market-only / single-driver detector. The pick's only meaningful source
 * is rawEdge — no model trust, no situational support beyond the home tilt.
 */
export function isMarketOnlyDriver(components) {
  const c = components || {};
  return (c.modelConfidence ?? 0) < 0.40 && (c.situationalEdge ?? 0) <= 0.55;
}

/**
 * A pick "favors" a side when the side is the chalk on its market:
 *   moneyline: priceAmerican < 0
 *   runline (spread): line < 0
 */
export function isFavoriteSide(pick) {
  const t = pick?.market?.type;
  if (t === 'runline') return (pick?.market?.line ?? 0) < 0;
  if (t === 'moneyline') return (pick?.market?.priceAmerican ?? 0) < 0;
  return false;
}

/**
 * Apply discipline to a single pick.
 *
 * @param {object} pick — a pick produced by makePick()
 * @param {object} ctx
 * @param {boolean} [ctx.injuryDataAvailable=false]
 * @param {boolean} [ctx.isElimination=false]
 * @param {boolean} [ctx.isGameSeven=false]
 * @param {object}  [config] — NBA tuning config; reads `discipline` block
 * @param {object}  [opts]
 * @param {'publish'|'fullSlate'} [opts.mode='publish']
 *   `publish` (default, legacy): may return null to suppress entirely.
 *   `fullSlate` (v7 contract): NEVER returns null. Suppression instead
 *   caps the conviction to "Low Conviction", flags `tracking: true`, and
 *   keeps the pick so it can be persisted + graded as a tracking pick.
 * @returns {object|null} the updated pick, or `null` when mode='publish'
 *   and discipline decided to suppress.
 */
export function applyDiscipline(pick, ctx = {}, config = {}, opts = {}) {
  const mode = opts.mode === 'fullSlate' ? 'fullSlate' : 'publish';
  if (!pick || !pick.betScore) return pick;

  const disc = config.discipline || {};
  const components = pick.betScore.components || {};
  const flags = { ...(pick.flags || {}) };

  let total = pick.betScore.total ?? 0;
  let labelCap = null;       // most restrictive cap chosen below
  let suppress = false;

  const conf = components.modelConfidence ?? 0;
  const sit  = components.situationalEdge ?? 0;

  const multi = multiFactorSupport(components, disc.multiFactor);
  const marketOnly = isMarketOnlyDriver(components);
  const lowConf = conf < (disc.lowConfidence?.threshold ?? 0.35);
  const isFav = isFavoriteSide(pick);

  // ── R1: Low-confidence cap ────────────────────────────────────
  if (lowConf && !multi) {
    flags.lowConfidenceCapped = true;
    labelCap = mostRestrictive(labelCap, 'Lean');
  }

  // ── R2: Single-driver / market-only cap ───────────────────────
  if (marketOnly) {
    flags.marketOnlyLean = true;
    labelCap = mostRestrictive(labelCap, multi ? 'Solid' : 'Lean');
  }

  // ── R3: Spread discipline ─────────────────────────────────────
  const isSpread = pick.market?.type === 'runline';
  const lineAbs = isSpread ? Math.abs(pick.market?.line ?? 0) : 0;

  if (isSpread) {
    const heavy = disc.spread?.heavyAbs ?? 12;
    const large = disc.spread?.largeAbs ?? 8;

    if (lineAbs >= heavy) {
      flags.heavySpreadCapped = true;
      labelCap = mostRestrictive(labelCap, multi ? 'Solid' : 'Lean');
    } else if (lineAbs >= large) {
      // Suppress when big spread + low conf + no multi-factor agreement.
      const confFloor = disc.spread?.largeMinConfidence ?? 0.45;
      if (!multi && conf < confFloor) {
        flags.largeSpreadSuppressed = true;
        suppress = true;
      } else if (!multi) {
        flags.largeSpreadCapped = true;
        labelCap = mostRestrictive(labelCap, 'Solid');
      }
    }

    // Spread validation: never publish off edge alone.
    const sitFloor  = disc.spread?.sitFloor  ?? 0.55;
    const confFloor = disc.spread?.confFloor ?? 0.40;
    if (sit < sitFloor && conf < confFloor) {
      flags.spreadEdgeOnly = true;
      labelCap = mostRestrictive(labelCap, 'Lean');
    }
  }

  // ── R5b: Cross-market-only signal cap (v9) ──
  // When the pick's model probability comes from cross-market arbitrage
  // (spread vs de-vigged moneyline) without a real independent NBA
  // model, we cannot honestly publish a hero-tier conviction. Cap to
  // "Solid" so tracking labels collapse appropriately. Independent model
  // signals (`devigged_ml` for spread, `spread` for ML) are exactly the
  // cross-market case the v9 audit identified.
  if (pick.isLowConviction === true) {
    flags.crossMarketSignalOnly = true;
    labelCap = mostRestrictive(labelCap, 'Solid');
  }
  if (pick.modelSource === 'spread' || pick.modelSource === 'devigged_ml' || pick.modelSource === 'no_vig_blend') {
    flags.crossMarketSignalOnly = true;
    labelCap = mostRestrictive(labelCap, 'Solid');
  }

  // ── R6: Injury data unavailable → favorites lose Top Play, haircut ──
  if (ctx.injuryDataAvailable === false) {
    flags.injuryDataAvailable = false;
    if (isFav) {
      labelCap = mostRestrictive(labelCap, 'Strong');
      total = total * (disc.injuryUnknown?.favHaircut ?? 0.95);
    }
  } else {
    flags.injuryDataAvailable = true;
  }

  // ── R7: Game 7 / elimination logic ────────────────────────────
  if (ctx.isElimination || ctx.isGameSeven) {
    flags.elimination = true;
    if (ctx.isGameSeven) flags.gameSeven = true;

    const elimFavLineFloor = disc.elimination?.suppressFavLineAbs ?? 5;
    if (isFav && lineAbs >= elimFavLineFloor && !multi) {
      flags.eliminationSuppressed = true;
      suppress = true;
    } else if (isFav && lineAbs >= elimFavLineFloor) {
      labelCap = mostRestrictive(labelCap, 'Solid');
      flags.eliminationCapped = true;
    }

    // Home favorites haircut — closeout chalk is historically noisy.
    const isHomeFav = isFav && pick.selection?.side === 'home';
    if (isHomeFav) {
      total = total * (disc.elimination?.homeFavHaircut ?? 0.80);
      flags.eliminationHomeHaircut = true;
    }
  }

  // Suppression behavior depends on mode:
  //   - publish (legacy): return null so the caller drops the pick.
  //   - fullSlate (v7):   keep the pick, cap to "Lean", flag tracking.
  //                       Picks always reach persistence + grading.
  if (suppress) {
    if (mode === 'publish') return null;
    flags.tracking = true;
    flags.suppressedReason = (
      flags.eliminationSuppressed ? 'elimination' :
      flags.largeSpreadSuppressed ? 'large_spread' :
      'discipline'
    );
    labelCap = mostRestrictive(labelCap, 'Lean');
  }

  // Apply label cap by clamping the score to the label's ceiling — score and
  // label always agree downstream.
  if (labelCap) {
    const ceil = LABEL_CEIL[labelCap] ?? 1.0;
    total = Math.min(total, ceil);
  }

  total = clamp(total, 0, 1);
  const label = labelFromScore(total);

  return {
    ...pick,
    betScore: { ...pick.betScore, total: round3(total) },
    conviction: { label, score: Math.round(total * 100) },
    confidence: total >= 0.75 ? 'high' : total >= 0.60 ? 'medium' : 'low',
    confidenceScore: Math.round(total * 100) / 100,
    flags,
  };
}

function mostRestrictive(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (LABEL_ORDER[a] ?? 99) <= (LABEL_ORDER[b] ?? 99) ? a : b;
}

export const NBA_DISCIPLINE_DEFAULTS = Object.freeze({
  lowConfidence: { threshold: 0.35 },
  multiFactor:   { confFloor: 0.50, sitFloor: 0.62, mktFloor: 0.85 },
  spread:        {
    heavyAbs: 12, largeAbs: 8,
    largeMinConfidence: 0.45,
    confFloor: 0.40, sitFloor: 0.55,
  },
  injuryUnknown: { favHaircut: 0.95 },
  elimination:   { suppressFavLineAbs: 5, homeFavHaircut: 0.80 },
});
