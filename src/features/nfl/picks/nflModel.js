/**
 * NFL power-rating model — pure, deterministic, no I/O.
 *
 * Inputs are things the app can observe directly: final scores for the
 * season so far, plus the current standings as a fallback. There is no
 * injury, depth-chart, or weather feed behind this, and the model says so
 * in its output rather than pretending otherwise (see `informationGap`).
 *
 * Method
 * ------
 * 1. Opponent-adjusted offense and defense ratings, in points per game
 *    relative to league average, solved by damped fixed-point iteration
 *    (the same idea as SRS, split into its two halves). Home field is
 *    removed from each game before solving.
 * 2. Ratings are shrunk toward league average by games played, so a hot
 *    three-week start does not read as a 12-point team.
 * 3. A game projection is rating difference plus home field. Win and cover
 *    probabilities come from a normal distribution of final margin around
 *    that projection.
 * 4. The projection is then pulled most of the way toward the betting
 *    market. NFL closing lines are the best public forecast available and
 *    already price in injuries this model cannot see, so the model is
 *    allowed to nudge the market number, not replace it.
 */

export const NFL_MODEL = Object.freeze({
  /** Home-field advantage in points. Modern NFL sits between 1.5 and 2. */
  HOME_FIELD: 1.7,
  /** Std dev of final margin around a good pregame spread. */
  MARGIN_SD: 13.5,
  /** Std dev of final total points around a good pregame total. */
  TOTAL_SD: 13.5,
  /** Games of league-average prior used to shrink ratings. */
  PRIOR_GAMES: 4,
  /** Share of the model-vs-market gap the model keeps on sides. */
  MARKET_WEIGHT_SIDE: 0.30,
  /** Share of the model-vs-market gap the model keeps on totals. */
  MARKET_WEIGHT_TOTAL: 0.25,
  /** Raw disagreement (points) beyond which the market likely knows more. */
  INFO_GAP_SIDE: 7,
  INFO_GAP_TOTAL: 7,
  /** League scoring average used before any results exist. */
  DEFAULT_PPG: 22.5,
  /** Fixed-point iterations for the opponent adjustment. */
  ITERATIONS: 200,
  /**
   * Share of each new iterate that is kept. Undamped, the solve oscillates
   * forever whenever the schedule graph is bipartite, which is guaranteed
   * after Weeks 1 and 2 (every team has played one or two games, so the
   * graph is a set of even cycles). Averaging each step with the previous
   * one converges for every schedule.
   */
  DAMPING: 0.5,
  /** Games in the recent-form window. */
  FORM_WINDOW: 4,
});

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function round1(v) { return isNum(v) ? Math.round(v * 10) / 10 : null; }
function round3(v) { return isNum(v) ? Math.round(v * 1000) / 1000 : null; }

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(x) {
  if (!isNum(x)) return 0.5;
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation,
 * relative error below 1.2e-9). Input is clamped away from 0 and 1.
 */
export function normalInv(p) {
  if (!isNum(p)) return 0;
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425;
  if (q < lo) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5])
      / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - lo) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5])
      / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  const r = q - 0.5;
  const t = r * r;
  return (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r
    / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
}

