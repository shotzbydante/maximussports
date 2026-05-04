/**
 * Locks the editorial Team Intel caption contract.
 *
 * Audit Part 7 coverage:
 *   - Caption includes team name
 *   - Includes latest game result / series result
 *   - Includes next-round / next-game implication
 *   - Includes model outlook when available
 *   - Includes graceful fallback when model outlook unavailable
 *   - Includes key driver language (when leader data exists)
 *   - Includes title-path / odds angle
 *   - Includes CTA + disclaimer
 *   - Caption mirrors the canonical Team Intel payload (no separate
 *     filtering / sorting paths)
 *   - Concise + non-empty
 *   - Does NOT use "first round in motion" copy for completed series
 */

import { describe, it, expect } from 'vitest';
import { buildNbaTeamIntelCaption } from './buildNbaTeamIntelCaption.js';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';

function mkFinal({ awaySlug, awayScore, homeSlug, homeScore, hoursAgo = 24 }) {
  const startTime = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  return {
    gameId: `${awaySlug}-${homeSlug}-${startTime}`,
    sport: 'nba',
    status: 'final',
    startTime,
    teams: {
      away: { slug: awaySlug, abbrev: awaySlug.toUpperCase(), score: awayScore, name: awaySlug },
      home: { slug: homeSlug, abbrev: homeSlug.toUpperCase(), score: homeScore, name: homeSlug },
    },
    gameState: { isFinal: true, isLive: false },
  };
}

function buildClePayload({ withLeaders = true, withOdds = true, withPicks = false } = {}) {
  // CLE wins Round 1 4-3 over TOR. Path: 2-0 → 2-2 → 3-2 → 3-3 → 4-3.
  const games = [
    mkFinal({ awaySlug: 'tor', awayScore: 113, homeSlug: 'cle', homeScore: 126, hoursAgo: 312 }),
    mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
    mkFinal({ awaySlug: 'cle', awayScore: 104, homeSlug: 'tor', homeScore: 126, hoursAgo: 216 }),
    mkFinal({ awaySlug: 'cle', awayScore: 89,  homeSlug: 'tor', homeScore: 93,  hoursAgo: 168 }),
    mkFinal({ awaySlug: 'tor', awayScore: 120, homeSlug: 'cle', homeScore: 125, hoursAgo: 120 }),
    mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 112, hoursAgo: 72 }),
    mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 114, hoursAgo: 8 }),
  ];
  const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
  const payload = {
    section: 'team-intel',
    teamA: { slug: 'cle', name: 'Cleveland Cavaliers', abbrev: 'CLE' },
    conference: 'Eastern',
    nbaSelectedTeam: { slug: 'cle', name: 'Cleveland Cavaliers', abbrev: 'CLE', conference: 'Eastern' },
    nbaPlayoffContext: playoffContext,
    nbaWindowGames: games,
    nbaLiveGames: [],
    nbaStandings: { cle: { record: '52-30', playoffSeed: 4, streak: 'W1' } },
    nbaChampOdds: withOdds ? { cle: { bestChanceAmerican: 1900 } } : {},
    nbaLeaders: withLeaders ? {
      categories: {
        blk: {
          abbrev: 'BLK',
          leaders: [
            { name: 'Jarrett Allen', teamAbbrev: 'CLE', value: 2.2, display: '2.2', teamSlug: 'cle' },
          ],
        },
      },
    } : { categories: {} },
    nbaPicks: withPicks ? {
      categories: {
        ats: [{
          matchup: {
            awayTeam: { slug: 'cle', abbrev: 'CLE', shortName: 'CLE' },
            homeTeam: { slug: 'det', abbrev: 'DET', shortName: 'DET' },
          },
          pick: { side: 'away', label: 'CLE -4.5' },
          confidence: 'medium',
          betScore: { total: 80 },
        }],
      },
    } : { categories: {} },
  };
  return { payload, games };
}

