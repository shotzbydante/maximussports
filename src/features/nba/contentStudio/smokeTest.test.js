/**
 * NBA Daily Briefing Phase 1 — end-to-end smoke test.
 *
 * Exercises the full canonical pipeline with synthesized but realistic
 * playoff data to verify:
 *   - playoffContext derives round / series / elimination / upsets correctly
 *   - normalizeNbaImagePayload assembles the canonical shape
 *   - buildNbaCaption produces a playoff-framed caption
 *   - HARD validation throws on zero picks / zero leaders
 *   - no-slate path emits a marked caption (not fallback junk)
 *
 * Uses current 2026 bracket seeds: OKC(1) vs PlayIn, LAL(4) vs HOU(5),
 * DEN(3) vs MIN(6), SAS(2) vs PlayIn, DET(1) vs PlayIn, CLE(4) vs TOR(5),
 * NYK(3) vs ATL(6), BOS(2) vs PlayIn.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPlayoffContext, findSeriesForGame } from '../../../data/nba/playoffContext.js';
import { buildNbaDailyHeadline } from './buildNbaDailyHeadline.js';
import { buildNbaHotPress } from './buildNbaHotPress.js';
import { normalizeNbaImagePayload } from './normalizeNbaImagePayload.js';
import { buildNbaCaption, NO_SLATE_REASON } from './buildNbaCaption.js';

// ── Test fixtures ──────────────────────────────────────────────────────────

function mkFinal({ id, awaySlug, awayAbbrev, awayScore, homeSlug, homeAbbrev, homeScore, date }) {
  return {
    gameId: id,
    sport: 'nba',
    status: 'final',
    startTime: date,
    teams: {
      away: { slug: awaySlug, abbrev: awayAbbrev, score: awayScore, name: awayAbbrev },
      home: { slug: homeSlug, abbrev: homeAbbrev, score: homeScore, name: homeAbbrev },
    },
    gameState: { isLive: false, isFinal: true },
  };
}

function mkUpcoming({ id, awaySlug, awayAbbrev, homeSlug, homeAbbrev, date }) {
  return {
    gameId: id,
    sport: 'nba',
    status: 'upcoming',
    startTime: date,
    teams: {
      away: { slug: awaySlug, abbrev: awayAbbrev, score: null, name: awayAbbrev },
      home: { slug: homeSlug, abbrev: homeAbbrev, score: null, name: homeAbbrev },
    },
    gameState: { isLive: false, isFinal: false },
  };
}

/**
 * Synthetic R1 series state: BOS leads 2-1, LAL leads HOU 2-1, NYK tied 1-1
 * with ATL (upset watch — NYK is 3-seed, ATL is 6-seed so NYK tied = no upset).
 * To create an upset we need lower seed leading: ATL(6) over NYK(3) at 2-1.
 *
 * We simulate: ATL 2, NYK 1 → ATL (6-seed) leading NYK (3-seed) = upset watch.
 */
const playoffFinals = [
  // NYK vs ATL (3 vs 6) — ATL 2-1 upset
  mkFinal({ id: 'g-nyk-atl-1', awaySlug: 'atl', awayAbbrev: 'ATL', awayScore: 110, homeSlug: 'nyk', homeAbbrev: 'NYK', homeScore: 105, date: '2026-04-19T23:00:00Z' }),
  mkFinal({ id: 'g-nyk-atl-2', awaySlug: 'atl', awayAbbrev: 'ATL', awayScore: 98,  homeSlug: 'nyk', homeAbbrev: 'NYK', homeScore: 112, date: '2026-04-21T23:00:00Z' }),
  mkFinal({ id: 'g-nyk-atl-3', awaySlug: 'nyk', awayAbbrev: 'NYK', awayScore: 100, homeSlug: 'atl', homeAbbrev: 'ATL', homeScore: 115, date: '2026-04-23T23:00:00Z' }),

  // LAL vs HOU (4 vs 5) — LAL 2-1 lead
  mkFinal({ id: 'g-lal-hou-1', awaySlug: 'lal', awayAbbrev: 'LAL', awayScore: 120, homeSlug: 'hou', homeAbbrev: 'HOU', homeScore: 108, date: '2026-04-18T02:00:00Z' }),
  mkFinal({ id: 'g-lal-hou-2', awaySlug: 'lal', awayAbbrev: 'LAL', awayScore: 95,  homeSlug: 'hou', homeAbbrev: 'HOU', homeScore: 112, date: '2026-04-20T02:00:00Z' }),
  // Today's game: LAL home win, putting them up 2-1
  mkFinal({ id: 'g-lal-hou-3', awaySlug: 'hou', awayAbbrev: 'HOU', awayScore: 102, homeSlug: 'lal', homeAbbrev: 'LAL', homeScore: 115, date: '2026-04-21T03:00:00Z' }),

  // BOS vs Play-In (2 vs 7) — BOS 2-1
  mkFinal({ id: 'g-bos-mia-1', awaySlug: 'mia', awayAbbrev: 'MIA', awayScore: 92,  homeSlug: 'bos', homeAbbrev: 'BOS', homeScore: 108, date: '2026-04-19T18:00:00Z' }),
  mkFinal({ id: 'g-bos-mia-2', awaySlug: 'mia', awayAbbrev: 'MIA', awayScore: 98,  homeSlug: 'bos', homeAbbrev: 'BOS', homeScore: 104, date: '2026-04-21T18:00:00Z' }),
];

