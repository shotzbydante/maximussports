/**
 * displayMetrics — canonical UI labels/values/descriptions per pick.
 *
 * The user-facing problem (v15 audit, May 12):
 *   The card showed "Confidence: 33%" on MIN +10. A reasonable reader
 *   inferred "so SAS −10 must be 67%." That's wrong: `modelConfidence`
 *   in betScore.components is `dataQuality × signalAgreement` —
 *   data-/model-quality, not hit probability. Both sides share the
 *   same signal quality.
 *
 * This module is a pure function that takes a pick (after makePick has
 * populated risk flags + buckets) and returns a UI-ready
 * `displayMetrics` object. The frontend renders these strings verbatim
 * so there's no client-side semantic confusion.
 *
 * NO INVENTED HIT PROBABILITIES. Hit probability is only emitted when
 * `pick.modelProb` is credible (currently: ML picks where pickMoneylineSide
 * computed a no-vig-blended modelProb). For ATS / Totals we surface
 * projected edge in POINTS, not a synthetic probability.
 */

function isNum(v) { return v != null && Number.isFinite(v); }
function pct(v, digits = 1) {
  if (!isNum(v)) return null;
  const n = v * 100;
  return digits === 0 ? `${Math.round(n)}%` : `${n.toFixed(digits)}%`;
}
function signedPts(v, digits = 1) {
  if (!isNum(v)) return null;
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toFixed(digits)} pts`;
}

const ROLE_DESC = {
  hero:     'Recommended play. Promoted to the hero board.',
  tracking: 'Tracking only. Shown for full-slate calibration, not a recommended play.',
};

function buildEdge(pick) {
  const t = pick?.market?.type;
  if (t === 'moneyline') {
    if (!isNum(pick.rawEdge)) return null;
    return {
      label: 'Edge',
      value: pct(pick.rawEdge, 1),
      description: 'Model probability minus de-vigged market probability.',
    };
  }
  if (t === 'runline') {
    // Prefer cover-edge in points when available; fall back to rawEdge%.
    const sp = pick.spreadDebug || {};
    const side = pick.selection?.side;
    const coverEdge = side === 'away' ? sp.awayCoverEdge : sp.homeCoverEdge;
    if (isNum(coverEdge)) {
      return {
        label: 'Cover edge',
        value: signedPts(coverEdge, 1),
        description: 'Projected margin vs. the spread, in points.',
      };
    }
    if (isNum(pick.rawEdge)) {
      return {
        label: 'Edge',
        value: pct(pick.rawEdge, 1),
        description: 'Projected probability vs market (compressed).',
      };
    }
    return null;
  }
  if (t === 'total') {
    const td = pick.totalDebug || {};
    if (isNum(td.delta)) {
      return {
        label: 'Fair total Δ',
        value: signedPts(td.delta, 1),
        description: 'Model fair total minus the market line, in points.',
      };
    }
    return null;
  }
  return null;
}

function buildSignalQuality(pick) {
  const mc = pick?.betScore?.components?.modelConfidence;
  if (!isNum(mc)) return null;
  return {
    label: 'Signal quality',
    value: pct(mc, 0),
    description:
      'Model + data confidence. NOT the probability this pick wins. ' +
      'Both sides of the same game share the same signal quality — ' +
      'it measures how robust the inputs are, not which side is more likely.',
  };
}

function buildHitProbability(pick) {
  const t = pick?.market?.type;
  // We only expose hit probability when modelProb is credible.
  // pickMoneylineSide produces a no-vig-blended modelProb for ML picks;
  // ATS / Totals don't have a credible probability today.
  if (t !== 'moneyline') return null;
  if (!isNum(pick.modelProb)) return null;
  // If the source is purely the de-vigged moneyline (no independent
  // model) the probability is effectively the market — don't surface
  // it as the model's own estimate.
  if (pick.modelSource === null || pick.modelSource === undefined) return null;
  return {
    label: 'Model probability',
    value: pct(pick.modelProb, 0),
    description:
      'Model estimate of the selected team winning. Directional only — ' +
      'do NOT read as a guaranteed hit rate.',
  };
}

function buildBetScore(pick) {
  const total = pick?.betScore?.total;
  if (!isNum(total)) return null;
  return {
    label: 'Bet score',
    value: String(Math.round(total * 100)),
    description: 'Composite 0–100 ranking score across all picks today.',
  };
}

function buildRole(pick) {
  const role = pick?.pickRole === 'hero' ? 'hero' : 'tracking';
  return {
    label: role === 'hero' ? 'Recommended' : 'Tracking',
    description: ROLE_DESC[role],
    role,
  };
}

function buildOppositeSide(pick) {
  const t = pick?.market?.type;
  const sel = pick?.selection?.label;
  if (!sel) return null;
  if (t === 'moneyline') {
    // For ML, opposite side is the other team. We don't say their
    // probability — we explain why signal quality is symmetric.
    const otherTeam = pick.selection?.side === 'away'
      ? pick.matchup?.homeTeam?.shortName
      : pick.matchup?.awayTeam?.shortName;
    if (!otherTeam) return null;
    return {
      label: `Why not ${otherTeam}?`,
      description:
        'Signal quality applies to both sides of the same game. ' +
        `The model just sees marginal value on ${sel}; it is NOT saying ` +
        `${otherTeam} has the inverse probability.`,
    };
  }
  if (t === 'runline') {
    // For ATS, opposite side is the favorite/dog flip.
    const line = pick.market?.line;
    const otherTeam = pick.selection?.side === 'away'
      ? pick.matchup?.homeTeam?.shortName
      : pick.matchup?.awayTeam?.shortName;
    if (!otherTeam || !isNum(line)) return null;
    const otherLine = -line;
    const otherLineStr = otherLine > 0 ? `+${otherLine}` : `${otherLine}`;
    return {
      label: `Why not ${otherTeam} ${otherLineStr}?`,
      description:
        `A low signal quality on ${sel} does NOT mean ${otherTeam} ${otherLineStr} ` +
        'is the inverse probability. The model sees small cover value on ' +
        'the chosen side; signal quality measures how robust the inputs are, ' +
        'which is the same on both sides.',
    };
  }
  if (t === 'total') {
    const otherSide = pick.selection?.side === 'over' ? 'Under' : 'Over';
    return {
      label: `Why not ${otherSide}?`,
      description:
        `The model's fair total leans ${pick.selection?.side === 'over' ? 'higher' : 'lower'} ` +
        'than the market line. Signal quality measures the data behind ' +
        'that lean — it is not the inverse probability of the other side.',
    };
  }
  return null;
}

