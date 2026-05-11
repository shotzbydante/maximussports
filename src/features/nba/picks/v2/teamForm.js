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
      weightedRecentMargin: null,        // v13b
      recentBlowoutRisk: false,          // v13b
      repeatedLossRisk: false,           // v13b
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

  // v13b: recency-weighted margin. `finals` is sorted newest → oldest by
  // `pastFinalsFor`. Weight = 1 / (1 + index) → most-recent game gets 1.0,
  // next 0.5, next 0.33, ... — bounded but materially favors the most
  // recent result. This is what lets the model catch a team in a fresh
  // collapse / hot streak even when the older average looks neutral.
  let wSum = 0, wTotal = 0;
  finals.forEach((r, i) => {
    const w = 1 / (1 + i);
    wSum += r.margin * w;
    wTotal += w;
  });
  const weightedRecentMargin = wTotal > 0 ? wSum / wTotal : null;

  // v13b: simple repeated-blowout flags
  const blowoutLosses = finals.filter(r => r.margin <= -10).length;
  const blowoutWins   = finals.filter(r => r.margin >= +10).length;
  const recentBlowoutRisk = n >= 2 && blowoutLosses >= 2;
  const repeatedLossRisk  = n >= 2 && finals.filter(r => r.margin < 0).length === n;

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
    // v13b additions
    weightedRecentMargin: round2(weightedRecentMargin),
    recentBlowoutRisk,
    repeatedLossRisk,
    blowoutLossCount: blowoutLosses,
    blowoutWinCount: blowoutWins,
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
 * v12b — ATS short-dog support gate (+0.5 .. +6.5 inclusive). Mirrors the
 * v12 long-shot ML dog gate but for the ATS market: a small/moderate
 * underdog spread can ride cross-market disagreement to a hero/briefing
 * slot without any independent reason to think the dog will keep it
 * close. CLE +3 (May 5 slate, lost cover by 7) was the production
 * example.
 *
 * Returns supported=true ONLY when:
 *   - both teams have ≥ 2 priors
 *   - the dog's recent margin is non-negative (not in a losing slide)
 *   - the favorite's recent margin advantage isn't massively larger
 *     than the spread (the dog isn't being asked to absorb a true
 *     blowout). Threshold: support ≤ spreadAbs + 6.
 */
export function isShortAtsDogSupportedByForm({
  favoriteForm, underdogForm, line,
  shortDogMin = 0.5, shortDogMax = 6.5,
} = {}) {
  if (!isNum(line)) return { supported: false, reason: 'no_line' };
  if (line < shortDogMin || line > shortDogMax) {
    return { supported: true, reason: 'not_short_dog' };
  }
  if (!underdogForm || underdogForm.sample < 2) {
    return { supported: false, reason: 'low_sample_dog' };
  }
  if (!favoriteForm || favoriteForm.sample < 2) {
    return { supported: false, reason: 'low_sample_fav' };
  }
  // Dog must not be in a losing trend.
  if (underdogForm.recentMarginAvg < -8) {
    return { supported: false, reason: 'dog_recent_margin_negative' };
  }
  const ms = recentMarginSupport({ favoriteForm, underdogForm });
  if (ms.supportPoints != null && ms.supportPoints > line + 6) {
    // Favorite materially exceeds spread by recent margin → cover risk.
    return { supported: false, reason: 'favorite_dominates_recent' };
  }
  return { supported: true, reason: 'form_supports_short_dog' };
}

/**
 * v12b — long-shot ML dog HARD cap. Independent of `isLongShotDogSupportedByForm`.
 * For prices ≥ +500 and cross-market source, the gate is unconditional:
 * never hero/briefing. The PHI/SAS lessons + LAL +700 May 5 loss
 * confirmed that even with form data, +500+ dogs are too noisy on cross-
 * market signal alone. A real independent model can lift the cap by
 * setting modelSource away from the cross-market enum.
 */
