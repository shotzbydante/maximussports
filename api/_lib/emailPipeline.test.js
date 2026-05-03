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

const MOCK_NBA_DATA = {
  narrativeParagraph: 'Celtics drop the Knicks in a tight one. Wolves keep climbing the West.',
  headlines: [
    { title: 'NBA Power Rankings', link: '#', source: 'ESPN', pubDate: null },
  ],
  standings: {
    east: [
      { slug: 'bos', abbrev: 'BOS', conference: 'Eastern', record: '50-20', wins: 50, losses: 20, confRank: 1, streak: 'W4', gb: '—' },
      { slug: 'mil', abbrev: 'MIL', conference: 'Eastern', record: '46-24', wins: 46, losses: 24, confRank: 2, streak: 'W2', gb: '4.0' },
      { slug: 'nyk', abbrev: 'NYK', conference: 'Eastern', record: '44-26', wins: 44, losses: 26, confRank: 3, streak: 'L1', gb: '6.0' },
    ],
    west: [
      { slug: 'okc', abbrev: 'OKC', conference: 'Western', record: '52-18', wins: 52, losses: 18, confRank: 1, streak: 'W6', gb: '—' },
      { slug: 'min', abbrev: 'MIN', conference: 'Western', record: '48-22', wins: 48, losses: 22, confRank: 2, streak: 'W3', gb: '4.0' },
      { slug: 'lal', abbrev: 'LAL', conference: 'Western', record: '45-25', wins: 45, losses: 25, confRank: 3, streak: 'W1', gb: '7.0' },
    ],
  },
  titleOutlook: [
    { slug: 'bos', bestChanceAmerican: 250, booksCount: 8 },
    { slug: 'okc', bestChanceAmerican: 350, booksCount: 8 },
    { slug: 'mil', bestChanceAmerican: 800, booksCount: 8 },
  ],
  champOdds: {
    bos: { bestChanceAmerican: 250 },
    okc: { bestChanceAmerican: 350 },
    mil: { bestChanceAmerican: 800 },
  },
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
    nbaData: { ...MOCK_NBA_DATA },
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
  it('includes all sections from the new compact cross-sport contract', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // NEW CONTRACT: NBA Playoffs first, MLB second, parallel 5-section structure
    // Sport headers
    expect(html).toContain('NBA PLAYOFFS');
    expect(html).toContain('MLB');
    // NBA block
    expect(html).toContain('NBA DAILY INTELLIGENCE');
    expect(html).toContain('NBA PICKS SCORECARD');
    expect(html).toContain('NBA CHAMPIONSHIP ODDS');
    // MLB block
    expect(html).toContain('MLB DAILY INTELLIGENCE');
    expect(html).toContain('MLB PICKS SCORECARD');
    expect(html).toContain('TODAY’S MLB PICKS');
    expect(html).toContain('WORLD SERIES ODDS');
    // Partner module
    expect(html).toContain('ACT ON TODAY');
  });

  it('renders NBA section BEFORE MLB section (NBA Playoffs lead)', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    const nbaIdx = html.indexOf('NBA PLAYOFFS');
    const mlbIdx = html.indexOf('>MLB<');  // sport header (not "MLB DAILY")
    const partnerIdx = html.indexOf('ACT ON TODAY');

    expect(nbaIdx).toBeGreaterThan(-1);
    expect(mlbIdx).toBeGreaterThan(nbaIdx);
    expect(partnerIdx).toBeGreaterThan(mlbIdx);
  });

  it('renders partner module AFTER main briefing content', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    const nbaIdx = html.indexOf('NBA DAILY INTELLIGENCE');
    const mlbOddsIdx = html.indexOf('WORLD SERIES ODDS');
    const partnerIdx = html.indexOf('ACT ON TODAY');

    expect(nbaIdx).toBeGreaterThan(-1);
    expect(mlbOddsIdx).toBeGreaterThan(-1);
    expect(partnerIdx).toBeGreaterThan(mlbOddsIdx);
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
  it('digest reports all sections present for full data (new contract)', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    // New compact contract: NBA + MLB sections
    expect(digest.hasNbaNarrative).toBe(true);
    expect(digest.hasNbaChampOdds).toBe(true);
    expect(digest.hasMlbNarrative).toBe(true);
    expect(digest.hasMlbPicks).toBe(true);
    expect(digest.hasMlbChampOdds).toBe(true);
  });

  it('expectedHeroSections returns empty when both champ odds present', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const missing = expectedHeroSections(globalBriefingSectionDigest(emailData));
    expect(missing).toEqual([]);
  });

  it('expectedHeroSections flags missing championship odds (the only Tier 1)', () => {
    const assembled = fullAssembled();
    assembled.mlbData.champOdds = {};
    assembled.nbaData.champOdds = {};
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const missing = expectedHeroSections(globalBriefingSectionDigest(emailData));
    expect(missing).toContain('mlbChampOdds');
    expect(missing).toContain('nbaChampOdds');
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

    // Section presence parity — new compact cross-sport contract
    const sections = [
      'NBA PLAYOFFS',
      'NBA DAILY INTELLIGENCE',
      'NBA PICKS SCORECARD',
      'NBA CHAMPIONSHIP ODDS',
      'MLB DAILY INTELLIGENCE',
      'MLB PICKS SCORECARD',
      'TODAY’S MLB PICKS',
      'WORLD SERIES ODDS',
      'ACT ON TODAY',
    ];
    for (const section of sections) {
      expect(prodHtml.includes(section)).toBe(true);
      expect(testHtml.includes(section)).toBe(true);
    }
  });
});

