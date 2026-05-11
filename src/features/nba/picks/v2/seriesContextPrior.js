/**
 * seriesContextPrior — bounded support/cap signal derived from the
 * current playoff series state.
 *
 * The May 9/10 weekend audit (docs/nba-weekend-results-model-audit-
 * may9-10-v13.md) showed a recurring failure mode:
 *   - LAL/PHI: getting picked as long-shot ML dogs while their series
 *     trailing-team trend was clearly negative.
 *   - OKC/NYK: dominating their series but the model assigned no extra
 *     favorite support beyond cross-market arbitrage.
 *
 * This helper consumes series data (from `buildNbaPlayoffContext` +
 * `findSeriesForGame`) and returns a SMALL, BOUNDED prior:
 *
 *   {
 *     teamSlug, opponentSlug,
 *     leadState: 'leading' | 'trailing' | 'tied' | 'unknown',
 *     teamWins, opponentWins, gamesPlayed,
 *     // Recent margin of THIS team in the series (last up-to-3 games)
 *     recentSeriesMarginAvg,
 *     // Net of margin deltas — "dominant favorite" or "collapsing dog"
 *     trailingTeamRisk: boolean,   // down 0-2/0-3 + losing by big margins
 *     dominantFavoriteSupport: boolean, // up 2-0/3-0 + big margins
 *     // Confidence is conservative: 2 series games minimum, 3+ stronger.
 *     sample,
 *     confidence,
 *     // Bounded support score in [-1, +1]. Negative = capping signal for
 *     // this team's ML/ATS; positive = supporting signal.
 *     support,
 *   }
 *
 * No hard-coded teams. Pure function. Used as a GATE on hero/briefing,
 * never as a pick selector — full-slate ML/ATS/Total contract is intact.
 */

const SAMPLE_FLOOR_FOR_RISK = 2;
const TRAILING_DOWN_DEFICIT = 2;          // ≥ 2 game deficit
const DOMINANT_LEAD_THRESHOLD = 2;        // ≥ 2 game lead
const BLOWOUT_MARGIN = 10;                // points

