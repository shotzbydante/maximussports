/**
 * Locks the data-correctness contract for Slide 3 (Playoff Outlook):
 *   - Active set = (non-stale bracket series) ∪ (game-derived pairs)
 *   - Eliminated set wins ties (a team that lost a series cannot be active)
 *   - Round-1 winners awaiting next-round opponents stay active
 *   - Play-in only teams (PHI, MIA, ORL, IND, etc. before play-in resolves)
 *     are excluded — they're not in bracketTeamSlugs and their game pairs
 *     are skipped by the bracket-team gate
 *   - Bracket-fallback engages when bracket+games produce no signal, so
 *     Slide 3 never silently dumps all 30 teams via championship-odds
 *     rank (the user-reported "CHA / NOP / MEM / UTA" bug)
 */

import { describe, it, expect } from 'vitest';
import { buildPlayoffOutlook } from './normalizeNbaImagePayload.js';
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

function mkUpcoming({ awaySlug, homeSlug, hoursAhead = 4 }) {
  const startTime = new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();
  return {
    gameId: `${awaySlug}-${homeSlug}-${startTime}`,
    sport: 'nba',
    status: 'upcoming',
    startTime,
    teams: {
      away: { slug: awaySlug, abbrev: awaySlug.toUpperCase(), score: null, name: awaySlug },
      home: { slug: homeSlug, abbrev: homeSlug.toUpperCase(), score: null, name: homeSlug },
    },
    gameState: { isFinal: false, isLive: false },
  };
}