describe('buildNbaTeamIntelCaption — Cleveland completed-series benchmark', () => {
  it('includes team name + nickname', () => {
    const { payload } = buildClePayload();
    const { caption } = buildNbaTeamIntelCaption(payload);
    // Hook references the team nickname.
    expect(caption.toLowerCase()).toMatch(/cavaliers|cle/);
  });

  it('includes the verified Game-7 score and the 4-3 series result', () => {
    const { payload } = buildClePayload();
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).toContain('114-102');
    expect(caption.toLowerCase()).toMatch(/4-3|4–3/);
  });

  it('includes next-round implication (East Semifinals)', () => {
    const { payload } = buildClePayload();
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption.toLowerCase()).toContain('east semifinals');
  });

  it('falls back to "no Maximus board posted yet" when no picks exist', () => {
    const { payload } = buildClePayload({ withPicks: false });
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption.toLowerCase()).toContain('no maximus board posted yet');
  });

  it('uses Model watch line when picks exist', () => {
    const { payload } = buildClePayload({ withPicks: true });
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).toContain('📈 Model watch:');
    expect(caption).toContain('ATS:');
  });

  it('includes Key Driver language anchored on a verified team leader', () => {
    const { payload } = buildClePayload({ withLeaders: true });
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).toContain('💪 Key driver:');
    expect(caption).toContain('Jarrett Allen');
    expect(caption).toContain('2.2');
  });

  it('omits Key Driver line when no team leader is in the leaders board', () => {
    const { payload } = buildClePayload({ withLeaders: false });
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).not.toContain('Key driver:');
  });

  it('includes Big Picture line with title odds + tier when odds exist', () => {
    const { payload } = buildClePayload({ withOdds: true });
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).toContain('🏆 Big picture:');
    expect(caption).toContain('+1900');
    expect(caption.toLowerCase()).toMatch(/upside team|long shot|contender|title favorite/);
  });

  it('omits Big Picture line when champ odds are missing', () => {
    const { payload } = buildClePayload({ withOdds: false });
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).not.toContain('Big picture:');
  });

  it('includes CTA + disclaimer + hashtags', () => {
    const { payload } = buildClePayload();
    const { caption, hashtags } = buildNbaTeamIntelCaption(payload);
    expect(caption.toLowerCase()).toContain('more playoff intel → maximussports.ai');
    expect(caption).toContain('21+');
    expect(hashtags).toContain('#NBA');
    expect(hashtags).toContain('#NBAPlayoffs');
    expect(hashtags).toContain('#MaximusSports');
    // Cap at 8.
    expect(hashtags.length).toBeLessThanOrEqual(8);
  });

  it('NEVER uses "first round in motion" for a completed series', () => {
    const { payload } = buildClePayload();
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption.toLowerCase()).not.toContain('in motion');
  });

  it('hook surfaces "survive Game 7" framing for path-verified Game-7 win that was NOT down 3-1', () => {
    const { payload } = buildClePayload();
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption).toMatch(/survive Game 7|outlast|close out/);
  });

  it('returns a non-empty caption with at least 5 sections', () => {
    const { payload } = buildClePayload();
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption.trim().length).toBeGreaterThan(200);
    // 6+ blank-line separated sections (hook, what, why, model,
    // driver, big picture, CTA, disclaimer).
    const sections = caption.split(/\n\s*\n/).filter(Boolean);
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });
});

describe('buildNbaTeamIntelCaption — graceful fallbacks', () => {
  it('renders a minimal caption when no team is selected', () => {
    const { caption } = buildNbaTeamIntelCaption({ section: 'team-intel' });
    expect(caption.toLowerCase()).toContain('select an nba team');
  });

  it('renders without throwing when payload has no playoff context', () => {
    const team = { slug: 'lal', name: 'Los Angeles Lakers', abbrev: 'LAL', conference: 'Western' };
    expect(() => buildNbaTeamIntelCaption({
      section: 'team-intel',
      teamA: team,
      nbaSelectedTeam: team,
      conference: 'Western',
    })).not.toThrow();
  });
});

describe('buildNbaTeamIntelCaption — true 3-1 comeback hook', () => {
  it('hook says "complete the 3-1 comeback" when path-verified', () => {
    // CLE goes down 1-3 (TOR led 3-1 after G4) then wins G5/G6/G7.
    const games = [
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'tor', awayScore: 110, homeSlug: 'cle', homeScore: 100, hoursAgo: 168 }),
      mkFinal({ awaySlug: 'cle', awayScore: 102, homeSlug: 'tor', homeScore: 95,  hoursAgo: 120 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'cle', awayScore: 109, homeSlug: 'tor', homeScore: 100, hoursAgo: 8 }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const team = { slug: 'cle', name: 'Cleveland Cavaliers', abbrev: 'CLE', conference: 'Eastern' };
    const payload = {
      section: 'team-intel',
      teamA: team,
      nbaSelectedTeam: team,
      conference: 'Eastern',
      nbaPlayoffContext: playoffContext,
      nbaWindowGames: games,
      nbaStandings: { cle: { record: '52-30', playoffSeed: 4 } },
      nbaChampOdds: { cle: { bestChanceAmerican: 1900 } },
      nbaLeaders: { categories: {} },
      nbaPicks: { categories: {} },
    };
    const { caption } = buildNbaTeamIntelCaption(payload);
    expect(caption.toLowerCase()).toContain('3-1 comeback');
  });
});