function buildConvictionLabel(pick) {
  return pick?.conviction?.label || null;
}

/**
 * Build the full displayMetrics object for a pick. Each sub-object is
 * `null` when the underlying signal isn't available, so the UI can
 * skip-render gracefully.
 */
export function buildDisplayMetrics(pick) {
  if (!pick) return null;
  const edge = buildEdge(pick);
  const signalQuality = buildSignalQuality(pick);
  const hitProb = buildHitProbability(pick);
  const betScore = buildBetScore(pick);
  const role = buildRole(pick);
  const oppositeSide = buildOppositeSide(pick);
  return {
    edgeLabel:                    edge?.label ?? null,
    edgeValue:                    edge?.value ?? null,
    edgeDescription:              edge?.description ?? null,
    signalQualityLabel:           signalQuality?.label ?? null,
    signalQualityValue:           signalQuality?.value ?? null,
    signalQualityDescription:     signalQuality?.description ?? null,
    hitProbabilityLabel:          hitProb?.label ?? null,
    hitProbabilityValue:          hitProb?.value ?? null,
    hitProbabilityDescription:    hitProb?.description ?? null,
    betScoreLabel:                betScore?.label ?? null,
    betScoreValue:                betScore?.value ?? null,
    betScoreDescription:          betScore?.description ?? null,
    convictionLabel:              buildConvictionLabel(pick),
    roleLabel:                    role.label,
    roleDescription:              role.description,
    pickRole:                     role.role,
    oppositeSideLabel:            oppositeSide?.label ?? null,
    oppositeSideDescription:      oppositeSide?.description ?? null,
  };
}
