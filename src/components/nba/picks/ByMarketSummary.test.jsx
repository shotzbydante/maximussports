/**
 * ByMarketSummary — explicit-category strip for NBA Home.
 *
 * Locks the contract: every render shows tiles for Pick 'Em / ATS /
 * Totals with their pick counts, AND honest "totals model inactive"
 * captioning when the engine has no fair-total model. Static markup
 * test so we don't need jsdom + fetch mocks.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ByMarketSummary from './ByMarketSummary.jsx';

const mlPick   = { id: 'a', market: { type: 'moneyline' }, selection: { side: 'away' } };
const atsPick  = { id: 'b', market: { type: 'runline', line: -4 }, selection: { side: 'home' } };
const totPick  = { id: 'c', market: { type: 'total', line: 220.5 }, selection: { side: 'over' } };
const altSpread = { id: 'd', market: { type: 'spread', line: -3 }, selection: { side: 'away' } };

describe('ByMarketSummary — always renders all three categories', () => {
  it('renders Pick ’Ems / ATS / Totals tiles with zero counts on an empty slate', () => {
    const html = renderToStaticMarkup(<ByMarketSummary picks={[]} />);
    expect(html).toMatch(/Pick.{0,4}Ems/);
    expect(html).toMatch(/Moneyline/);
    expect(html).toMatch(/ATS/);
    expect(html).toMatch(/Spread/);
    expect(html).toMatch(/Totals/);
    expect(html).toMatch(/Over.{0,2}\/.{0,2}Under/);
  });

  it('counts each market type correctly', () => {
    const html = renderToStaticMarkup(
      <ByMarketSummary picks={[mlPick, atsPick, atsPick, totPick]} />,
    );
    // 1 ML, 2 ATS, 1 Total
    expect(html).toMatch(/>1</);
    expect(html).toMatch(/>2</);
  });

  it('treats `runline` and `spread` as the same ATS bucket', () => {
    const html = renderToStaticMarkup(
      <ByMarketSummary picks={[atsPick, altSpread]} />,
    );
    expect(html).toMatch(/>2<\/span>\s*<span[^>]*>picks/i);
  });

  it('shows "fair-total model inactive" caption when notes.totalsInactive is true', () => {
    const html = renderToStaticMarkup(
      <ByMarketSummary picks={[atsPick]} notes={{ totalsInactive: true }} />,
    );
    expect(html).toMatch(/Fair-total model inactive/);
  });

  it('shows "no qualified totals" caption when totals are 0 and the model is active', () => {
    const html = renderToStaticMarkup(
      <ByMarketSummary picks={[atsPick]} notes={{}} />,
    );
    expect(html).toMatch(/No qualified totals/);
  });

  it('shows zero-state captions for empty ML and ATS', () => {
    const html = renderToStaticMarkup(
      <ByMarketSummary picks={[totPick]} notes={{}} />,
    );
    expect(html).toMatch(/No moneyline edges/);
    expect(html).toMatch(/No spread edges/);
  });
});