describe("Global Briefing: MLB picks section (Tier 2 degradable)", () => {
  it('renders MLB picks under TODAY’S MLB PICKS when canonical board exists', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).toContain("TODAY’S MLB PICKS");
    expect(html).toContain('PHI -135');
    expect(html).toContain('KC -1.5');
  });

  it('digest reports hasMlbPicks=true when board has picks', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);
    expect(digest.hasMlbPicks).toBe(true);
  });

  it('gracefully degrades when MLB picks board is null', () => {
    const assembled = fullAssembled();
    assembled.mlbData.picksBoard = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).not.toContain("TODAY’S MLB PICKS");
    // Other MLB sections still render
    expect(html).toContain('MLB DAILY INTELLIGENCE');
    expect(html).toContain('WORLD SERIES ODDS');
    expect(html).toContain('ACT ON TODAY');
  });

  it('gracefully degrades when MLB picks categories are all empty', () => {
    const assembled = fullAssembled();
    assembled.mlbData.picksBoard = { categories: { pickEms: [], ats: [], leans: [], totals: [] } };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).not.toContain("TODAY’S MLB PICKS");
    expect(html).toContain('MLB DAILY INTELLIGENCE');
  });

  it('missing MLB picks is reported via degradableHeroSections (not expectedHeroSections)', () => {
    const assembled = fullAssembled();
    assembled.mlbData.picksBoard = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    // Picks is NOT in the durable list — only champ odds are Tier 1
    expect(expectedHeroSections(digest)).toEqual([]);
    expect(degradableHeroSections(digest)).toContain('mlbPicks');
  });

  it('missing championship odds triggers expectedHeroSections (Tier 1)', () => {
    const assembled = fullAssembled();
    assembled.mlbData.champOdds = {};
    assembled.nbaData.champOdds = {};
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    const missingDurable = expectedHeroSections(digest);
    expect(missingDurable).toContain('mlbChampOdds');
    expect(missingDurable).toContain('nbaChampOdds');
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

describe('MLB Picks: reliability — partial board renders available categories', () => {
  it('renders only pickEms when other categories are empty', () => {
    const assembled = fullPicksAssembled();
    assembled.picksBoard.categories.ats = [];
    assembled.picksBoard.categories.leans = [];
    assembled.picksBoard.categories.totals = [];
    const emailData = buildEmailData('mlb_picks', assembled, { displayName: 'Test' });
    const html = renderMlbPicksHTML(emailData);

    expect(html).toContain("PICK 'EMS");
    expect(html).not.toContain('AGAINST THE SPREAD');
    expect(html).not.toContain('VALUE LEANS');
    expect(html).not.toContain('GAME TOTALS');
    expect(html).not.toContain('No picks have cleared');
  });

  it('board summary strip reflects only populated categories', () => {
    const assembled = fullPicksAssembled();
    assembled.picksBoard.categories.leans = [];
    assembled.picksBoard.categories.totals = [];
    const emailData = buildEmailData('mlb_picks', assembled, { displayName: 'Test' });
    const html = renderMlbPicksHTML(emailData);

    // Summary shows actual counts, not phantom zero categories
    expect(html).toContain('2 moneyline');
    expect(html).toContain('1 run line');
    expect(html).not.toContain('0 value');
    expect(html).not.toContain('0 total');
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

// ═══════════════════════════════════════════════════════════════
// GLOBAL BRIEFING — NBA CROSS-SPORT PARITY TESTS
// ═══════════════════════════════════════════════════════════════

describe('Global Briefing: NBA section contract', () => {
  it('includes nbaData top-level fields after buildEmailData', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });

    expect(emailData).toHaveProperty('nbaData');
    expect(emailData).toHaveProperty('nbaStandings');
    expect(emailData).toHaveProperty('nbaTitleOutlook');
    expect(emailData).toHaveProperty('nbaChampOdds');
    expect(emailData).toHaveProperty('nbaHeadlines');

    expect(emailData.nbaStandings.east).toHaveLength(3);
    expect(emailData.nbaStandings.west).toHaveLength(3);
    expect(emailData.nbaTitleOutlook).toHaveLength(3);
  });

  it('renders NBA headers in HTML when nbaData is present (new compact contract)', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).toContain('NBA PLAYOFFS');
    expect(html).toContain('NBA DAILY INTELLIGENCE');
    expect(html).toContain('NBA PICKS SCORECARD');
    expect(html).toContain('NBA CHAMPIONSHIP ODDS');
    // Specific odds team data should appear
    expect(html).toContain('BOS');
    expect(html).toContain('OKC');
    expect(html).toContain('+250');  // odds formatted
  });

  it('uses ESPN CDN absolute URLs for NBA team logos (no relative paths)', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // NBA logos should resolve to absolute ESPN CDN URLs
    expect(html).toContain('a.espncdn.com/i/teamlogos/nba/500/');
    // No relative paths
    expect(html).not.toContain('src="/logos/nba/');
  });

  it('digest reports NBA sections as present when data exists', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });
    const digest = globalBriefingSectionDigest(emailData);

    // New compact contract fields
    expect(digest.hasNbaNarrative).toBe(true);
    expect(digest.hasNbaChampOdds).toBe(true);
    // Legacy aliases still work for back-compat diagnostics
    expect(digest.hasNbaHeadlines).toBe(true);
  });
});

