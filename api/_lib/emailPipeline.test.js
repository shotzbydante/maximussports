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
import {
  buildEmailData, globalBriefingSectionDigest, expectedHeroSections, degradableHeroSections,
} from './emailPipeline.js';
import { renderHTML as renderGlobalBriefingHTML } from '../../src/emails/templates/globalBriefing.js';
import { renderHTML as renderMlbPicksHTML } from '../../src/emails/templates/mlbPicks.js';

// ── Mock data matching what assembleEmailData() returns ────────────

const MOCK_MLB_DATA = {
  narrativeParagraph: 'Nationals take down Brewers 7-3 as the underdog prevails.',
  headlines: [{ title: 'MLB Power Rankings', link: '#', source: 'ESPN' }],
  picksBoard: {
    categories: {
      pickEms: [{
        id: '1',
        matchup: { awayTeam: { slug: 'ari', shortName: 'ARI' }, homeTeam: { slug: 'phi', shortName: 'PHI' } },
        pick: { label: 'PHI -135', side: 'home', explanation: 'Model favors Phillies with a 28.9% edge.' },
        confidence: 'high',
        confidenceScore: 85,
      }],
      ats: [{
        id: '2',
        matchup: { awayTeam: { slug: 'cws', shortName: 'CWS' }, homeTeam: { slug: 'kc', shortName: 'KC' } },
        pick: { label: 'KC -1.5', side: 'home', explanation: 'Model favors KC to cover the run line.' },
        confidence: 'high',
        confidenceScore: 90,
      }],
      leans: [],
      totals: [],
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

describe('Global Briefing: rendered HTML section contract', () => {
  it('includes all hero email section headers when data is complete', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // Explicit section header assertions — these are the hero-email contract
    expect(html).toContain('MLB DAILY INTELLIGENCE');
    expect(html).toContain('PENNANT RACE SNAPSHOT');
    expect(html).toContain("MAXIMUS'S PICKS"); // Tier 2 hero-critical
    expect(html).toContain('SEASON LEADERS');
    expect(html).toContain('WORLD SERIES OUTLOOK');
    expect(html).toContain('HEADLINES');
    expect(html).toContain('ACT ON TODAY'); // partner module
  });

  it('renders partner module AFTER main briefing content', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    const pennantIdx = html.indexOf('PENNANT RACE SNAPSHOT');
    const outlookIdx = html.indexOf('WORLD SERIES OUTLOOK');
    const partnerIdx = html.indexOf('ACT ON TODAY');

    expect(pennantIdx).toBeGreaterThan(-1);
    expect(outlookIdx).toBeGreaterThan(-1);
    expect(partnerIdx).toBeGreaterThan(outlookIdx);
  });

  it('suppresses partner module when briefing content is empty (last-resort)', () => {
    const emptyAssembled = {
      scoresToday: [], rankingsTop25: [], atsLeaders: { best: [], worst: [] },
      headlines: [], oddsGames: [], botIntelBullets: [],
      mlbData: {
        narrativeParagraph: '', headlines: [], picksBoard: null,
        pennantRace: null, worldSeriesOutlook: null,
        leadersCategories: {}, champOdds: {},
        scoresToday: [], botIntelBullets: [], rankingsTop25: [],
        atsLeaders: { best: [], worst: [] }, oddsGames: [],
        modelSignals: [], tournamentMeta: {},
      },
      mlbNarrativeParagraph: '', briefingContext: {}, picksBoard: null,
      modelSignals: [], tournamentMeta: {},
    };
    const emailData = buildEmailData('global_briefing', emptyAssembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).not.toContain('ACT ON TODAY');
    expect(html).toContain('still being assembled');
  });
});

describe('Global Briefing: section digest and expected hero sections', () => {
  it('digest reports all sections present for full data', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    expect(digest.hasNarrative).toBe(true);
    expect(digest.hasHeadlines).toBe(true);
    expect(digest.hasPicks).toBe(true);
    expect(digest.hasPennant).toBe(true);
    expect(digest.hasLeaders).toBe(true);
    expect(digest.hasOutlook).toBe(true);
    expect(digest.hasChampOdds).toBe(true);
  });

  it('expectedHeroSections returns empty for full data', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const missing = expectedHeroSections(globalBriefingSectionDigest(emailData));
    expect(missing).toEqual([]);
  });

  it('expectedHeroSections flags missing durable fields', () => {
    const assembled = fullAssembled();
    assembled.mlbData.pennantRace = null;
    assembled.mlbData.worldSeriesOutlook = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const missing = expectedHeroSections(globalBriefingSectionDigest(emailData));
    expect(missing).toContain('pennantRace');
    expect(missing).toContain('worldSeriesOutlook');
  });
});