// Upcoming games tonight
const playoffUpcoming = [
  mkUpcoming({ id: 'u-den-min-2', awaySlug: 'min', awayAbbrev: 'MIN', homeSlug: 'den', homeAbbrev: 'DEN', date: '2026-04-22T03:00:00Z' }),
  mkUpcoming({ id: 'u-cle-tor-2', awaySlug: 'tor', awayAbbrev: 'TOR', homeSlug: 'cle', homeAbbrev: 'CLE', date: '2026-04-22T23:30:00Z' }),
];

const liveGames = [...playoffFinals, ...playoffUpcoming];

// Synthetic picks board (shape matches buildNbaPicksV2 output)
const synthPicks = {
  sport: 'nba',
  categories: {
    pickEms: [
      {
        id: 'p1',
        matchup: { awayTeam: { slug: 'min', shortName: 'MIN', name: 'Timberwolves' }, homeTeam: { slug: 'den', shortName: 'DEN', name: 'Nuggets' } },
        pick: { label: 'DEN ML', side: 'home' },
        confidence: 'high', tier: 'tier1',
        confidenceScore: 0.78, betScore: { total: 0.78 },
      },
    ],
    ats: [
      {
        id: 'p2',
        matchup: { awayTeam: { slug: 'tor', shortName: 'TOR', name: 'Raptors' }, homeTeam: { slug: 'cle', shortName: 'CLE', name: 'Cavaliers' } },
        pick: { label: 'CLE -7.5', side: 'home' },
        confidence: 'medium', tier: 'tier2',
        confidenceScore: 0.62, betScore: { total: 0.62 },
      },
    ],
    leans: [],
    totals: [
      {
        id: 'p3',
        matchup: { awayTeam: { slug: 'min', shortName: 'MIN', name: 'Timberwolves' }, homeTeam: { slug: 'den', shortName: 'DEN', name: 'Nuggets' } },
        pick: { label: 'OVER 218.5' },
        confidence: 'medium', tier: 'tier2',
        confidenceScore: 0.55, betScore: { total: 0.55 },
      },
    ],
  },
};

const synthLeaders = {
  categories: {
    avgPoints:   { label: 'Points Per Game',   abbrev: 'PPG', leaders: [
      { name: 'Luka Doncic',   teamAbbrev: 'DAL', value: 32.1, display: '32.1' },
      { name: 'Shai Gilgeous-Alexander', teamAbbrev: 'OKC', value: 31.4, display: '31.4' },
      { name: 'Giannis Antetokounmpo', teamAbbrev: 'MIL', value: 30.2, display: '30.2' },
    ]},
    avgAssists:  { label: 'Assists Per Game',  abbrev: 'APG', leaders: [
      { name: 'Trae Young',    teamAbbrev: 'ATL', value: 11.0, display: '11.0' },
      { name: 'Tyrese Haliburton', teamAbbrev: 'IND', value: 10.4, display: '10.4' },
      { name: 'Nikola Jokic',  teamAbbrev: 'DEN', value: 9.8,  display: '9.8'  },
    ]},
    avgRebounds: { label: 'Rebounds Per Game', abbrev: 'RPG', leaders: [
      { name: 'Domantas Sabonis', teamAbbrev: 'SAC', value: 13.9, display: '13.9' },
      { name: 'Nikola Jokic',  teamAbbrev: 'DEN', value: 12.4, display: '12.4' },
      { name: 'Anthony Davis', teamAbbrev: 'LAL', value: 11.6, display: '11.6' },
    ]},
    avgSteals:   { label: 'Steals Per Game',   abbrev: 'SPG', leaders: [
      { name: "De'Aaron Fox",  teamAbbrev: 'SAS', value: 2.2, display: '2.2' },
      { name: 'Dyson Daniels', teamAbbrev: 'ATL', value: 2.1, display: '2.1' },
      { name: 'Jrue Holiday',  teamAbbrev: 'BOS', value: 1.9, display: '1.9' },
    ]},
    avgBlocks:   { label: 'Blocks Per Game',   abbrev: 'BPG', leaders: [
      { name: 'Victor Wembanyama', teamAbbrev: 'SAS', value: 3.8, display: '3.8' },
      { name: 'Anthony Davis', teamAbbrev: 'LAL', value: 2.4, display: '2.4' },
      { name: 'Chet Holmgren', teamAbbrev: 'OKC', value: 2.3, display: '2.3' },
    ]},
  },
};

