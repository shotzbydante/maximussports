/**
 * Locks the NBA Team Intel integrity contract:
 *
 *   - A completed 4-3 series MUST say "won 4-3" / "advanced" /
 *     "survived Game 7" — NEVER "lead 4-3" (logical impossibility).
 *   - An active 1-0 series MAY say "lead 1-0".
 *   - A tied series says "Series tied".
 *   - resolveActivePlayoffTeams returns 8 teams when conf semis are
 *     starting (driven by the bracket + game data, not hardcoded).
 *   - Eliminated teams DO NOT appear in the active-teams set.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';
import {
  resolveActivePlayoffTeams,
  computeActivePlayoffTeams,
} from '../../../features/nba/contentStudio/normalizeNbaImagePayload.js';

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

describe('seriesSummary integrity — no "lead 4-3" after series complete', () => {
  it('CLE wins 4-3 over TOR → summary says "won 4-3", never "lead"', () => {
    // CLE goes 2-0 → 2-2 → 3-2 → 3-3 → 4-3 (no comeback, no sweep).
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 113, homeSlug: 'cle', homeScore: 126, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 104, homeSlug: 'tor', homeScore: 126, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 89,  homeSlug: 'tor', homeScore: 93,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 120, homeSlug: 'cle', homeScore: 125, hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 112, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 114, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series).toBeTruthy();
    expect(series.isComplete).toBe(true);
    // Integrity: a finished 4-3 series must NOT say "lead".
    expect(series.seriesScore.summary.toLowerCase()).not.toContain('lead');
    expect(series.seriesScore.summary).toMatch(/won 4-3/);
  });

  it('CLE sweeps TOR 4-0 → summary says "swept 4-0"', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 240 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 192 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 95,  hoursAgo: 144 }),
      mkFinal({ awaySlug: 'cle', awayScore: 120, homeSlug: 'tor', homeScore: 100, hoursAgo: 24 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.seriesScore.summary).toMatch(/swept 4-0/);
    expect(series.seriesScore.summary.toLowerCase()).not.toContain('lead');
  });

  it('CLE leads 1-0 in active series → summary says "lead 1-0"', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 24 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.isComplete).toBe(false);
    expect(series.seriesScore.summary).toMatch(/lead 1-0/);
  });

  it('Tied 1-1 series says "Series tied 1-1"', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 110, homeSlug: 'cle', homeScore: 100, hoursAgo: 24 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    expect(series.seriesScore.summary).toMatch(/Series tied 1-1/);
  });
});

describe('resolveActivePlayoffTeams — alive teams only', () => {
  it('eliminated R1 teams are NOT in the active set', () => {
    // CLE wins 4-3 over TOR. CLE alive, TOR eliminated.
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 113, homeSlug: 'cle', homeScore: 126, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 104, homeSlug: 'tor', homeScore: 126, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 89,  homeSlug: 'tor', homeScore: 93,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 120, homeSlug: 'cle', homeScore: 125, hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 112, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 114, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const active = resolveActivePlayoffTeams(ctx, games);
    expect(active).toContain('cle');
    expect(active).not.toContain('tor');
  });

  it('returns 8 alive teams when conf semifinals are starting', () => {
    // Simulate the 4 East R1 winners + 4 West R1 winners. Each R1
    // result is 4-1 to keep the fixtures small.
    const r1 = (winner, loser) => [
      mkFinal({ awaySlug: loser,  awayScore: 95,  homeSlug: winner, homeScore: 110, hoursAgo: 240 }),
      mkFinal({ awaySlug: loser,  awayScore: 100, homeSlug: winner, homeScore: 115, hoursAgo: 192 }),
      mkFinal({ awaySlug: winner, awayScore: 110, homeSlug: loser,  homeScore: 95,  hoursAgo: 144 }),
      mkFinal({ awaySlug: winner, awayScore: 100, homeSlug: loser,  homeScore: 95,  hoursAgo: 96 }),
      mkFinal({ awaySlug: winner, awayScore: 120, homeSlug: loser,  homeScore: 100, hoursAgo: 24 }),
    ];
    // East matchups in the static bracket (4 series):
    //   r1-east-0 DET vs Play-In Winner (resolved to ORL via games)
    //   r1-east-1 CLE vs TOR
    //   r1-east-2 NYK vs ATL
    //   r1-east-3 BOS vs Play-In Winner (resolved to PHI via games)
    // West matchups:
    //   r1-west-0 OKC vs Play-In Winner (resolved to PHX)
    //   r1-west-1 LAL vs HOU
    //   r1-west-2 DEN vs MIN  (MIN upsets DEN)
    //   r1-west-3 SAS vs Play-In Winner (resolved to POR)
    const games = [
      ...r1('det', 'orl'),
      ...r1('cle', 'tor'),
      ...r1('nyk', 'atl'),
      ...r1('bos', 'phi'),
      ...r1('okc', 'phx'),
      ...r1('lal', 'hou'),
      ...r1('min', 'den'),
      ...r1('sas', 'por'),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const active = resolveActivePlayoffTeams(ctx, games);
    // Exactly the 8 R1 winners — no eliminated teams.
    expect(active.sort()).toEqual(
      ['bos', 'cle', 'det', 'lal', 'min', 'nyk', 'okc', 'sas'].sort()
    );
    expect(active.length).toBe(8);
  });
});

describe('Team Intel headline integrity — no "lead 4-3" output', () => {
  // Re-import the headline shape via the slide's series-summary.
  // This is the contract that prevents the original screenshot bug
  // ("CLE — CAVALIERS LEAD 4-3").
  it('a series summary for CLE 4-3 over TOR never says "lead"', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 113, homeSlug: 'cle', homeScore: 126, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 105, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 104, homeSlug: 'tor', homeScore: 126, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 89,  homeSlug: 'tor', homeScore: 93,  hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 120, homeSlug: 'cle', homeScore: 125, hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 112, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 114, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: [], windowGames: games });
    const series = ctx.allSeries.find(s =>
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('cle') &&
      [s.topTeam?.slug, s.bottomTeam?.slug].includes('tor')
    );
    // Composite headline shape used by the slide:
    //   `${abbrev} — ${seriesScore.summary}`
    const headline = `CLE — ${series.seriesScore.summary}`;
    expect(headline.toLowerCase()).not.toContain('lead 4-3');
    expect(headline).toContain('won 4-3');
  });
});