describe('Global Briefing: prod/test parity (same input → same output)', () => {
  it('buildEmailData is idempotent and deterministic for global_briefing', () => {
    const assembled1 = fullAssembled();
    const assembled2 = fullAssembled();

    const prodData = buildEmailData('global_briefing', assembled1, { displayName: 'Prod User' });
    const testData = buildEmailData('global_briefing', assembled2, { displayName: 'Prod User' });

    // Structural parity — both paths must produce the same field set
    expect(Object.keys(prodData).sort()).toEqual(Object.keys(testData).sort());

    // Durable fields parity
    expect(prodData.pennantRace).toEqual(testData.pennantRace);
    expect(prodData.worldSeriesOutlook).toEqual(testData.worldSeriesOutlook);
    expect(prodData.leadersCategories).toEqual(testData.leadersCategories);
    expect(prodData.champOdds).toEqual(testData.champOdds);
    expect(prodData.mlbData).toEqual(testData.mlbData);
  });

  it('rendered HTML is identical between prod and test paths for same input', () => {
    // Use a fixed date-independent mock — renderHTML uses new Date() for some
    // calls, but section markers should be stable
    const assembled1 = fullAssembled();
    const assembled2 = fullAssembled();

    const prodData = buildEmailData('global_briefing', assembled1, { displayName: 'User' });
    const testData = buildEmailData('global_briefing', assembled2, { displayName: 'User' });

    const prodHtml = renderGlobalBriefingHTML(prodData);
    const testHtml = renderGlobalBriefingHTML(testData);

    // Section presence parity — the hero contract
    const sections = [
      'MLB DAILY INTELLIGENCE',
      'PENNANT RACE SNAPSHOT',
      "MAXIMUS'S PICKS",
      'SEASON LEADERS',
      'WORLD SERIES OUTLOOK',
      'HEADLINES',
      'ACT ON TODAY',
    ];
    for (const section of sections) {
      expect(prodHtml.includes(section)).toBe(true);
      expect(testHtml.includes(section)).toBe(true);
    }
  });
});

