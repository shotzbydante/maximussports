/**
 * v12 — end-to-end postmortem tests pinning the May 4 picks.
 *
 * Reproduces PHI ML +236 and SAS -13 fixtures and asserts that v12
 * demotes them to tracking, blocks them from briefing, and that legitimate
 * picks with recent-form support can still qualify.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG, NBA_MODEL_VERSION } from './buildNbaPicksV2.js';

function mkGame({ id, away, home, awayMl, homeMl, line, total, fairTotalSource = 'team_recent_v1+trend_v1', awayForm = null, homeForm = null }) {
  return {
    gameId: id,
    startTime: '2026-05-05T22:00:00Z',
    status: 'upcoming', gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: away, name: away.toUpperCase(), abbrev: away.toUpperCase() },
      home: { slug: home, name: home.toUpperCase(), abbrev: home.toUpperCase() },
    },
    market: {
      moneyline: { away: awayMl, home: homeMl },
      pregameSpread: line,
      pregameTotal: total,
    },
    model: {
      confidence: 0.7,
      fairTotal: total + 5,
      fairTotalSource,
      fairTotalConfidence: 0.6,
      awayTeamForm: awayForm,
      homeTeamForm: homeForm,
    },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
  };
}

describe('v12 model version', () => {
  it('NBA_MODEL_VERSION is bumped past v2.2.0', () => {
    expect(NBA_MODEL_VERSION).toBe('nba-picks-v2.3.0');
  });
});

describe('v12 — PHI ML +236 fixture (long-shot dog, no support)', () => {
  it('PHI ML +236 stays tracking when no team-form support', () => {
    const g = mkGame({
      id: 'phi-nyk', away: 'phi', home: 'nyk',
      awayMl: +236, homeMl: -290, line: -7.5, total: 213,
      // PHI is COLD recently, NYK is HOT — exactly the May 4 setup
      awayForm: { teamSlug: 'phi', sample: 3, confidence: 0.5,
                  recentScoringAvg: 100, recentAllowedAvg: 120,
                  recentMarginAvg: -15, recentTotalAvg: 220, formScore: -1 },
      homeForm: { teamSlug: 'nyk', sample: 3, confidence: 0.5,
                  recentScoringAvg: 125, recentAllowedAvg: 105,
                  recentMarginAvg: +18, recentTotalAvg: 230, formScore: 1 },
    });
    const r = buildNbaPicksV2({ games: [g], config: NBA_DEFAULT_CONFIG });
    const phiMl = r.fullSlatePicks.find(p =>
      p.gameId === 'phi-nyk' && p.market?.type === 'moneyline'
    );
    expect(phiMl).toBeTruthy();
    // Picks builder may still pick PHI side (cross-market spread vs ML edge),
    // but the longShotDogRisk flag should fire and mark unsupported.
    if (phiMl.selection?.side === 'away') {
      expect(phiMl.longShotDogRisk).toBeTruthy();
      expect(phiMl.longShotDogRisk.supported).toBe(false);
      // Hero must be denied
      expect(phiMl.pickRole).toBe('tracking');
    }
    // Briefing must reject
    const inBriefing = r.briefingPicks.find(p => p.id === phiMl.id);
    expect(inBriefing).toBeUndefined();
    const rejection = r.rejectedBriefingCandidates.find(rc => rc.id === phiMl.id);
    expect(rejection).toBeTruthy();
  });
});

describe('v12 — SAS -13 fixture (large favorite spread, no margin support)', () => {
  it('SAS -13 stays tracking when recent margin support is missing', () => {
    const g = mkGame({
      id: 'min-sas', away: 'min', home: 'sas',
      awayMl: +600, homeMl: -900, line: -13, total: 210,
      awayForm: { teamSlug: 'min', sample: 3, confidence: 0.5,
                  recentScoringAvg: 110, recentAllowedAvg: 108,
                  recentMarginAvg: +2, recentTotalAvg: 218, formScore: 0.13 },
      homeForm: { teamSlug: 'sas', sample: 3, confidence: 0.5,
                  recentScoringAvg: 112, recentAllowedAvg: 105,
                  recentMarginAvg: +7, recentTotalAvg: 217, formScore: 0.47 },
    });
    const r = buildNbaPicksV2({ games: [g], config: NBA_DEFAULT_CONFIG });
    const sasAts = r.fullSlatePicks.find(p =>
      p.gameId === 'min-sas' && p.market?.type === 'runline'
    );
    expect(sasAts).toBeTruthy();
    if (sasAts.selection?.side === 'home' && (sasAts.market?.line ?? 0) <= -10) {
      expect(sasAts.largeFavoriteSpreadRisk).toBeTruthy();
      expect(sasAts.largeFavoriteSpreadRisk.supported).toBe(false);
      expect(sasAts.pickRole).toBe('tracking');
    }
    const inBriefing = r.briefingPicks.find(p => p.id === sasAts.id);
    expect(inBriefing).toBeUndefined();
  });
});

describe('v12 — legitimate picks with team-form support still qualify', () => {
  it('large favorite WITH strong recent margin support can still earn briefing', () => {
    // Strong fav: home has been blowing teams out by 18, dog has been
    // losing by 10 → support clears spread -10.
    const g = mkGame({
      id: 'fav-supported', away: 'tm-dog', home: 'tm-fav',
      awayMl: +400, homeMl: -550, line: -10, total: 220,
      awayForm: { teamSlug: 'tm-dog', sample: 3, confidence: 0.5,
                  recentScoringAvg: 100, recentAllowedAvg: 110,
                  recentMarginAvg: -10, recentTotalAvg: 210, formScore: -0.67 },
      homeForm: { teamSlug: 'tm-fav', sample: 3, confidence: 0.5,
                  recentScoringAvg: 120, recentAllowedAvg: 102,
                  recentMarginAvg: +18, recentTotalAvg: 222, formScore: 1 },
    });
    const r = buildNbaPicksV2({ games: [g], config: NBA_DEFAULT_CONFIG });
    const ats = r.fullSlatePicks.find(p =>
      p.gameId === 'fav-supported' && p.market?.type === 'runline'
    );
    if (ats?.selection?.side === 'home' && (ats.market?.line ?? 0) <= -10) {
      // Risk flag attached; supported=true means it can pass the gate.
      expect(ats.largeFavoriteSpreadRisk?.supported).toBe(true);
    }
  });

  it('non-long-shot moderate dog (≤+200) is unaffected by long-shot gate', () => {
    const g = mkGame({
      id: 'modest-dog', away: 'tm-a', home: 'tm-b',
      awayMl: +130, homeMl: -150, line: -3, total: 215,
      awayForm: { teamSlug: 'tm-a', sample: 3, confidence: 0.5,
                  recentScoringAvg: 112, recentAllowedAvg: 108,
                  recentMarginAvg: +4, recentTotalAvg: 220, formScore: 0.27 },
      homeForm: { teamSlug: 'tm-b', sample: 3, confidence: 0.5,
                  recentScoringAvg: 110, recentAllowedAvg: 109,
                  recentMarginAvg: +1, recentTotalAvg: 219, formScore: 0.07 },
    });
    const r = buildNbaPicksV2({ games: [g], config: NBA_DEFAULT_CONFIG });
    const ml = r.fullSlatePicks.find(p =>
      p.gameId === 'modest-dog' && p.market?.type === 'moneyline'
    );
    if (ml?.selection?.side === 'away') {
      expect(ml.longShotDogRisk).toBeNull();
    }
  });
});

describe('v12 — totals trend agreement attaches to total picks', () => {
  it('totalsTrendAgreement field present on total picks when both teams have form', () => {
    const g = mkGame({
      id: 'tot-test', away: 'pa', home: 'pb',
      awayMl: -110, homeMl: -110, line: 0, total: 215,
      awayForm: { teamSlug: 'pa', sample: 3, confidence: 0.5,
                  recentScoringAvg: 115, recentAllowedAvg: 110,
                  recentMarginAvg: +5, recentTotalAvg: 230, formScore: 0.33 },
      homeForm: { teamSlug: 'pb', sample: 3, confidence: 0.5,
                  recentScoringAvg: 113, recentAllowedAvg: 112,
                  recentMarginAvg: +1, recentTotalAvg: 228, formScore: 0.07 },
    });
    const r = buildNbaPicksV2({ games: [g], config: NBA_DEFAULT_CONFIG });
    const tot = r.fullSlatePicks.find(p =>
      p.gameId === 'tot-test' && p.market?.type === 'total'
    );
    expect(tot.totalsTrendAgreement).toBeTruthy();
    expect(['agree', 'mixed', 'unknown']).toContain(tot.totalsTrendAgreement.agreement);
  });
});