const synthStandings = {
  bos: { wins: 55, losses: 26, record: '55-26', rank: 2, conference: 'Eastern', playoffSeed: 2 },
  lal: { wins: 52, losses: 29, record: '52-29', rank: 4, conference: 'Western', playoffSeed: 4 },
  hou: { wins: 52, losses: 30, record: '52-30', rank: 5, conference: 'Western', playoffSeed: 5 },
  nyk: { wins: 53, losses: 28, record: '53-28', rank: 3, conference: 'Eastern', playoffSeed: 3 },
  atl: { wins: 46, losses: 35, record: '46-35', rank: 6, conference: 'Eastern', playoffSeed: 6 },
  den: { wins: 53, losses: 28, record: '53-28', rank: 3, conference: 'Western', playoffSeed: 3 },
  min: { wins: 48, losses: 33, record: '48-33', rank: 6, conference: 'Western', playoffSeed: 6 },
  okc: { wins: 64, losses: 17, record: '64-17', rank: 1, conference: 'Western', playoffSeed: 1 },
  sas: { wins: 62, losses: 19, record: '62-19', rank: 2, conference: 'Western', playoffSeed: 2 },
  det: { wins: 59, losses: 22, record: '59-22', rank: 1, conference: 'Eastern', playoffSeed: 1 },
  cle: { wins: 51, losses: 30, record: '51-30', rank: 4, conference: 'Eastern', playoffSeed: 4 },
  tor: { wins: 49, losses: 33, record: '49-33', rank: 5, conference: 'Eastern', playoffSeed: 5 },
};