export function isLongShotDogHardCapped({
  priceAmerican, modelSource,
  hardCapPriceAbs = 500,
} = {}) {
  if (!isNum(priceAmerican) || priceAmerican < hardCapPriceAbs) {
    return { capped: false, reason: 'below_hard_cap' };
  }
  const isCrossMarket = ['spread', 'devigged_ml', 'no_vig_blend'].includes(modelSource);
  if (!isCrossMarket) {
    return { capped: false, reason: 'non_cross_market_source' };
  }
  return { capped: true, reason: 'long_shot_cross_market_hard_cap' };
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

/**
 * v13 — totals volatility risk gate.
 *
 * `team_recent_v1+trend_v1` produced the DET @ CLE Under 213 hero pick
 * that missed by 12 points (final 225). Recent finals for either team
 * had wide score variance — the model committed too confidently to a
 * direction the signal couldn't actually support. v13 caps confidence
 * when:
 *   - either team's recent combined-score standard deviation is high
 *     (> totalsVolatilityAbs, default 15 points), AND
 *   - the model's fair-total delta vs the market is small
 *     (|fairTotal − marketTotal| < tightDeltaAbs, default 3 points),
 *
 * Returns { capped, reason, awayVol, homeVol, delta }.
 * `capped: true` → builder should demote to tracking + briefing reject.
 */
export function isTotalsTooVolatileForHero({
  awayForm, homeForm, marketTotal, fairTotal,
  totalsVolatilityAbs = 15,
  tightDeltaAbs = 3,
} = {}) {
  if (!isNum(marketTotal) || !isNum(fairTotal)) {
    return { capped: false, reason: 'missing_total' };
  }
  const delta = Math.abs(fairTotal - marketTotal);
  const awayVol = awayForm?.marginVolatility ?? null;
  const homeVol = homeForm?.marginVolatility ?? null;
  // Use the max of the two — single noisy team is enough to capsize
  // a totals projection.
  const maxVol = Math.max(awayVol ?? 0, homeVol ?? 0);
  if (maxVol >= totalsVolatilityAbs && delta < tightDeltaAbs) {
    return {
      capped: true,
      reason: 'high_volatility_thin_delta',
      awayVolatility: awayVol, homeVolatility: homeVol,
      delta: round2(delta),
    };
  }
  if (delta < 2) {
    // Mirror-the-market totals never qualify as hero regardless of
    // volatility. The fair-total chain must say something the market
    // isn't already pricing.
    return {
      capped: true,
      reason: 'thin_delta_mirror_market',
      awayVolatility: awayVol, homeVolatility: homeVol,
      delta: round2(delta),
    };
  }
  return {
    capped: false,
    reason: null,
    awayVolatility: awayVol, homeVolatility: homeVol,
    delta: round2(delta),
  };
}

/**
 * v13 — ATS dog margin cushion.
 *
 * For ATS underdog picks the cushion is how many points the spread
 * gives the dog beyond what the model projects the favorite to win by.
 * A thin cushion (< 2 points) means a normal-variance game outcome
 * easily exceeds the spread.
 *
 *   line = +5, projectedHomeMargin = -3.8 (home loses by 3.8)
 *     home-dog cushion = away projected margin vs +5 spread.
 *     If selected side is HOME dog at +5: cushion = 5 - 3.8 = 1.2 pts.
 *
 *   line = +5, projectedHomeMargin = -7.5 (home loses by 7.5)
 *     If selected side is HOME dog at +5: cushion = 7.5 - 5 = +2.5 pts.
 *
 * Returns:
 *   { cushion, bucket: 'thin'|'lean'|'hero', supported }
 * where cushion is in points and supported is true iff bucket==='hero'.
 */
export function atsDogMarginCushion({
  projectedHomeMargin, line, selectedSide,
  heroCushionPts = 3.5,
  leanCushionPts = 2.0,
} = {}) {
  if (!isNum(projectedHomeMargin) || !isNum(line)) {
    return { cushion: null, bucket: 'thin', supported: false, reason: 'missing_inputs' };
  }
  // line is the SELECTED side's line. Positive = dog.
  if (line <= 0) {
    return { cushion: null, bucket: 'fav', supported: true, reason: 'not_dog' };
  }
  // Compute cushion in points. selectedSide is 'away' or 'home'.
  // projectedHomeMargin > 0 means home wins by that many points.
  //
  //   Away dog at line=+5 covers when final home_margin < 5.
  //     cushion = 5 - projectedHomeMargin
  //     (e.g., projHM=3.8 → cushion=1.2 [thin]; projHM=-2 → cushion=7 [hero])
  //
  //   Home dog at line=+5 covers when final home_margin > -5
  //     (home loses by less than 5).
  //     cushion = projectedHomeMargin - (-line) = projectedHomeMargin + line
  //     (e.g., projHM=-2.5 → cushion=2.5 [lean])
  let cushion;
  if (selectedSide === 'home') {
    cushion = projectedHomeMargin + line;
  } else if (selectedSide === 'away') {
    cushion = line - projectedHomeMargin;
  } else {
    return { cushion: null, bucket: 'thin', supported: false, reason: 'unknown_side' };
  }
  cushion = round2(cushion);
  let bucket;
  if (cushion >= heroCushionPts) bucket = 'hero';
  else if (cushion >= leanCushionPts) bucket = 'lean';
  else bucket = 'thin';
  return {
    cushion,
    bucket,
    supported: bucket === 'hero',
    reason: bucket === 'thin' ? 'cushion_below_lean' :
            bucket === 'lean' ? 'cushion_lean_only' :
            'cushion_supports_hero',
  };
}

export const TEAM_FORM_CONSTANTS = Object.freeze({ SAMPLE_CAP });
