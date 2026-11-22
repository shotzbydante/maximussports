import { describe, it, expect } from 'vitest';
import { renderHTML, renderText } from './globalBriefing.js';

const soon = new Date(Date.now() + 26 * 3600e3).toISOString();
const pick = (over = {}) => ({
  id: 'g1-total-under', gameId: 'g1', pickRole: 'hero', tier: 'tier2',
  conviction: { label: 'Solid', score: 74 },
  market: { type: 'total', line: 40.5, priceAmerican: -105 },
  selection: { side: 'under', label: 'Under 40.5' },
  book: { key: 'draftkings', title: 'DraftKings' },
  matchup: { awayTeam: { shortName: 'ARI' }, homeTeam: { shortName: 'KC' }, startTime: soon },
  displayMetrics: { edgeValue: '+3.1%' },
  why: '17 mph wind is forecast at Arrowhead Stadium, and unders have won 57% of the time in wind that strong since 2003. DraftKings’s -105 on Under 40.5 is +3.1% expected value.',
  whyShort: '17 mph wind forecast; unders win 57% in wind that strong',
  ...over,
});
const board = (picks, leans = []) => ({
  sport: 'nfl', tiers: { tier1: [], tier2: picks, tier3: [] },
  fullSlatePicks: [...picks, ...leans],
});

describe('global briefing: NFL picks', () => {
  it('states each recommended pick with its price, its book and the reason', () => {
    const html = renderHTML({ nflPicksBoard: board([pick()]) });
    expect(html).toContain('NFL PICKS');
    expect(html).toContain('Under 40.5');
    expect(html).toContain('-105 at DraftKings');
    expect(html).toContain('Why:');
    expect(html).toContain('17 mph wind is forecast at Arrowhead Stadium');
    const text = renderText({ nflPicksBoard: board([pick()]) });
    expect(text).toContain('ARI at KC: Under 40.5 (-105 at DraftKings)');
    expect(text).toContain('Why: 17 mph wind is forecast');
  });

  it('says why when nothing is recommended, and never shows a lean as a pick', () => {
    const lean = pick({ id: 'g2-runline-home', gameId: 'g2', pickRole: 'tracking', tier: 'tracking', selection: { side: 'home', label: 'BUF -6.5' } });
    const html = renderHTML({ nflPicksBoard: board([], [lean]) });
    expect(html).toContain('No recommended NFL bets right now.');
    expect(html).toContain('Why: no sportsbook is paying more than the market’s fair price');
    expect(html).not.toContain('BUF -6.5');
  });

  it('leaves the NFL block out with no board, and drops picks that have kicked off', () => {
    expect(renderHTML({})).not.toContain('NFL PICKS');
    const started = pick({ matchup: { awayTeam: { shortName: 'ARI' }, homeTeam: { shortName: 'KC' }, startTime: new Date(Date.now() - 3600e3).toISOString() } });
    expect(renderHTML({ nflPicksBoard: board([started]) })).not.toContain('Under 40.5');
  });

  it('escapes text that comes from a feed', () => {
    const html = renderHTML({ nflPicksBoard: board([pick({ book: { title: 'Bet<script>' } })]) });
    expect(html).not.toContain('<script>');
  });
});
