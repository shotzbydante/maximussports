/**
 * teamForm — recent-margin / scoring trend prior derived from ESPN finals
 * already loaded into the picks builder's `windowGames`.
 *
 * v12 adds this as an INDEPENDENT signal that v9-v11 lacked. v9-v11 only
 * had cross-market arbitrage (spread vs. de-vigged ML) — that's still the
 * most defensible quantitative signal, but it has no view on whether a
 * team has actually been *playing well* recently. teamForm closes that
 * gap with a small, bounded prior:
 *
 *   computeTeamForm({ teamSlug, windowGames }) → {
 *     recentScoringAvg, recentAllowedAvg, recentMarginAvg,
 *     recentTotalAvg, sample, confidence,
 *     marginVolatility,
 *     // bounded scalar signed by relative form (-1..+1)
 *     formScore,
 *   }
 *
 *   recentMarginSupport(favorite, underdog) → {
 *     supportPoints,        // favorite_margin − underdog_margin (signed)
 *     supportConfidence,    // [0..1] from sample sizes
 *   }
 *
 *   isLongShotDogSupportedByForm(...) — rejects long-shot ML dog
 *     unless there's an actual recent-form reason to like the dog.
 *
 *   isLargeFavoriteSupportedByMargin(...) — rejects large favorite
 *     spread unless recent margin support clears the spread.
 *
 * Limitations: ESPN finals window is 7 days currently (per nbaPicksBuilder).
 * That's at most a few games per team in the playoffs — small sample.
 * The helper caps confidence at sample/6 and never drives selection alone.
 * It is a *gate* on hero/briefing, not a replacement for the model.
 */

const SAMPLE_CAP = 6;

