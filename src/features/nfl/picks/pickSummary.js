/**
 * How a pick is stated outside the picks board: emails and the written
 * briefing. One place, so a pick never appears without its reason.
 */

const fmtOdds = (v) => (typeof v === 'number' ? (v > 0 ? `+${v}` : `${v}`) : '');

export function isRecommendedPick(p) {
  return p?.pickRole === 'hero';
}

/** The reason for a pick: the engine's sentence, or the headline on picks locked before it existed. */
export function pickWhy(p, { short = false } = {}) {
  const full = p?.why || p?.rationale?.why || p?.rationale?.headline || '';
  const text = short ? (p?.whyShort || p?.rationale?.whyShort || full) : full;
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}

/** Recommended picks on a board, strongest first. */
export function recommendedPicks(board) {
  const t = board?.tiers || {};
  return [...(t.tier1 || []), ...(t.tier2 || []), ...(t.tier3 || [])]
    .filter(isRecommendedPick)
    .sort((a, b) => (b.conviction?.score ?? 0) - (a.conviction?.score ?? 0));
}

/**
 * A pick as plain fields: what it is, where to bet it, and why.
 * @returns {{ matchup, pick, price, book, kickoff, conviction, expectedValue, conditions, why, whyShort }}
 */
export function summarizePick(p) {
  const m = p?.matchup || {};
  const away = m.awayTeam?.shortName || m.awayTeam?.abbrev || m.awayTeam?.name || '';
  const home = m.homeTeam?.shortName || m.homeTeam?.abbrev || m.homeTeam?.name || '';
  return {
    matchup: away && home ? `${away} at ${home}` : '',
    pick: p?.selection?.label || '',
    price: p?.market?.type === 'moneyline' ? '' : fmtOdds(p?.market?.priceAmerican),
    book: p?.book?.title || '',
    kickoff: m.startTime || null,
    conviction: p?.conviction?.score ?? null,
    expectedValue: p?.displayMetrics?.edgeValue || null,
    conditions: p?.environment?.label || null,
    why: pickWhy(p),
    whyShort: pickWhy(p, { short: true }),
  };
}