/** American odds → implied probability, vig included. */
export function impliedFromAmerican(american) {
  if (!isNum(american) || american === 0) return null;
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

/** Remove the bookmaker margin from a two-way market. */
export function devig(pA, pB) {
  if (!isNum(pA) || !isNum(pB) || pA + pB <= 0) return { a: null, b: null };
  const sum = pA + pB;
  return { a: pA / sum, b: pB / sum };
}

/**
 * Solve opponent-adjusted ratings from final scores.
 *
 * @param {Array<{homeSlug,awaySlug,homeScore,awayScore,date?,week?,neutralSite?}>} results
 * @param {object} [opts]
 * @param {object} [opts.standings] — slug → { pointsFor, pointsAgainst, wins, losses, ties }
 *        used only for teams with no results (or when results are empty)
 * @returns {{ teams: Record<string, TeamRating>, leaguePpg: number, source: string, games: number }}
 */
export function buildNflRatings(results = [], { standings = null } = {}) {
  const finals = (results || []).filter(g =>
    g && g.homeSlug && g.awaySlug && isNum(g.homeScore) && isNum(g.awayScore)
  );

  if (finals.length === 0) return ratingsFromStandings(standings);

  const hfa = NFL_MODEL.HOME_FIELD;
  const slugs = new Set();
  let totalPoints = 0;
  for (const g of finals) {
    slugs.add(g.homeSlug); slugs.add(g.awaySlug);
    totalPoints += g.homeScore + g.awayScore;
  }
  const leaguePpg = totalPoints / (finals.length * 2);

  // Per-team game logs, home field already removed.
  const logs = {};
  for (const s of slugs) logs[s] = [];
  for (const g of finals) {
    const when = g.date ? Date.parse(g.date) : 0;
    // International and other neutral-site games carry no home edge.
    const h = g.neutralSite ? 0 : hfa;
    logs[g.homeSlug].push({
      opp: g.awaySlug, home: true, when, week: g.week ?? null,
      pf: g.homeScore - h / 2, pa: g.awayScore + h / 2,
      rawPf: g.homeScore, rawPa: g.awayScore,
    });
    logs[g.awaySlug].push({
      opp: g.homeSlug, home: false, when, week: g.week ?? null,
      pf: g.awayScore + h / 2, pa: g.homeScore - h / 2,
      rawPf: g.awayScore, rawPa: g.homeScore,
    });
  }
  for (const s of slugs) logs[s].sort((a, b) => a.when - b.when);

  // Fixed-point solve. off = points scored above average against an average
  // defense; def = points prevented relative to average against an average
  // offense. Positive is good for both.
  let off = {}, def = {};
  for (const s of slugs) { off[s] = 0; def[s] = 0; }
  for (let i = 0; i < NFL_MODEL.ITERATIONS; i++) {
    const nextOff = {}, nextDef = {};
    for (const s of slugs) {
      const games = logs[s];
      let o = 0, d = 0;
      for (const g of games) {
        o += (g.pf - leaguePpg) + (def[g.opp] ?? 0);
        d += (leaguePpg - g.pa) + (off[g.opp] ?? 0);
      }
      nextOff[s] = games.length ? o / games.length : 0;
      nextDef[s] = games.length ? d / games.length : 0;
    }
    // Re-centre each pass so the system cannot drift, then damp.
    const meanOff = mean(Object.values(nextOff));
    const meanDef = mean(Object.values(nextDef));
    const k = NFL_MODEL.DAMPING;
    for (const s of slugs) {
      nextOff[s] = (1 - k) * off[s] + k * (nextOff[s] - meanOff);
      nextDef[s] = (1 - k) * def[s] + k * (nextDef[s] - meanDef);
    }
    off = nextOff; def = nextDef;
  }

  const teams = {};
  for (const s of slugs) {
    const games = logs[s];
    const n = games.length;
    const shrink = n / (n + NFL_MODEL.PRIOR_GAMES);
    const offense = off[s] * shrink;
    const defense = def[s] * shrink;

    const margins = games.map(g => g.rawPf - g.rawPa);
    const seasonMargin = mean(margins);
    const recent = margins.slice(-NFL_MODEL.FORM_WINDOW);
    const recentMargin = recent.length ? mean(recent) : null;
    const last = games[n - 1] || null;

    teams[s] = {
      slug: s,
      games: n,
      rating: round1(offense + defense),
      offense: round1(offense),
      defense: round1(defense),
      rawMargin: round1(seasonMargin),
      pointsForPg: round1(mean(games.map(g => g.rawPf))),
      pointsAgainstPg: round1(mean(games.map(g => g.rawPa))),
      sos: round1(mean(games.map(g => (off[g.opp] ?? 0) + (def[g.opp] ?? 0)))),
      recentMargin: round1(recentMargin),
      formTrend: isNum(recentMargin) && n > NFL_MODEL.FORM_WINDOW ? round1(recentMargin - seasonMargin) : 0,
      lastGameAt: last?.when || null,
      shrink: round3(shrink),
    };
  }

  // Teams with no finals yet (bye in week 1, or a partial fetch) fall back to
  // standings-derived numbers so every matchup can still be projected.
  if (standings) {
    const fallback = ratingsFromStandings(standings).teams;
    for (const [slug, r] of Object.entries(fallback)) {
      if (!teams[slug]) teams[slug] = { ...r, source: 'standings' };
    }
  }

  return { teams, leaguePpg: round1(leaguePpg), source: 'results', games: finals.length };
}

/** Rating fallback when no game results are available: raw points per game. */
export function ratingsFromStandings(standings) {
  const rows = Object.entries(standings || {})
    .map(([slug, s]) => ({
      slug,
      games: (s?.wins ?? 0) + (s?.losses ?? 0) + (s?.ties ?? 0),
      pf: s?.pointsFor, pa: s?.pointsAgainst,
    }))
    .filter(r => r.games > 0 && isNum(r.pf) && isNum(r.pa));

  if (rows.length === 0) {
    return { teams: {}, leaguePpg: NFL_MODEL.DEFAULT_PPG, source: 'none', games: 0 };
  }

  const leaguePpg = rows.reduce((a, r) => a + r.pf, 0) / rows.reduce((a, r) => a + r.games, 0);
  const teams = {};
  for (const r of rows) {
    const shrink = r.games / (r.games + NFL_MODEL.PRIOR_GAMES);
    const offense = (r.pf / r.games - leaguePpg) * shrink;
    const defense = (leaguePpg - r.pa / r.games) * shrink;
    teams[r.slug] = {
      slug: r.slug,
      games: r.games,
      rating: round1(offense + defense),
      offense: round1(offense),
      defense: round1(defense),
      rawMargin: round1((r.pf - r.pa) / r.games),
      pointsForPg: round1(r.pf / r.games),
      pointsAgainstPg: round1(r.pa / r.games),
      sos: null,
      recentMargin: null,
      formTrend: 0,
      lastGameAt: null,
      shrink: round3(shrink),
    };
  }
  return { teams, leaguePpg: round1(leaguePpg), source: 'standings', games: 0 };
}

/**
 * Project one game from ratings alone (no market input).
 *
 * @returns {{ margin, fairSpreadHome, total, homePoints, awayPoints, homeWinProb, awayWinProb } | null}
 *          margin is home minus away; fairSpreadHome is the home line (negative = home favoured)
 */
export function projectNflGame({ homeSlug, awaySlug, ratings, neutralSite = false }) {
  const home = ratings?.teams?.[homeSlug];
  const away = ratings?.teams?.[awaySlug];
  if (!home || !away) return null;

  const hfa = neutralSite ? 0 : NFL_MODEL.HOME_FIELD;
  const lg = isNum(ratings.leaguePpg) ? ratings.leaguePpg : NFL_MODEL.DEFAULT_PPG;

  const homePoints = lg + home.offense - away.defense + hfa / 2;
  const awayPoints = lg + away.offense - home.defense - hfa / 2;
  const margin = homePoints - awayPoints;
  const homeWinProb = normalCdf(margin / NFL_MODEL.MARGIN_SD);

  return {
    margin: round1(margin),
    fairSpreadHome: round1(-margin),
    total: round1(homePoints + awayPoints),
    homePoints: round1(homePoints),
    awayPoints: round1(awayPoints),
    homeWinProb: round3(homeWinProb),
    awayWinProb: round3(1 - homeWinProb),
  };
}

/**
 * Blend a rating projection with the market and price each side.
 *
 * `market.spreadHome` is the home team's line (-3.5 means home favoured by
 * 3.5). When the market has no number for a market type, that market's
 * fields come back null and no pick should be made on it.
 */
export function priceNflGame({ projection, market = {} }) {
  if (!projection) return null;

  const out = {
    side: null,
    total: null,
    moneyline: null,
  };

  // ── Sides ────────────────────────────────────────────────────────────────
  // How far the model moves off the market, in points toward the home team.
  let adjGap = null;
  if (isNum(market.spreadHome)) {
    const marketMargin = -market.spreadHome;
    const rawGap = projection.margin - marketMargin;          // + = model likes home more
    adjGap = rawGap * NFL_MODEL.MARKET_WEIGHT_SIDE;
    const homeCover = normalCdf(adjGap / NFL_MODEL.MARGIN_SD);

    out.side = {
      marketSpreadHome: market.spreadHome,
      modelSpreadHome: projection.fairSpreadHome,
      blendedSpreadHome: round1(-(marketMargin + adjGap)),
      rawGap: round1(rawGap),
      edgePoints: round1(adjGap),
      homeCoverProb: round3(homeCover),
      awayCoverProb: round3(1 - homeCover),
      informationGap: Math.abs(rawGap) >= NFL_MODEL.INFO_GAP_SIDE,
    };
  }

  // ── Moneyline ────────────────────────────────────────────────────────────
  // Anchored on the moneyline's own no-vig probability, then shifted by the
  // same point adjustment as the spread. Pricing it from the spread through
  // a normal curve instead would manufacture an "edge" on every underdog,
  // because real moneylines on big favourites run shorter than that curve
  // implies. Anchoring means: no model disagreement, no moneyline edge, and
  // the moneyline can never point the opposite way from the spread pick.
  const fair = devig(impliedFromAmerican(market.moneylineHome), impliedFromAmerican(market.moneylineAway));
  if (isNum(fair.a) && isNum(fair.b)) {
    const z = normalInv(fair.a);
    if (adjGap == null) {
      // No spread posted: measure the gap against the moneyline-implied margin.
      adjGap = (projection.margin - z * NFL_MODEL.MARGIN_SD) * NFL_MODEL.MARKET_WEIGHT_SIDE;
    }
    const homeWin = normalCdf(z + adjGap / NFL_MODEL.MARGIN_SD);
    out.moneyline = {
      homeWinProb: round3(homeWin),
      awayWinProb: round3(1 - homeWin),
      impliedHome: round3(fair.a),
      impliedAway: round3(fair.b),
      homeEdge: round3(homeWin - fair.a),
      awayEdge: round3(fair.a - homeWin),
      priced: true,
    };
  } else {
    // No two-way price: report a win probability, but there is nothing to bet.
    const homeWin = isNum(market.spreadHome)
      ? normalCdf((-market.spreadHome + adjGap) / NFL_MODEL.MARGIN_SD)
      : projection.homeWinProb;
    out.moneyline = {
      homeWinProb: round3(homeWin),
      awayWinProb: round3(1 - homeWin),
      impliedHome: null,
      impliedAway: null,
      homeEdge: null,
      awayEdge: null,
      priced: false,
    };
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  if (isNum(market.total)) {
    const rawGap = projection.total - market.total;           // + = model leans over
    const adjGap = rawGap * NFL_MODEL.MARKET_WEIGHT_TOTAL;
    const over = normalCdf(adjGap / NFL_MODEL.TOTAL_SD);
    out.total = {
      marketTotal: market.total,
      modelTotal: projection.total,
      blendedTotal: round1(market.total + adjGap),
      rawGap: round1(rawGap),
      edgePoints: round1(adjGap),
      overProb: round3(over),
      underProb: round3(1 - over),
      informationGap: Math.abs(rawGap) >= NFL_MODEL.INFO_GAP_TOTAL,
    };
  }

  return out;
}

/**
 * Pythagorean win expectation for the NFL (exponent 2.37).
 * Returns the share of games a team "should" have won from its scoring.
 */
export function pythagoreanWinPct(pointsFor, pointsAgainst) {
  if (!isNum(pointsFor) || !isNum(pointsAgainst) || pointsFor + pointsAgainst <= 0) return null;
  const e = 2.37;
  const pf = Math.pow(Math.max(pointsFor, 0), e);
  const pa = Math.pow(Math.max(pointsAgainst, 0), e);
  return pf + pa > 0 ? pf / (pf + pa) : null;
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
