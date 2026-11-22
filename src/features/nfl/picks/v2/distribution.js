/**
 * Score distributions and bet pricing. Pure.
 *
 * NFL margins are not a smooth bell curve: 3 and 7 land far more often
 * than 2 or 5. A spread of +3.5 is worth a great deal more than +3, and a
 * whole-number line can push. Both effects are missing from a plain normal
 * curve, so margins here are a normal curve re-weighted by how often each
 * final margin has actually occurred (nflverse results, 2015 to 2025,
 * 3,028 games), and every probability is split into win / push / lose.
 */

export const DIST = Object.freeze({
  /** Std dev of final margin around the closing spread, 2011 to 2025. */
  marginSd: 13.0,
  /** Std dev of final total around the closing total, 2011 to 2025. */
  totalSd: 13.2,
});

/** Observed frequency of each absolute margin relative to a smooth curve. */
const KEY_MULT = Object.freeze([
  0.12, 0.82, 0.84, 2.74, 0.87, 0.84, 1.37, 1.77, 0.91, 0.37,
  1.09, 0.51, 0.47, 0.56, 1.49, 0.51, 0.79, 1.25, 0.90, 0.50,
  0.97, 1.13, 0.57, 0.87, 1.40, 0.94, 0.91, 0.79, 1.76,
]);
const MAX_MARGIN = 70;
const MAX_TOTAL = 130;

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/** American odds → implied probability, vig included. */
export function impliedProb(american) {
  if (!isNum(american) || american === 0) return null;
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

/** Profit per unit staked at an American price. */
export function payout(american) {
  if (!isNum(american) || american === 0) return null;
  return american > 0 ? american / 100 : 100 / -american;
}

/** Remove the bookmaker margin from a two-way market. */
export function devig(priceA, priceB) {
  const a = impliedProb(priceA), b = impliedProb(priceB);
  if (!isNum(a) || !isNum(b) || a + b <= 0) return null;
  return { a: a / (a + b), b: b / (a + b), hold: a + b - 1 };
}

/**
 * Remove the margin from a two-way moneyline by the power method: find k
 * with a^k + b^k = 1. Splitting the margin in proportion (as `devig` does)
 * hands too much of it back to the long shot, which makes every big
 * underdog look like value; the power method takes more from the long
 * shot, the way books actually load their margin.
 */
export function devigPower(priceA, priceB) {
  const a = impliedProb(priceA), b = impliedProb(priceB);
  if (!isNum(a) || !isNum(b) || a <= 0 || b <= 0) return null;
  if (a + b <= 1) return { a: a / (a + b), b: b / (a + b), hold: a + b - 1 };
  let lo = 1, hi = 3;
  for (let i = 0; i < 50; i++) {
    const k = (lo + hi) / 2;
    if (a ** k + b ** k > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  const fa = a ** k, fb = b ** k;
  return { a: fa / (fa + fb), b: fb / (fa + fb), hold: a + b - 1 };
}

/** Probability → American odds (rounded). */
export function probToAmerican(p) {
  if (!isNum(p) || p <= 0 || p >= 1) return null;
  return Math.round(p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100);
}

function marginPmf(mean, sd = DIST.marginSd) {
  const w = new Float64Array(2 * MAX_MARGIN + 1);
  let z = 0;
  for (let k = -MAX_MARGIN; k <= MAX_MARGIN; k++) {
    const d = (k - mean) / sd;
    const v = Math.exp(-d * d / 2) * (KEY_MULT[Math.abs(k)] ?? 1);
    w[k + MAX_MARGIN] = v; z += v;
  }
  for (let i = 0; i < w.length; i++) w[i] /= z;
  return w;
}

function totalPmf(mean, sd = DIST.totalSd) {
  const w = new Float64Array(MAX_TOTAL + 1);
  let z = 0;
  for (let k = 0; k <= MAX_TOTAL; k++) {
    const d = (k - mean) / sd;
    const v = Math.exp(-d * d / 2);
    w[k] = v; z += v;
  }
  for (let i = 0; i < w.length; i++) w[i] /= z;
  return w;
}

/**
 * Win / push / lose for a spread bet.
 * @param {number} mean  expected margin, home minus away
 * @param {number} line  the HOME team's line (-3.5 = home favoured)
 * @param {'home'|'away'} side
 */
export function spreadProbs(mean, line, side = 'home') {
  const pmf = marginPmf(mean);
  let win = 0, push = 0;
  for (let k = -MAX_MARGIN; k <= MAX_MARGIN; k++) {
    const net = k + line;                       // home's margin against the number
    if (net > 1e-9) win += pmf[k + MAX_MARGIN];
    else if (Math.abs(net) <= 1e-9) push += pmf[k + MAX_MARGIN];
  }
  const lose = Math.max(0, 1 - win - push);
  return side === 'home' ? { win, push, lose } : { win: lose, push, lose: win };
}

/** Win / push / lose for a total bet. */
export function totalProbs(mean, line, side = 'over') {
  const pmf = totalPmf(mean);
  let over = 0, push = 0;
  for (let k = 0; k <= MAX_TOTAL; k++) {
    if (k - line > 1e-9) over += pmf[k];
    else if (Math.abs(k - line) <= 1e-9) push += pmf[k];
  }
  const under = Math.max(0, 1 - over - push);
  return side === 'over' ? { win: over, push, lose: under } : { win: under, push, lose: over };
}

/**
 * Home win probability for a curve centre (a tie counts as half).
 *
 * This curve is tuned for prices near the spread, where 3 and 7 matter. It
 * runs a few points low for heavy favourites, so moneylines are never
 * priced from it: their fair price comes from the moneyline market itself.
 */
export function homeWinProb(mean) {
  const pmf = marginPmf(mean);
  let p = 0;
  for (let k = 1; k <= MAX_MARGIN; k++) p += pmf[k + MAX_MARGIN];
  return p + pmf[MAX_MARGIN] / 2;
}

function bisect(fn, target, lo, hi) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The expected margin a book's spread and prices imply.
 * A -3 priced -120/+100 implies more than three points; this solves for it.
 */
export function fairMarginFromSpread({ line, homePrice, awayPrice }) {
  if (!isNum(line)) return null;
  const fair = devig(homePrice, awayPrice);
  const target = fair ? fair.a : 0.5;
  const share = (m) => { const p = spreadProbs(m, line, 'home'); return p.win / (p.win + p.lose); };
  return bisect(share, target, -line - 12, -line + 12);
}

/** The expected total a book's number and prices imply. */
export function fairTotalFromLine({ line, overPrice, underPrice }) {
  if (!isNum(line)) return null;
  const fair = devig(overPrice, underPrice);
  const target = fair ? fair.a : 0.5;
  const share = (m) => { const p = totalProbs(m, line, 'over'); return p.win / (p.win + p.lose); };
  return bisect(share, target, line - 12, line + 12);
}

/** The expected margin a two-way moneyline implies. */
export function fairMarginFromMoneyline({ homePrice, awayPrice }) {
  const fair = devig(homePrice, awayPrice);
  if (!fair) return null;
  return bisect(homeWinProb, fair.a, -40, 40);
}

/**
 * Expected profit per unit staked. A push returns the stake.
 * @param {{win:number, push:number, lose:number}} probs
 * @param {number} american
 */
export function expectedValue(probs, american) {
  const pay = payout(american);
  if (!probs || !isNum(pay)) return null;
  return probs.win * pay - probs.lose;
}

/** Units won or lost on a one-unit stake. */
export function unitsFor(status, american) {
  if (status === 'won') return payout(isNum(american) ? american : -110);
  if (status === 'lost') return -1;
  if (status === 'push' || status === 'void') return 0;
  return null;
}
