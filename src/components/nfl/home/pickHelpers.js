/**
 * Small pure helpers shared by the NFL pick components: labels, sorting,
 * and the groupings behind the "Every game" tabs.
 */

import { fmtLine } from './format.js';

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

/** A price that beats fair, but by less than the bar for a recommendation. Playable, so not a hold. */
export const THIN_VALUE = 'thin_value';
/** Expected value below this is rounding, not value. Mirrors the engine's `evThresholds.thin`. */
export const VALUE_FLOOR = 0.005;

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
 * with "Lean:", "Tracked, ..." or "Held, ...": the row already says that
 * with a chip, so the prefix comes off.
 */
export function oneLiner(p) {
  const raw = String(whyShortOf(p) || '')
    .replace(/^Lean:\s*/i, '')
    .replace(/^(Tracked|Held),[^.]*\.\s*/i, '')
    .replace(/^Thin value\.\s*/i, '')
    .replace(/^Opens three days out\.\s*/i, '');
  if (!raw) return '';
  return sentence(raw.charAt(0).toUpperCase() + raw.slice(1));
}

/** "+0.6%" */
export const evText = (ev) => (typeof ev === 'number' ? `${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(1)}%` : '');

/**
 * Whether a moneyline is worth showing. A moneyline is judged on value
 * alone: a book's price has to pay more than the fair price by at least
 * the floor. Anything else is not a call, it is just a price.
 */
export function moneylineHasValue(p, floor = VALUE_FLOOR) {
  if (p?.market?.type !== 'moneyline') return false;
  return isRecommended(p) || (typeof p.ev === 'number' && p.ev >= floor);
}

/** Moneylines with value, best value first. Often empty: most weeks no price beats fair. */
export function rankMoneylineValue(picks, floor = VALUE_FLOOR) {
  return (picks || [])
    .filter((p) => moneylineHasValue(p, floor))
    .sort((a, b) => (isRecommended(b) - isRecommended(a)) || ((b.ev || 0) - (a.ev || 0)));
}

/** The moneyline that comes closest to value, for saying how far off the board is. */
export function closestMoneyline(picks) {
  return (picks || [])
    .filter((p) => p?.market?.type === 'moneyline' && typeof p.ev === 'number')
    .sort((a, b) => b.ev - a.ev)[0] || null;
}

/** One market's decision for every game, strongest first. */
export function rankMarket(picks, type) {
  return (picks || []).filter((p) => p?.market?.type === type).sort(byConviction);
}

const MARKET_ORDER = { runline: 0, total: 1, moneyline: 2 };
const isHeld = (p) => Boolean(HELD_BACK[p?.lowSignalReason]);

const NEXT_UP_HOURS = 48;

/**
 * The leans a signed-out reader sees for free beside the recommended picks:
 * the strongest call in each market the recommended picks do not already
 * cover (spread, total, to win), so the page opens with up to `want` calls.
 * Drawn from the games kicking off within two days of the next kickoff, so
 * a Thursday visitor gets Thursday's games, and from the whole board when
 * that window holds fewer than three games. Held-back calls are left out.
 */
export function freeLeans(leans, recommended = [], want = 3) {
  const need = Math.max(0, want - recommended.length);
  if (need === 0) return [];
  const start = (p) => Date.parse(p?.matchup?.startTime) || Infinity;
  const open = (leans || []).filter((p) => !isHeld(p));
  const first = Math.min(...[...open, ...recommended].map(start));
  const soon = open.filter((p) => start(p) <= first + NEXT_UP_HOURS * 3600e3);
  const pool = new Set(soon.map((p) => p.gameId)).size >= 3 ? soon : open;
  const covered = new Set(recommended.map((p) => p?.market?.type));
  return Object.keys(MARKET_ORDER)
    .filter((type) => !covered.has(type))
    .map((type) => rankMarket(pool, type)[0])
    .filter(Boolean)
    .slice(0, need);
}

/**
 * Which of two decisions on the same game should represent it: a
 * recommended pick first; then one that is not held back (a -1500
 * favorite to win is our surest call and nobody's bet, so it gives way to
 * a call at a playable price); then conviction; then spread before total
 * before moneyline.
 */
function strongerForGame(a, b) {
  return (isRecommended(b) - isRecommended(a))
    || (isHeld(a) - isHeld(b))
    || (score(b) - score(a))
    || ((MARKET_ORDER[a?.market?.type] ?? 9) - (MARKET_ORDER[b?.market?.type] ?? 9));
}

/**
 * The single strongest decision for each game, whichever market it is in,
 * with the games then ranked strongest first. A recommended pick always
 * represents its game. A moneyline is only in the running when it has value.
 */
export function bestPerGame(picks, floor = VALUE_FLOOR) {
  const best = new Map();
  for (const p of picks || []) {
    if (p?.market?.type === 'moneyline' && !moneylineHasValue(p, floor)) continue;
    const key = String(p.gameId);
    const cur = best.get(key);
    if (!cur || strongerForGame(p, cur) < 0) best.set(key, p);
  }
  return [...best.values()].sort((a, b) => (isRecommended(b) - isRecommended(a)) || byConviction(a, b));
}

/**
 * The recommended pick whose market has moved furthest in its favour since
 * it was locked: a total or spread now harder to get than the number taken.
 * @returns {{ label:string, taken:string, now:string, when:string }|null}
 */
export function movedSinceLock(recommended = [], byGame = []) {
  const games = new Map(byGame.map((g) => [String(g.gameId), g]));
  let best = null;
  for (const p of recommended) {
    const took = p?.lock?.line;
    const market = games.get(String(p.gameId))?.market;
    const type = p?.market?.type;
    if (!Number.isFinite(took) || !market) continue;
    let now = null;
    let gain = 0;
    if (type === 'total' && Number.isFinite(market.total)) {
      now = market.total;
      gain = p.selection?.side === 'under' ? took - now : now - took;
    } else if (type === 'runline' && Number.isFinite(market.spreadHome)) {
      now = p.selection?.side === 'home' ? market.spreadHome : -market.spreadHome;
      gain = took - now; // our side's number: +3 taken, +2.5 now, is half a point better
    }
    if (now === null || gain < 0.5) continue;
    if (!best || gain > best.gain) {
      best = {
        gain,
        label: p.selection?.label || '',
        taken: type === 'total' ? String(took) : fmtLine(took),
        now: type === 'total' ? String(now) : fmtLine(now),
        when: p.lock.lockedAt,
      };
    }
  }
  return best;
}

