/**
 * selectFeaturedQuadrants — shared resolver for MLB Maximus's Picks
 * slide and caption. Ensures zero drift between visual and text output.
 *
 * Returns top 2 picks per category (8 total) from the canonical board,
 * plus board-level metadata for summary strip and narrative.
 *
 * Used by:
 *   - MlbMaxPicksSlide.jsx  (slide render)
 *   - buildMlbCaption.js    (caption builder)
 */

/**
 * Select 8 featured picks: top 2 per quadrant from the canonical board.
 *
 * Sorting: confidenceScore descending → stable tie-break (original order).
 *
 * @param {object} board - Canonical board from buildMlbPicks()
 * @returns {{ moneyline, ats, leans, totals, boardCounts, topPlay, totalFeatured }}
 */
export function selectFeaturedQuadrants(board) {
  const cats = board?.categories || {};

  const sortByConf = (arr) =>
    [...arr].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const pickEmsAll = sortByConf(cats.pickEms || []);
  const atsAll     = sortByConf(cats.ats || []);
  const leansAll   = sortByConf(cats.leans || []);
  const totalsAll  = sortByConf(cats.totals || []);

  const moneyline = pickEmsAll.slice(0, 2);
  const ats       = atsAll.slice(0, 2);
  const leans     = leansAll.slice(0, 2);
  const totals    = totalsAll.slice(0, 2);

  const boardCounts = {
    moneyline: pickEmsAll.length,
    spread:    atsAll.length,
    value:     leansAll.length,
    totals:    totalsAll.length,
    total:     pickEmsAll.length + atsAll.length + leansAll.length + totalsAll.length,
  };

  // Top play: highest confidence across entire board (for summary callout)
  const allSorted = [
    ...pickEmsAll.map(p => ({ ...p, _cat: 'Moneyline' })),
    ...atsAll.map(p => ({ ...p, _cat: 'Run Line' })),
    ...leansAll.map(p => ({ ...p, _cat: 'Value' })),
    ...totalsAll.map(p => ({ ...p, _cat: 'Total' })),
  ].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const topPlay = allSorted[0] || null;
  const totalFeatured = moneyline.length + ats.length + leans.length + totals.length;

  return { moneyline, ats, leans, totals, boardCounts, topPlay, totalFeatured };
}

/**
 * Build an editorial narrative from the 8 featured quadrant picks.
 * Analyzes conviction level, category strength, and board patterns.
 */
export function buildQuadrantNarrative(quadrants) {
  const { moneyline, ats, leans, totals } = quadrants;
  const all = [...moneyline, ...ats, ...leans, ...totals];

  if (all.length === 0) return 'The model is evaluating today\'s slate.';

  const highCount = all.filter(p => p.confidence === 'high').length;

  // ── Board character ──
  let boardChar;
  if (highCount >= 5) boardChar = 'High-conviction board';
  else if (highCount >= 3) boardChar = 'Selective conviction';
  else if (highCount >= 1) boardChar = 'Measured approach';
  else boardChar = 'Distributed edges';

  // ── Detect patterns ──
  const patterns = [];

  // Favorite-heavy moneylines (negative odds = favorite)
  const mlFavorites = moneyline.filter(p => {
    const label = p.pick?.label || '';
    return /-\d/.test(label);
  });
  if (mlFavorites.length === 2) patterns.push('favorite-heavy moneylines');

  // Totals direction
  const overs  = totals.filter(p => /over/i.test(p.pick?.label || ''));
  const unders = totals.filter(p => /under/i.test(p.pick?.label || ''));
  if (overs.length === 2) patterns.push('leans over');
  else if (unders.length === 2) patterns.push('leans under');

  // ── Category emphasis ──
  const catStrength = [];
  if (moneyline.some(p => p.confidence === 'high')) catStrength.push('moneyline');
  if (ats.some(p => p.confidence === 'high')) catStrength.push('run-line');
  if (leans.some(p => p.confidence === 'high')) catStrength.push('value');
  if (totals.some(p => p.confidence === 'high')) catStrength.push('totals');

  let result = `${boardChar} tonight.`;

  if (patterns.length > 0) {
    result += ` Board ${patterns.join(', ')}.`;
  }

  if (catStrength.length > 0 && catStrength.length <= 2) {
    result += ` Strongest edges in ${catStrength.join(' and ')}.`;
  } else if (catStrength.length > 2) {
    result += ` Signal alignment across multiple markets.`;
  }

  return result;
}
