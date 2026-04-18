import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TopPlayHero from './TopPlayHero.jsx';

function samplePick() {
  return {
    id: 'g1-moneyline-away',
    gameId: 'g1',
    market: { type: 'moneyline', priceAmerican: -135, line: null },
    selection: { side: 'away', team: 'NYY', label: 'NYY -135' },
    matchup: {
      awayTeam: { slug: 'nyy', shortName: 'NYY' },
      homeTeam: { slug: 'bos', shortName: 'BOS' },
      startTime: '2026-04-18T18:00:00Z',
    },
    betScore: {
      total: 0.93,
      components: { edgeStrength: 0.8, modelConfidence: 0.78, situationalEdge: 0.55, marketQuality: 0.62 },
    },
    conviction: { label: 'Top Play', score: 93 },
    rawEdge: 0.07,
    rationale: { headline: 'NYY mispriced', bullets: ['Rotation edge'] },
  };
}

describe('TopPlayHero', () => {
  it('renders nothing when pick is null', () => {
    expect(renderToStaticMarkup(<TopPlayHero pick={null} />)).toBe('');
  });

  it('renders explicit labels for Conviction / Edge / Confidence / Bet Score', () => {
    const html = renderToStaticMarkup(<TopPlayHero pick={samplePick()} featured />);
    expect(html).toMatch(/Conviction/);
    expect(html).toMatch(/Edge/);
    expect(html).toMatch(/Confidence/);
    expect(html).toMatch(/Bet Score/);
  });

  it('renders the signed edge percentage and the conviction value', () => {
    const html = renderToStaticMarkup(<TopPlayHero pick={samplePick()} featured />);
    expect(html).toMatch(/\+7\.0%/);
    expect(html).toMatch(/>93</);
  });

  it('renders the market type as a friendly label', () => {
    const html = renderToStaticMarkup(<TopPlayHero pick={samplePick()} featured />);
    expect(html).toMatch(/Moneyline/);
  });
});