describe('Global Briefing: cross-sport graceful degradation', () => {
  it('MLB renders fully when NBA data is null', () => {
    const assembled = fullAssembled();
    assembled.nbaData = null;
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // MLB sections still present (compact contract)
    expect(html).toContain('MLB DAILY INTELLIGENCE');
    expect(html).toContain('WORLD SERIES ODDS');
    expect(html).toContain('TODAY’S MLB PICKS');
    // NBA sections absent
    expect(html).not.toContain('NBA DAILY INTELLIGENCE');
    expect(html).not.toContain('NBA CHAMPIONSHIP ODDS');
    // Partner module still renders
    expect(html).toContain('ACT ON TODAY');
  });

  it('NBA renders fully when MLB data is sparse but NBA data present', () => {
    const assembled = fullAssembled();
    assembled.mlbData = {
      narrativeParagraph: '', headlines: [], picksBoard: null,
      pennantRace: null, worldSeriesOutlook: null,
      leadersCategories: {}, champOdds: {},
    };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // NBA sections still render (compact contract)
    expect(html).toContain('NBA DAILY INTELLIGENCE');
    expect(html).toContain('NBA CHAMPIONSHIP ODDS');
    // Partner module still renders since NBA has substantive content
    expect(html).toContain('ACT ON TODAY');
  });

  it('full empty: only true last resort triggers no-content fallback', () => {
    const assembled = fullAssembled();
    assembled.nbaData = null;
    assembled.mlbData = {
      narrativeParagraph: '', headlines: [], picksBoard: null,
      pennantRace: null, worldSeriesOutlook: null,
      leadersCategories: {}, champOdds: {},
    };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // Empty-state message should appear
    expect(html).toContain('still being assembled');
    // No section headers
    expect(html).not.toContain('MLB DAILY INTELLIGENCE');
    expect(html).not.toContain('NBA CHAMPIONSHIP ODDS');
    // Partner module suppressed when no substantive content
    expect(html).not.toContain('ACT ON TODAY');
  });
});

