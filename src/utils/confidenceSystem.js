/**
 * confidenceSystem — single source of truth for Maximus Picks confidence display.
 *
 * Consumed by: Content Studio slides, Home page, Odds Insights, captions.
 *
 * Thresholds (mirrors maximusPicksModel derivation constants):
 *   Pick 'Em:  HIGH ≥ 0.14  MEDIUM ≥ 0.07  LOW < 0.07
 *   ATS:       HIGH ≥ 0.18  MEDIUM ≥ 0.12  LOW < 0.12
 *   Value:     HIGH ≥ 0.08  MEDIUM ≥ 0.05  LOW < 0.05
 *   Totals:    HIGH ≥ 0.16  MEDIUM ≥ 0.12  LOW < 0.12
 */

const THRESHOLDS = {
  pickem: { min: 0.05, med: 0.07, high: 0.14 },
  ats:    { min: 0.10, med: 0.12, high: 0.18 },
  value:  { min: 0.04, med: 0.05, high: 0.08 },
  total:  { min: 0.08, med: 0.12, high: 0.16 },
};

// ─── Slide-context colors (dark backgrounds) ────────────────────────────────

export const CONF_COLORS_SLIDE = {
  high: {
    bg:        'rgba(45, 138, 110, 0.22)',
    text:      '#2d8a6e',
    border:    'rgba(45, 138, 110, 0.40)',
    barFill:   'linear-gradient(135deg, #2d8a6e, #3db88c)',
    barGlow:   'rgba(45, 138, 110, 0.30)',
    barHeight: 6,
  },
  medium: {
    bg:        'rgba(183, 152, 108, 0.22)',
    text:      '#B7986C',
    border:    'rgba(183, 152, 108, 0.40)',
    barFill:   'linear-gradient(135deg, #B7986C, #d4b896)',
    barGlow:   'rgba(183, 152, 108, 0.25)',
    barHeight: 5,
  },
  low: {
    bg:        'rgba(90, 107, 125, 0.18)',
    text:      '#7a8fa3',
    border:    'rgba(90, 107, 125, 0.30)',
    barFill:   'linear-gradient(135deg, #5a6b7d, #7a8b9d)',
    barGlow:   'rgba(90, 107, 125, 0.15)',
    barHeight: 4,
  },
};

// ─── Tier classification ────────────────────────────────────────────────────

export function getConfidenceTier(confidence) {
  if (confidence >= 2) return 'high';
  if (confidence >= 1) return 'medium';
  return 'low';
}

export function getConfidenceLabel(confidence) {
  if (confidence >= 2) return 'HIGH';
  if (confidence >= 1) return 'MEDIUM';
  return 'LOW';
}

// ─── Color lookup ───────────────────────────────────────────────────────────

export function getSlideColors(confidence) {
  return CONF_COLORS_SLIDE[getConfidenceTier(confidence)];
}

// ─── Normalized bar fill (0–100) ────────────────────────────────────────────
// Guarantees fill correlates with tier:
//   LOW → 10–33   MEDIUM → 34–66   HIGH → 67–100

export function getBarFill(pick) {
  const edgeMag = pick?.edgeMag ?? 0;
  const conf    = pick?.confidence ?? 0;
  const t       = THRESHOLDS[pick?.pickType] ?? THRESHOLDS.pickem;

  if (conf >= 2) {
    const ceiling = t.high * 2;
    const ratio = Math.min(Math.max((edgeMag - t.high) / (ceiling - t.high), 0), 1);
    return Math.round(67 + ratio * 33);
  }
  if (conf >= 1) {
    const ratio = Math.min(Math.max((edgeMag - t.med) / (t.high - t.med), 0), 1);
    return Math.round(34 + ratio * 32);
  }
  const ratio = Math.min(edgeMag / Math.max(t.med, 0.01), 1);
  return Math.round(10 + ratio * 23);
}

export function getBarBlocks(pick, total = 6) {
  return Math.max(1, Math.round((getBarFill(pick) / 100) * total));
}

// ─── Edge display text ──────────────────────────────────────────────────────

export function getEdgeText(pick) {
  if (pick?.pickType === 'value' && pick.edgePp != null) return `+${pick.edgePp}%`;
  return `+${Math.round((pick?.edgeMag ?? 0) * 100)}%`;
}

// ─── Editorial one-liner ────────────────────────────────────────────────────

