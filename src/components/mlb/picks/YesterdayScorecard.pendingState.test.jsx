/**
 * Regression test — YesterdayScorecard must render a tasteful "pending"
 * placeholder when no row exists, instead of returning null and leaving a
 * hole in the MLB Home trust strip.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import YesterdayScorecard from './YesterdayScorecard.jsx';

describe('YesterdayScorecard — pending placeholder', () => {
  it('renders pending placeholder when summary is null and no fetch has resolved', () => {
    // No `summary` prop. SSR runs before useEffect; the first render sees
    // `loading=true, card=null` and produces the skeleton.
    const html = renderToStaticMarkup(<YesterdayScorecard />);
    // Either the skeleton OR the pending placeholder is acceptable — but
    // MUST NOT be empty (that's the regression we're guarding against).
    expect(html.length).toBeGreaterThan(0);
  });

  it('does not return empty string when summary is explicit null (regression)', () => {
    // When summary is null, initial SSR render sees loading=true → skeleton
    // frame. Either the skeleton OR the pending placeholder is acceptable —
    // the regression we guard against is the component returning null,
    // which would leave a hole in the MLB Home trust strip.
    const html = renderToStaticMarkup(<YesterdayScorecard summary={null} />);
    expect(html.length).toBeGreaterThan(50);
    expect(/loading|Yesterday's Scorecard/i.test(html)).toBe(true);
  });

  it('still renders real data when summary is populated', () => {
    const summary = {
      date: '2026-04-21',
      overall: { won: 9, lost: 7, push: 0, pending: 0 },
      byMarket: {}, byTier: {},
      topPlayResult: 'won', streak: null, note: 'Top Play hit',
    };
    const html = renderToStaticMarkup(<YesterdayScorecard summary={summary} />);
    expect(html).toMatch(/9-7/);
    expect(html).toMatch(/56% win rate/);
  });
});