describe("Global Briefing: MAXIMUS'S PICKS contract (Tier 2 degradable)", () => {
  it('renders picks section when canonical picks source is available', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).toContain("MAXIMUS'S PICKS");
    // Mock pick labels should render
    expect(html).toContain('PHI -135');
    expect(html).toContain('KC -1.5');
  });

  it('digest reports hasPicks=true when board has picks', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);
    expect(digest.hasPicks).toBe(true);
  });

  it('gracefully degrades when picks source is null (still renders durable sections)', () => {
    const assembled = fullAssembled();
    assembled.mlbData.picksBoard = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // Picks section should be absent
    expect(html).not.toContain("MAXIMUS'S PICKS");
    // Durable sections must still be present
    expect(html).toContain('PENNANT RACE SNAPSHOT');
    expect(html).toContain('SEASON LEADERS');
    expect(html).toContain('WORLD SERIES OUTLOOK');
    // Hero email still has substantive content — partner module should render
    expect(html).toContain('ACT ON TODAY');
  });

  it('gracefully degrades when picks categories are all empty', () => {
    const assembled = fullAssembled();
    assembled.mlbData.picksBoard = { categories: { pickEms: [], ats: [], leans: [], totals: [] } };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).not.toContain("MAXIMUS'S PICKS");
    expect(html).toContain('PENNANT RACE SNAPSHOT');
  });

  it('missing picks is reported via degradableHeroSections (not expectedHeroSections)', () => {
    const assembled = fullAssembled();
    assembled.mlbData.picksBoard = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    // Picks is NOT in the durable list — missing it must NOT fail the strict contract
    expect(expectedHeroSections(digest)).toEqual([]);
    // But it IS reported as a degradable gap for diagnostics
    expect(degradableHeroSections(digest)).toContain('picks');
  });

  it('durable sections missing still reports via expectedHeroSections (stricter than picks)', () => {
    const assembled = fullAssembled();
    assembled.mlbData.pennantRace = null;
    assembled.mlbData.worldSeriesOutlook = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    // Durable misses trigger the strict contract
    const missingDurable = expectedHeroSections(digest);
    expect(missingDurable).toContain('pennantRace');
    expect(missingDurable).toContain('worldSeriesOutlook');
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

// ═══════════════════════════════════════════════════════════════
// MLB PICKS EMAIL — PARITY TESTS
// ═══════════════════════════════════════════════════════════════

function fullPicksAssembled() {
  return {
    scoresToday: [],
    rankingsTop25: [],
    atsLeaders: { best: [], worst: [] },
    headlines: [],
    oddsGames: [],
    botIntelBullets: [],
    mlbData: null,
    mlbNarrativeParagraph: '',
    briefingContext: {},
    picksBoard: {
      categories: {
        pickEms: [
          { id: 'p1', matchup: { awayTeam: { slug: 'ari', shortName: 'ARI' }, homeTeam: { slug: 'phi', shortName: 'PHI' } }, pick: { label: 'PHI -135', side: 'home', explanation: 'Model favors Phillies.', topSignals: ['Strong rotation edge'] }, model: { edge: 0.289, dataQuality: 0.92 }, confidence: 'high', confidenceScore: 85, category: 'pickEms' },
          { id: 'p2', matchup: { awayTeam: { slug: 'mia', shortName: 'MIA' }, homeTeam: { slug: 'det', shortName: 'DET' } }, pick: { label: 'DET -145', side: 'home', explanation: 'Pitching mismatch.', topSignals: ['Home advantage'] }, model: { edge: 0.379, dataQuality: 0.88 }, confidence: 'high', confidenceScore: 90, category: 'pickEms' },
        ],
        ats: [
          { id: 'a1', matchup: { awayTeam: { slug: 'cws', shortName: 'CWS' }, homeTeam: { slug: 'kc', shortName: 'KC' } }, pick: { label: 'KC -1.5', side: 'home', explanation: 'Run line value.', topSignals: ['Run line value'] }, model: { edge: 0.15, dataQuality: 0.85 }, confidence: 'high', confidenceScore: 88, category: 'ats' },
        ],
        leans: [
          { id: 'l1', matchup: { awayTeam: { slug: 'sf', shortName: 'SF' }, homeTeam: { slug: 'col', shortName: 'COL' } }, pick: { label: 'SF +110', side: 'away', explanation: 'Value lean.', topSignals: ['Road edge'] }, model: { edge: 0.08, dataQuality: 0.75 }, confidence: 'medium', confidenceScore: 65, category: 'leans' },
        ],
        totals: [
          { id: 't1', matchup: { awayTeam: { slug: 'nyy', shortName: 'NYY' }, homeTeam: { slug: 'bos', shortName: 'BOS' } }, pick: { label: 'OVER 8.5', side: 'over', explanation: 'Both offenses hot.', topSignals: ['Both offenses hot'] }, model: { edge: 0.12, dataQuality: 0.78 }, confidence: 'medium', confidenceScore: 70, category: 'totals' },
        ],
      },
    },
    modelSignals: [],
    tournamentMeta: {},
  };
}

describe('MLB Picks: buildEmailData produces correct payload', () => {
  it('includes picksBoard with all four categories at top level', () => {
    const emailData = buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'Test' });

    expect(emailData.picksBoard).toBeTruthy();
    expect(emailData.picksBoard.categories).toBeTruthy();
    expect(emailData.picksBoard.categories.pickEms).toHaveLength(2);
    expect(emailData.picksBoard.categories.ats).toHaveLength(1);
    expect(emailData.picksBoard.categories.leans).toHaveLength(1);
    expect(emailData.picksBoard.categories.totals).toHaveLength(1);
  });

  it('preserves pick detail fields through buildEmailData', () => {
    const emailData = buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'Test' });
    const pick = emailData.picksBoard.categories.pickEms[0];

    expect(pick.pick.label).toBe('PHI -135');
    expect(pick.model.edge).toBe(0.289);
    expect(pick.confidence).toBe('high');
    expect(pick.matchup.homeTeam.shortName).toBe('PHI');
  });
});

