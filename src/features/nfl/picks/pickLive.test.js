import { describe, it, expect } from 'vitest';
import { pickLiveStatus, gameVsClose } from './pickLive.js';

const game = (away, home, { status = 'live', label = 'Q4 13:41', halftime = false } = {}) => ({
  status,
  teams: { away: { abbrev: 'NO', score: away }, home: { abbrev: 'CHI', score: home } },
  gameState: { periodLabel: label, isHalftime: halftime },
});

describe('pickLiveStatus: totals', () => {
  const under = { market: 'total', side: 'under', line: 49 };
  const over = { market: 'total', side: 'over', line: 54 };

  it('says how much room a live under has', () => {
    expect(pickLiveStatus(under, game(10, 19))).toEqual({
      state: 'live', verdict: 'ahead', text: '29 points at Q4 13:41. Stays under 49 with 19 or fewer more.',
    });
  });

  it('handles a half-point total', () => {
    const s = pickLiveStatus({ market: 'total', side: 'under', line: 40.5 }, game(7, 34, { label: 'Q4 9:51' }));
    expect(s).toMatchObject({ verdict: 'lost', text: '41 points at Q4 9:51, already past 40.5.' });
    expect(pickLiveStatus({ market: 'total', side: 'under', line: 40.5 }, game(7, 31)).text).toBe('38 points at Q4 13:41. Stays under 40.5 with 2 or fewer more.');
  });

  it('settles an over the moment the total is passed, and counts down before that', () => {
    expect(pickLiveStatus(over, game(31, 27))).toMatchObject({ state: 'live', verdict: 'won' });
    expect(pickLiveStatus(over, game(20, 24, { halftime: true }))).toEqual({
      state: 'live', verdict: 'behind', text: '44 points at halftime. Needs 11 more to go over 54.',
    });
  });

  it('warns when an under has no room left', () => {
    expect(pickLiveStatus({ market: 'total', side: 'under', line: 48.5 }, game(24, 24)).text).toBe('48 points at Q4 13:41. Any more scoring puts it over 48.5.');
  });

  it('grades a final, including a push', () => {
    expect(pickLiveStatus(under, game(17, 20, { status: 'final' }))).toMatchObject({ state: 'final', verdict: 'won', text: 'Finished with 37 points against a total of 49.' });
    expect(pickLiveStatus(under, game(28, 21, { status: 'final' })).verdict).toBe('push');
    expect(pickLiveStatus(over, game(28, 21, { status: 'final' })).verdict).toBe('lost');
  });
});

describe('pickLiveStatus: sides', () => {
  it('says whether a spread pick is covering', () => {
    const dog = { market: 'runline', side: 'away', line: 11.5 };
    expect(pickLiveStatus(dog, game(10, 19))).toEqual({ state: 'live', verdict: 'ahead', text: 'NO down 9 at Q4 13:41, covering by 2.5 at +11.5.' });
    const fav = { market: 'runline', side: 'home', line: -11.5 };
    expect(pickLiveStatus(fav, game(10, 19))).toMatchObject({ verdict: 'behind', text: 'CHI up 9 at Q4 13:41, 2.5 short of covering at -11.5.' });
  });

  it('grades a final spread and moneyline', () => {
    expect(pickLiveStatus({ market: 'runline', side: 'home', line: -3 }, game(20, 23, { status: 'final' })).verdict).toBe('push');
    expect(pickLiveStatus({ market: 'moneyline', side: 'away', line: null }, game(20, 23, { status: 'final' }))).toMatchObject({ verdict: 'lost', text: 'NO finished down 3.' });
  });

  it('has nothing to say before kickoff', () => {
    expect(pickLiveStatus({ market: 'total', side: 'over', line: 54 }, { status: 'upcoming' })).toEqual({ state: 'upcoming', verdict: null, text: '' });
  });
});

describe('gameVsClose', () => {
  it('describes a favorite short of the number and the scoring against the total', () => {
    expect(gameVsClose(game(10, 19), { spreadHome: -11.5, total: 48.5 })).toEqual({
      spread: 'CHI leads by 9 but is 2.5 short of covering 11.5',
      total: '29 points scored against a total of 48.5',
    });
  });

  it('describes a favorite that is behind, and a total already passed', () => {
    const g = game(27, 20);
    expect(gameVsClose(g, { spreadHome: -3, total: 44 })).toEqual({
      spread: 'CHI, a 3-point favorite, trails by 7',
      total: '47 points scored, already over the 44 total',
    });
  });

  it('returns null without scores or a closing line', () => {
    expect(gameVsClose({ teams: { home: {}, away: {} } }, { spreadHome: -3 })).toBeNull();
    expect(gameVsClose(game(1, 2), null)).toBeNull();
  });
});
