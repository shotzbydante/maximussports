import { describe, it, expect } from 'vitest';
import { resolveBracketMatchup, warnUniformBatch } from './bracketMatchupResolver';

describe('bracketMatchupResolver', () => {
  // ── 8/9 matchup differentiation ────────────────────────────
  describe('8/9 seed matchups', () => {
    const matchups89 = [
      {
        a: { slug: 'utah-state-aggies', name: 'Utah State Aggies', shortName: 'Utah State', seed: 8, conference: 'Mountain West', record: '23-8' },
        b: { slug: 'iowa-hawkeyes', name: 'Iowa Hawkeyes', shortName: 'Iowa', seed: 9, conference: 'Big Ten', record: '20-11' },
      },
      {
        a: { slug: 'georgia-bulldogs', name: 'Georgia Bulldogs', shortName: 'Georgia', seed: 8, conference: 'SEC', record: '20-11' },
        b: { slug: 'smu-mustangs', name: 'SMU Mustangs', shortName: 'SMU', seed: 9, conference: 'ACC', record: '20-11' },
      },
      {
        a: { slug: 'clemson-tigers', name: 'Clemson Tigers', shortName: 'Clemson', seed: 8, conference: 'ACC', record: '20-11' },
        b: { slug: 'nc-state-wolfpack', name: 'NC State Wolfpack', shortName: 'NC State', seed: 9, conference: 'ACC', record: '20-11' },
      },
      {
        a: { slug: 'texas-longhorns', name: 'Texas Longhorns', shortName: 'Texas', seed: 8, conference: 'SEC', record: '20-11' },
        b: { slug: 'ucf-knights', name: 'UCF Knights', shortName: 'UCF', seed: 9, conference: 'Big 12', record: '20-11' },
      },
    ];

    it('should never produce exactly 50% win probability', () => {
      for (const m of matchups89) {
        const result = resolveBracketMatchup(m.a, m.b, {}, { round: 1 });
        expect(result.winProbability).toBeGreaterThanOrEqual(0.51);
      }
    });

    it('should not all resolve to the exact same probability', () => {
      const results = matchups89.map(m =>
        resolveBracketMatchup(m.a, m.b, {}, { round: 1 }),
      );
      const probs = results.map(r => Math.round(r.winProbability * 1000));
      const uniqueProbs = new Set(probs);
      expect(uniqueProbs.size).toBeGreaterThan(1);
    });

    it('should differentiate teams with different records at edge level', () => {
      const m1 = matchups89[0]; // Utah St 23-8 vs Iowa 20-11
      const m2 = matchups89[2]; // Clemson 20-11 vs NC State 20-11
      const r1 = resolveBracketMatchup(m1.a, m1.b, {}, { round: 1 });
      const r2 = resolveBracketMatchup(m2.a, m2.b, {}, { round: 1 });
      // Internal edge magnitudes differ even when display floors both to 51%
      expect(r1.edgeMagnitude).not.toEqual(r2.edgeMagnitude);
      expect(r1.edgeMagnitude).toBeGreaterThan(r2.edgeMagnitude);
    });

    it('should differentiate teams from different conferences', () => {
      const secVsAcc = resolveBracketMatchup(
        { slug: 'sec-team', name: 'SEC Team', seed: 8, conference: 'SEC', record: '20-11' },
        { slug: 'acc-team', name: 'ACC Team', seed: 9, conference: 'ACC', record: '20-11' },
        {}, { round: 1 },
      );
      const accVsAcc = resolveBracketMatchup(
        { slug: 'acc-team-a', name: 'ACC A', seed: 8, conference: 'ACC', record: '20-11' },
        { slug: 'acc-team-b', name: 'ACC B', seed: 9, conference: 'ACC', record: '20-11' },
        {}, { round: 1 },
      );
      expect(secVsAcc.winProbability).not.toEqual(accVsAcc.winProbability);
    });
  });

  // ── Predicted-side integrity ───────────────────────────────
  describe('predicted winner integrity', () => {
    it('winner probability should always be >= 51%', () => {
      const cases = [
        [{ slug: 'a', seed: 1, record: '30-1', conference: 'SEC' },
         { slug: 'b', seed: 16, record: '15-17', conference: 'MEAC' }],
        [{ slug: 'c', seed: 5, record: '24-7', conference: 'Big 12' },
         { slug: 'd', seed: 12, record: '21-11', conference: 'WCC' }],
        [{ slug: 'e', seed: 8, record: '20-11', conference: 'ACC' },
         { slug: 'f', seed: 9, record: '20-11', conference: 'ACC' }],
      ];
      for (const [a, b] of cases) {
        const r = resolveBracketMatchup(a, b, {}, { round: 1 });
        expect(r.winProbability).toBeGreaterThanOrEqual(0.51);
        expect(r.winProbability).toBeLessThanOrEqual(0.97);
      }
    });

    it('winner should be the team the edge favors', () => {
      const r = resolveBracketMatchup(
        { slug: 'strong', seed: 8, record: '26-5', conference: 'SEC' },
        { slug: 'weak', seed: 9, record: '15-16', conference: 'MEAC' },
        {}, { round: 1 },
      );
      expect(r.winner.slug).toBe('strong');
    });
  });

  // ── Non-close matchups remain unaffected ───────────────────
  describe('wider seed gaps', () => {
    it('1v16 should still produce strong favorites', () => {
      const r = resolveBracketMatchup(
        { slug: 'duke', seed: 1, record: '28-3', conference: 'ACC' },
        { slug: 'nobody', seed: 16, record: '16-16', conference: 'MEAC' },
        {}, { round: 1 },
      );
      expect(r.winProbability).toBeGreaterThanOrEqual(0.85);
      expect(r.winner.slug).toBe('duke');
    });

    it('5v12 should vary based on team data', () => {
      const r1 = resolveBracketMatchup(
        { slug: 'five-strong', seed: 5, record: '26-5', conference: 'Big Ten' },
        { slug: 'twelve-a', seed: 12, record: '22-10', conference: 'A-10' },
        {}, { round: 1 },
      );
      const r2 = resolveBracketMatchup(
        { slug: 'five-weak', seed: 5, record: '21-10', conference: 'Big East' },
        { slug: 'twelve-b', seed: 12, record: '24-7', conference: 'WCC' },
        {}, { round: 1 },
      );
      expect(r1.winProbability).not.toEqual(r2.winProbability);
    });
  });

  // ── Enrichment with rankings/odds ──────────────────────────
  describe('enrichment signals', () => {
    it('ranked team should get higher probability than unranked', () => {
      const base = resolveBracketMatchup(
        { slug: 'ranked', seed: 6, record: '22-9', conference: 'Big 12' },
        { slug: 'unranked', seed: 11, record: '21-11', conference: 'Mountain West' },
        {}, { round: 1 },
      );
      const enriched = resolveBracketMatchup(
        { slug: 'ranked', seed: 6, record: '22-9', conference: 'Big 12' },
        { slug: 'unranked', seed: 11, record: '21-11', conference: 'Mountain West' },
        { rankMap: { ranked: 12 } }, { round: 1 },
      );
      expect(enriched.winProbability).toBeGreaterThan(base.winProbability);
    });
  });

  // ── warnUniformBatch ───────────────────────────────────────
  describe('warnUniformBatch', () => {
    it('should not throw for varied results', () => {
      expect(() => warnUniformBatch([
        { winProbability: 0.55, enrichmentCount: 2 },
        { winProbability: 0.62, enrichmentCount: 3 },
      ], 'test')).not.toThrow();
    });

    it('should not throw for empty/single results', () => {
      expect(() => warnUniformBatch([], 'test')).not.toThrow();
      expect(() => warnUniformBatch([{ winProbability: 0.5 }], 'test')).not.toThrow();
    });
  });
});