describe('Global Briefing: NBA prod/test parity', () => {
  it('buildEmailData produces same NBA fields for same input (idempotent)', () => {
    const prod = buildEmailData('global_briefing', fullAssembled(), { displayName: 'User' });
    const test = buildEmailData('global_briefing', fullAssembled(), { displayName: 'User' });

    expect(prod.nbaData).toEqual(test.nbaData);
    expect(prod.nbaStandings).toEqual(test.nbaStandings);
    expect(prod.nbaTitleOutlook).toEqual(test.nbaTitleOutlook);
    expect(prod.nbaChampOdds).toEqual(test.nbaChampOdds);
    expect(prod.nbaHeadlines).toEqual(test.nbaHeadlines);
  });

  it('MLB data unaffected by NBA addition (regression check)', () => {
    const emailData = buildEmailData('global_briefing', fullAssembled(), { displayName: 'Test' });

    // MLB durable fields still mapped correctly
    expect(emailData.pennantRace).toBeTruthy();
    expect(emailData.worldSeriesOutlook).toBeTruthy();
    expect(emailData.leadersCategories).toBeTruthy();
    expect(emailData.champOdds).toBeTruthy();
    expect(emailData.mlbData).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// DATE CONTEXT + RECENT RESULTS REGRESSION TESTS
// ═══════════════════════════════════════════════════════════════

import { resolveEmailDateContext } from './emailDateContext.js';

describe('Date context: timezone-safe resolution', () => {
  it('resolves the correct PT date at 11:45 PM PT (the near-midnight bug)', () => {
    // 06:45 UTC May 3 = 11:45 PM PT May 2
    const nightPT = new Date('2026-05-03T06:45:00.000Z');
    const ctx = resolveEmailDateContext({ now: nightPT });

    expect(ctx.sendDate).toBe('2026-05-02');
    expect(ctx.briefingDate).toBe('2026-05-02');
    expect(ctx.yesterdayDate).toBe('2026-05-01');
    expect(ctx.sportsDataDate).toBe('20260501');
    expect(ctx.briefingDateLabel).toBe('Saturday, May 2');
    expect(ctx.timezone).toBe('America/Los_Angeles');
  });

  it('resolves correctly at noon PT', () => {
    // 19:00 UTC May 2 = 12:00 PM PT May 2
    const noonPT = new Date('2026-05-02T19:00:00.000Z');
    const ctx = resolveEmailDateContext({ now: noonPT });

    expect(ctx.sendDate).toBe('2026-05-02');
    expect(ctx.yesterdayDate).toBe('2026-05-01');
  });

  it('rolls correctly across month boundary', () => {
    // 03:00 UTC May 1 = 8:00 PM PT April 30
    const apr30pm = new Date('2026-05-01T03:00:00.000Z');
    const ctx = resolveEmailDateContext({ now: apr30pm });

    expect(ctx.sendDate).toBe('2026-04-30');
    expect(ctx.yesterdayDate).toBe('2026-04-29');
  });
});

describe('Recent Results: defensive rendering (no malformed rows)', () => {
  it('rendered HTML never contains "?? ? - @ ?? ? - Final" placeholders', () => {
    const assembled = fullAssembled();
    // Inject a malformed result row
    assembled.mlbData.yesterdayResults = [
      { gameId: 'bad1', away: { abbrev: null, score: null }, home: { abbrev: null, score: null }, statusText: 'Final' },
    ];
    assembled.nbaData.yesterdayResults = [
      { gameId: 'bad2', away: { abbrev: null, score: null }, home: { abbrev: null, score: null }, statusText: 'Final' },
    ];
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).not.toContain('?? ?');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    // Should render the clean fallback message instead
    expect(html).toMatch(/No completed.*results were available/i);
  });

  it('renders valid result rows correctly', () => {
    const assembled = fullAssembled();
    assembled.mlbData.yesterdayResults = [
      { gameId: '1', away: { slug: 'lad', abbrev: 'LAD', score: 7 }, home: { slug: 'sf', abbrev: 'SF', score: 3 }, statusText: 'Final' },
    ];
    assembled.nbaData.yesterdayResults = [
      { gameId: '2', away: { slug: 'bos', abbrev: 'BOS', score: 110 }, home: { slug: 'nyk', abbrev: 'NYK', score: 95 }, statusText: 'Final' },
    ];
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // Valid rows should render with actual data
    expect(html).toContain('LAD');
    expect(html).toContain('SF');
    expect(html).toContain('>7<');
    expect(html).toContain('>3<');
    expect(html).toContain('BOS');
    expect(html).toContain('NYK');
    expect(html).toContain('>110<');
    expect(html).toContain('>95<');
    // Still no placeholders
    expect(html).not.toContain('?? ?');
  });

  it('mixed valid + invalid: only valid rows render', () => {
    const assembled = fullAssembled();
    assembled.mlbData.yesterdayResults = [
      { gameId: '1', away: { slug: 'lad', abbrev: 'LAD', score: 7 }, home: { slug: 'sf', abbrev: 'SF', score: 3 }, statusText: 'Final' },
      { gameId: 'bad', away: { abbrev: null, score: null }, home: { abbrev: null, score: null }, statusText: 'Final' },
    ];
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).toContain('LAD');
    expect(html).not.toContain('?? ?');
  });
});

describe('MLB Picks dedupe in Global Briefing', () => {
  it('does not render the same matchup twice across categories', () => {
    const assembled = fullAssembled();
    // Inject duplicate matchup across pickEms and ats
    assembled.mlbData.picksBoard = {
      categories: {
        pickEms: [{
          id: 'a', gameId: 'g1',
          matchup: { awayTeam: { slug: 'phi', shortName: 'PHI' }, homeTeam: { slug: 'mia', shortName: 'MIA' } },
          pick: { label: 'PHI -135', side: 'away', explanation: 'Test.' },
          confidence: 'high', confidenceScore: 90,
        }],
        ats: [{
          id: 'b', gameId: 'g1',
          matchup: { awayTeam: { slug: 'phi', shortName: 'PHI' }, homeTeam: { slug: 'mia', shortName: 'MIA' } },
          pick: { label: 'PHI -1.5', side: 'away', explanation: 'Test.' },
          confidence: 'medium', confidenceScore: 75,
        }],
        leans: [{
          id: 'c', gameId: 'g2',
          matchup: { awayTeam: { slug: 'lad', shortName: 'LAD' }, homeTeam: { slug: 'sf', shortName: 'SF' } },
          pick: { label: 'LAD ML', side: 'away', explanation: 'Test.' },
          confidence: 'medium', confidenceScore: 70,
        }],
        totals: [],
      },
    };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // PHI vs MIA should appear only ONCE (the higher confidence pickEm wins)
    const phiMiaCount = (html.match(/PHI vs MIA/g) || []).length;
    expect(phiMiaCount).toBe(1);
    // The higher-confidence pick should be the one shown
    expect(html).toContain('PHI -135');
    expect(html).not.toContain('PHI -1.5');
    // LAD vs SF should also render
    expect(html).toContain('LAD vs SF');
  });

  it('caps Global Briefing picks to 3 unique matchups', () => {
    const assembled = fullAssembled();
    const matchups = ['phi-mia', 'lad-sf', 'nyy-bos', 'hou-tex', 'atl-was'];
    assembled.mlbData.picksBoard = {
      categories: {
        pickEms: matchups.map((m, i) => {
          const [a, h] = m.split('-');
          return {
            id: `p${i}`, gameId: `g${i}`,
            matchup: { awayTeam: { slug: a, shortName: a.toUpperCase() }, homeTeam: { slug: h, shortName: h.toUpperCase() } },
            pick: { label: `${a.toUpperCase()} ML`, side: 'away', explanation: '.' },
            confidence: 'high', confidenceScore: 90 - i,
          };
        }),
        ats: [], leans: [], totals: [],
      },
    };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    // Only the top 3 should appear
    expect(html).toContain('PHI vs MIA');
    expect(html).toContain('LAD vs SF');
    expect(html).toContain('NYY vs BOS');
    expect(html).not.toContain('HOU vs TEX');
    expect(html).not.toContain('ATL vs WAS');
  });
});

describe('Date context propagates to template label', () => {
  it('uses dateCtx.briefingDateLabel for date display when provided', () => {
    const assembled = fullAssembled();
    assembled.dateCtx = {
      briefingDateLabel: 'Saturday, May 2',
      sendDate: '2026-05-02',
      yesterdayDate: '2026-05-01',
      sportsDataDate: '20260501',
      timezone: 'America/Los_Angeles',
    };
    const emailData = buildEmailData('global_briefing', assembled, { displayName: 'Test' });
    const html = renderGlobalBriefingHTML(emailData);

    expect(html).toContain('Saturday, May 2');
  });
});