describe('buildPlayoffOutlook — active team derivation (Slide 3)', () => {
  it('matches the current 2026 bracket reality (West=4 alive, East=7 alive)', () => {
    // Reproduces the ESPN bracket from the audit screenshot:
    //   West complete: OKC 4-0 PHX, LAL 4-2 HOU, MIN 4-2 DEN, SAS 4-1 POR
    //   East: NYK 4-2 ATL complete; CLE-TOR, DET-ORL, BOS-PHI all 3-3
    const games = [
      // OKC sweeps PHX (play-in winner) 4-0
      mkFinal({ awaySlug: 'okc', awayScore: 110, homeSlug: 'phx', homeScore: 95, hoursAgo: 320 }),
      mkFinal({ awaySlug: 'okc', awayScore: 105, homeSlug: 'phx', homeScore: 90, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'phx', awayScore: 95, homeSlug: 'okc', homeScore: 110, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'phx', awayScore: 100, homeSlug: 'okc', homeScore: 115, hoursAgo: 224 }),
      // LAL beats HOU 4-2
      mkFinal({ awaySlug: 'lal', awayScore: 100, homeSlug: 'hou', homeScore: 95, hoursAgo: 320 }),
      mkFinal({ awaySlug: 'lal', awayScore: 105, homeSlug: 'hou', homeScore: 100, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'hou', awayScore: 110, homeSlug: 'lal', homeScore: 105, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'lal', awayScore: 102, homeSlug: 'hou', homeScore: 95, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'hou', awayScore: 110, homeSlug: 'lal', homeScore: 100, hoursAgo: 152 }),
      mkFinal({ awaySlug: 'lal', awayScore: 115, homeSlug: 'hou', homeScore: 110, hoursAgo: 104 }),
      // MIN beats DEN 4-2
      mkFinal({ awaySlug: 'min', awayScore: 100, homeSlug: 'den', homeScore: 95, hoursAgo: 320 }),
      mkFinal({ awaySlug: 'min', awayScore: 105, homeSlug: 'den', homeScore: 100, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'den', awayScore: 110, homeSlug: 'min', homeScore: 105, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'min', awayScore: 102, homeSlug: 'den', homeScore: 95, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'den', awayScore: 110, homeSlug: 'min', homeScore: 100, hoursAgo: 152 }),
      mkFinal({ awaySlug: 'min', awayScore: 115, homeSlug: 'den', homeScore: 110, hoursAgo: 104 }),
      // SAS beats POR (play-in winner) 4-1
      mkFinal({ awaySlug: 'sas', awayScore: 110, homeSlug: 'por', homeScore: 95, hoursAgo: 320 }),
      mkFinal({ awaySlug: 'sas', awayScore: 105, homeSlug: 'por', homeScore: 90, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'por', awayScore: 105, homeSlug: 'sas', homeScore: 95, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'sas', awayScore: 102, homeSlug: 'por', homeScore: 95, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'sas', awayScore: 115, homeSlug: 'por', homeScore: 100, hoursAgo: 152 }),
      // NYK beats ATL 4-2
      mkFinal({ awaySlug: 'nyk', awayScore: 100, homeSlug: 'atl', homeScore: 95, hoursAgo: 320 }),
      mkFinal({ awaySlug: 'nyk', awayScore: 105, homeSlug: 'atl', homeScore: 100, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'atl', awayScore: 110, homeSlug: 'nyk', homeScore: 105, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'nyk', awayScore: 102, homeSlug: 'atl', homeScore: 95, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'atl', awayScore: 110, homeSlug: 'nyk', homeScore: 100, hoursAgo: 152 }),
      mkFinal({ awaySlug: 'nyk', awayScore: 115, homeSlug: 'atl', homeScore: 110, hoursAgo: 104 }),
      // CLE-TOR tied 3-3 (Game 7 pending)
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 95, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 102, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 100, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95, homeSlug: 'cle', homeScore: 90, hoursAgo: 152 }),
      mkFinal({ awaySlug: 'cle', awayScore: 108, homeSlug: 'tor', homeScore: 100, hoursAgo: 104 }),
      mkFinal({ awaySlug: 'tor', awayScore: 112, homeSlug: 'cle', homeScore: 110, hoursAgo: 24 }),
      mkUpcoming({ awaySlug: 'tor', homeSlug: 'cle', hoursAhead: 4 }),
      // DET-ORL tied 3-3 (Game 7 pending) — ORL is a play-in winner
      mkFinal({ awaySlug: 'det', awayScore: 100, homeSlug: 'orl', homeScore: 95, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'orl', awayScore: 105, homeSlug: 'det', homeScore: 102, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'det', awayScore: 110, homeSlug: 'orl', homeScore: 100, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'orl', awayScore: 95, homeSlug: 'det', homeScore: 90, hoursAgo: 152 }),
      mkFinal({ awaySlug: 'det', awayScore: 108, homeSlug: 'orl', homeScore: 100, hoursAgo: 104 }),
      mkFinal({ awaySlug: 'orl', awayScore: 112, homeSlug: 'det', homeScore: 110, hoursAgo: 24 }),
      // BOS-PHI tied 3-3 (Game 7 pending) — PHI is a play-in winner
      mkFinal({ awaySlug: 'bos', awayScore: 100, homeSlug: 'phi', homeScore: 95, hoursAgo: 296 }),
      mkFinal({ awaySlug: 'phi', awayScore: 105, homeSlug: 'bos', homeScore: 102, hoursAgo: 248 }),
      mkFinal({ awaySlug: 'bos', awayScore: 110, homeSlug: 'phi', homeScore: 100, hoursAgo: 200 }),
      mkFinal({ awaySlug: 'phi', awayScore: 95, homeSlug: 'bos', homeScore: 90, hoursAgo: 152 }),
      mkFinal({ awaySlug: 'bos', awayScore: 108, homeSlug: 'phi', homeScore: 100, hoursAgo: 104 }),
      mkFinal({ awaySlug: 'phi', awayScore: 112, homeSlug: 'bos', homeScore: 110, hoursAgo: 24 }),
    ];

    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const outlook = buildPlayoffOutlook({
      champOdds: {},
      standings: {},
      playoffContext,
      rawGames: games,
    });

    const eastAbbrevs = outlook.east.map(t => t.abbrev).sort();
    const westAbbrevs = outlook.west.map(t => t.abbrev).sort();
    const eastFullAbbrevs = (outlook.eastFull || []).map(t => t.abbrev).sort();
    const westFullAbbrevs = (outlook.westFull || []).map(t => t.abbrev).sort();

    // Audit Part 5: Slide 3 east/west are capped at 4 teams. Verify
    // the cap, plus verify the FULL ranked list still contains all
    // active teams for caption / Title Path consumption.
    expect(outlook.east.length).toBeLessThanOrEqual(4);
    expect(outlook.west.length).toBeLessThanOrEqual(4);

    // Full West active set (4 alive): OKC, LAL, MIN, SAS
    expect(westFullAbbrevs).toEqual(['LAL', 'MIN', 'OKC', 'SAS']);
    expect(westAbbrevs).toEqual(['LAL', 'MIN', 'OKC', 'SAS']);

    // Full East active set (7 alive): BOS, CLE, DET, NYK, ORL, PHI, TOR
    expect(eastFullAbbrevs).toEqual(['BOS', 'CLE', 'DET', 'NYK', 'ORL', 'PHI', 'TOR']);
    // Slide 3 East shows top-4 by championship odds (no odds passed in
    // this fixture → all teams have prob=0, sorted purely by seed
    // tiebreaker, so any 4 of the 7 may appear). Just check the cap +
    // that every shown East team IS in the active list.
    expect(outlook.east.length).toBe(4);
    for (const ab of eastAbbrevs) {
      expect(eastFullAbbrevs).toContain(ab);
    }

    // Eliminated must include: PHX, POR, HOU, DEN, ATL
    const eliminated = new Set(outlook.eliminatedTeams);
    expect(eliminated.has('phx')).toBe(true);
    expect(eliminated.has('por')).toBe(true);
    expect(eliminated.has('hou')).toBe(true);
    expect(eliminated.has('den')).toBe(true);
    expect(eliminated.has('atl')).toBe(true);

    // Non-playoff teams must NOT appear (the user-reported bug)
    for (const bad of ['cha', 'nop', 'mem', 'uta', 'bkn', 'mia']) {
      expect(eastAbbrevs).not.toContain(bad.toUpperCase());
      expect(westAbbrevs).not.toContain(bad.toUpperCase());
    }
  });

  it('completed series winner stays active, loser is eliminated', () => {
    // CLE sweeps TOR 4-0 in r1-east-1 (both bracket teams)
    const games = [
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 95, hoursAgo: 240 }),
      mkFinal({ awaySlug: 'cle', awayScore: 105, homeSlug: 'tor', homeScore: 100, hoursAgo: 192 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95, homeSlug: 'cle', homeScore: 110, hoursAgo: 144 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 120, hoursAgo: 24 }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const outlook = buildPlayoffOutlook({
      champOdds: {}, standings: {}, playoffContext, rawGames: games,
    });
    const east = outlook.east.map(t => t.abbrev);
    expect(east).toContain('CLE');
    expect(east).not.toContain('TOR');
    expect(outlook.eliminatedTeams).toContain('tor');
  });

  it('play-in matchups are excluded from active set', () => {
    // PHI vs MIA play-in (neither is in static bracket round-1 named slots)
    const games = [
      mkFinal({ awaySlug: 'phi', awayScore: 110, homeSlug: 'mia', homeScore: 105, hoursAgo: 320 }),
      // Plus a real CLE-TOR series so we have signal to anchor the filter
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 95, hoursAgo: 240 }),
      mkFinal({ awaySlug: 'cle', awayScore: 105, homeSlug: 'tor', homeScore: 100, hoursAgo: 192 }),
      mkFinal({ awaySlug: 'tor', awayScore: 95, homeSlug: 'cle', homeScore: 110, hoursAgo: 144 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 120, hoursAgo: 24 }),
    ];
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const outlook = buildPlayoffOutlook({
      champOdds: {}, standings: {}, playoffContext, rawGames: games,
    });
    const east = outlook.east.map(t => t.abbrev);
    // Play-in pair PHI-MIA both not in bracketTeamSlugs → skipped
    expect(east).not.toContain('MIA');
    // PHI is also not in our static bracket as a named slot, so it
    // shouldn't surface from a play-in-only signal either.
    expect(east).not.toContain('PHI');
  });

  it('bracket fallback prevents 30-team dump when no signal exists', () => {
    // No games — neither bracket-derived (all stale because play-in slots
    // are placeholders) nor game-derived signal will appear. Without the
    // fallback, hasAnyContext=false would let all 30 NBA teams pass
    // through. With the fallback, only bracket-anchored teams appear.
    const playoffContext = buildNbaPlayoffContext({ liveGames: [], windowGames: [] });
    const outlook = buildPlayoffOutlook({
      champOdds: {}, standings: {}, playoffContext, rawGames: [],
    });
    const east = outlook.east.map(t => t.abbrev);
    const west = outlook.west.map(t => t.abbrev);

    // Bracket teams should be present
    expect(west).toContain('OKC');
    expect(west).toContain('LAL');
    expect(east).toContain('BOS');
    expect(east).toContain('NYK');

    // Non-playoff lottery teams must NOT appear (the user-reported bug)
    for (const bad of ['CHA', 'NOP', 'MEM', 'UTA', 'BKN']) {
      expect([...east, ...west]).not.toContain(bad);
    }
  });
});
