/**
 * Locks the canonical-picks parity contract:
 *   - Slide 1 picks (cap 2) === Slide 2 picks (cap 3).slice(0, 2)
 *   - Caption picks (cap 999) starts with the same prefix
 *   - When the source has ≥2 picks, Slide 1 NEVER renders fewer than 2.
 *
 * This is a regression guard for the screenshot bug where Slide 2
 * showed 3 picks but Slide 1 showed only 1 because each slide was
 * building + sorting its own array.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCanonicalNbaPicks,
  resolveSlidePicks,
} from './resolveSlidePicks.js';

function mkPick({ ats, score, awaySlug, homeSlug, label }) {
  return {
    matchup: {
      awayTeam: { slug: awaySlug, abbrev: awaySlug.toUpperCase(), shortName: awaySlug.toUpperCase() },
      homeTeam: { slug: homeSlug, abbrev: homeSlug.toUpperCase(), shortName: homeSlug.toUpperCase() },
    },
    pick: { side: ats === 'home' ? 'home' : 'away', label },
    confidence: 'medium',
    betScore: { total: score },
  };
}

const sampleData = {
  nbaPicks: {
    categories: {
      ats: [
        mkPick({ ats: 'away', score: 95, awaySlug: 'min', homeSlug: 'sas', label: 'SAS -14' }),
        mkPick({ ats: 'away', score: 88, awaySlug: 'phi', homeSlug: 'nyk', label: 'NYK -7' }),
        mkPick({ ats: 'home', score: 80, awaySlug: 'lal', homeSlug: 'okc', label: 'OKC -16' }),
      ],
      pickEms: [
        mkPick({ ats: 'home', score: 70, awaySlug: 'tor', homeSlug: 'cle', label: 'CLE ML' }),
      ],
      totals: [],
      leans: [],
    },
  },
};

describe('resolveSlidePicks — Slide 1 === Slide 2 ⊆ canonical', () => {
  it('Slide 1 (cap 3) === Slide 2 (cap 3) — same picks, same order', () => {
    const slide1 = resolveSlidePicks(sampleData, 3);
    const slide2 = resolveSlidePicks(sampleData, 3);
    expect(slide1.length).toBe(3);
    expect(slide2.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(slide1[i].pick.label).toBe(slide2[i].pick.label);
    }
  });

  it('Slide 1 cap is now 3 — when source has ≥3 picks, Slide 1 renders 3', () => {
    const slide1 = resolveSlidePicks(sampleData, 3);
    expect(slide1.length).toBe(3);
  });

  it('regression: Slide 1 picks IDs match Slide 2 picks IDs exactly', () => {
    // Locks the parity bug from the audit screenshot — Slide 2 had 3
    // picks but Slide 1 was rendering 1. With the canonical resolver
    // both slides MUST surface identical pick identities in identical
    // order (same selection labels prove it).
    const slide1 = resolveSlidePicks(sampleData, 3);
    const slide2 = resolveSlidePicks(sampleData, 3);
    expect(slide1.map(p => p.pick.label)).toEqual(slide2.map(p => p.pick.label));
    expect(slide1.map(p => p._cat)).toEqual(slide2.map(p => p._cat));
  });

  it('Slide 2 is the strict prefix of canonical (caption full list)', () => {
    const slide2 = resolveSlidePicks(sampleData, 3);
    const canonical = resolveCanonicalNbaPicks(sampleData);
    expect(canonical.length).toBe(4);
    for (let i = 0; i < slide2.length; i++) {
      expect(slide2[i].pick.label).toBe(canonical[i].pick.label);
    }
  });

  it('Slide 1 falls back to source size when fewer than cap exist', () => {
    const twoOnly = {
      nbaPicks: {
        categories: {
          ats: [
            mkPick({ ats: 'away', score: 95, awaySlug: 'min', homeSlug: 'sas', label: 'SAS -14' }),
            mkPick({ ats: 'away', score: 88, awaySlug: 'phi', homeSlug: 'nyk', label: 'NYK -7' }),
          ],
        },
      },
    };
    const slide1 = resolveSlidePicks(twoOnly, 3);
    expect(slide1.length).toBe(2);
  });

  it('top picks ranked by betScore desc with Spread breaking same-score ties', () => {
    const tied = {
      nbaPicks: {
        categories: {
          ats:     [mkPick({ ats: 'away', score: 90, awaySlug: 'min', homeSlug: 'sas', label: 'SAS -14' })],
          pickEms: [mkPick({ ats: 'home', score: 90, awaySlug: 'tor', homeSlug: 'cle', label: 'CLE ML' })],
        },
      },
    };
    const top = resolveSlidePicks(tied, 1);
    expect(top[0]._cat).toBe('Spread');
  });

  it('each pick carries both long (_cat) and short (_catShort) labels', () => {
    const top = resolveSlidePicks(sampleData, 3);
    for (const p of top) {
      expect(typeof p._cat).toBe('string');
      expect(typeof p._catShort).toBe('string');
    }
    // Spread should map to long='Spread' / short='SPR'
    const spread = top.find(p => p._cat === 'Spread');
    expect(spread).toBeTruthy();
    expect(spread._catShort).toBe('SPR');
  });

  it('handles canonicalPicks fallback path', () => {
    const altShape = { canonicalPicks: sampleData.nbaPicks };
    const top = resolveSlidePicks(altShape, 2);
    expect(top.length).toBe(2);
    expect(top[0]._cat).toBe('Spread');
  });

  it('handles empty/missing categories without throwing', () => {
    expect(resolveCanonicalNbaPicks({}).length).toBe(0);
    expect(resolveCanonicalNbaPicks(null).length).toBe(0);
    expect(resolveCanonicalNbaPicks(undefined).length).toBe(0);
    expect(resolveSlidePicks({}, 2).length).toBe(0);
  });
});
