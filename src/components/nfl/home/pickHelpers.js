/**
 * Small pure helpers shared by the NFL pick components: labels, sorting,
 * and the groupings behind the "Every game" tabs.
 */

export const MARKET = { moneyline: 'To win', runline: 'Spread', total: 'Total' };

/** Why a game is held to tracking. A plain "no price edge" needs no chip. */
export const HELD_BACK = {
  qb_uncertain: 'Quarterback in doubt',
  injury_feed_down: 'No injury report',
  stale_price: 'Stale price',
  price_outlier: 'Price out of line',
  outside_window: 'Opens 3 days out',
  price_guard: 'Extreme price',
  thin_market: 'Few books',
  data_gap: 'Thin data',
};

export const score = (p) => p?.conviction?.score ?? Math.round((p?.betScore?.total || 0) * 100);
export const isRecommended = (p) => p?.pickRole === 'hero';

/** Highest conviction first; a recommended pick beats a lean on a tie, then expected value. */
export const byConviction = (a, b) =>
  (score(b) - score(a)) || (isRecommended(b) - isRecommended(a)) || ((b.ev || 0) - (a.ev || 0));

export function pickedTeam(p) {
  const m = p?.matchup || {};
  return p?.selection?.side === 'home' ? m.homeTeam : p?.selection?.side === 'away' ? m.awayTeam : null;
}

/**
 * Why this pick, in the engine's own words. Every pick carries a full
 * sentence (`why`) and a few words (`whyShort`). Picks locked before those
 * fields existed fall back to what the headline says after the pick label.
 */
function headlineReason(p) {
  const lean = (p?.rationale?.headline || '').match(/^Model lean: .*?\. (.+)$/);
  return lean ? lean[1] : '';
}
export const whyOf = (p) => p?.why || p?.rationale?.why || headlineReason(p);
export const whyShortOf = (p) => p?.whyShort || p?.rationale?.whyShort || whyOf(p);
export const sentence = (t) => (t && !/[.!?]$/.test(t) ? `${t}.` : t);

/**
 * The one line shown beside a decision. The engine's short reason opens
 * with "Lean:" or "Tracked, ...": the row already says that with a chip,
 * so the prefix comes off.
 */
export function oneLiner(p) {
  const raw = String(whyShortOf(p) || '')
    .replace(/^Lean:\s*/i, '')
    .replace(/^Tracked,[^.]*\.\s*/i, '');
  if (!raw) return '';
  return sentence(raw.charAt(0).toUpperCase() + raw.slice(1));
}

/** One market's decision for every game, strongest first. */
export function rankMarket(picks, type) {
  return (picks || []).filter((p) => p?.market?.type === type).sort(byConviction);
}

const MARKET_ORDER = { runline: 0, total: 1, moneyline: 2 };
const isHeld = (p) => Boolean(HELD_BACK[p?.lowSignalReason]);

/**
 * Which of two decisions on the same game should represent it: a
 * recommended pick first, then conviction; on a tie, one that is not held
 * back, then spread before total before moneyline (the spread and the
 * moneyline are the same opinion, and the spread is the cleaner price).
 */
function strongerForGame(a, b) {
  return (isRecommended(b) - isRecommended(a))
    || (score(b) - score(a))
    || (isHeld(a) - isHeld(b))
    || ((MARKET_ORDER[a?.market?.type] ?? 9) - (MARKET_ORDER[b?.market?.type] ?? 9));
}

/**
 * The single strongest decision for each game, whichever market it is in,
 * with the games then ranked strongest first. A recommended pick always
 * represents its game.
 */
export function bestPerGame(picks) {
  const best = new Map();
  for (const p of picks || []) {
    const key = String(p.gameId);
    const cur = best.get(key);
    if (!cur || strongerForGame(p, cur) < 0) best.set(key, p);
  }
  return [...best.values()].sort((a, b) => (isRecommended(b) - isRecommended(a)) || byConviction(a, b));
}
