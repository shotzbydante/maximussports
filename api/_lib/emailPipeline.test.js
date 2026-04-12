/**
 * Regression tests for Global Daily Briefing email pipeline parity.
 *
 * Protects against prod/test drift by verifying:
 * 1. buildEmailData() produces the correct template-ready data shape
 * 2. Durable sections (leaders, outlook, pennant, champOdds) are always present
 *    when their source data exists
 * 3. Empty-state is a true last resort, not a common outcome
 */

import { describe, it, expect } from 'vitest';
import { buildEmailData } from './emailPipeline.js';

// ── Mock data matching what assembleEmailData() returns ────────────

const MOCK_MLB_DATA = {
  narrativeParagraph: 'Nationals take down Brewers 7-3 as the underdog prevails.',
  headlines: [{ title: 'MLB Power Rankings', link: '#', source: 'ESPN' }],
  picksBoard: {
    categories: {
      pickEms: [{ id: '1', matchup: {}, pick: { label: 'PHI -135' }, confidence: 'high' }],
      ats: [], leans: [], totals: [],
    },
  },
  pennantRace: {
    al: [{ slug: 'nyy', abbrev: 'NYY', projectedWins: 91, confidenceTier: 'medium', signals: ['Fragile Upside'] }],
    nl: [{ slug: 'lad', abbrev: 'LAD', projectedWins: 102, confidenceTier: 'high', signals: ['Stable Contender'] }],
  },
  worldSeriesOutlook: {
    al: [{ slug: 'nyy', abbrev: 'NYY', projectedWins: 91, champOdds: 800, signals: ['Test'], confidenceTier: 'medium', distilledRationale: 'Test rationale.', rangeLabel: '76-103' }],
    nl: [{ slug: 'lad', abbrev: 'LAD', projectedWins: 102, champOdds: 200, signals: ['Test'], confidenceTier: 'high', distilledRationale: 'Test rationale.', rangeLabel: '93-108' }],
  },
  leadersCategories: {
    homeRuns: { leaders: [{ name: 'Yordan Alvarez', teamAbbrev: 'HOU', display: '5' }] },
    RBIs: { leaders: [{ name: 'Andy Pages', teamAbbrev: 'LAD', display: '16' }] },
  },
  champOdds: {
    nyy: { bestChanceAmerican: 800 },
    lad: { bestChanceAmerican: 200 },
  },
  leadersEditorial: 'The HR race is heating up.',
  scoresToday: [],
  botIntelBullets: [],
  rankingsTop25: [],
  atsLeaders: { best: [], worst: [] },
  oddsGames: [],
  modelSignals: [],
  tournamentMeta: {},
};

function fullAssembled() {
  return {
    scoresToday: [],
    rankingsTop25: [],
    atsLeaders: { best: [], worst: [] },
    headlines: [],
    oddsGames: [],
    botIntelBullets: [],
    mlbData: { ...MOCK_MLB_DATA },
    mlbNarrativeParagraph: MOCK_MLB_DATA.narrativeParagraph,
    briefingContext: {},
    picksBoard: null,
    modelSignals: [],
    tournamentMeta: {},
    pennantRace: null,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Global Briefing: buildEmailData parity', () => {
  it('includes all durable top-level fields required by the template', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test User' });

    // These fields MUST exist at the top level — the template reads them directly
    expect(emailData).toHaveProperty('pennantRace');
    expect(emailData).toHaveProperty('worldSeriesOutlook');
    expect(emailData).toHaveProperty('leadersCategories');
    expect(emailData).toHaveProperty('champOdds');
    expect(emailData).toHaveProperty('mlbData');
    expect(emailData).toHaveProperty('displayName');
  });

  it('maps durable fields from mlbData to top-level correctly', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });

    // pennantRace
    expect(emailData.pennantRace).toBeTruthy();
    expect(emailData.pennantRace.al).toHaveLength(1);
    expect(emailData.pennantRace.nl).toHaveLength(1);
    expect(emailData.pennantRace.al[0].abbrev).toBe('NYY');

    // worldSeriesOutlook
    expect(emailData.worldSeriesOutlook).toBeTruthy();
    expect(emailData.worldSeriesOutlook.al).toHaveLength(1);
    expect(emailData.worldSeriesOutlook.nl).toHaveLength(1);

    // leadersCategories
    expect(emailData.leadersCategories).toBeTruthy();
    expect(emailData.leadersCategories.homeRuns).toBeTruthy();
    expect(emailData.leadersCategories.homeRuns.leaders).toHaveLength(1);

    // champOdds
    expect(emailData.champOdds).toBeTruthy();
    expect(emailData.champOdds.nyy).toBeTruthy();
    expect(emailData.champOdds.nyy.bestChanceAmerican).toBe(800);
  });

  it('preserves mlbData as a nested object for template sections that read it', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });

    expect(emailData.mlbData).toBeTruthy();
    expect(emailData.mlbData.narrativeParagraph).toContain('Nationals');
    expect(emailData.mlbData.headlines).toHaveLength(1);
  });
});

describe('Global Briefing: durable sections survive sparse data', () => {
  it('retains durable fields even when narrative and picks are empty', () => {
    const assembled = fullAssembled();
    // Simulate: narrative and picks APIs failed, but durable model data exists
    assembled.mlbData.narrativeParagraph = '';
    assembled.mlbData.picksBoard = null;
    assembled.mlbData.headlines = [];
    assembled.mlbNarrativeParagraph = '';

    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });

    // Durable sections must still be present
    expect(emailData.pennantRace).toBeTruthy();
    expect(emailData.pennantRace.al.length).toBeGreaterThan(0);
    expect(emailData.worldSeriesOutlook).toBeTruthy();
    expect(emailData.worldSeriesOutlook.al.length).toBeGreaterThan(0);
    expect(emailData.leadersCategories).toBeTruthy();
    expect(Object.keys(emailData.leadersCategories).length).toBeGreaterThan(0);
    expect(emailData.champOdds).toBeTruthy();
    expect(Object.keys(emailData.champOdds).length).toBeGreaterThan(0);
  });
});

describe('Global Briefing: empty-state is last resort only', () => {
  it('returns empty/null durable fields only when mlbData has no durable content', () => {
    const assembled = fullAssembled();
    // Simulate: ALL MLB data fetches failed — mlbData has no content
    assembled.mlbData = {
      narrativeParagraph: '',
      headlines: [],
      picksBoard: null,
      pennantRace: null,
      worldSeriesOutlook: null,
      leadersCategories: {},
      champOdds: {},
      leadersEditorial: null,
      scoresToday: [],
      botIntelBullets: [],
      rankingsTop25: [],
      atsLeaders: { best: [], worst: [] },
      oddsGames: [],
      modelSignals: [],
      tournamentMeta: {},
    };

    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });

    // Durable fields should be null/empty — this is the true last resort
    expect(emailData.pennantRace).toBeNull();
    expect(emailData.worldSeriesOutlook).toBeNull();
    expect(emailData.leadersCategories).toEqual({});
    expect(emailData.champOdds).toEqual({});

    // But mlbData should still be present (template needs it for guard checks)
    expect(emailData.mlbData).toBeTruthy();
  });
});