function isNum(v) { return v != null && Number.isFinite(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round2(v) { return isNum(v) ? Math.round(v * 100) / 100 : null; }

/**
 * Pull the most recent finals (any opponent) for a given team slug from
 * windowGames. Returns the parsed pf/pa pairs in chronological order
 * (newest first).
 */
function pastFinalsFor(slug, windowGames, sampleCap = SAMPLE_CAP) {
  if (!slug || !Array.isArray(windowGames)) return [];
  const sorted = [...windowGames].sort((a, b) => {
    const at = a?.startTime ? new Date(a.startTime).getTime() : 0;
    const bt = b?.startTime ? new Date(b.startTime).getTime() : 0;
    return bt - at;
  });
  const rows = [];
  for (const g of sorted) {
    const isFinal = !!(g?.gameState?.isFinal || g?.status === 'final');
    if (!isFinal) continue;
    const a = g?.teams?.away?.slug;
    const h = g?.teams?.home?.slug;
    if (a !== slug && h !== slug) continue;
    const aScore = Number(g?.teams?.away?.score);
    const hScore = Number(g?.teams?.home?.score);
    if (!Number.isFinite(aScore) || !Number.isFinite(hScore)) continue;
    const isAway = a === slug;
    const pf = isAway ? aScore : hScore;
    const pa = isAway ? hScore : aScore;
    rows.push({ pf, pa, isAway, total: pf + pa, margin: pf - pa, startTime: g.startTime });
    if (rows.length >= sampleCap) break;
  }
  return rows;
}

export function computeTeamForm({ teamSlug, windowGames, sampleCap = SAMPLE_CAP } = {}) {
  const finals = pastFinalsFor(teamSlug, windowGames, sampleCap);
  if (finals.length === 0) {
    return {
      teamSlug, sample: 0, confidence: 0,
      recentScoringAvg: null, recentAllowedAvg: null,
      recentMarginAvg: null, recentTotalAvg: null,
      marginVolatility: null, formScore: 0,
    };
  }
  const n = finals.length;
  const sumPf = finals.reduce((s, r) => s + r.pf, 0);
  const sumPa = finals.reduce((s, r) => s + r.pa, 0);
  const sumMargin = finals.reduce((s, r) => s + r.margin, 0);
  const sumTotal = finals.reduce((s, r) => s + r.total, 0);
  const recentMarginAvg = sumMargin / n;

  // Margin volatility — std dev. Used to soften over-confident projections.
  const variance = finals.reduce((s, r) => s + Math.pow(r.margin - recentMarginAvg, 2), 0) / n;
  const marginVolatility = Math.sqrt(variance);

  // Bounded form score in [-1, +1].
  // ±15-point average margin is treated as a strong end of the scale.
  const formScore = clamp(recentMarginAvg / 15, -1, 1);

  return {
    teamSlug,
    sample: n,
    confidence: clamp(n / sampleCap, 0, 1),
    recentScoringAvg: round2(sumPf / n),
    recentAllowedAvg: round2(sumPa / n),
    recentMarginAvg:  round2(recentMarginAvg),
    recentTotalAvg:   round2(sumTotal / n),
    marginVolatility: round2(marginVolatility),
    formScore: round2(formScore),
  };
}

/**
 * Recent-margin support for a (favorite, underdog) pair. Returns the
 * SIGNED point cushion the favorite has based on recent form. A positive
 * supportPoints means the favorite has been outscoring the underdog by
 * that many points recently (in *separate* games against various opponents).
 *
 * supportConfidence saturates at min(favSample, dogSample) / SAMPLE_CAP.
 */
export function recentMarginSupport({ favoriteForm, underdogForm } = {}) {
  if (!favoriteForm || !underdogForm) {
    return { supportPoints: null, supportConfidence: 0 };
  }
  if (!isNum(favoriteForm.recentMarginAvg) || !isNum(underdogForm.recentMarginAvg)) {
    return { supportPoints: null, supportConfidence: 0 };
  }
  const supportPoints = favoriteForm.recentMarginAvg - underdogForm.recentMarginAvg;
  const supportConfidence = Math.min(favoriteForm.confidence, underdogForm.confidence);
  return {
    supportPoints: round2(supportPoints),
    supportConfidence: round2(supportConfidence),
  };
}

/**
 * Long-shot ML dog must show recent form support to be promoted past
 * tracking. For a +200 or longer dog, we require:
 *   - the dog's recent margin average is non-negative, AND
 *   - the favorite's recent margin average is not large enough to fully
 *     explain the dog's status.
 * Otherwise the dog is tracking-only.
 *
 * Sample size matters: with low sample, we conservatively REJECT (return
 * supported=false) so the gate stays on. Once a real season-long rating
 * lands, this gate can relax.
 */
export function isLongShotDogSupportedByForm({
  favoriteForm, underdogForm,
  longShotPriceAbs = 200,
  priceAmerican,
} = {}) {
  if (!isNum(priceAmerican)) return { supported: false, reason: 'no_price' };
  if (priceAmerican < longShotPriceAbs) {
    return { supported: true, reason: 'not_long_shot' };
  }
  if (!underdogForm || underdogForm.sample < 2) {
    return { supported: false, reason: 'low_sample_dog' };
  }
  if (!favoriteForm || favoriteForm.sample < 2) {
    return { supported: false, reason: 'low_sample_fav' };
  }
  // Dog must not be in a losing trend itself.
  if (underdogForm.recentMarginAvg < -8) {
    return { supported: false, reason: 'dog_recent_margin_negative' };
  }
  // The favorite's margin advantage must not be overwhelmingly large.
  const ms = recentMarginSupport({ favoriteForm, underdogForm });
  if (ms.supportPoints != null && ms.supportPoints > 12) {
    return { supported: false, reason: 'favorite_dominates_recent' };
  }
  return { supported: true, reason: 'form_supports_dog' };
}

/**
 * Large-favorite spread (line ≤ -10) must have recent-form support.
 * Returns supported=true when the favorite's recent margin clears the
 * spread in absolute terms; otherwise the pick is tracking-only.
 */
export function isLargeFavoriteSupportedByMargin({
  favoriteForm, underdogForm,
  spreadAbs,                  // absolute value of the spread, e.g. 13 for SAS -13
  largeSpreadAbs = 10,
  marginCushionPts = 2,       // require margin ≥ spread + cushion
} = {}) {
  if (!isNum(spreadAbs) || spreadAbs < largeSpreadAbs) {
    return { supported: true, reason: 'not_large' };
  }
  if (!favoriteForm || favoriteForm.sample < 2) {
    return { supported: false, reason: 'low_sample_fav' };
  }
  if (!underdogForm || underdogForm.sample < 2) {
    return { supported: false, reason: 'low_sample_dog' };
  }
  const ms = recentMarginSupport({ favoriteForm, underdogForm });
  if (ms.supportPoints == null) return { supported: false, reason: 'no_margin_signal' };
  // Cushion: we want fav's recent margin ADVANTAGE ≥ spread + cushion.
  if (ms.supportPoints + marginCushionPts < spreadAbs) {
    return {
      supported: false,
      reason: 'recent_margin_below_spread',
      supportPoints: ms.supportPoints,
      requiredPoints: spreadAbs - marginCushionPts,
    };
  }
  // Underdog must not be hot.
  if (isNum(underdogForm.recentMarginAvg) && underdogForm.recentMarginAvg > 5) {
    return { supported: false, reason: 'underdog_recent_form_hot' };
  }
  return { supported: true, reason: 'recent_margin_supports' };
}

/**
 * Totals trend agreement — do both teams' recent total averages point in
 * the same direction as the model's selected over/under?
 *
 * Returns:
 *   { agreement: 'agree'|'mixed'|'unknown',
 *     boost: 0|0.05|-0.05,
 *     awayDelta, homeDelta }
 *
 * Boost is small and bounded: only used as a soft conviction nudge by
 * downstream guardrails — never overrides a pick selection.
 */
export function totalsTrendAgreement({
  awayForm, homeForm, marketTotal, fairTotal,
} = {}) {
  if (!isNum(marketTotal) || !isNum(fairTotal)) {
    return { agreement: 'unknown', boost: 0, awayDelta: null, homeDelta: null };
  }
  const direction = fairTotal >= marketTotal ? 'over' : 'under';
  if (!awayForm || !homeForm) {
    return { agreement: 'unknown', boost: 0, awayDelta: null, homeDelta: null };
  }
  if (awayForm.sample < 2 || homeForm.sample < 2) {
    return { agreement: 'unknown', boost: 0, awayDelta: null, homeDelta: null };
  }
  if (!isNum(awayForm.recentTotalAvg) || !isNum(homeForm.recentTotalAvg)) {
    return { agreement: 'unknown', boost: 0, awayDelta: null, homeDelta: null };
  }
  const awayDelta = awayForm.recentTotalAvg - marketTotal;
  const homeDelta = homeForm.recentTotalAvg - marketTotal;
  const awayDir = awayDelta >= 0 ? 'over' : 'under';
  const homeDir = homeDelta >= 0 ? 'over' : 'under';
  if (awayDir === direction && homeDir === direction) {
    return { agreement: 'agree', boost: 0.05, awayDelta: round2(awayDelta), homeDelta: round2(homeDelta) };
  }
  return { agreement: 'mixed', boost: -0.02, awayDelta: round2(awayDelta), homeDelta: round2(homeDelta) };
}

export const TEAM_FORM_CONSTANTS = Object.freeze({ SAMPLE_CAP });
