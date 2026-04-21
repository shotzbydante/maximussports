/**
 * Cross-sport render test for the shared PickCardV2.
 *
 * Locks the rendering-layer invariant: when the pick carries `sport: 'nba'`,
 * the rendered HTML must reference the NBA logo CDN, never the MLB self-
 * hosted path — and vice versa for MLB. This is the exact scenario that
 * previously broke (Celtics card showed the Red Sox logo).
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PickCardV2 from './PickCardV2.jsx';

function nbaPick() {
  return {
    id: 'g1-runline-home',
    sport: 'nba',
    gameId: 'g1',
    tier: 'tier1',
    market: { type: 'runline', line: -14.5, priceAmerican: null },
    selection: { side: 'home', team: 'BOS', label: 'BOS −14.5' },
    matchup: {
      awayTeam: { slug: 'phi', name: '76ers', shortName: 'PHI' },
      homeTeam: { slug: 'bos', name: 'Celtics', shortName: 'BOS' },
      startTime: '2026-04-21T20:00:00Z',
    },
    betScore: {
      total: 0.74,
      components: { edgeStrength: 0.82, modelConfidence: 0.55, situationalEdge: 0.55, marketQuality: 0.6 },
    },
    conviction: { score: 74, label: 'Solid' },
    modelProb: null, impliedProb: null, rawEdge: 0.328,
    model: { edge: 0.328, dataQuality: 0.7, signalAgreement: 0.66 },
    rationale: { headline: 'Boston Celtics to cover −14.5.', bullets: ['Market edge (home)'] },
    pick: { topSignals: ['Market edge (home)'] },
  };
}

function mlbPick() {
  return {
    id: 'g2-moneyline-away',
    sport: 'mlb',
    gameId: 'g2',
    tier: 'tier1',
    market: { type: 'moneyline', priceAmerican: -135 },
    selection: { side: 'away', team: 'NYY', label: 'NYY −135' },
    matchup: {
      awayTeam: { slug: 'nyy', name: 'Yankees', shortName: 'NYY' },
      homeTeam: { slug: 'bos', name: 'Red Sox', shortName: 'BOS' },
      startTime: '2026-04-21T22:00:00Z',
    },
    betScore: {
      total: 0.82,
      components: { edgeStrength: 0.7, modelConfidence: 0.7, situationalEdge: 0.55, marketQuality: 0.6 },
    },
    conviction: { score: 82, label: 'Strong' },
    rawEdge: 0.06,
    model: { edge: 0.06, dataQuality: 0.75, signalAgreement: 0.75 },
    rationale: { headline: 'Yankees priced below model.', bullets: ['Rotation edge'] },
    pick: { topSignals: ['Rotation edge'] },
  };
}

describe('PickCardV2 — no cross-sport logo leakage in rendered HTML', () => {
  it('NBA pick renders only NBA logo URLs (no /logos/mlb/ references)', () => {
    const html = renderToStaticMarkup(<PickCardV2 pick={nbaPick()} tier="tier1" />);
    // Expect NBA ESPN CDN path present:
    expect(html).toMatch(/teamlogos\/nba\//);
    // Expect ZERO references to the MLB self-hosted logo path:
    expect(html).not.toMatch(/\/logos\/mlb\//);
    // Specifically the Celtics slug should NOT resolve to bos.png MLB path:
    expect(html).not.toMatch(/\/logos\/mlb\/bos\.png/);
    // Specifically the 76ers slug should NOT resolve to phi.png MLB path:
    expect(html).not.toMatch(/\/logos\/mlb\/phi\.png/);
  });

  it('MLB pick renders only MLB logo URLs (no teamlogos/nba references)', () => {
    const html = renderToStaticMarkup(<PickCardV2 pick={mlbPick()} tier="tier1" />);
    expect(html).toMatch(/\/logos\/mlb\/(nyy|bos)\.png/);
    expect(html).not.toMatch(/teamlogos\/nba\//);
  });
});
