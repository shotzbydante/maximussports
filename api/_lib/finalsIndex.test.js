/**
 * finalsIndex — repeat-matchup safety tests.
 *
 * Locks down the contract: in repeat NBA playoff matchups (HOU/LAL Game 5
 * vs Game 6), a pick from one slate must NEVER be graded against a final
 * from a different slate via the team-pair fallback.
 */

import { describe, it, expect } from 'vitest';
import { buildFinalsIndex, resolveFinalForPick, slugPairKey } from './finalsIndex.js';

function mkFinal({ gameId, away, home, awayScore, homeScore, startTime }) {
  return {
    gameId,
    startTime,
    teams: {
      away: { slug: away, score: awayScore },
      home: { slug: home, score: homeScore },
    },
    gameState: { isFinal: true },
    status: 'final',
  };
}

describe('slugPairKey — order-independent matchup fingerprint', () => {
  it('produces the same key regardless of arg order', () => {
    expect(slugPairKey('hou', 'lal')).toBe(slugPairKey('lal', 'hou'));
  });
  it('lowercases inputs', () => {
    expect(slugPairKey('HOU', 'LAL')).toBe('hou|lal');
  });
});

describe('resolveFinalForPick — primary game-id match', () => {
  it('returns the final when pick.game_id matches an indexed gameId', () => {
    const finals = [mkFinal({ gameId: '401_g5', away: 'hou', home: 'lal', awayScore: 78, homeScore: 98, startTime: '2026-05-01T22:30:00Z' })];
    const idx = buildFinalsIndex(finals);
    const pick = { game_id: '401_g5', away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' };
    const r = resolveFinalForPick(pick, idx, { slateDate: '2026-05-01' });
    expect(r.via).toBe('game_id');
    expect(r.final.gameId).toBe('401_g5');
  });
});

describe('resolveFinalForPick — slug-pair fallback (legacy id)', () => {
  it('falls back when game_id is not indexed but team pair is', () => {
    const finals = [mkFinal({ gameId: '401_g5', away: 'hou', home: 'lal', awayScore: 78, homeScore: 98, startTime: '2026-05-01T22:30:00Z' })];
    const idx = buildFinalsIndex(finals);
    const pick = { game_id: 'oddsapi_legacy_id', away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' };
    const r = resolveFinalForPick(pick, idx, { slateDate: '2026-05-01' });
    expect(r.via).toBe('slug_pair');
    expect(r.final.gameId).toBe('401_g5');
  });
});

describe('resolveFinalForPick — cross-date safety (THE HOU/LAL bug guard)', () => {
  it('REJECTS a slug-pair fallback when the candidate final is on a different ET day', () => {
    // Imagine the caller accidentally loaded May 2's finals into the
    // index but the pick's slate_date is May 1. The fallback must NOT
    // grade the May 1 pick against the May 2 final.
    const may2Final = mkFinal({
      gameId: '401_g6', away: 'lal', home: 'hou',
      awayScore: 98, homeScore: 78,             // LAL wins
      startTime: '2026-05-02T23:00:00Z',
    });
    const idx = buildFinalsIndex([may2Final]);
    const may1Pick = {
      game_id: 'legacy_id',
      away_team_slug: 'hou', home_team_slug: 'lal',
      slate_date: '2026-05-01',
    };
    const r = resolveFinalForPick(may1Pick, idx, { slateDate: '2026-05-01' });
    expect(r.final).toBeNull();
    expect(r.rejectedReason).toBe('cross_date_slug_pair');
    expect(r.detail.pickSlateDate).toBe('2026-05-01');
    expect(r.detail.finalDate).toBe('2026-05-02');
  });

  it('ACCEPTS a slug-pair fallback when dates match', () => {
    const may1Final = mkFinal({
      gameId: '401_g5', away: 'hou', home: 'lal',
      awayScore: 78, homeScore: 98,             // LAL wins Game 5 at home
      startTime: '2026-05-01T22:30:00Z',
    });
    const idx = buildFinalsIndex([may1Final]);
    const may1Pick = {
      game_id: 'legacy_id',
      away_team_slug: 'hou', home_team_slug: 'lal',
      slate_date: '2026-05-01',
    };
    const r = resolveFinalForPick(may1Pick, idx, { slateDate: '2026-05-01' });
    expect(r.via).toBe('slug_pair');
    expect(r.final.gameId).toBe('401_g5');
  });
});

describe('resolveFinalForPick — repeat playoff matchup integration', () => {
  // The full scenario: HOU/LAL play Game 5 on May 1 (LAL wins 98-78) and
  // Game 6 on May 3 (HOU wins 98-78). Same teams, different days, mirrored
  // scores. The grader MUST not cross them.
  const game5 = mkFinal({
    gameId: '401_g5', away: 'hou', home: 'lal',
    awayScore: 78, homeScore: 98,
    startTime: '2026-05-01T22:30:00Z',
  });
  const game6 = mkFinal({
    gameId: '401_g6', away: 'lal', home: 'hou',
    awayScore: 78, homeScore: 98,
    startTime: '2026-05-03T22:30:00Z',
  });

  it('Game 5 pick + Game 5 finals index → grades against Game 5', () => {
    const idx = buildFinalsIndex([game5]);
    const pick = { game_id: '401_g5', away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' };
    const r = resolveFinalForPick(pick, idx, { slateDate: '2026-05-01' });
    expect(r.final.gameId).toBe('401_g5');
  });

  it('Game 6 pick + Game 6 finals index → grades against Game 6', () => {
    const idx = buildFinalsIndex([game6]);
    const pick = { game_id: '401_g6', away_team_slug: 'lal', home_team_slug: 'hou', slate_date: '2026-05-03' };
    const r = resolveFinalForPick(pick, idx, { slateDate: '2026-05-03' });
    expect(r.final.gameId).toBe('401_g6');
  });

  it('a Game 5 pick CANNOT cross-grade against Game 6 even if both finals are loaded', () => {
    // Mis-built map: both days loaded together. Even then, the cross-date
    // guard rejects the bad fallback. The Game 5 pick still finds Game 5
    // by primary game_id. The Game 6 pick still finds Game 6.
    const idx = buildFinalsIndex([game5, game6]);
    // Strip the persisted game_id to force fallback path.
    const pick5Legacy = { game_id: 'legacy_5', away_team_slug: 'hou', home_team_slug: 'lal', slate_date: '2026-05-01' };
    const r5 = resolveFinalForPick(pick5Legacy, idx, { slateDate: '2026-05-01' });
    // The slug-pair index ends up with whichever final was inserted last
    // (Game 6). The guard must reject it because dates disagree.
    expect(r5.rejectedReason).toBe('cross_date_slug_pair');
  });
});
