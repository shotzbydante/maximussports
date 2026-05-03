/**
 * Tests for the deterministic intelligence-layer helpers.
 * No backend, no LLM — pure functions over existing data.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCrossSportHook,
  buildResultInsight,
  buildNbaModelWatch,
  buildOddsMarketRead,
} from './globalBriefingIntelligence.js';
import { buildEmailData } from './emailPipeline.js';
import { renderHTML as renderGlobalBriefingHTML } from '../../src/emails/templates/globalBriefing.js';

// ── buildCrossSportHook ──────────────────────────────────────────

describe('buildCrossSportHook', () => {
  it('returns playoff + race combo when both narratives are rich', () => {
    const hook = buildCrossSportHook({
      nbaData: { narrativeParagraph: 'Game 7 looms as the playoff series swings...' },
      mlbData: { narrativeParagraph: 'The contender tier separates as the division race heats up.' },
    });
    expect(hook).toMatch(/NBA playoff/i);
    expect(hook).toMatch(/MLB contender|separating/i);
    expect(hook.length).toBeLessThanOrEqual(120);
  });

  it('returns NBA-only hook when MLB narrative absent', () => {
    const hook = buildCrossSportHook({
      nbaData: { narrativeParagraph: 'Series advances with playoff intensity high across the board.' },
      mlbData: null,
    });
    expect(hook).toMatch(/NBA/i);
    expect(hook).not.toMatch(/MLB/i);
  });

  it('returns MLB-only hook when NBA narrative absent', () => {
    const hook = buildCrossSportHook({
      nbaData: null,
      mlbData: { narrativeParagraph: 'Division races tighten as contenders extend their leads.' },
    });
    expect(hook).toMatch(/MLB/i);
    expect(hook).not.toMatch(/NBA/i);
  });

  it('returns durable fallback when both sparse', () => {
    const hook = buildCrossSportHook({ nbaData: null, mlbData: null });
    expect(hook).toContain('Cross-sport');
    expect(hook).toBeTruthy();
  });

  it('always returns a non-empty string', () => {
    expect(buildCrossSportHook({})).toBeTruthy();
    expect(buildCrossSportHook(undefined)).toBeTruthy();
  });
});

// ── buildResultInsight ──────────────────────────────────────────

describe('buildResultInsight', () => {
  it('NBA: uses ESPN series note when present (advance)', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'NYK', slug: 'nyk', score: 140 }, home: { abbrev: 'ATL', slug: 'atl', score: 89 }, seriesNote: 'NYK advance to second round' },
      { sport: 'nba' }
    );
    expect(insight).toMatch(/advance/i);
    expect(insight).toContain('NYK');
  });

  it('NBA: detects Game 7 / force', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'PHI', slug: 'phi', score: 118 }, home: { abbrev: 'BOS', slug: 'bos', score: 113 }, seriesNote: 'Sixers force Game 7' },
      { sport: 'nba' }
    );
    expect(insight).toMatch(/distance|game 7|series/i);
  });

  it('NBA: title-side pressure phrasing when winner is in top odds', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'OKC', slug: 'okc', score: 106 }, home: { abbrev: 'LAL', slug: 'lal', score: 101 } },
      { sport: 'nba', topOddsSlugs: ['okc', 'bos'] }
    );
    expect(insight).toContain('OKC');
    expect(insight).toMatch(/title/i);
  });

  it('NBA: generic fallback when no series + no top odds match', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'POR', slug: 'por', score: 95 }, home: { abbrev: 'CHA', slug: 'cha', score: 88 } },
      { sport: 'nba' }
    );
    expect(insight).toMatch(/playoff race|adds pressure/i);
  });

  it('MLB: leader phrasing when winner is top odds (#1)', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'LAD', slug: 'lad', score: 6 }, home: { abbrev: 'STL', slug: 'stl', score: 2 } },
      { sport: 'mlb', topOddsSlugs: ['lad', 'nyy'] }
    );
    expect(insight).toContain('LAD');
    expect(insight).toMatch(/separation|race/i);
  });

  it('MLB: contender-tier phrasing when winner is in odds top 5 (not #1)', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'NYY', slug: 'nyy', score: 7 }, home: { abbrev: 'BAL', slug: 'bal', score: 4 } },
      { sport: 'mlb', topOddsSlugs: ['lad', 'nyy', 'atl'] }
    );
    expect(insight).toContain('NYY');
    expect(insight).toMatch(/contender|pressure/i);
  });

  it('MLB: neutral fallback for non-contender winners', () => {
    const insight = buildResultInsight(
      { away: { abbrev: 'KC', slug: 'kc', score: 3 }, home: { abbrev: 'OAK', slug: 'oak', score: 1 } },
      { sport: 'mlb', topOddsSlugs: ['lad', 'nyy'] }
    );
    expect(insight).toMatch(/early-season|adds another/i);
  });

  it('returns empty string for invalid result data (never hallucinates)', () => {
    expect(buildResultInsight({}, { sport: 'mlb' })).toBe('');
    expect(buildResultInsight({ away: {}, home: {} }, { sport: 'mlb' })).toBe('');
    expect(buildResultInsight({ away: { score: 'X' }, home: { score: 'Y' } }, { sport: 'mlb' })).toBe('');
  });
});

// ── buildNbaModelWatch ──────────────────────────────────────────

describe('buildNbaModelWatch', () => {
  it('returns title anchor as first row from top championship odds', () => {
    const rows = buildNbaModelWatch({
      nbaChampOdds: {
        bos: { bestChanceAmerican: 250 },
        okc: { bestChanceAmerican: 350 },
      },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].kind).toBe('anchor');
    expect(rows[0].slug).toBe('bos');  // bos has lower (better) odds
    expect(rows[0].signal).toMatch(/title/i);
  });

  it('flags yesterday winners as risers when in top odds', () => {
    const rows = buildNbaModelWatch({
      nbaChampOdds: {
        bos: { bestChanceAmerican: 250 },
        nyk: { bestChanceAmerican: 1500 },
        okc: { bestChanceAmerican: 350 },
      },
      nbaYesterdayResults: [
        { away: { slug: 'nyk', score: 110 }, home: { slug: 'atl', score: 95 } },
      ],
    });
    const riser = rows.find(r => r.kind === 'riser');
    expect(riser).toBeTruthy();
    expect(riser.slug).toBe('nyk');
  });

  it('caps at 3 rows', () => {
    const rows = buildNbaModelWatch({
      nbaChampOdds: {
        a: { bestChanceAmerican: 100 }, b: { bestChanceAmerican: 200 },
        c: { bestChanceAmerican: 300 }, d: { bestChanceAmerican: 400 },
        e: { bestChanceAmerican: 500 },
      },
    });
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array when no odds available', () => {
    expect(buildNbaModelWatch({})).toEqual([]);
    expect(buildNbaModelWatch({ nbaChampOdds: {} })).toEqual([]);
  });

  it('never includes fake spreads, edges, or confidence scores', () => {
    const rows = buildNbaModelWatch({
      nbaChampOdds: { bos: { bestChanceAmerican: 250 }, okc: { bestChanceAmerican: 350 } },
    });
    for (const r of rows) {
      const json = JSON.stringify(r);
      expect(json).not.toMatch(/spread/i);
      expect(json).not.toMatch(/moneyline/i);
      expect(json).not.toMatch(/edge.*\d/i);  // no "edge: 27%" style
      expect(json).not.toMatch(/confidence.*\d/i);
    }
  });
});

// ── buildOddsMarketRead ──────────────────────────────────────────

describe('buildOddsMarketRead', () => {
  it('NBA: 3+ teams produces title-side anchor + chase tier read', () => {
    const read = buildOddsMarketRead({
      okc: { bestChanceAmerican: 200 },
      bos: { bestChanceAmerican: 350 },
      mil: { bestChanceAmerican: 800 },
    }, { sport: 'nba', teamInfo: { okc: 'Thunder', bos: 'Celtics', mil: 'Bucks' } });
    expect(read).toMatch(/Market read:/);
    expect(read).toMatch(/title-side anchor/i);
    expect(read).toMatch(/chase tier|first challenger/i);
    expect(read).toContain('Thunder');
  });

  it('MLB: 3+ teams produces favorite + challenger tier read', () => {
    const read = buildOddsMarketRead({
      lad: { bestChanceAmerican: 200 },
      nyy: { bestChanceAmerican: 800 },
      atl: { bestChanceAmerican: 1200 },
    }, { sport: 'mlb', teamInfo: { lad: 'Dodgers', nyy: 'Yankees', atl: 'Braves' } });
    expect(read).toMatch(/Market read:/);
    expect(read).toMatch(/board favorite|favorite/i);
    expect(read).toMatch(/challenger tier/i);
    expect(read).toContain('Dodgers');
  });

  it('2 teams returns simpler closest-challenger phrasing', () => {
    const read = buildOddsMarketRead({
      lad: { bestChanceAmerican: 200 },
      nyy: { bestChanceAmerican: 800 },
    }, { sport: 'mlb' });
    expect(read).toMatch(/closest challenger/i);
  });

  it('1 team returns lone-favorite phrasing', () => {
    const read = buildOddsMarketRead({ lad: { bestChanceAmerican: 200 } }, { sport: 'mlb' });
    expect(read).toMatch(/lone listed favorite/i);
  });

  it('empty odds returns empty string (no fake market read)', () => {
    expect(buildOddsMarketRead({}, { sport: 'mlb' })).toBe('');
    expect(buildOddsMarketRead(null, { sport: 'mlb' })).toBe('');
  });

  it('never claims movement without prior data', () => {
    const read = buildOddsMarketRead({
      okc: { bestChanceAmerican: 200 },
      bos: { bestChanceAmerican: 350 },
      mil: { bestChanceAmerican: 800 },
    }, { sport: 'nba' });
    // Should not claim odds movement, drift, shifted, etc.
    expect(read).not.toMatch(/moved|shifted|drift|jumped|dropped|risen|fell/i);
  });
});

// ── Integration: rendered HTML uses intelligence layer ───────────

function fullAssembledForIntel() {
  return {
    scoresToday: [], rankingsTop25: [], atsLeaders: { best: [], worst: [] },
    headlines: [], oddsGames: [], botIntelBullets: [],
    mlbData: {
      narrativeParagraph: 'The Dodgers extend their division race lead while contender pricing tightens.',
      headlines: [], picksBoard: null,
      yesterdayResults: [
        { away: { slug: 'lad', abbrev: 'LAD', score: 6 }, home: { slug: 'stl', abbrev: 'STL', score: 2 }, statusText: 'Final' },
      ],
      champOdds: { lad: { bestChanceAmerican: 200 }, nyy: { bestChanceAmerican: 800 }, atl: { bestChanceAmerican: 1200 } },
    },
    nbaData: {
      narrativeParagraph: 'Series pressure peaks across NBA playoffs as Game 7 looms in two matchups.',
      headlines: [],
      yesterdayResults: [
        { away: { slug: 'okc', abbrev: 'OKC', score: 106 }, home: { slug: 'lal', abbrev: 'LAL', score: 101 }, statusText: 'Final' },
      ],
      titleOutlook: [],
      champOdds: { okc: { bestChanceAmerican: 200 }, bos: { bestChanceAmerican: 350 }, mil: { bestChanceAmerican: 800 } },
    },
    briefingContext: {}, picksBoard: null, modelSignals: [], tournamentMeta: {},
  };
}

describe('Integration: intelligence layer renders in Global Briefing HTML', () => {
  it("includes Today's Edge cross-sport hook", () => {
    const emailData = buildEmailData('global_briefing', fullAssembledForIntel(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);
    expect(html).toContain("TODAY’S EDGE");
    // The synthesis line should mention BOTH sports when both narratives present
    expect(html).toMatch(/NBA.*MLB|MLB.*NBA/);
  });

  it('renders result insights ("→ ...") for results', () => {
    const emailData = buildEmailData('global_briefing', fullAssembledForIntel(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);
    expect(html).toContain('→ ');
  });

  it("renders NBA Model Watch (not picks) when no canonical NBA picks board", () => {
    const emailData = buildEmailData('global_briefing', fullAssembledForIntel(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);
    expect(html).toContain("TODAY’S NBA MODEL WATCH");
    expect(html).not.toContain("TODAY’S NBA PICKS");
    // Should have the not-official-picks caveat
    expect(html).toMatch(/Not official picks/i);
  });

  it('renders Market read above championship odds', () => {
    const emailData = buildEmailData('global_briefing', fullAssembledForIntel(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);
    expect(html).toMatch(/Market read:/);
  });

  it('updated NBA scorecard copy reads as intentional, not broken', () => {
    const emailData = buildEmailData('global_briefing', fullAssembledForIntel(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);
    expect(html).toContain('NBA scorecard activates once official playoff model picks begin settling');
  });

  it('NBA Model Watch never includes fake spreads / edges / fake confidence numbers', () => {
    const emailData = buildEmailData('global_briefing', fullAssembledForIntel(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    const modelWatchIdx = html.indexOf("TODAY’S NBA MODEL WATCH");
    expect(modelWatchIdx).toBeGreaterThan(-1);

    const oddsIdx = html.indexOf('NBA CHAMPIONSHIP ODDS', modelWatchIdx);
    const watchSection = html.slice(modelWatchIdx, oddsIdx > 0 ? oddsIdx : modelWatchIdx + 2000);

    // No fabricated odds, spreads, edges, confidence percentages
    expect(watchSection).not.toMatch(/moneyline/i);
    expect(watchSection).not.toMatch(/spread\s*[+\-]?\s*\d/i);
    expect(watchSection).not.toMatch(/edge\s*[:=]?\s*\d/i);
    expect(watchSection).not.toMatch(/confidence\s*[:=]?\s*\d/i);
    // Must include the disclaimer
    expect(watchSection).toMatch(/Not official picks/i);
  });
});
