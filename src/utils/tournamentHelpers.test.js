import { describe, it, expect } from 'vitest';
import {
  getFirstRoundMatchupsByRegion,
  getSeedPairMatchups,
  getBatchTournamentInsights,
} from './tournamentHelpers';
import { REGIONS } from '../config/bracketology';

describe('tournamentHelpers', () => {
  describe('getFirstRoundMatchupsByRegion', () => {
    it('should return 8 matchups per region', () => {
      const byRegion = getFirstRoundMatchupsByRegion();
      for (const region of REGIONS) {
        const matchups = byRegion[region] || [];
        expect(matchups.length).toBe(8);
      }
    });

    it('should include all 16 unique seeds per region', () => {
      const byRegion = getFirstRoundMatchupsByRegion();
      for (const region of REGIONS) {
        const seeds = new Set();
        for (const m of byRegion[region]) {
          seeds.add(m.topSeed);
          seeds.add(m.bottomSeed);
        }
        expect(seeds.size).toBe(16);
      }
    });
  });

  describe('getSeedPairMatchups', () => {
    it('should return 4 matchups for 8v9 (one per region)', () => {
      const matchups = getSeedPairMatchups(8, 9);
      expect(matchups.length).toBe(4);
      const regions = matchups.map(m => m.region);
      expect(new Set(regions).size).toBe(4);
    });
  });

  describe('getBatchTournamentInsights', () => {
    it('8v9 batch should not produce all-50% probabilities', () => {
      const matchups = getSeedPairMatchups(8, 9);
      const insights = getBatchTournamentInsights(matchups, {});
      expect(insights.length).toBe(4);
      for (const ins of insights) {
        expect(Math.round(ins.winProbability * 100)).toBeGreaterThanOrEqual(51);
      }
    });

    it('full region batch should return 8 insights', () => {
      const byRegion = getFirstRoundMatchupsByRegion();
      const eastMatchups = byRegion.East || byRegion[REGIONS[0]];
      const insights = getBatchTournamentInsights(eastMatchups, {});
      expect(insights.length).toBe(8);
    });
  });
});