export function getEditorialLine(pick) {
  const c = pick?.confidence ?? 0;
  switch (pick?.pickType) {
    case 'pickem':
      if (c >= 2) return 'Composite model edge exceeds HIGH threshold — strongest conviction tier';
      if (c >= 1) return 'Model-vs-market divergence detected — moderate conviction';
      return 'Marginal edge — market price looks close to efficient';
    case 'ats':
      if (c >= 2) return 'ATS form differential and spread-adjusted edge both exceed top tier';
      if (c >= 1) return 'Cover rate differential suggests a directional lean after spread discount';
      return 'Directional lean — spread value exists but magnitude is thin';
    case 'value':
      if (c >= 2) return 'Model probability exceeds market implied by a significant margin';
      if (c >= 1) return 'Meaningful model-vs-market probability gap detected';
      return 'Edge qualifies but the value gap is narrow';
    case 'total':
      if (pick?.leanDirection === 'OVER') {
        if (c >= 2) return 'Both sides\' ATS trends agree on elevated scoring environment';
        if (c >= 1) return 'Combined tempo signals lean toward the over';
        return 'Slight scoring lean — signals are present but not commanding';
      }
      if (c >= 2) return 'Defensive matchup profiles converge on lower-scoring outcome';
      if (c >= 1) return 'Pace signals suggest total may be set slightly high';
      return 'Marginal lean toward the under — proceed with caution';
    default:
      return 'Model edge detected';
  }
}

// ─── Model Edge display (optional — only when data exists) ──────────────────

export function getModelEdgeDisplay(pick) {
  if (!pick) return null;

  if (pick.pickType === 'value' && pick.modelPct != null && pick.marketImpliedPct != null) {
    return {
      lines: [
        { label: 'Model prob', value: `${pick.modelPct}%` },
        { label: 'Market implied', value: `${pick.marketImpliedPct}%` },
        { label: 'Edge', value: `+${pick.edgePp ?? Math.round((pick.edgeMag ?? 0) * 100)}pp` },
      ],
    };
  }

  if (pick.pickType === 'ats' && pick.spread != null && pick.edgeMag != null) {
    return {
      lines: [
        { label: 'Spread', value: pick.spread > 0 ? `+${pick.spread}` : String(pick.spread) },
        { label: 'ATS edge', value: `+${Math.round(pick.edgeMag * 100)}%` },
      ],
    };
  }

  if (pick.pickType === 'total' && pick.lineValue != null && pick.edgeMag != null) {
    return {
      lines: [
        { label: 'Line', value: String(pick.lineValue) },
        { label: 'Edge', value: `+${Math.round(pick.edgeMag * 100)}%` },
      ],
    };
  }

  if (pick.modelLine != null && pick.marketLine != null) {
    const edge = Math.abs(pick.modelLine - pick.marketLine);
    return {
      lines: [
        { label: 'Model', value: String(pick.modelLine) },
        { label: 'Market', value: String(pick.marketLine) },
        { label: 'Edge', value: `+${edge.toFixed(1)} pts` },
      ],
    };
  }

  return null;
}

// ─── Maximus Take — editorial top-signal summary ─────────────────────────────

const TAKE_TYPE_LABELS = {
  pickem: 'Top straight-up signal',
  ats:    'Sharpest spread edge',
  value:  'Best value shot',
  total_OVER: 'Sharpest over on the board',
  total_UNDER: 'Sharp under signal',
};

function getTakeTypeLabel(pick) {
  if (!pick) return '';
  if (pick.pickType === 'total') {
    const dir = pick.leanDirection || 'OVER';
    return TAKE_TYPE_LABELS[`total_${dir}`] ?? 'Sharpest total';
  }
  if (pick.pickType === 'value' && pick.mlPriceLabel) {
    const ml = parseInt(String(pick.mlPriceLabel).replace('+', ''), 10);
    if (!isNaN(ml) && ml >= 500) return 'Longshot worth watching';
  }
  return TAKE_TYPE_LABELS[pick.pickType] ?? '';
}

/**
 * Score picks for editorial interest, not just raw strength.
 * Value and total picks get a slight boost because they tell a more
 * compelling "story of the board" than a straightforward pick'em or spread.
 */
function editorialScore(pick) {
  const conf = pick.confidence ?? 0;
  const edge = pick.edgeMag ?? 0;
  const typeBoost = { value: 0.25, total: 0.15, ats: 0.05, pickem: 0 }[pick.pickType] ?? 0;
  return conf * 2 + edge + typeBoost;
}

export function getMaximusTake(allPicks) {
  if (!allPicks || allPicks.length === 0) return null;
  const leans = allPicks.filter(p => p.itemType === 'lean' && p.confidence >= 1);
  if (leans.length === 0) return null;

  const top = [...leans].sort((a, b) => editorialScore(b) - editorialScore(a))[0];
  if (!top) return null;

  const catLabel = { pickem: "Pick 'Em", ats: 'ATS', value: 'Value', total: 'Totals' }[top.pickType] ?? '';
  const takeType = getTakeTypeLabel(top);

  return {
    pick: top,
    label: top.pickLine || top.pickTeam || '—',
    category: catLabel,
    takeType,
    tier: getConfidenceTier(top.confidence),
    tierLabel: getConfidenceLabel(top.confidence),
    editorial: getEditorialLine(top),
  };
}
