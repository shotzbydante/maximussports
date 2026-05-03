/**
 * Locks the narrative-beat contract for Slide 1 hero, Slide 2 headline,
 * and HOTP/caption shared vocabulary:
 *   - 3-1 series comeback → "complete 3-1 comeback to stun"
 *   - Game 7 forced (3-3 after trailing team wins) → "force Game 7"
 *   - Closeout failed → "stave off elimination"
 *   - Elimination avoided → "avoid elimination"
 *   - OT clincher → "in OT"
 *   - Buzzer-beater → "last-second"
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';
import { buildNbaDailyHeadline } from './buildNbaDailyHeadline.js';
import { buildNbaHotPress } from './buildNbaHotPress.js';

function mkFinal({ awaySlug, awayScore, homeSlug, homeScore, hoursAgo = 24, narrative = null }) {
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
    narrative,
  };
}

describe('Narrative beats — 3-1 comeback', () => {
  it('hero headline detects 3-1 comeback and uses "complete 3-1 comeback"', () => {
    // PHI down 1-3, wins games 5-6-7 to take series 4-3 over BOS in r1-east-3
    const games = [
      // Game 1: BOS wins
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 312 }),
      // Game 2: BOS wins (BOS leads 2-0)
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      // Game 3: PHI wins (BOS leads 2-1)
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 105, hoursAgo: 216 }),
      // Game 4: BOS wins (BOS leads 3-1)
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 100, hoursAgo: 168 }),
      // Game 5: PHI wins (BOS leads 3-2)
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 95,  hoursAgo: 120 }),
      // Game 6: PHI wins (series tied 3-3)
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 108, hoursAgo: 72 }),
      // Game 7: PHI wins (PHI takes series 4-3)
      mkFinal({ awaySlug: 'tor', awayScore: 109, homeSlug: 'cle', homeScore: 100, hoursAgo: 8 }),
    ];

    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext });

    expect(hl.heroTitle).toContain('3-1 COMEBACK');
    expect(hl.heroTitle.toUpperCase()).toContain('STUN');
    expect(hl.mainHeadline.toLowerCase()).toContain('3-1 comeback');
    // Top story should carry the new flag
    expect(hl.topStory?.isComebackFrom31).toBe(true);
  });

  it('HOTP includes "complete the 3-1 comeback" in the lead bullet', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 100, hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 95,  hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 109, homeSlug: 'cle', homeScore: 100, hoursAgo: 8 }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext });
    const lead = bullets[0]?.text || '';
    expect(lead.toLowerCase()).toMatch(/3-1 comeback|complete the 3-1/);
  });
});

describe('Narrative beats — forces Game 7', () => {
  it('hero detects 3-3 series tie via trailing team and uses "FORCE GAME 7"', () => {
    // CLE up 3-2, TOR wins Game 6 to force Game 7
    const games = [
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 95,  hoursAgo: 312 }),
      mkFinal({ awaySlug: 'cle', awayScore: 105, homeSlug: 'tor', homeScore: 100, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'tor', awayScore: 110, homeSlug: 'cle', homeScore: 100, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 102, homeSlug: 'tor', homeScore: 95,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 90,  hoursAgo: 120 }),
      // Game 6: TOR wins to force Game 7
      mkFinal({ awaySlug: 'tor', awayScore: 108, homeSlug: 'cle', homeScore: 100, hoursAgo: 8 }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext });
    expect(hl.heroTitle.toUpperCase()).toContain('FORCE GAME 7');
    expect(hl.topStory?.forcesGame7).toBe(true);
  });
});

describe('Narrative beats — OT + buzzer-beater', () => {
  it('hero clincher in OT uses "IN OT"', () => {
    const otNarrative = { isOvertime: true, overtimeCount: 1, notesText: '' };
    // CLE wins 4-2 in OT in Game 6 over TOR
    const games = [
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 95,  hoursAgo: 312 }),
      mkFinal({ awaySlug: 'cle', awayScore: 105, homeSlug: 'tor', homeScore: 100, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'tor', awayScore: 110, homeSlug: 'cle', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 102, homeSlug: 'tor', homeScore: 95,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 90,  hoursAgo: 120 }),
      // Clinching game in OT
      mkFinal({ awaySlug: 'cle', awayScore: 112, homeSlug: 'tor', homeScore: 110, hoursAgo: 8, narrative: otNarrative }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext });
    expect(hl.heroTitle.toUpperCase()).toContain('IN OT');
    expect(hl.topStory?.isClinch).toBe(true);
  });

  it('buzzer-beater clincher uses "LAST-SECOND"', () => {
    const buzzerNarrative = { isOvertime: false, notesText: 'last-second buzzer-beater walk-off' };
    const games = [
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 95,  hoursAgo: 312 }),
      mkFinal({ awaySlug: 'cle', awayScore: 105, homeSlug: 'tor', homeScore: 100, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'tor', awayScore: 110, homeSlug: 'cle', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 102, homeSlug: 'tor', homeScore: 95,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 90,  hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 112, homeSlug: 'tor', homeScore: 110, hoursAgo: 8, narrative: buzzerNarrative }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const hl = buildNbaDailyHeadline({ liveGames: games, playoffContext });
    expect(hl.heroTitle.toUpperCase()).toContain('LAST-SECOND');
  });
});

describe('Narrative beats — Slide 3 top-4 cap', () => {
  it('Slide 3 east/west each capped to 4 active teams ranked by odds', async () => {
    const { buildPlayoffOutlook } = await import('./normalizeNbaImagePayload.js');
    // Build a context where many teams are alive (simulate empty bracket
    // → bracketFallback) — real-world top-4 selection happens against
    // the championship-odds map.
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: [] });
    const champOdds = {
      bos: { american: -200 }, // best East
      nyk: { american: 200 },
      det: { american: 600 },
      cle: { american: 1500 },
      tor: { american: 4000 },
      atl: { american: 8000 },
      okc: { american: -150 }, // best West
      sas: { american: 250 },
      lal: { american: 1200 },
      min: { american: 5000 },
      hou: { american: 9000 },
      den: { american: 12000 },
    };
    const outlook = buildPlayoffOutlook({
      champOdds,
      standings: {},
      playoffContext,
      rawGames: [],
    });

    expect(outlook.east.length).toBeLessThanOrEqual(4);
    expect(outlook.west.length).toBeLessThanOrEqual(4);
    // Top East should be BOS, top West should be OKC (best implied prob)
    expect(outlook.east[0].abbrev).toBe('BOS');
    expect(outlook.west[0].abbrev).toBe('OKC');
    // eastFull / westFull still expose the complete list for caption use
    expect(outlook.eastFull.length).toBeGreaterThanOrEqual(outlook.east.length);
    expect(outlook.westFull.length).toBeGreaterThanOrEqual(outlook.west.length);
  });
});
