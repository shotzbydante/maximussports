/**
 * confidenceSystem — single source of truth for Maximus Picks confidence display.
 *
 * Consumed by: Content Studio slides, Home page, Odds Insights, captions.
 *
 * Thresholds (mirrors maximusPicksModel derivation constants):
 *   Pick 'Em:  HIGH ≥ 0.12  MEDIUM ≥ 0.07  LOW < 0.07
 *   ATS:       HIGH ≥ 0.16  MEDIUM ≥ 0.11  LOW < 0.11
 *   Value:     HIGH ≥ 0.07  MEDIUM ≥ 0.05  LOW < 0.05
 *   Totals:    HIGH ≥ 0.14  MEDIUM ≥ 0.10  LOW < 0.10
 */

const THRESHOLDS = {
  pickem: { min: 0.04, med: 0.07, high: 0.12 },
  ats:    { min: 0.08, med: 0.11, high: 0.16 },
  value:  { min: 0.04, med: 0.05, high: 0.07 },
  total:  { min: 0.06, med: 0.10, high: 0.14 },
};

// ─── Slide-context colors (dark backgrounds) ────────────────────────────────

export const CONF_COLORS_SLIDE = {
  high: {
    bg:       'rgba(45, 138, 110, 0.22)',
    text:     '#2d8a6e',
    border:   'rgba(45, 138, 110, 0.40)',
    barFill:  'linear-gradient(135deg, #2d8a6e, #3db88c)',
    barGlow:  'rgba(45, 138, 110, 0.30)',
  },
  medium: {
    bg:       'rgba(183, 152, 108, 0.22)',
    text:     '#B7986C',
    border:   'rgba(183, 152, 108, 0.40)',
    barFill:  'linear-gradient(135deg, #B7986C, #d4b896)',
    barGlow:  'rgba(183, 152, 108, 0.25)',
  },
  low: {
    bg:       'rgba(90, 107, 125, 0.18)',
    text:     '#7a8fa3',
    border:   'rgba(90, 107, 125, 0.30)',
    barFill:  'linear-gradient(135deg, #5a6b7d, #7a8b9d)',
    barGlow:  'rgba(90, 107, 125, 0.15)',
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
      if (c >= 2) return 'Strong model conviction — significant edge detected';
      if (c >= 1) return 'Model sees value the market may be underrating';
      return 'Marginal edge — market price looks close to fair';
    case 'ats':
      if (c >= 2) return 'ATS trends strongly favor this side to cover';
      if (c >= 1) return 'Recent form suggests a cover opportunity';
      return 'Directional lean — spread value at the margin';
    case 'value':
      if (c >= 2) return 'Model sees significantly more value than the market';
      if (c >= 1) return 'Moderate value gap between model and market';
      return 'Price looks efficient but edge still qualifies';
    case 'total':
      if (pick?.leanDirection === 'OVER') {
        if (c >= 2) return 'Strongest scoring environment on the board';
        if (c >= 1) return 'Scoring trends point toward the over';
        return 'Combined tempo leans toward higher scoring';
      }
      if (c >= 2) return 'Defensive matchup strongly favors the under';
      if (c >= 1) return 'Scoring pace suggests total may be set too high';
      return 'Marginal lean toward lower-scoring outcome';
    default:
      return 'Model edge detected';
  }
}

// ─── Maximus Take — compact top-signal summary ──────────────────────────────

export function getMaximusTake(allPicks) {
  if (!allPicks || allPicks.length === 0) return null;
  const leans = allPicks.filter(p => p.itemType === 'lean' && p.confidence >= 1);
  if (leans.length === 0) return null;

  const top = [...leans].sort(
    (a, b) => (b.confidence - a.confidence) || ((b.edgeMag ?? 0) - (a.edgeMag ?? 0)),
  )[0];
  if (!top) return null;

  const catLabel = { pickem: "Pick 'Em", ats: 'ATS', value: 'Value', total: 'Totals' }[top.pickType] ?? '';

  return {
    pick: top,
    label: top.pickLine || top.pickTeam || '—',
    category: catLabel,
    tier: getConfidenceTier(top.confidence),
    tierLabel: getConfidenceLabel(top.confidence),
    editorial: getEditorialLine(top),
  };
}