function isNum(v) { return v != null && Number.isFinite(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round2(v) { return isNum(v) ? Math.round(v * 100) / 100 : null; }

/**
 * From a series object, compute per-team series margin for the games
 * THIS team played. Positive margin = team won by that many points.
 */
function recentSeriesMargins({ series, teamSlug, lastN = 3 }) {
  if (!series || !Array.isArray(series.games)) return { margins: [], sample: 0 };
  const games = [...series.games]
    .sort((a, b) => {
      const at = a?.gameDate ? new Date(a.gameDate).getTime() : 0;
      const bt = b?.gameDate ? new Date(b.gameDate).getTime() : 0;
      return bt - at;
    })
    .slice(0, lastN);
  const margins = [];
  for (const g of games) {
    if (!isNum(g?.winScore) || !isNum(g?.loseScore)) continue;
    if (g.winnerSlug === teamSlug) margins.push(g.winScore - g.loseScore);
    else if (g.loserSlug === teamSlug) margins.push(-(g.winScore - g.loseScore));
  }
  return { margins, sample: margins.length };
}

/**
 * Build the prior for a given pick subject (team being evaluated).
 *
 * @param {object} args
 * @param {object} args.series — from playoffContext (topTeam/bottomTeam/
 *   seriesScore/games). When null, returns a no-op prior.
 * @param {string} args.teamSlug — slug of the team whose ML/ATS pick
 *   we're evaluating support for.
 */
export function seriesContextPrior({ series, teamSlug } = {}) {
  const out = {
    teamSlug, opponentSlug: null,
    leadState: 'unknown',
    teamWins: 0, opponentWins: 0, gamesPlayed: 0,
    recentSeriesMarginAvg: null,
    trailingTeamRisk: false,
    dominantFavoriteSupport: false,
    sample: 0, confidence: 0,
    support: 0,
  };
  if (!series || !teamSlug) return out;

  const topSlug = series.topTeam?.slug;
  const btmSlug = series.bottomTeam?.slug;
  if (teamSlug !== topSlug && teamSlug !== btmSlug) return out;

  const isTop = teamSlug === topSlug;
  out.opponentSlug = isTop ? btmSlug : topSlug;
  out.teamWins = isTop ? (series.seriesScore?.top ?? 0) : (series.seriesScore?.bottom ?? 0);
  out.opponentWins = isTop ? (series.seriesScore?.bottom ?? 0) : (series.seriesScore?.top ?? 0);
  out.gamesPlayed = (out.teamWins ?? 0) + (out.opponentWins ?? 0);

  if (out.teamWins > out.opponentWins) out.leadState = 'leading';
  else if (out.teamWins < out.opponentWins) out.leadState = 'trailing';
  else if (out.gamesPlayed > 0) out.leadState = 'tied';

  const rm = recentSeriesMargins({ series, teamSlug });
  out.sample = rm.sample;
  if (rm.sample > 0) {
    const sum = rm.margins.reduce((s, m) => s + m, 0);
    out.recentSeriesMarginAvg = round2(sum / rm.sample);
  }
  out.confidence = clamp(rm.sample / 3, 0, 1);

  // Trailing-team risk: team is materially down AND has been losing by
  // blowout-level margins recently in the same series.
  if (
    out.sample >= SAMPLE_FLOOR_FOR_RISK
    && out.leadState === 'trailing'
    && (out.opponentWins - out.teamWins) >= TRAILING_DOWN_DEFICIT
    && isNum(out.recentSeriesMarginAvg)
    && out.recentSeriesMarginAvg <= -BLOWOUT_MARGIN
  ) {
    out.trailingTeamRisk = true;
  }

  // Dominant-favorite support: mirror condition on the leading side.
  if (
    out.sample >= SAMPLE_FLOOR_FOR_RISK
    && out.leadState === 'leading'
    && (out.teamWins - out.opponentWins) >= DOMINANT_LEAD_THRESHOLD
    && isNum(out.recentSeriesMarginAvg)
    && out.recentSeriesMarginAvg >= BLOWOUT_MARGIN
  ) {
    out.dominantFavoriteSupport = true;
  }

  // Bounded support score for downstream callers that want a single
  // number. Always small.
  let support = 0;
  if (out.trailingTeamRisk) support = -0.5 * out.confidence;
  else if (out.dominantFavoriteSupport) support = +0.5 * out.confidence;
  else if (out.recentSeriesMarginAvg != null) {
    // Tiny linear blend (caps at ±0.2)
    support = clamp(out.recentSeriesMarginAvg / 30, -0.2, 0.2) * out.confidence;
  }
  out.support = round2(support);

  return out;
}

/**
 * Gate helper — does series context support a ML/ATS hero promotion
 * for the selected team?
 *
 *   - returns `supported: false` when the team is the trailing collapser.
 *   - returns `supported: true` when the team is the dominant favorite.
 *   - returns `neutral: true` otherwise (no opinion).
 */
export function isSeriesContextSupportingHero({ prior } = {}) {
  if (!prior || prior.sample === 0) {
    return { supported: null, neutral: true, reason: 'no_series_sample' };
  }
  if (prior.trailingTeamRisk) {
    return { supported: false, neutral: false, reason: 'trailing_team_collapse_risk' };
  }
  if (prior.dominantFavoriteSupport) {
    return { supported: true, neutral: false, reason: 'dominant_favorite_support' };
  }
  return { supported: null, neutral: true, reason: 'series_neutral' };
}

export const SERIES_PRIOR_CONSTANTS = Object.freeze({
  SAMPLE_FLOOR_FOR_RISK,
  TRAILING_DOWN_DEFICIT,
  DOMINANT_LEAD_THRESHOLD,
  BLOWOUT_MARGIN,
});
