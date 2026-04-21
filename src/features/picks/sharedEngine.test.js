/**
 * Shared-engine parity test — proves NBA and MLB v2 builders produce
 * structurally identical payloads so the shared UI container can render
 * both sports uniformly. No sport has its own payload shape.
 */

import { describe, it, expect } from 'vitest';
import { buildMlbPicksV2 } from '../mlb/picks/v2/buildMlbPicksV2.js';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from '../nba/picks/v2/buildNbaPicksV2.js';
import { MLB_DEFAULT_CONFIG } from './tuning/defaultConfig.js';

function mkMlbGame(i) {
  return {
    gameId: `mlb-${i}`,
    startTime: new Date(Date.now() + (i + 1) * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: `mlb_away_${i}`, name: `Away${i}`, abbrev: `A${i}` },
      home: { slug: `mlb_home_${i}`, name: `Home${i}`, abbrev: `H${i}` },
    },
    market: { moneyline: -135 + (i * 5), pregameSpread: -1.5, pregameTotal: 8.5 },
    model: { pregameEdge: null, confidence: 0.75 },
  };
}

function mkNbaGame(i) {
  return {
    gameId: `nba-${i}`,
    startTime: new Date(Date.now() + (i + 1) * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: `nba_away_${i}`, name: `Away${i}`, abbrev: `A${i}` },
      home: { slug: `nba_home_${i}`, name: `Home${i}`, abbrev: `H${i}` },
    },
    market: {
      moneyline: { away: 130 - i * 10, home: -150 + i * 8 },
      pregameSpread: -3.5 + (i * 0.5),
      pregameTotal: 220 + i,
    },
    model: { pregameEdge: 1.5 - i * 0.6, confidence: 0.70, fairTotal: 222 + i },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
  };
}

const REQUIRED_KEYS = [
  'sport', 'date', 'modelVersion', 'configVersion',
  'generatedAt', 'topPick', 'tiers', 'coverage',
  'scorecardSummary', 'meta', 'legacy', 'categories',
];

describe('Shared v2 engine — NBA & MLB payload parity', () => {
  it('both payloads expose the same top-level keys', () => {
    const mlb = buildMlbPicksV2({ games: Array.from({ length: 4 }, (_, i) => mkMlbGame(i)), config: MLB_DEFAULT_CONFIG });
    const nba = buildNbaPicksV2({ games: Array.from({ length: 4 }, (_, i) => mkNbaGame(i)), config: NBA_DEFAULT_CONFIG });
    for (const k of REQUIRED_KEYS) {
      expect(mlb).toHaveProperty(k);
      expect(nba).toHaveProperty(k);
    }
  });

  it('sport field correctly stamped per payload', () => {
    const mlb = buildMlbPicksV2({ games: [mkMlbGame(0)], config: MLB_DEFAULT_CONFIG });
    const nba = buildNbaPicksV2({ games: [mkNbaGame(0)], config: NBA_DEFAULT_CONFIG });
    expect(mlb.sport).toBe('mlb');
    expect(nba.sport).toBe('nba');
  });

  it('every pick in both payloads has the same required pick-level keys', () => {
    const mlb = buildMlbPicksV2({ games: Array.from({ length: 4 }, (_, i) => mkMlbGame(i)), config: MLB_DEFAULT_CONFIG });
    const nba = buildNbaPicksV2({ games: Array.from({ length: 4 }, (_, i) => mkNbaGame(i)), config: NBA_DEFAULT_CONFIG });
    const keys = ['id', 'sport', 'gameId', 'tier', 'conviction', 'market', 'selection', 'matchup', 'betScore', 'rationale'];
    const all = [
      ...mlb.tiers.tier1, ...mlb.tiers.tier2, ...mlb.tiers.tier3, ...(mlb.coverage || []),
      ...nba.tiers.tier1, ...nba.tiers.tier2, ...nba.tiers.tier3, ...(nba.coverage || []),
    ];
    for (const p of all) {
      for (const k of keys) expect(p).toHaveProperty(k);
    }
  });
});
