/**
 * GET /api/odds/teamNextLine/:slug — Next game consensus odds for Team page only.
 * Module-level de-dupe: in-flight coalesce + short last-result cache to avoid duplicate fetches when navigating quickly.
 */

const MEMO_MS = 20 * 1000;
let inFlight = null;
let last = { slug: null, data: null, ts: 0 };

function normalizePayload(data) {
  return {
    nextEvent: data.nextEvent ?? null,
    consensus: data.consensus ?? {},
    outliers: data.outliers ?? { spreadOutlier: null, spreadBestForTeam: null, totalOutlier: null, moneylineBest: null, bestSpreadOutlier: null, bestTotalOutlier: null },
    movement: data.movement ?? null,
    contributingBooks: data.contributingBooks ?? { spreads: 0, totals: 0, h2h: 0 },
    oddsMeta: data.oddsMeta ?? {},
  };
}

/**
 * @param {string} slug - Team slug
 * @returns {Promise<{ nextEvent: object|null, consensus: object, outliers: object, movement: object|null, contributingBooks: object, oddsMeta: object }>}
 */
export async function fetchTeamNextLine(slug) {
  if (!slug) return normalizePayload({});
  const now = Date.now();
  if (last.slug === slug && last.data != null && now - last.ts < MEMO_MS) return last.data;
  if (inFlight?.slug === slug) return inFlight.promise;
  const promise = (async () => {
    try {
      const res = await fetch(`/api/odds/teamNextLine/${encodeURIComponent(slug)}`);
      if (!res.ok) return normalizePayload({});
      const data = await res.json();
      const out = normalizePayload(data);
      last = { slug, data: out, ts: Date.now() };
      return out;
    } catch {
      return normalizePayload({});
    } finally {
      if (inFlight?.slug === slug) inFlight = null;
    }
  })();
  inFlight = { slug, promise };
  return promise;
}
