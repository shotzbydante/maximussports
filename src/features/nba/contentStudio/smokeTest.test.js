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

// Audit Part 1: postseason leaders are TOTALS now (PTS/AST/REB/STL/BLK).
// Synthetic numbers reflect a partial Round 1 sample (5-6 games each).
const synthLeaders = {
  seasonType: 'postseason',
  statType: 'totals',
  categories: {
    pts: { label: 'Points',   abbrev: 'PTS', leaders: [
      { name: 'Anthony Edwards',       teamAbbrev: 'MIN', value: 156, display: '156', gamesPlayed: 5 },
      { name: 'Shai Gilgeous-Alexander', teamAbbrev: 'OKC', value: 142, display: '142', gamesPlayed: 5 },
      { name: 'Jayson Tatum',          teamAbbrev: 'BOS', value: 138, display: '138', gamesPlayed: 5 },
    ]},
    ast: { label: 'Assists',  abbrev: 'AST', leaders: [
      { name: 'Tyrese Haliburton',     teamAbbrev: 'IND', value: 54,  display: '54',  gamesPlayed: 5 },
      { name: 'Trae Young',            teamAbbrev: 'ATL', value: 48,  display: '48',  gamesPlayed: 5 },
      { name: 'Nikola Jokic',          teamAbbrev: 'DEN', value: 42,  display: '42',  gamesPlayed: 5 },
    ]},
    reb: { label: 'Rebounds', abbrev: 'REB', leaders: [
      { name: 'Nikola Jokic',          teamAbbrev: 'DEN', value: 78,  display: '78',  gamesPlayed: 5 },
      { name: 'Domantas Sabonis',      teamAbbrev: 'SAC', value: 70,  display: '70',  gamesPlayed: 5 },
      { name: 'Anthony Davis',         teamAbbrev: 'LAL', value: 64,  display: '64',  gamesPlayed: 5 },
    ]},
    stl: { label: 'Steals',   abbrev: 'STL', leaders: [
      { name: 'OG Anunoby',            teamAbbrev: 'NYK', value: 12,  display: '12',  gamesPlayed: 5 },
      { name: 'Dyson Daniels',         teamAbbrev: 'ATL', value: 10,  display: '10',  gamesPlayed: 5 },
      { name: 'Jrue Holiday',          teamAbbrev: 'BOS', value: 9,   display: '9',   gamesPlayed: 5 },
    ]},
    blk: { label: 'Blocks',   abbrev: 'BLK', leaders: [
      { name: 'Victor Wembanyama',     teamAbbrev: 'SAS', value: 18,  display: '18',  gamesPlayed: 5 },
      { name: 'Anthony Davis',         teamAbbrev: 'LAL', value: 13,  display: '13',  gamesPlayed: 5 },
      { name: 'Chet Holmgren',         teamAbbrev: 'OKC', value: 11,  display: '11',  gamesPlayed: 5 },
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

    // Playoff outlook: ALL active teams per conference (no truncation).
    // Audit Part 4 + Part 6 explicitly removed the top-5 slice — Slide 3
    // uses compact mode when >5 active teams. Upper cap is conference
    // size (15 teams). This assertion just confirms we render at least
    // one card per conference and no team is silently dropped.
    expect(payload.playoffOutlook).toBeDefined();
    expect(payload.playoffOutlook.east.length).toBeGreaterThan(0);
    expect(payload.playoffOutlook.east.length).toBeLessThanOrEqual(15);
    expect(payload.playoffOutlook.west.length).toBeGreaterThan(0);
    expect(payload.playoffOutlook.west.length).toBeLessThanOrEqual(15);

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
    // Updated audit Part 2 ordering — playoff-aware tags lead, betting
    // hashtag included for IG reach during the postseason.
    expect(hashtags[0]).toBe('#NBAPlayoffs');
    expect(hashtags).toContain('#NBA');
    expect(hashtags).toContain('#NBAPicks');
    expect(hashtags).toContain('#SportsBetting');
    expect(hashtags).toContain('#MaximusSports');

    // All required sections present
    expect(shortCaption).toMatch(/🏀 Your Daily NBA Playoff Briefing is here/);
    expect(shortCaption).toMatch(/🔥/);
    expect(shortCaption).toMatch(/📊 What happened:/);
    expect(shortCaption).toMatch(/📈 Why it matters:/);
    expect(shortCaption).toMatch(/🎯 Maximus's Picks:/);
    // Updated label: "Postseason Leaders" (audit Part 2)
    expect(shortCaption).toMatch(/🏆 Postseason Leaders:/);
    // Postseason leaders block must include all 5 totals abbreviations
    // (audit Part 1: PTS/AST/REB/STL/BLK, not per-game averages).
    expect(shortCaption).toMatch(/PTS:/);
    expect(shortCaption).toMatch(/AST:/);
    expect(shortCaption).toMatch(/REB:/);
    expect(shortCaption).toMatch(/STL:/);
    expect(shortCaption).toMatch(/BLK:/);
    // Daily caption MUST NOT carry per-game averages.
    expect(shortCaption).not.toMatch(/PPG:|APG:|RPG:|SPG:|BPG:/);
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

  it('buildNbaCaption SOFT-handles zero leaders (renders updating placeholder, does not throw)', () => {
    // Audit Part 2 explicitly downgraded the leaders check from hard
    // throw to a soft inline placeholder — postseason leader feeds can
    // legitimately lag during early playoff days, and we'd rather ship
    // a caption with "Postseason leader feed updating" in the leaders
    // block than fail the entire publish path.
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: liveGames,
      nbaLeaders: { categories: {} },
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const result = buildNbaCaption(payload);
    expect(result.shortCaption).toMatch(/🏆 Postseason Leaders:/);
    expect(result.shortCaption).toMatch(/Postseason leader feed updating/);
    expect(result.shortCaption.length).toBeGreaterThan(80);
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

  it('Slide 3 playoffOutlook ranks active teams by best title odds with seed tiebreaker', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: liveGames,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const east = payload.playoffOutlook?.east || [];
    const west = payload.playoffOutlook?.west || [];

    // Probabilities should be monotonically non-increasing within each
    // conference (audit Part 5: best odds first)
    function nonIncreasing(list) {
      for (let i = 1; i < list.length; i++) {
        if ((list[i].prob ?? 0) > (list[i - 1].prob ?? 0)) return false;
      }
      return true;
    }
    expect(nonIncreasing(east)).toBe(true);
    expect(nonIncreasing(west)).toBe(true);
  });

  it('Slide 3 playoffOutlook excludes eliminated teams entirely (active-only)', () => {
    // Build a context where one series has completed in an upset (MIN
    // beats DEN 4-2). DEN should be entirely absent from the West
    // outlook — Slide 3 shows only teams still alive in the bracket.
    const completedFinals = [];
    for (let i = 0; i < 6; i++) {
      const minWins = [true, false, true, true, false, true][i];
      const date = new Date(Date.now() - (12 - i * 2) * 24 * 3600 * 1000).toISOString();
      completedFinals.push({
        gameId: `g-min-den-${i + 1}`,
        sport: 'nba',
        status: 'final',
        startTime: date,
        teams: {
          away: { slug: minWins ? 'min' : 'den', score: minWins ? 110 : 95 },
          home: { slug: minWins ? 'den' : 'min', score: minWins ? 100 : 105 },
        },
        gameState: { isFinal: true, isLive: false },
      });
    }
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: completedFinals,
      nbaWindowGames: completedFinals,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const westSlugs = (payload.playoffOutlook?.west || []).map(t => t.slug);
    expect(westSlugs).toContain('min');     // winner stays
    expect(westSlugs).not.toContain('den'); // loser excluded
    // No team in the outlook should carry isEliminated=true (we don't
    // surface eliminated teams on Slide 3 anymore).
    const anyElim = (payload.playoffOutlook?.east || [])
      .concat(payload.playoffOutlook?.west || [])
      .some(t => t.isEliminated || t.status === 'eliminated');
    expect(anyElim).toBe(false);
  });

  it('postseason leaders use canonical totals categories pts/ast/reb/stl/blk', () => {
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: liveGames,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const cats = payload.nbaLeaders?.categories || {};
    expect(Object.keys(cats).sort()).toEqual(['ast', 'blk', 'pts', 'reb', 'stl']);
    // Values are integer totals, not decimals
    const topPts = cats.pts?.leaders?.[0];
    expect(topPts).toBeTruthy();
    expect(Number.isInteger(topPts.value)).toBe(true);
    expect(topPts.display).toMatch(/^\d+$/);
  });

  it('Slide 3 active set includes teams whose bracket opponent is a play-in placeholder (game-data fallback)', () => {
    // Bracket says BOS vs tbd("Play-In Winner") → series isStalePlaceholder.
    // Real games show BOS sweeping PHI 4-0. Without the game-data
    // fallback, BOS is dropped from active. With the fallback, BOS
    // stays active and PHI is eliminated.
    const games = [1, 2, 3, 4].map((g, i) => ({
      gameId: `g-bos-phi-${g}`,
      sport: 'nba', status: 'final',
      startTime: new Date(Date.now() - (12 - i * 2) * 24 * 3600 * 1000).toISOString(),
      teams: {
        away: { slug: i % 2 === 0 ? 'phi' : 'bos', score: i % 2 === 0 ? 95 : 110 },
        home: { slug: i % 2 === 0 ? 'bos' : 'phi', score: i % 2 === 0 ? 110 : 95 },
      },
      gameState: { isFinal: true, isLive: false },
    }));
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: games,
      nbaWindowGames: games,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const eastSlugs = (payload.playoffOutlook?.east || []).map(t => t.slug);
    expect(eastSlugs).toContain('bos');     // active despite bracket placeholder
    expect(eastSlugs).not.toContain('phi'); // eliminated → excluded entirely
  });

  it('Slide 3 active set includes completed-series winners (cross-round)', () => {
    // Synthesize: NYK sweeps ATL 4-0 (r1-east-2 — both teams resolved
    // in the static bracket). After the sweep the active outlook MUST
    // still include NYK (winner advancing) and MUST exclude ATL.
    const games = [1, 2, 3, 4].map((g, i) => ({
      gameId: `g-nyk-atl-${g}`,
      sport: 'nba', status: 'final',
      startTime: new Date(Date.now() - (12 - i * 2) * 24 * 3600 * 1000).toISOString(),
      teams: {
        away: { slug: i % 2 === 0 ? 'atl' : 'nyk', score: i % 2 === 0 ? 95 : 110 },
        home: { slug: i % 2 === 0 ? 'nyk' : 'atl', score: i % 2 === 0 ? 110 : 95 },
      },
      gameState: { isFinal: true, isLive: false },
    }));
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: games,
      nbaWindowGames: games,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const eastSlugs = (payload.playoffOutlook?.east || []).map(t => t.slug);
    expect(eastSlugs).toContain('nyk');     // winner advances — stays active
    expect(eastSlugs).not.toContain('atl'); // loser excluded entirely
  });

  it('caption Watch Tonight section appears for closeout games', () => {
    // Build a series where Lakers lead Rockets 3-2 with Game 6 today.
    const now = Date.now();
    const games = [];
    for (let i = 1; i <= 5; i++) {
      const lalWins = [true, true, false, false, true][i - 1];
      games.push({
        gameId: `g-lal-hou-${i}`,
        sport: 'nba',
        status: 'final',
        startTime: new Date(now - (10 - i * 2) * 24 * 3600 * 1000).toISOString(),
        teams: {
          away: { slug: lalWins ? 'lal' : 'hou', score: lalWins ? 110 : 100 },
          home: { slug: lalWins ? 'hou' : 'lal', score: lalWins ? 105 : 95 },
        },
        gameState: { isFinal: true, isLive: false },
      });
    }
    // Game 6 scheduled "today" in PT — pin to noon PT so the test isn't
    // fragile when run late in the day (now + 4hr would roll past
    // midnight if run after 8pm PT and the upcoming game would no longer
    // count as a "today" game in the playoff context).
    const todayPtNoon = (() => {
      const pt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      // Build a Date at PT noon by anchoring to YYYY-MM-DDT19:00:00Z (noon PT in standard, 19:00 UTC in PDT).
      return new Date(`${pt}T20:00:00.000Z`).toISOString();
    })();
    games.push({
      gameId: 'g-lal-hou-6',
      sport: 'nba',
      status: 'upcoming',
      startTime: todayPtNoon,
      teams: {
        away: { slug: 'hou', score: null },
        home: { slug: 'lal', score: null },
      },
      gameState: { isFinal: false, isLive: false },
    });

    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: games,
      nbaWindowGames: games,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const { shortCaption } = buildNbaCaption(payload);
    // Audit Part 7 caption restructure: section was renamed
    // "Watch tonight" → "Watch next" so caption flow goes from
    // "where we stand" (Title Path) to "what's next" (Watch next).
    expect(shortCaption).toMatch(/👀 Watch next:/);
    // Some form of "Game 6" + elimination framing should appear
    expect(shortCaption).toMatch(/Game 6/);
    expect(shortCaption.toLowerCase()).toMatch(/elimination|win.{0,5}or.{0,5}go.{0,5}home|series tips|series swings|takes the series/);
  });

  it('hasValidLeaderCategories rejects empty / partial postseason payloads', async () => {
    const { hasValidLeaderCategories } = await import('../../../../api/_lib/nbaBoxScoreLeaders.js');
    expect(hasValidLeaderCategories(null)).toBe(false);
    expect(hasValidLeaderCategories({})).toBe(false);
    expect(hasValidLeaderCategories({ categories: {} })).toBe(false);
    // Partial — missing blk
    expect(hasValidLeaderCategories({
      categories: {
        pts: { leaders: [{ name: 'A' }] },
        ast: { leaders: [{ name: 'B' }] },
        reb: { leaders: [{ name: 'C' }] },
        stl: { leaders: [{ name: 'D' }] },
        blk: { leaders: [] },
      },
    })).toBe(false);
    // All five present
    expect(hasValidLeaderCategories({
      categories: {
        pts: { leaders: [{ name: 'A' }] },
        ast: { leaders: [{ name: 'B' }] },
        reb: { leaders: [{ name: 'C' }] },
        stl: { leaders: [{ name: 'D' }] },
        blk: { leaders: [{ name: 'E' }] },
      },
    })).toBe(true);
  });

  it('hasValidPostseasonTotalsPayload rejects payloads with non-playoff teams', async () => {
    const { hasValidPostseasonTotalsPayload } = await import('../../../../api/_lib/nbaBoxScoreLeaders.js');
    const validTeams = new Set(['lal', 'hou', 'bos', 'nyk', 'min']);

    // Reject when seasonType wrong
    expect(hasValidPostseasonTotalsPayload({
      seasonType: 'regular', statType: 'totals',
      categories: {
        pts: { leaders: [{ name: 'A', teamSlug: 'lal' }] },
        ast: { leaders: [{ name: 'B', teamSlug: 'hou' }] },
        reb: { leaders: [{ name: 'C', teamSlug: 'bos' }] },
        stl: { leaders: [{ name: 'D', teamSlug: 'nyk' }] },
        blk: { leaders: [{ name: 'E', teamSlug: 'min' }] },
      },
    }, validTeams)).toBe(false);

    // ACCEPT averages (PPG abbrev) — the spec was reverted to per-game
    // averages, so ESPN-style PPG/APG/RPG/SPG/BPG abbrevs are valid.
    expect(hasValidPostseasonTotalsPayload({
      seasonType: 'postseason', statType: 'averages',
      categories: {
        pts: { abbrev: 'PPG', leaders: [{ name: 'A', teamSlug: 'lal' }] },
        ast: { abbrev: 'APG', leaders: [{ name: 'B', teamSlug: 'hou' }] },
        reb: { abbrev: 'RPG', leaders: [{ name: 'C', teamSlug: 'bos' }] },
        stl: { abbrev: 'SPG', leaders: [{ name: 'D', teamSlug: 'nyk' }] },
        blk: { abbrev: 'BPG', leaders: [{ name: 'E', teamSlug: 'min' }] },
      },
    }, validTeams)).toBe(true);

    // Reject when ANY leader's team is not in the valid set
    expect(hasValidPostseasonTotalsPayload({
      seasonType: 'postseason', statType: 'totals',
      categories: {
        pts: { abbrev: 'PTS', leaders: [{ name: 'A', teamSlug: 'lal' }] },
        ast: { abbrev: 'AST', leaders: [{ name: 'B', teamSlug: 'nop' /* not playoff */ }] },
        reb: { abbrev: 'REB', leaders: [{ name: 'C', teamSlug: 'bos' }] },
        stl: { abbrev: 'STL', leaders: [{ name: 'D', teamSlug: 'nyk' }] },
        blk: { abbrev: 'BLK', leaders: [{ name: 'E', teamSlug: 'min' }] },
      },
    }, validTeams)).toBe(false);

    // Accept when all leaders are on valid playoff teams
    expect(hasValidPostseasonTotalsPayload({
      seasonType: 'postseason', statType: 'totals',
      categories: {
        pts: { abbrev: 'PTS', leaders: [{ name: 'A', teamSlug: 'lal' }] },
        ast: { abbrev: 'AST', leaders: [{ name: 'B', teamSlug: 'hou' }] },
        reb: { abbrev: 'REB', leaders: [{ name: 'C', teamSlug: 'bos' }] },
        stl: { abbrev: 'STL', leaders: [{ name: 'D', teamSlug: 'nyk' }] },
        blk: { abbrev: 'BLK', leaders: [{ name: 'E', teamSlug: 'min' }] },
      },
    }, validTeams)).toBe(true);
  });

  it('buildValidPlayoffTeamSlugs unions bracket teams + playoff-proper game teams', async () => {
    const { buildValidPlayoffTeamSlugs } = await import('../../../../api/_lib/nbaBoxScoreLeaders.js');
    const games = [
      { gameId: 'g-bos-phi-1', sport: 'nba', status: 'final',
        startTime: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        teams: { away: { slug: 'phi', score: 95 }, home: { slug: 'bos', score: 110 } },
        gameState: { isFinal: true } },
    ];
    const ctx = {
      allSeries: [
        { round: 1, isStalePlaceholder: false,
          topTeam: { slug: 'lal', isPlaceholder: false },
          bottomTeam: { slug: 'hou', isPlaceholder: false },
          winnerSlug: null, loserSlug: null },
      ],
    };
    const slugs = buildValidPlayoffTeamSlugs(ctx, games);
    expect(slugs.has('lal')).toBe(true);
    expect(slugs.has('hou')).toBe(true);
    expect(slugs.has('bos')).toBe(true); // from games
    expect(slugs.has('phi')).toBe(true); // from games
    expect(slugs.has('nop')).toBe(false); // never appeared
  });

  it('buildNbaGameNarrative surfaces overtime + comeback + last-second framing', async () => {
    const { buildNbaGameNarrative } = await import('./buildNbaHotPress.js');
    // Overtime
    const otStory = {
      winSlug: 'tor', loseSlug: 'cle', winSide: 'home',
      winScore: 112, loseScore: 110,
      narrative: { isOvertime: true, overtimeCount: 1, notesText: '' },
    };
    const otText = buildNbaGameNarrative(otStory);
    expect(otText).toBeTruthy();
    expect(otText).toMatch(/OT/);

    // Buzzer beater (notes signal) + OT
    const bzStory = {
      winSlug: 'tor', loseSlug: 'cle', winSide: 'home',
      winScore: 112, loseScore: 110,
      narrative: { isOvertime: true, overtimeCount: 1, notesText: 'last-second three forces game 7' },
    };
    const bzText = buildNbaGameNarrative(bzStory);
    expect(bzText).toMatch(/last-second|stun/i);

    // Comeback (15+ point deficit at half)
    const cbStory = {
      winSlug: 'det', loseSlug: 'orl', winSide: 'home',
      winScore: 93, loseScore: 79,
      narrative: {
        isOvertime: false,
        // Det (winner / home) is down 25-50 = -25 at half, then comes back
        homeLine: [10, 15, 30, 38],
        awayLine: [25, 25, 18, 11],
        notesText: '',
      },
    };
    const cbText = buildNbaGameNarrative(cbStory);
    expect(cbText).toBeTruthy();
    expect(cbText).toMatch(/comeback|deficit|rally/i);

    // Generic game with no special signals returns null
    const genericStory = {
      winSlug: 'lal', loseSlug: 'hou', winSide: 'home',
      winScore: 110, loseScore: 100,
      narrative: { isOvertime: false, homeLine: null, awayLine: null, notesText: '' },
    };
    expect(buildNbaGameNarrative(genericStory)).toBeNull();
  });

  it('isPlayInGame catches text variants (play-in / play in / tournament play-in)', async () => {
    const { isPlayInGame } = await import('../../../../api/_lib/nbaBoxScoreLeaders.js');
    expect(isPlayInGame({ competitions: [{ notes: [{ headline: 'Play-In Tournament' }] }] })).toBe(true);
    expect(isPlayInGame({ competitions: [{ notes: [{ headline: 'play in tournament' }] }] })).toBe(true);
    expect(isPlayInGame({ season: { displayName: 'NBA Play-In Tournament' } })).toBe(true);
    expect(isPlayInGame({ competitions: [{ notes: [{ headline: 'Round 1 Game 4' }] }] })).toBe(false);
    expect(isPlayInGame({})).toBe(false);
  });

  it('hasValidPostseasonTotalsPayload is fail-closed when team set is missing', async () => {
    const { hasValidPostseasonTotalsPayload } = await import('../../../../api/_lib/nbaBoxScoreLeaders.js');
    const goodPayload = {
      seasonType: 'postseason', statType: 'totals',
      categories: {
        pts: { abbrev: 'PTS', leaders: [{ name: 'A', teamSlug: 'lal' }] },
        ast: { abbrev: 'AST', leaders: [{ name: 'B', teamSlug: 'hou' }] },
        reb: { abbrev: 'REB', leaders: [{ name: 'C', teamSlug: 'bos' }] },
        stl: { abbrev: 'STL', leaders: [{ name: 'D', teamSlug: 'nyk' }] },
        blk: { abbrev: 'BLK', leaders: [{ name: 'E', teamSlug: 'min' }] },
      },
    };
    // No team set → reject (fail-closed)
    expect(hasValidPostseasonTotalsPayload(goodPayload, null)).toBe(false);
    expect(hasValidPostseasonTotalsPayload(goodPayload, new Set())).toBe(false);
    // Explicit allowMissingTeamSet escape hatch
    expect(hasValidPostseasonTotalsPayload(goodPayload, null, { allowMissingTeamSet: true })).toBe(true);
    // Non-empty team set → validates teams
    const playoffSet = new Set(['lal', 'hou', 'bos', 'nyk', 'min']);
    expect(hasValidPostseasonTotalsPayload(goodPayload, playoffSet)).toBe(true);
  });

  it('normalizer sanitizePostseasonLeaders drops non-playoff team leaders', () => {
    // Build a fixture where the playoff context has BOS/PHI active,
    // but the leaders payload includes a NOP star (non-playoff team).
    // The sanitizer should drop NOP and keep BOS/PHI.
    const leaders = {
      seasonType: 'postseason', statType: 'totals', _source: 'fresh',
      categories: {
        pts: { abbrev: 'PTS', leaders: [
          { name: 'Zion Williamson', teamAbbrev: 'NOP', teamSlug: 'nop', value: 200, display: '200' },
          { name: 'Jayson Tatum',    teamAbbrev: 'BOS', teamSlug: 'bos', value: 156, display: '156' },
        ]},
        ast: { abbrev: 'AST', leaders: [
          { name: 'Tyrese Maxey',    teamAbbrev: 'PHI', teamSlug: 'phi', value: 50, display: '50' },
        ]},
        reb: { abbrev: 'REB', leaders: [{ name: 'C',  teamAbbrev: 'BOS', teamSlug: 'bos', value: 70, display: '70' }] },
        stl: { abbrev: 'STL', leaders: [{ name: 'D',  teamAbbrev: 'PHI', teamSlug: 'phi', value: 12, display: '12' }] },
        blk: { abbrev: 'BLK', leaders: [{ name: 'E',  teamAbbrev: 'BOS', teamSlug: 'bos', value: 18, display: '18' }] },
      },
    };
    // Build a window where BOS/PHI played 4 games (BOS sweep)
    const games = [1, 2, 3, 4].map((g, i) => ({
      gameId: `g-bos-phi-${g}`,
      sport: 'nba', status: 'final',
      startTime: new Date(Date.now() - (12 - i * 2) * 24 * 3600 * 1000).toISOString(),
      teams: {
        away: { slug: i % 2 === 0 ? 'phi' : 'bos', score: i % 2 === 0 ? 95 : 110 },
        home: { slug: i % 2 === 0 ? 'bos' : 'phi', score: i % 2 === 0 ? 110 : 95 },
      },
      gameState: { isFinal: true, isLive: false },
    }));
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: games,
      nbaWindowGames: games,
      nbaLeaders: leaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const ptsLeaders = payload.nbaLeaders?.categories?.pts?.leaders || [];
    const ptsTeams = ptsLeaders.map(l => l.teamSlug);
    expect(ptsTeams).not.toContain('nop'); // dropped — non-playoff team
    expect(ptsTeams).toContain('bos');     // kept
    expect(payload.nbaLeaders?._sanitizedAtNormalizer).toBe(true);
  });

  it('buildValidPlayoffTeamSlugs includes ALL named teams from bracket, even from stale-placeholder series', async () => {
    const { buildValidPlayoffTeamSlugs } = await import('../../../../api/_lib/nbaBoxScoreLeaders.js');
    const playoffContext = {
      allSeries: [
        // Stale-placeholder series (BOS vs Play-In Winner) — BOS must
        // still appear in the team set even though their bracket
        // opponent isn't resolved yet.
        {
          isStalePlaceholder: true,
          topTeam:    { slug: 'bos', isPlaceholder: false },
          bottomTeam: { slug: 'tbd-7', isPlaceholder: true },
        },
        // Fully-resolved active series.
        {
          isStalePlaceholder: false,
          topTeam:    { slug: 'nyk', isPlaceholder: false },
          bottomTeam: { slug: 'atl', isPlaceholder: false },
        },
      ],
    };
    const slugs = buildValidPlayoffTeamSlugs(playoffContext, []);
    expect(slugs.has('bos')).toBe(true);   // bracket-named, even if series stale
    expect(slugs.has('nyk')).toBe(true);
    expect(slugs.has('atl')).toBe(true);
    expect(slugs.has('tbd-7')).toBe(false); // placeholder slot ignored
  });

  it('Slide 3 active set excludes play-in pairs (PHI vs MIA never makes activeSlugs)', () => {
    // Build playoff context with ONE bracket series (BOS vs PlayIn placeholder
    // = stale) plus a play-in matchup (PHI vs MIA, MIA wins).
    // The bracket-anchored team set will include BOS but not PHI or MIA.
    // deriveActiveFromGames must NOT add PHI or MIA to active because
    // neither is bracket-anchored.
    const games = [
      // Play-in game between two non-bracket teams — should be ignored.
      {
        gameId: 'g-phi-mia-playin',
        sport: 'nba', status: 'final',
        startTime: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
        teams: {
          away: { slug: 'phi', score: 110 },
          home: { slug: 'mia', score: 95 },
        },
        gameState: { isFinal: true, isLive: false },
      },
      // Real Round-1 series: NYK sweeps ATL — both bracket-anchored.
      ...[1, 2, 3, 4].map((g, i) => ({
        gameId: `g-nyk-atl-r1-${g}`,
        sport: 'nba', status: 'final',
        startTime: new Date(Date.now() - (10 - i * 2) * 24 * 3600 * 1000).toISOString(),
        teams: {
          away: { slug: i % 2 === 0 ? 'atl' : 'nyk', score: i % 2 === 0 ? 95 : 110 },
          home: { slug: i % 2 === 0 ? 'nyk' : 'atl', score: i % 2 === 0 ? 110 : 95 },
        },
        gameState: { isFinal: true, isLive: false },
      })),
    ];
    const payload = normalizeNbaImagePayload({
      activeSection: 'nba-daily',
      nbaPicks: synthPicks,
      nbaLiveGames: games,
      nbaWindowGames: games,
      nbaLeaders: synthLeaders,
      nbaStandings: synthStandings,
      nbaChampOdds: synthChampOdds,
    });
    const east = payload.playoffOutlook?.east || [];
    const eastSlugs = east.map(t => t.slug);
    // PHI / MIA / CHA / GSW etc. (non-bracket / play-in losers) must
    // NEVER appear on Slide 3.
    expect(eastSlugs).not.toContain('phi');
    expect(eastSlugs).not.toContain('mia');
    expect(eastSlugs).not.toContain('cha');
    // NYK should be present (bracket-anchored, won R1).
    expect(eastSlugs).toContain('nyk');
    // ATL should NOT be present (eliminated).
    expect(eastSlugs).not.toContain('atl');
  });

  it('buildNbaGameNarrative handles forces-Game-7 + buzzer-beater + halftime comeback', async () => {
    const { buildNbaGameNarrative } = await import('./buildNbaHotPress.js');

    // Buzzer-beater in OT that forces Game 7
    const game7Force = {
      winSlug: 'tor', loseSlug: 'cle', winSide: 'home',
      winScore: 112, loseScore: 110,
      inSeries: true, winSeriesWins: 3, loseSeriesWins: 3,
      narrative: { isOvertime: true, overtimeCount: 1, notesText: 'last-second three at the buzzer' },
    };
    const g7Text = buildNbaGameNarrative(game7Force);
    expect(g7Text).toMatch(/Game 7/);
    expect(g7Text).toMatch(/last-second/);

    // Comeback from 25+ point halftime hole
    const historicComeback = {
      winSlug: 'det', loseSlug: 'orl', winSide: 'home',
      winScore: 93, loseScore: 79,
      narrative: {
        isOvertime: false,
        homeLine: [10, 15, 30, 38],   // det down 25-50 at half
        awayLine: [25, 25, 18, 11],
        notesText: '',
      },
    };
    const cbText = buildNbaGameNarrative(historicComeback);
    expect(cbText).toMatch(/biggest comebacks|biggest|massive/i);
    expect(cbText).toMatch(/halftime|down 25 at the half|deficit/i);

    // Forces Game 7 without OT or buzzer
    const forces = {
      winSlug: 'lal', loseSlug: 'hou', winSide: 'home',
      winScore: 110, loseScore: 100,
      inSeries: true, winSeriesWins: 3, loseSeriesWins: 3,
      narrative: { isOvertime: false, homeLine: null, awayLine: null, notesText: '' },
    };
    expect(buildNbaGameNarrative(forces)).toMatch(/force Game 7/i);
  });
});
