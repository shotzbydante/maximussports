import { describe, it, expect } from 'vitest';
import { pageContext, launcherAllowed, peekLine, starters } from './askContext.js';

describe('pageContext', () => {
  it('reads the game, team and picks pages', () => {
    expect(pageContext('/nfl/games/raiders-at-chiefs')).toEqual({ kind: 'game', teams: ['raiders', 'chiefs'], key: 'game:raiders-chiefs' });
    expect(pageContext('/nfl/games/49ers-at-bills/')).toMatchObject({ kind: 'game', teams: ['49ers', 'bills'] });
    expect(pageContext('/nfl/teams/lions')).toEqual({ kind: 'team', teams: ['lions'], key: 'team:lions' });
    expect(pageContext('/nfl/insights?tab=totals')).toMatchObject({ kind: 'picks' });
  });

  it('falls back to home for anything else, including teams that do not exist', () => {
    for (const p of ['/', '/nfl', '/nfl/games', '/nfl/games/unicorns-at-chiefs', '/nfl/teams/unicorns', '/nba/teams/lakers', undefined]) {
      expect(pageContext(p).kind).toBe('home');
    }
  });
});

describe('launcherAllowed', () => {
  it('lives on the home pages and the NFL section', () => {
    for (const p of ['/', '/nfl', '/nfl/insights', '/nfl/games/raiders-at-chiefs', '/nfl/teams/lions/']) expect(launcherAllowed(p)).toBe(true);
  });

  it('stays off sign-up, account, admin, other sports and its own full page', () => {
    for (const p of ['/settings', '/auth/callback', '/nba', '/mlb/games', '/content-studio', '/ask', '/nfl/ask', '/nfl/ask/']) expect(launcherAllowed(p)).toBe(false);
  });
});

describe('peekLine', () => {
  it('names the game or team on its page', () => {
    expect(peekLine(pageContext('/nfl/games/raiders-at-chiefs'))).toEqual({ text: 'Raiders at Chiefs. Want my read?', question: 'Break down Raiders at Chiefs' });
    expect(peekLine(pageContext('/nfl/teams/lions')).question).toBe('How do the Lions look this week?');
  });

  it('says how many picks there are, with the right grammar, and never invents one', () => {
    const home = pageContext('/');
    expect(peekLine(home, { week: 'Week 13', picks: 3 }).text).toBe('I like 3 bets for Week 13. Want them?');
    expect(peekLine(home, { week: 'Week 13', picks: 1 }).text).toBe('I like 1 bet for Week 13. Want it?');
    expect(peekLine(home, { week: 'Week 13', picks: 0 }).text).toBe('Lines are up for Week 13. Ask me about any game.');
    expect(peekLine(home, {}).text).toBe('Lines are up for this week. Ask me about any game.');
    const picks = pageContext('/nfl/insights');
    expect(peekLine(picks, { week: 'Week 13', picks: 2 }).text).toBe('2 picks made the cut for Week 13. Ask me why.');
    expect(peekLine(picks, { picks: 0 }).question).toBe('Which games are closest to a pick?');
  });
});

describe('starters', () => {
  it('fits the page', () => {
    expect(starters(pageContext('/nfl/games/raiders-at-chiefs'))[0]).toBe('Break down Raiders at Chiefs');
    expect(starters(pageContext('/nfl/teams/lions'))).toEqual(['How do the Lions look this week?', 'Will the Lions make the playoffs?', 'Lions injury report', 'Latest Lions news']);
  });

  it('offers price shopping only to someone who has it', () => {
    const game = pageContext('/nfl/games/raiders-at-chiefs');
    expect(starters(game, { shopPrices: true })[3]).toBe('Which book has the best price?');
    expect(starters(game, { shopPrices: false })[3]).toBe('What is your pick on this game?');
  });

  it('uses a followed team on the home pages', () => {
    expect(starters(pageContext('/'), { followed: 'bills' })[1]).toBe('Break down the Bills game');
    expect(starters(pageContext('/'))[1]).toBe('Which game has the biggest mismatch?');
    expect(starters(pageContext('/'), { followed: 'not-a-team' })).toHaveLength(4);
  });

  it('keeps every starter short enough for one chip', () => {
    for (const p of ['/', '/nfl/insights', '/nfl/teams/buccaneers', '/nfl/games/commanders-at-buccaneers']) {
      for (const s of starters(pageContext(p), { shopPrices: true })) expect(s.length).toBeLessThanOrEqual(42);
    }
  });
});
