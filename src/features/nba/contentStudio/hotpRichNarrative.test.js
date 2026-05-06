/**
 * Locks the HOTP rich-narrative contract.
 *
 * Audit: HOTP regressed to generic "Team beat Team SCORE." copy for
 * Round 2 games where the static bracket has no series for the
 * matchup (R2 slots are placeholders, so findSeriesForGame returns
 * null). Fix added:
 *   - deriveHeadToHeadGameNumber → recovers Game N from the chrono
 *     finals between the two teams, even off-bracket.
 *   - extractGameStories now sets h2hGameNumber, roundNumber,
 *     marginTier, isRoadWin on every story.
 *   - buildNbaGameNarrative gained Section 6: non-clincher playoff
 *     templates (statement / first-punch / series-edge / margin-
 *     driven / safe-playoff fallback). Bare "Team beat Team SCORE."
 *     output is no longer reachable when game is in playoff window.
 *
 * Tests below cover:
 *   - OKC 108-90 over LAL Game 1 → "statement" / "controls" / "open"
 *   - DET 111-101 over CLE Game 1 → "first punch" / "statement"
 *     / "edge"
 *   - Non-clincher with series state present → series-lead language
 *   - Forced Game 7 still fires
 *   - True 3-1 comeback only when path-verified
 *   - HOTP NEVER says bare "X beat Y SCORE." for a game in the
 *     playoff window
 *   - Slide 1's 130-char cap is honored after trim()
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';
import { extractGameStories } from './buildNbaDailyHeadline.js';
import { buildNbaHotPress, buildNbaGameNarrative } from './buildNbaHotPress.js';

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

// Build full Round-1 results so the bracket promotes both R1 winners
// to "alive". Then add the R2 Game 1 we want to test.
function buildR1Closeouts(eastWest = 'all') {
  // R1 clinchers staged WELL outside the 48hr freshness window so they
  // don't crowd the HOTP slots — leaves room for the fresh R2 Game 1
  // bullets the tests target.
  const r1 = (winner, loser) => [
    mkFinal({ awaySlug: loser,  awayScore: 95,  homeSlug: winner, homeScore: 110, hoursAgo: 480 }),
    mkFinal({ awaySlug: loser,  awayScore: 100, homeSlug: winner, homeScore: 115, hoursAgo: 432 }),
    mkFinal({ awaySlug: winner, awayScore: 110, homeSlug: loser,  homeScore: 95,  hoursAgo: 384 }),
    mkFinal({ awaySlug: winner, awayScore: 100, homeSlug: loser,  homeScore: 95,  hoursAgo: 336 }),
    mkFinal({ awaySlug: winner, awayScore: 120, homeSlug: loser,  homeScore: 100, hoursAgo: 240 }),
  ];
  const all = [];
  if (eastWest === 'all' || eastWest === 'east') {
    all.push(...r1('det', 'orl'));
    all.push(...r1('cle', 'tor'));
    all.push(...r1('nyk', 'atl'));
    all.push(...r1('bos', 'phi'));
  }
  if (eastWest === 'all' || eastWest === 'west') {
    all.push(...r1('okc', 'phx'));
    all.push(...r1('lal', 'hou'));
    all.push(...r1('min', 'den'));
    all.push(...r1('sas', 'por'));
  }
  return all;
}

describe('HOTP rich narrative — Game 1 statement (OKC 108-90 over LAL)', () => {
  it('produces "statement" / "control" / "protect home court" copy, never bare "Thunder beat Lakers 108-90"', () => {
    // R1 fully done (LAL won 4-2 over HOU; OKC swept PHX 4-0). Then
    // OKC vs LAL Round 2 Game 1 — OKC at home, OKC wins 108-90.
    const games = [
      ...buildR1Closeouts('all'),
      mkFinal({ awaySlug: 'lal', awayScore: 90, homeSlug: 'okc', homeScore: 108, hoursAgo: 4 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const stories = extractGameStories(games, ctx);
    const okcLalStory = stories.find(s => s.winSlug === 'okc' && s.loseSlug === 'lal');
    expect(okcLalStory).toBeTruthy();
    expect(okcLalStory.h2hGameNumber).toBe(1);
    const bullet = buildNbaGameNarrative(okcLalStory);
    expect(bullet).toBeTruthy();
    expect(bullet.toLowerCase()).toMatch(/statement|control|protect home court|open the/);
    expect(bullet.toLowerCase()).not.toMatch(/^thunder beat lakers 108-90\.?$/);
    // Score is included.
    expect(bullet).toContain('108-90');
  });

  it('threads through buildNbaHotPress so the HOTP bullet itself is rich', () => {
    // Mirror real R1: OKC swept PHX, LAL won 4-1 over HOU. Then the
    // R2 Game 1 OKC vs LAL — fresh, so the placeholder resolver
    // doesn't conflate it with a R1 series for either team.
    const games = [
      // OKC R1 sweep of PHX
      mkFinal({ awaySlug: 'phx', awayScore: 95,  homeSlug: 'okc', homeScore: 110, hoursAgo: 480 }),
      mkFinal({ awaySlug: 'phx', awayScore: 100, homeSlug: 'okc', homeScore: 115, hoursAgo: 432 }),
      mkFinal({ awaySlug: 'okc', awayScore: 110, homeSlug: 'phx', homeScore: 95,  hoursAgo: 384 }),
      mkFinal({ awaySlug: 'okc', awayScore: 120, homeSlug: 'phx', homeScore: 100, hoursAgo: 336 }),
      // LAL R1 4-1 over HOU
      mkFinal({ awaySlug: 'hou', awayScore: 95,  homeSlug: 'lal', homeScore: 110, hoursAgo: 480 }),
      mkFinal({ awaySlug: 'hou', awayScore: 100, homeSlug: 'lal', homeScore: 115, hoursAgo: 432 }),
      mkFinal({ awaySlug: 'lal', awayScore: 110, homeSlug: 'hou', homeScore: 95,  hoursAgo: 384 }),
      mkFinal({ awaySlug: 'lal', awayScore: 100, homeSlug: 'hou', homeScore: 95,  hoursAgo: 336 }),
      mkFinal({ awaySlug: 'lal', awayScore: 120, homeSlug: 'hou', homeScore: 100, hoursAgo: 240 }),
      // R2 Game 1 — OKC at home, OKC wins by 18.
      mkFinal({ awaySlug: 'lal', awayScore: 90,  homeSlug: 'okc', homeScore: 108, hoursAgo: 4 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    // The OKC-LAL bullet may surface as game_story (Game-1 statement
    // template) or as active_series ("Thunder lead Lakers 1-0
    // entering Game 2 — series control on the line."). EITHER is
    // rich playoff copy — both are verified to contain
    // "control" / "lead" / "statement" / "edge" / "series".
    const okcBullet = bullets.find(b => /thunder|okc/i.test(b.text));
    expect(okcBullet).toBeTruthy();
    expect(okcBullet.text.toLowerCase()).toMatch(/statement|control|protect home court|open the|edge|lead/);
    // Forbidden: bare "Thunder beat Lakers 108-90." shape from the
    // audit screenshot.
    expect(okcBullet.text).not.toMatch(/^Thunder beat Lakers 108-90\.?$/);
  });
});

describe('HOTP rich narrative — first punch (DET 111-101 over CLE)', () => {
  it('produces "first punch" / "statement" / "series edge" copy for DET Game 1 over CLE on the road', () => {
    // R1 done (CLE won 4-1 over TOR; DET swept ORL 4-0 in this fixture).
    // Then DET Game 1 win over CLE — DET on the road (CLE is home).
    const games = [
      ...buildR1Closeouts('all'),
      mkFinal({ awaySlug: 'det', awayScore: 111, homeSlug: 'cle', homeScore: 101, hoursAgo: 4 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const stories = extractGameStories(games, ctx);
    const story = stories.find(s => s.winSlug === 'det' && s.loseSlug === 'cle');
    expect(story).toBeTruthy();
    expect(story.h2hGameNumber).toBe(1);
    expect(story.isRoadWin).toBe(true);
    const bullet = buildNbaGameNarrative(story);
    expect(bullet).toBeTruthy();
    expect(bullet.toLowerCase()).toMatch(/first punch|statement|control|edge|steal/);
    expect(bullet).toContain('111-101');
  });
});

describe('HOTP rich narrative — non-clincher with series state', () => {
  it('CLE wins Game 5 to take a 3-2 series lead → "3-2 series lead" copy', () => {
    // CLE leads 2-1 entering Game 4, splits 2-2, then takes Game 5
    // to lead 3-2. Game 5 is the targeted bullet.
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 240 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 192 }),
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 105, hoursAgo: 144 }),
      mkFinal({ awaySlug: 'cle', awayScore: 90,  homeSlug: 'tor', homeScore: 95,  hoursAgo: 96 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 112, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const stories = extractGameStories(games, ctx);
    const g5 = stories.find(s => s.winSlug === 'cle' && s.winSeriesWins === 3 && s.loseSeriesWins === 2);
    expect(g5).toBeTruthy();
    const bullet = buildNbaGameNarrative(g5);
    expect(bullet).toBeTruthy();
    expect(bullet.toLowerCase()).toMatch(/3-2 series lead/);
  });
});

describe('HOTP rich narrative — true 3-1 comeback still gated', () => {
  it('TOR down 1-3 wins 3 in a row → "complete the 3-1 comeback" fires', () => {
    const games = [
      mkFinal({ awaySlug: 'tor', awayScore: 95,  homeSlug: 'cle', homeScore: 110, hoursAgo: 312 }),
      mkFinal({ awaySlug: 'tor', awayScore: 100, homeSlug: 'cle', homeScore: 115, hoursAgo: 264 }),
      mkFinal({ awaySlug: 'cle', awayScore: 95,  homeSlug: 'tor', homeScore: 105, hoursAgo: 216 }),
      mkFinal({ awaySlug: 'cle', awayScore: 110, homeSlug: 'tor', homeScore: 100, hoursAgo: 168 }),
      mkFinal({ awaySlug: 'tor', awayScore: 102, homeSlug: 'cle', homeScore: 95,  hoursAgo: 120 }),
      mkFinal({ awaySlug: 'cle', awayScore: 100, homeSlug: 'tor', homeScore: 108, hoursAgo: 72 }),
      mkFinal({ awaySlug: 'tor', awayScore: 109, homeSlug: 'cle', homeScore: 100, hoursAgo: 8 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const stories = extractGameStories(games, ctx);
    const g7 = stories.find(s => s.isComebackFrom31);
    expect(g7).toBeTruthy();
    const bullet = buildNbaGameNarrative(g7);
    expect(bullet.toLowerCase()).toContain('3-1 comeback');
  });

  it('Game 1 win does NOT claim "3-1 comeback"', () => {
    const games = [
      ...buildR1Closeouts('all'),
      mkFinal({ awaySlug: 'lal', awayScore: 90, homeSlug: 'okc', homeScore: 108, hoursAgo: 4 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    for (const b of bullets) {
      expect(b.text.toLowerCase()).not.toContain('3-1 comeback');
    }
  });
});

describe('HOTP rich narrative — never bare "X beat Y SCORE."', () => {
  it('NO HOTP bullet for a Round-2 Game 1 matches the bare "Thunder beat Lakers 108-90." shape', () => {
    const games = [
      ...buildR1Closeouts('all'),
      mkFinal({ awaySlug: 'lal', awayScore: 90, homeSlug: 'okc', homeScore: 108, hoursAgo: 4 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    for (const b of bullets) {
      // Forbidden shape: "Thunder beat Lakers 108-90." (period optional)
      expect(b.text).not.toMatch(/^Thunder beat Lakers 108-90\.?$/);
    }
  });
});

describe('HOTP rich narrative — Slide 1 length cap', () => {
  it('Slide 1 trim(b.text, 130) yields ≤130 chars even for the longest non-clincher template', () => {
    // Repro of the trim() helper from NbaDailySlide1.jsx — we can't
    // import the JSX module easily in node, so we replicate the
    // function inline. If trim's contract changes, this test breaks
    // loud and forces a reconciliation.
    function trim(text, max = 130) {
      if (!text) return '';
      let s = String(text).trim();
      if (s.length <= max) return s;
      const sentEnd = s.lastIndexOf('.', max);
      if (sentEnd > max * 0.4) return s.slice(0, sentEnd + 1);
      return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
    }
    const games = [
      ...buildR1Closeouts('all'),
      mkFinal({ awaySlug: 'lal', awayScore: 90, homeSlug: 'okc', homeScore: 108, hoursAgo: 4 }),
      mkFinal({ awaySlug: 'det', awayScore: 111, homeSlug: 'cle', homeScore: 101, hoursAgo: 6 }),
    ];
    const ctx = buildNbaPlayoffContext({ liveGames: games, windowGames: games });
    const bullets = buildNbaHotPress({ liveGames: games, playoffContext: ctx });
    for (const b of bullets) {
      const trimmed = trim(b.text, 130);
      expect(trimmed.length).toBeLessThanOrEqual(130);
    }
  });
});
