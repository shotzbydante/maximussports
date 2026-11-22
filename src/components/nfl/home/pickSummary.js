/**
 * One sentence on why a recommended pick is a pick, written from the
 * picks engine's own numbers: the multi-book consensus, the wind
 * adjustment when there is one, the book's price and the fair price.
 * No language model is involved, so the sentence can never drift from
 * what the engine computed.
 */

const odds = (v) => (typeof v === 'number' ? (v > 0 ? `+${v}` : `${v}`) : null);
const pct = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : null);
const num = (v) => (typeof v === 'number' ? `${Math.round(v * 10) / 10}` : null);

export function pickSummary(pick, game) {
  if (!pick) return '';
  const type = pick.market?.type;
  const label = pick.selection?.label;
  const book = pick.lock?.book || pick.book?.title;
  const price = odds(pick.lock?.price ?? pick.market?.priceAmerican);
  const fairPrice = odds(pick.lock?.fairPriceNow ?? pick.fair?.priceAmerican);
  const engine = game?.engine || {};
  const consensus = engine.consensus || {};
  const books = consensus.books ?? game?.market?.booksCount;
  const booksText = books ? `${books} books` : 'The market';
  const offer = book && price && type !== 'moneyline' ? `${book} has ${label} at ${price}` : book ? `${book} has ${label}` : `${label} is on the board`;
  const versusFair = fairPrice ? `, when the fair price is ${fairPrice}` : '';

  if (type === 'total') {
    const windAdj = (engine.fair?.adjustments || []).find((a) => a.key === 'windUnder');
    const wind = engine.env?.wind;
    const city = game?.venue?.city;
    if (pick.selection?.side === 'under' && windAdj && wind && num(consensus.fairTotal) && num(engine.fair?.total)) {
      return `A ${Math.round(wind)} mph wind is forecast${city ? ` in ${city}` : ''}, which takes the fair total from ${num(consensus.fairTotal)} to ${num(engine.fair.total)}; ${offer}${versusFair}.`;
    }
    if (num(consensus.fairTotal)) return `${booksText} put the fair total at ${num(consensus.fairTotal)}, and ${offer}${versusFair}.`;
  }

  if (type === 'runline' && typeof consensus.fairMargin === 'number') {
    const homeFav = consensus.fairMargin >= 0;
    const fav = homeFav ? game?.teams?.home?.abbrev : game?.teams?.away?.abbrev;
    if (fav) return `${booksText} make ${fav} a ${num(Math.abs(consensus.fairMargin))}-point favorite, and ${offer}${versusFair}.`;
  }

  if (type === 'moneyline' && pct(pick.modelProb) && pct(pick.impliedProb)) {
    return `${booksText} give this side a ${pct(pick.modelProb)} chance to win, and ${book ? `${book}’s price` : 'the price'} only needs ${pct(pick.impliedProb)}.`;
  }

  return `${offer.charAt(0).toUpperCase()}${offer.slice(1)}${versusFair}.`;
}

/** The first sentence of a longer passage. Decimals and prices ("40.5", "-105") are not sentence ends. */
export function firstSentence(text) {
  if (!text) return '';
  const m = String(text).trim().match(/^.*?[.!?](?=\s+[A-Z0-9“"]|$)/s);
  return (m ? m[0] : String(text)).trim();
}

/**
 * The one sentence a ticket shows. The engine stores a reason with every
 * pick, and for a locked pick that reason is written as of the moment it
 * was locked, so it leads. The sentence built here from live numbers is the
 * fallback for picks that predate the stored reason.
 */
export function ticketSummary(pick, game) {
  const stored = pick?.why || pick?.rationale?.why;
  const headline = pick?.rationale?.headline;
  if (stored && stored !== headline) return firstSentence(stored);
  return pickSummary(pick, game);
}
