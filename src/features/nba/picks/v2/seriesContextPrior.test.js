/**
 * v13b — seriesContextPrior tests.
 *
 * Pin the May 9/10 weekend audit lessons:
 *   - PHI trailing 0-3 with repeated blowout losses → trailingTeamRisk
 *   - OKC up 2-0 with repeated blowout wins → dominantFavoriteSupport
 *   - LAL trailing but margins close → neutral (no false positive)
 *   - Empty series → no opinion
 */

import { describe, it, expect } from 'vitest';
import {
  seriesContextPrior,
  isSeriesContextSupportingHero,
  SERIES_PRIOR_CONSTANTS,
} from './seriesContextPrior.js';

function mkSeries({ topSlug, bottomSlug, games, top, bottom }) {
  return {
    topTeam: { slug: topSlug },
    bottomTeam: { slug: bottomSlug },
    seriesScore: { top, bottom },
    games,
  };
}

function mkGame({ winnerSlug, loserSlug, winScore, loseScore, date }) {
  return { winnerSlug, loserSlug, winScore, loseScore, gameDate: date };
}

describe('seriesContextPrior — trailing-team risk (PHI sweep pattern)', () => {
  it('PHI trailing 0-3 with blowout losses → trailingTeamRisk', () => {
    const series = mkSeries({
      topSlug: 'nyk', bottomSlug: 'phi',
      top: 3, bottom: 0,
      games: [
        mkGame({ winnerSlug: 'nyk', loserSlug: 'phi', winScore: 130, loseScore: 100, date: '2026-05-03' }),
        mkGame({ winnerSlug: 'nyk', loserSlug: 'phi', winScore: 137, loseScore: 98,  date: '2026-05-06' }),
        mkGame({ winnerSlug: 'nyk', loserSlug: 'phi', winScore: 144, loseScore: 114, date: '2026-05-10' }),
      ],
    });
    const r = seriesContextPrior({ series, teamSlug: 'phi' });
    expect(r.leadState).toBe('trailing');
    expect(r.teamWins).toBe(0);
    expect(r.opponentWins).toBe(3);
    expect(r.trailingTeamRisk).toBe(true);
    expect(r.dominantFavoriteSupport).toBe(false);
    expect(r.support).toBeLessThan(0);
    expect(r.confidence).toBeGreaterThanOrEqual(SERIES_PRIOR_CONSTANTS.SAMPLE_FLOOR_FOR_RISK / 3);
  });

  it('NYK leading 3-0 with blowout wins → dominantFavoriteSupport', () => {
    const series = mkSeries({
      topSlug: 'nyk', bottomSlug: 'phi',
      top: 3, bottom: 0,
      games: [
        mkGame({ winnerSlug: 'nyk', loserSlug: 'phi', winScore: 130, loseScore: 100, date: '2026-05-03' }),
        mkGame({ winnerSlug: 'nyk', loserSlug: 'phi', winScore: 137, loseScore: 98,  date: '2026-05-06' }),
        mkGame({ winnerSlug: 'nyk', loserSlug: 'phi', winScore: 144, loseScore: 114, date: '2026-05-10' }),
      ],
    });
    const r = seriesContextPrior({ series, teamSlug: 'nyk' });
    expect(r.leadState).toBe('leading');
    expect(r.dominantFavoriteSupport).toBe(true);
    expect(r.trailingTeamRisk).toBe(false);
    expect(r.support).toBeGreaterThan(0);
  });

  it('LAL trailing 0-3 with CLOSE margins → no trailing risk', () => {
    // Series the model shouldn't blanket-suppress: trailing but games
    // were within 5 points.
    const series = mkSeries({
      topSlug: 'okc', bottomSlug: 'lal',
      top: 3, bottom: 0,
      games: [
        mkGame({ winnerSlug: 'okc', loserSlug: 'lal', winScore: 102, loseScore: 99,  date: '2026-05-03' }),
        mkGame({ winnerSlug: 'okc', loserSlug: 'lal', winScore: 105, loseScore: 102, date: '2026-05-06' }),
        mkGame({ winnerSlug: 'okc', loserSlug: 'lal', winScore: 108, loseScore: 104, date: '2026-05-09' }),
      ],
    });
    const r = seriesContextPrior({ series, teamSlug: 'lal' });
    expect(r.leadState).toBe('trailing');
    expect(r.trailingTeamRisk).toBe(false);   // margins not blowout-level
    expect(r.support).toBeLessThanOrEqual(0); // small negative, not extreme
  });

  it('series with 0 games → neutral / no opinion', () => {
    const series = mkSeries({
      topSlug: 'nyk', bottomSlug: 'phi', top: 0, bottom: 0, games: [],
    });
    const r = seriesContextPrior({ series, teamSlug: 'nyk' });
    expect(r.sample).toBe(0);
    expect(r.trailingTeamRisk).toBe(false);
    expect(r.dominantFavoriteSupport).toBe(false);
    expect(r.support).toBe(0);
  });

  it('null series → no opinion', () => {
    const r = seriesContextPrior({ series: null, teamSlug: 'nyk' });
    expect(r.sample).toBe(0);
    expect(r.support).toBe(0);
  });
});

describe('isSeriesContextSupportingHero gate', () => {
  it('trailing collapser → supported=false', () => {
    const prior = {
      sample: 3, confidence: 1, trailingTeamRisk: true,
      dominantFavoriteSupport: false, support: -0.5,
    };
    const g = isSeriesContextSupportingHero({ prior });
    expect(g.supported).toBe(false);
    expect(g.reason).toBe('trailing_team_collapse_risk');
  });

  it('dominant favorite → supported=true', () => {
    const prior = {
      sample: 3, confidence: 1, trailingTeamRisk: false,
      dominantFavoriteSupport: true, support: +0.5,
    };
    const g = isSeriesContextSupportingHero({ prior });
    expect(g.supported).toBe(true);
    expect(g.reason).toBe('dominant_favorite_support');
  });

  it('neutral series → no opinion', () => {
    const prior = { sample: 2, trailingTeamRisk: false, dominantFavoriteSupport: false, support: 0.05 };
    const g = isSeriesContextSupportingHero({ prior });
    expect(g.neutral).toBe(true);
    expect(g.supported).toBeNull();
  });

  it('no series sample → no opinion', () => {
    const g = isSeriesContextSupportingHero({ prior: { sample: 0 } });
    expect(g.neutral).toBe(true);
  });
});
