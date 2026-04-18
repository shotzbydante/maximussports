import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import YesterdayScorecard from './YesterdayScorecard.jsx';

function sampleSummary() {
  return {
    date: '2026-04-17',
    overall: { won: 3, lost: 1, push: 0, pending: 0 },
    byMarket: {
      moneyline: { won: 1, lost: 0, push: 0 },
      runline:   { won: 1, lost: 1, push: 0 },
      total:     { won: 1, lost: 0, push: 0 },
    },
    byTier: {
      tier1: { won: 1, lost: 0, push: 0 },
      tier2: { won: 2, lost: 1, push: 0 },
      tier3: { won: 0, lost: 0, push: 0 },
    },
    topPlayResult: 'won',
    streak: { type: 'won', count: 2 },
    note: 'Top Play hit',
  };
}

describe('YesterdayScorecard', () => {
  it('renders the record, win rate, and Top Play intent when summary is injected', () => {
    const html = renderToStaticMarkup(<YesterdayScorecard summary={sampleSummary()} />);
    expect(html).toMatch(/3-1/);
    expect(html).toMatch(/75% win rate/);
    expect(html).toMatch(/Top Play hit/);
  });

  it('renders the market chips with friendly labels in page mode', () => {
    const html = renderToStaticMarkup(<YesterdayScorecard summary={sampleSummary()} />);
    expect(html).toMatch(/Moneyline/);
    expect(html).toMatch(/Run Line/);
    expect(html).toMatch(/Total/);
  });

  it('uses compact chips (ML/RL/Tot) in compact mode', () => {
    const html = renderToStaticMarkup(<YesterdayScorecard summary={sampleSummary()} compact />);
    // Compact renders abbreviated labels
    expect(html).toMatch(/>ML</);
    expect(html).toMatch(/>RL</);
    expect(html).toMatch(/>Tot</);
  });

  it('gracefully handles missing summary', () => {
    const html = renderToStaticMarkup(<YesterdayScorecard summary={null} />);
    // Either the loading shell or empty output is acceptable; no crash.
    expect(html).toBeDefined();
  });

  it('labels the record block with the word "Record"', () => {
    const html = renderToStaticMarkup(<YesterdayScorecard summary={sampleSummary()} />);
    expect(html).toMatch(/Record/);
  });
});