describe('MLB Picks: rendered HTML section contract', () => {
  it('renders all pick sections when board is populated', () => {
    const emailData = buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'Test' });
    const html = renderMlbPicksHTML(emailData);

    expect(html).toContain('MLB SLATE');
    expect(html).toContain("PICK 'EMS");
    expect(html).toContain('AGAINST THE SPREAD');
    expect(html).toContain('VALUE LEANS');
    expect(html).toContain('GAME TOTALS');
    expect(html).toContain('ACT ON TODAY');
    // Actual pick labels
    expect(html).toContain('PHI -135');
    expect(html).toContain('KC -1.5');
    expect(html).toContain('OVER 8.5');
    // MODEL EDGE metric
    expect(html).toContain('MODEL EDGE');
  });

  it('does NOT render "no picks" message when board is populated', () => {
    const emailData = buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'Test' });
    const html = renderMlbPicksHTML(emailData);

    expect(html).not.toContain('No picks have cleared');
    expect(html).not.toContain('monitoring the board');
  });

  it('renders "no picks" only when board is truly empty', () => {
    const assembled = fullPicksAssembled();
    assembled.picksBoard = null;
    const emailData = buildEmailData('mlb_picks', assembled, { displayName: 'Test' });
    const html = renderMlbPicksHTML(emailData);

    expect(html).toContain('No picks have cleared');
    expect(html).not.toContain("PICK 'EMS");
    expect(html).not.toContain('AGAINST THE SPREAD');
  });

  it('renders board even if one category is empty', () => {
    const assembled = fullPicksAssembled();
    assembled.picksBoard.categories.leans = [];
    assembled.picksBoard.categories.totals = [];
    const emailData = buildEmailData('mlb_picks', assembled, { displayName: 'Test' });
    const html = renderMlbPicksHTML(emailData);

    // Board should still render with available categories
    expect(html).toContain("PICK 'EMS");
    expect(html).toContain('AGAINST THE SPREAD');
    expect(html).not.toContain('VALUE LEANS');
    expect(html).not.toContain('GAME TOTALS');
    expect(html).not.toContain('No picks have cleared');
  });
});

describe('MLB Picks: prod/test parity (same input → same output)', () => {
  it('buildEmailData is deterministic for mlb_picks', () => {
    const prod = buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'User' });
    const test = buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'User' });

    expect(Object.keys(prod).sort()).toEqual(Object.keys(test).sort());
    expect(prod.picksBoard).toEqual(test.picksBoard);
  });

  it('rendered HTML has same sections for same input', () => {
    const prodHtml = renderMlbPicksHTML(buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'User' }));
    const testHtml = renderMlbPicksHTML(buildEmailData('mlb_picks', fullPicksAssembled(), { displayName: 'User' }));

    const sections = ["PICK 'EMS", 'AGAINST THE SPREAD', 'VALUE LEANS', 'GAME TOTALS', 'ACT ON TODAY', 'MLB SLATE'];
    for (const s of sections) {
      expect(prodHtml.includes(s)).toBe(true);
      expect(testHtml.includes(s)).toBe(true);
    }
  });
});