const synthChampOdds = {
  bos: { bestChanceAmerican: 350 },   // ~22% implied — favorite tier
  okc: { bestChanceAmerican: 280 },   // ~26% — favorite
  lal: { bestChanceAmerican: 900 },   // ~10% — contender
  den: { bestChanceAmerican: 1200 },  // ~7.7% — contender
  sas: { bestChanceAmerican: 500 },   // ~17% — favorite
  det: { bestChanceAmerican: 800 },   // ~11% — contender
  nyk: { bestChanceAmerican: 1500 },  // ~6.3% — contender
  cle: { bestChanceAmerican: 2000 },  // ~4.8% — upside
  hou: { bestChanceAmerican: 3500 },  // ~2.8% — upside
  min: { bestChanceAmerican: 4000 },  // ~2.4% — upside
  atl: { bestChanceAmerican: 12000 }, // ~0.8% — long shot
  tor: { bestChanceAmerican: 25000 }, // — long shot
};

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('NBA Daily Briefing — Phase 1 foundation', () => {
  it('buildNbaPlayoffContext derives round + series + upset correctly', () => {
    const ctx = buildNbaPlayoffContext({ liveGames });

    expect(ctx.round).toBe('Round 1');
    expect(ctx.roundNumber).toBe(1);
    expect(ctx.series.length).toBeGreaterThanOrEqual(2); // at least BOS/MIA and LAL/HOU and NYK/ATL

    const nykAtl = ctx.series.find(s =>
      (s.topTeam?.slug === 'nyk' && s.bottomTeam?.slug === 'atl') ||
      (s.topTeam?.slug === 'atl' && s.bottomTeam?.slug === 'nyk')
    );
    expect(nykAtl).toBeDefined();
    // ATL has 2 wins, NYK has 1 → ATL leads 2-1
    const atlIsTop = nykAtl.topTeam.slug === 'atl';
    const atlWins = atlIsTop ? nykAtl.seriesScore.top : nykAtl.seriesScore.bottom;
    const nykWins = atlIsTop ? nykAtl.seriesScore.bottom : nykAtl.seriesScore.top;
    expect(atlWins).toBe(2);
    expect(nykWins).toBe(1);
    expect(nykAtl.isUpset).toBe(true); // 6-seed leading 3-seed
    expect(ctx.upsetWatch.some(s => s.matchupId === nykAtl.matchupId)).toBe(true);
  });

  it('buildNbaDailyHeadline produces a playoff-framed hero + subhead', () => {
    const ctx = buildNbaPlayoffContext({ liveGames });
    const hl = buildNbaDailyHeadline({ liveGames, playoffContext: ctx });

    // eslint-disable-next-line no-console
    console.log('\n=== NBA HERO TITLE ===\n' + hl.heroTitle);
    // eslint-disable-next-line no-console
    console.log('=== NBA SLIDE 2 HEADLINE ===\n' + hl.mainHeadline);
    // eslint-disable-next-line no-console
    console.log('=== NBA SUBHEAD ===\n' + hl.subhead + '\n');

    expect(hl.heroTitle).toBeTruthy();
    expect(hl.heroTitle).toBe(hl.heroTitle.toUpperCase());
    // Must reference at least one team (no generic regular-season phrasing)
    expect(hl.heroTitle).toMatch(/(CELTICS|LAKERS|HEAT|ROCKETS|HAWKS|KNICKS|SWEEP|GAME 7|SERIES|UPSET|ROUND|ELIMIN|CLOSE|STEAL|TOP|EDGE|HANDLE|PLAYOFF|LEAD|TRAIL|TIED|BRINK|NEXT|STUN|ROAD|CONTINUES)/i);
    expect(hl.topStory).toBeTruthy();
    expect(hl.topStory.inSeries).toBe(true);
  });

  it('buildNbaHotPress produces playoff-specific bullets', () => {
    const ctx = buildNbaPlayoffContext({ liveGames });
    const bullets = buildNbaHotPress({ liveGames, playoffContext: ctx });

    // eslint-disable-next-line no-console
    console.log('=== NBA HOT PRESS BULLETS ===');
    bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b.text}`));
    // eslint-disable-next-line no-console
    console.log('');

    expect(bullets.length).toBeGreaterThanOrEqual(3);
    // Every bullet must include series context or team result
    for (const b of bullets) {
      expect(b.text).toBeTruthy();
      // No generic regular-season phrases
      expect(b.text.toLowerCase()).not.toMatch(/division race|pennant|season heats up|regular season/);
    }
  });

  it('normalizeNbaImagePayload assembles canonical payload shape', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: liveGames,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });

    // Canonical keys present
    const expectedKeys = ['nbaPicks', 'canonicalPicks', 'nbaLeaders', 'nbaStandings', 'nbaChampOdds', 'nbaGames', 'nbaLiveGames', 'nbaNews', 'nbaPlayoffContext', 'nbaBriefing'];
    for (const k of expectedKeys) expect(payload).toHaveProperty(k);

    expect(payload.section).toBe('daily-briefing');
    expect(payload.workspace).toBe('nba');
    expect(payload.sport).toBe('nba');
    expect(payload.heroTitle).toBeTruthy();
    expect(Array.isArray(payload.bullets)).toBe(true);
    expect(payload.bullets.length).toBeGreaterThanOrEqual(3);

    // Playoff outlook: top 5 East + top 5 West
    expect(payload.playoffOutlook).toBeDefined();
    expect(payload.playoffOutlook.east.length).toBe(5);
    expect(payload.playoffOutlook.west.length).toBe(5);

    // Every outlook card has a non-generic rationale
    for (const card of [...payload.playoffOutlook.east, ...payload.playoffOutlook.west]) {
      expect(card.rationale).toBeTruthy();
      // Must reference the team's abbreviation
      expect(card.rationale).toContain(card.abbrev);
      // No generic phrases
      expect(card.rationale.toLowerCase()).not.toMatch(/strong offense leads the way|strong defense leads the way/);
    }

    // eslint-disable-next-line no-console
    console.log('=== NBA PLAYOFF OUTLOOK (East Top 3) ===');
    payload.playoffOutlook.east.slice(0, 3).forEach(c => {
      console.log(`  ${c.abbrev} (${c.label}, ${c.odds}) — ${c.rationale}`);
    });
    // eslint-disable-next-line no-console
    console.log('=== NBA PLAYOFF OUTLOOK (West Top 3) ===');
    payload.playoffOutlook.west.slice(0, 3).forEach(c => {
      console.log(`  ${c.abbrev} (${c.label}, ${c.odds}) — ${c.rationale}`);
    });
    // eslint-disable-next-line no-console
    console.log('');
  });

  it('buildNbaCaption produces a valid playoff-framed caption', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: liveGames,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });

    const { shortCaption, hashtags } = buildNbaCaption(payload);

    // eslint-disable-next-line no-console
    console.log('=== NBA CAPTION (first 400 chars) ===');
    console.log(shortCaption.slice(0, 400));
    // eslint-disable-next-line no-console
    console.log('...\n(total length: ' + shortCaption.length + ' chars, ' + hashtags.length + ' hashtags)');
    // eslint-disable-next-line no-console
    console.log('Hashtags: ' + hashtags.join(' ') + '\n');

    // Length + structure
    expect(shortCaption.length).toBeGreaterThan(80);
    expect(hashtags.length).toBe(5);
    expect(hashtags[0]).toBe('#NBA');
    expect(hashtags).toContain('#NBAPlayoffs');

    // All required sections present
    expect(shortCaption).toMatch(/🏀 Your Daily NBA Playoff Briefing is here/);
    expect(shortCaption).toMatch(/🔥/);
    expect(shortCaption).toMatch(/📊 What happened:/);
    expect(shortCaption).toMatch(/📈 Why it matters:/);
    expect(shortCaption).toMatch(/🎯 Maximus's Picks:/);
    expect(shortCaption).toMatch(/🏆 Season Leaders:/);
    expect(shortCaption).toMatch(/Points Per Game/);
    expect(shortCaption).toMatch(/Assists Per Game/);
    expect(shortCaption).toMatch(/For entertainment only/);
    expect(shortCaption).toMatch(/maximussports\.ai/);

    // No generic regular-season language
    expect(shortCaption.toLowerCase()).not.toMatch(/division race|pennant|strong offense leads the way|regular season/);
  });

  it('buildNbaCaption THROWS on zero picks (hard validation)', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: { categories: {} },
      nbaLiveGames: liveGames,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    expect(() => buildNbaCaption(payload)).toThrow(/CAPTION_VALIDATION_FAILED/);
  });

  it('buildNbaCaption THROWS on zero leaders (hard validation)', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: liveGames,
      nbaLeaders: { categories: {} },
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    expect(() => buildNbaCaption(payload)).toThrow(/CAPTION_VALIDATION_FAILED/);
  });

  it('buildNbaCaption emits marked no-slate caption when slate is truly empty', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: { categories: { pickEms: [], ats: [], leans: [], totals: [] } },
      nbaLiveGames: [], // zero games
      nbaLeaders: synthLeaders,
      nbaStandings: {},
      nbaChampOdds: {},
      // Pass an empty playoff context to simulate offseason / true empty
      nbaPlayoffContext: { round: 'Round 1', roundNumber: 1, series: [], eliminationGames: [], upsetWatch: [], sweepWatch: [] },
    });
    const result = buildNbaCaption(payload);
    expect(result._noSlate).toBe(true);
    expect(result._reason).toBe(NO_SLATE_REASON);
    expect(result.shortCaption.length).toBeGreaterThan(80);
    expect(result.shortCaption).toMatch(/No games on today's slate/);
    expect(result.shortCaption).toMatch(/For entertainment only/);
  });

  it('findSeriesForGame correctly anchors a game to its series', () => {
    const ctx = buildNbaPlayoffContext({ liveGames });
    const g = liveGames.find(g => g.gameId === 'g-lal-hou-3');
    const match = findSeriesForGame(g, ctx);
    expect(match).toBeTruthy();
    expect(match.series.matchupId).toBeTruthy();
    const slugs = [match.series.topTeam?.slug, match.series.bottomTeam?.slug];
    expect(slugs).toContain('lal');
    expect(slugs).toContain('hou');
  });
});
