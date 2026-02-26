/**
 * GET /api/odds/teamNextLine/:slug — Next game consensus odds for Team page only.
 */

/**
 * @param {string} slug - Team slug
 * @returns {Promise<{ nextEvent: object|null, consensus: object, outliers: object, contributingBooks: object, oddsMeta: object }>}
 */
export async function fetchTeamNextLine(slug) {
  if (!slug) return { nextEvent: null, consensus: {}, outliers: {}, contributingBooks: {}, oddsMeta: { stage: 'error' } };
  try {
    const res = await fetch(`/api/odds/teamNextLine/${encodeURIComponent(slug)}`);
    if (!res.ok) return { nextEvent: null, consensus: {}, outliers: {}, contributingBooks: {}, oddsMeta: { stage: 'error' } };
    const data = await res.json();
    return {
      nextEvent: data.nextEvent ?? null,
      consensus: data.consensus ?? {},
      outliers: data.outliers ?? { spreadOutlier: null, spreadBestForTeam: null, totalOutlier: null, moneylineBest: null, bestSpreadOutlier: null, bestTotalOutlier: null },
      movement: data.movement ?? null,
      contributingBooks: data.contributingBooks ?? { spreads: 0, totals: 0, h2h: 0 },
      oddsMeta: data.oddsMeta ?? {},
    };
  } catch {
    return { nextEvent: null, consensus: {}, outliers: {}, contributingBooks: {}, oddsMeta: { stage: 'error' } };
  }
}
