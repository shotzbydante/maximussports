/**
 * v12 — teamForm helper tests.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTeamForm,
  recentMarginSupport,
  isLongShotDogSupportedByForm,
  isLargeFavoriteSupportedByMargin,
  totalsTrendAgreement,
} from './teamForm.js';

function mkFinal({ away, awayScore, home, homeScore, startTime = '2026-04-30T22:00:00Z' }) {
  return {
    teams: { away: { slug: away, score: awayScore }, home: { slug: home, score: homeScore } },
    gameState: { isFinal: true }, status: 'final', startTime,
  };
}

describe('computeTeamForm', () => {
  it('returns null sample when no priors', () => {
    const f = computeTeamForm({ teamSlug: 'nyk', windowGames: [] });
    expect(f.sample).toBe(0);
    expect(f.recentMarginAvg).toBeNull();
  });

  it('computes avg margin from finals (team is home)', () => {
    const w = [
      mkFinal({ away: 'phi', awayScore: 98, home: 'nyk', homeScore: 137, startTime: '2026-05-04' }),
      mkFinal({ away: 'cle', awayScore: 110, home: 'nyk', homeScore: 119, startTime: '2026-05-01' }),
    ];
    const f = computeTeamForm({ teamSlug: 'nyk', windowGames: w });
    expect(f.sample).toBe(2);
    expect(f.recentMarginAvg).toBeCloseTo(((137 - 98) + (119 - 110)) / 2, 1);
    expect(f.recentScoringAvg).toBeCloseTo(128, 1);
    expect(f.formScore).toBeGreaterThan(0);
  });

  it('handles team as away side too', () => {
    const w = [
      mkFinal({ away: 'lal', awayScore: 95, home: 'okc', homeScore: 130 }),
    ];
    const f = computeTeamForm({ teamSlug: 'lal', windowGames: w });
    expect(f.sample).toBe(1);
    expect(f.recentMarginAvg).toBeCloseTo(-35, 1);
    expect(f.formScore).toBeLessThan(0);
  });

  it('caps confidence at sample/SAMPLE_CAP', () => {
    const w = [];
    for (let i = 0; i < 12; i++) {
      w.push(mkFinal({
        away: 'bos', awayScore: 100 + i, home: 'cha', homeScore: 95,
        startTime: `2026-05-0${(i % 9) + 1}T22:00:00Z`,
      }));
    }
    const f = computeTeamForm({ teamSlug: 'bos', windowGames: w });
    expect(f.sample).toBeLessThanOrEqual(6);
    expect(f.confidence).toBe(1);
  });
});

describe('recentMarginSupport', () => {
  it('returns null when either team has no priors', () => {
    const r = recentMarginSupport({ favoriteForm: null, underdogForm: null });
    expect(r.supportPoints).toBeNull();
  });

  it('positive support when favorite outscoring opponents recently', () => {
    const r = recentMarginSupport({
      favoriteForm: { recentMarginAvg: +12, confidence: 0.6 },
      underdogForm: { recentMarginAvg: -5,  confidence: 0.5 },
    });
    expect(r.supportPoints).toBeCloseTo(17, 1);
    expect(r.supportConfidence).toBeCloseTo(0.5, 2);
  });
});

describe('isLongShotDogSupportedByForm — v12 PHI ML +236 case', () => {
  it('rejects long-shot dog with low sample', () => {
    const r = isLongShotDogSupportedByForm({
      favoriteForm: { sample: 1, recentMarginAvg: 12 },
      underdogForm: { sample: 1, recentMarginAvg: -10 },
      priceAmerican: +236,
    });
    expect(r.supported).toBe(false);
  });

  it('rejects long-shot dog when dog is in losing trend', () => {
    const r = isLongShotDogSupportedByForm({
      favoriteForm: { sample: 3, recentMarginAvg: 6, confidence: 0.5 },
      underdogForm: { sample: 3, recentMarginAvg: -12, confidence: 0.5 },
      priceAmerican: +236,
    });
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('dog_recent_margin_negative');
  });

  it('rejects long-shot dog when favorite dominates recent', () => {
    const r = isLongShotDogSupportedByForm({
      favoriteForm: { sample: 3, recentMarginAvg: 18, confidence: 0.5 },
      underdogForm: { sample: 3, recentMarginAvg: -2, confidence: 0.5 },
      priceAmerican: +236,
    });
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('favorite_dominates_recent');
  });

  it('accepts dog when form modestly supports', () => {
    const r = isLongShotDogSupportedByForm({
      favoriteForm: { sample: 3, recentMarginAvg: 5, confidence: 0.5 },
      underdogForm: { sample: 3, recentMarginAvg: 0, confidence: 0.5 },
      priceAmerican: +220,
    });
    expect(r.supported).toBe(true);
  });

  it('non-long-shot price always supported', () => {
    const r = isLongShotDogSupportedByForm({
      favoriteForm: { sample: 1 }, underdogForm: { sample: 1 },
      priceAmerican: +130,
    });
    expect(r.supported).toBe(true);
    expect(r.reason).toBe('not_long_shot');
  });
});

describe('isLargeFavoriteSupportedByMargin — v12 SAS -13 case', () => {
  it('rejects large favorite spread with low sample', () => {
    const r = isLargeFavoriteSupportedByMargin({
      favoriteForm: { sample: 1, recentMarginAvg: 15 },
      underdogForm: { sample: 1, recentMarginAvg: -2 },
      spreadAbs: 13,
    });
    expect(r.supported).toBe(false);
  });

  it('rejects when recent margin advantage is below spread', () => {
    const r = isLargeFavoriteSupportedByMargin({
      favoriteForm: { sample: 3, recentMarginAvg: 4, confidence: 0.5 },
      underdogForm: { sample: 3, recentMarginAvg: -3, confidence: 0.5 },
      spreadAbs: 13,
    });
    // support = +7, required = 13-2 = 11 → false
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('recent_margin_below_spread');
  });

  it('accepts when favorite has clear margin support', () => {
    const r = isLargeFavoriteSupportedByMargin({
      favoriteForm: { sample: 3, recentMarginAvg: 18, confidence: 0.5 },
      underdogForm: { sample: 3, recentMarginAvg: -10, confidence: 0.5 },
      spreadAbs: 13,
    });
    // support = +28, required = 11 → true
    expect(r.supported).toBe(true);
  });

  it('rejects when underdog is hot even if favorite has margin support', () => {
    const r = isLargeFavoriteSupportedByMargin({
      favoriteForm: { sample: 3, recentMarginAvg: 18, confidence: 0.5 },
      underdogForm: { sample: 3, recentMarginAvg: 8, confidence: 0.5 },
      spreadAbs: 11,
    });
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('underdog_recent_form_hot');
  });

  it('non-large spread always supported', () => {
    const r = isLargeFavoriteSupportedByMargin({
      favoriteForm: { sample: 0 }, underdogForm: { sample: 0 },
      spreadAbs: 5,
    });
    expect(r.supported).toBe(true);
    expect(r.reason).toBe('not_large');
  });
});

describe('totalsTrendAgreement', () => {
  it('agree when both teams trending same direction as model', () => {
    const r = totalsTrendAgreement({
      awayForm: { sample: 3, recentTotalAvg: 230 },
      homeForm: { sample: 3, recentTotalAvg: 228 },
      marketTotal: 215, fairTotal: 220, // model says Over
    });
    expect(r.agreement).toBe('agree');
    expect(r.boost).toBeGreaterThan(0);
  });

  it('mixed when teams disagree', () => {
    const r = totalsTrendAgreement({
      awayForm: { sample: 3, recentTotalAvg: 230 },
      homeForm: { sample: 3, recentTotalAvg: 200 },
      marketTotal: 215, fairTotal: 220,
    });
    expect(r.agreement).toBe('mixed');
    expect(r.boost).toBeLessThan(0);
  });

  it('unknown when sample is too small', () => {
    const r = totalsTrendAgreement({
      awayForm: { sample: 1, recentTotalAvg: 230 },
      homeForm: { sample: 3, recentTotalAvg: 220 },
      marketTotal: 215, fairTotal: 220,
    });
    expect(r.agreement).toBe('unknown');
    expect(r.boost).toBe(0);
  });
});
