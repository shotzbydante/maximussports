/**
 * Season ratings for NBA sides.
 *
 * Until v2.6.0 the engine had no opinion of its own about a spread: it
 * turned the market's moneyline into a margin and compared that with the
 * market's spread. The two disagree by a point or so in the underdog's
 * favor on almost every game, so every side lean was the underdog and none
 * was strong enough to be a pick.
 *
 * This gives sides an independent input: each team's season scoring margin
 * per game, pulled part of the way back to league average while the season
 * is young, plus home court. The projection is then blended most of the way
 * back to the market line (the market knows about injuries, rest and travel;
 * this does not), and a projection that is far from the line is treated as
 * missing information, not as an edge.
 *
 * Pure functions, no I/O. The standings fetch lives in
 * api/_lib/nbaSeasonRatings.js.
 */

export const SEASON_RATINGS = Object.freeze({
  /** Points of home-court advantage. */
  homeCourt: 2.2,
  /** Shrink: a team's margin counts for games / (games + shrinkGames). */
  shrinkGames: 5,
  /** Fewer games than this and the team has no rating yet. */
  minGames: 8,
  /** Share of the gap between the ratings and the market line that is kept. */
  marketKeep: 0.3,
  /** A raw gap this large means the market knows something the ratings do not. */
  guardGap: 8,
  /** Kept edge (points) below which a side is a coin flip, not a lean. */
  minCoverEdge: 0.5,
  /** Kept edge (points) at which the side's raw edge reaches the engine's spread cap. */
  fullEdgePoints: 2.4,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** A team's season margin per game, shrunk toward zero early in the season. Null when it cannot be rated. */
export function shrunkMargin(team, cfg = SEASON_RATINGS) {
  if (!team || !isNum(team.pointDiff) || !isNum(team.games)) return null;
  if (team.games < cfg.minGames) return null;
  return team.pointDiff * (team.games / (team.games + cfg.shrinkGames));
}

/**
 * Projected home margin from the two teams' season ratings.
 * Positive means the home team is projected to win by that many points.
 * Null when either team cannot be rated.
 */
export function projectHomeMarginFromRatings({ home, away, neutralSite = false } = {}, cfg = SEASON_RATINGS) {
  const h = shrunkMargin(home, cfg);
  const a = shrunkMargin(away, cfg);
  if (h == null || a == null) return null;
  return h - a + (neutralSite ? 0 : cfg.homeCourt);
}

/**
 * Set a ratings projection against the market's spread.
 *
 * @param {number} ratingsHomeMargin  projection from projectHomeMarginFromRatings
 * @param {number} homeLine           the home team's spread, signed (-7 = home favored by 7)
 * @returns {{ side: 'home'|'away', projectedHomeMargin: number, rawGap: number,
 *            homeCoverEdge: number, awayCoverEdge: number, coverPts: number,
 *            guarded: boolean, thin: boolean }}
 */
export function ratingsAgainstSpread(ratingsHomeMargin, homeLine, cfg = SEASON_RATINGS) {
  const marketMargin = -homeLine;
  const rawGap = ratingsHomeMargin - marketMargin;
  const homeCoverEdge = cfg.marketKeep * rawGap;
  const coverPts = Math.abs(homeCoverEdge);
  // Dead level: take the favorite, as the engine does elsewhere.
  const side = homeCoverEdge > 0 ? 'home'
    : homeCoverEdge < 0 ? 'away'
      : (homeLine <= 0 ? 'home' : 'away');
  return {
    side,
    projectedHomeMargin: marketMargin + homeCoverEdge,
    rawGap,
    homeCoverEdge,
    awayCoverEdge: -homeCoverEdge,
    coverPts,
    guarded: Math.abs(rawGap) >= cfg.guardGap,
    thin: coverPts < cfg.minCoverEdge,
  };
}

/**
 * Pull season scoring margins out of ESPN's standings payload.
 * Returns { [espnTeamId]: { pointDiff, games } }, margin in points per game.
 *
 * ESPN has carried the margin under more than one stat name, so this reads
 * whichever is present and rejects values that cannot be a per-game margin.
 */
export function parseStandingsRatings(data) {
  const out = {};
  const entries = [];
  const walk = (node) => {
    for (const e of node?.standings?.entries || []) entries.push(e);
    for (const child of node?.children || []) walk(child);
  };
  walk(data);

  for (const entry of entries) {
    const id = String(entry?.team?.id || '');
    if (!id) continue;
    const stats = entry?.stats || [];
    const stat = (name) => {
      const s = stats.find((x) => x?.name === name || x?.type === name);
      return isNum(s?.value) ? s.value : null;
    };
    const wins = stat('wins');
    const losses = stat('losses');
    const games = isNum(wins) && isNum(losses) ? Math.round(wins + losses) : stat('gamesPlayed');
    if (!isNum(games) || games <= 0) continue;

    let pointDiff = null;
    const ppg = stat('avgPointsFor');
    const oppg = stat('avgPointsAgainst');
    const pf = stat('pointsFor');
    const pa = stat('pointsAgainst');
    const diff = stat('differential');
    const total = stat('pointDifferential');
    if (isNum(ppg) && isNum(oppg)) pointDiff = ppg - oppg;
    else if (isNum(pf) && isNum(pa)) pointDiff = pf > 400 || pa > 400 ? (pf - pa) / games : pf - pa;
    else if (isNum(diff)) pointDiff = diff;
    else if (isNum(total)) pointDiff = total / games;

    // No team finishes a season beyond about +/-13 a game; 30 is a typo guard, not a basketball claim.
    if (!isNum(pointDiff) || Math.abs(pointDiff) > 30) continue;
    out[id] = { pointDiff: Math.round(pointDiff * 100) / 100, games };
  }
  return out;
}
