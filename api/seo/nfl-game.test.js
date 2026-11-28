import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { week } from './_fixtures/nflWeek.js';
import { renderNflGame, renderNoGame, findGame, parseGameSlug, gameSlug, gamePath, gameFacts, impliedChance } from './nfl-game.js';
import { renderNflPicks } from './nfl-picks.js';

const root = path.resolve(__dirname, '../..');
const page = (slug) => renderNflGame(week, findGame(week, slug).game);
/** What a reader or a crawler reads: the page without its stylesheet. */
const words = (html) => html.replace(/<style>[\s\S]*?<\/style>/, '');

describe('game page addresses', () => {
  it('reads away-vs-home with team nicknames', () => {
    expect(parseGameSlug('seahawks-vs-49ers-prediction')).toEqual({ a: 'seahawks', b: '49ers' });
    expect(parseGameSlug('SEAHAWKS-vs-49ers-prediction')).toEqual({ a: 'seahawks', b: '49ers' });
    for (const bad of ['seahawks-vs-49ers', 'seahawks-at-49ers-prediction', 'seahawks-vs-seahawks-prediction', 'sea-vs-sf-prediction', 'nobody-vs-49ers-prediction', '', null]) {
      expect(parseGameSlug(bad)).toBeNull();
    }
  });

  it('finds the game, notices the reversed order, and misses a game that is not on', () => {
    const hit = findGame(week, 'seahawks-vs-49ers-prediction');
    expect(hit.game.gameId).toBe('401873091');
    expect(hit.reversed).toBe(false);
    expect(gameSlug(hit.game)).toBe('seahawks-vs-49ers-prediction');
    expect(gamePath(hit.game)).toBe('/nfl/seahawks-vs-49ers-prediction');
    expect(findGame(week, '49ers-vs-seahawks-prediction')).toMatchObject({ reversed: true });
    expect(findGame(week, 'cowboys-vs-eagles-prediction')).toEqual({ game: null, reversed: false });
    expect(findGame(null, 'seahawks-vs-49ers-prediction').game).toBeNull();
  });

  it('is routed in vercel.json ahead of the app, and measured by the middleware', () => {
    const { rewrites } = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const sources = rewrites.map((r) => r.source);
    const mine = sources.findIndex((s) => s.startsWith('/nfl/:matchup('));
    expect(mine).toBeGreaterThan(-1);
    expect(mine).toBeLessThan(sources.indexOf('/((?!api/).*)'));
    expect(rewrites[mine].destination).toBe('/api/seo/nfl-game?matchup=:matchup');
    expect(fs.readFileSync(path.join(root, 'middleware.js'), 'utf8')).toContain(rewrites[mine].source);
  });
});

describe('game facts', () => {
  it('turns a moneyline into each side’s chance', () => {
    expect(impliedChance({ home: -233, away: 192 })).toEqual({ home: 67, away: 33 });
    expect(impliedChance({ home: -100, away: -118 })).toEqual({ home: 48, away: 52 });
    expect(impliedChance(null)).toBeNull();
    expect(impliedChance({ home: -110 })).toBeNull();
  });

  it('names the favorite from the home spread', () => {
    const f = (slug) => gameFacts(findGame(week, slug).game);
    expect(f('seahawks-vs-49ers-prediction')).toMatchObject({ by: 1.5, fav: { abbrev: 'SEA' }, dog: { abbrev: 'SF' } });
    expect(f('raiders-vs-browns-prediction')).toMatchObject({ by: 4.5, fav: { abbrev: 'CLE' } });
  });

  it('grades a finished game against its closing lines', () => {
    const buf = gameFacts(findGame(week, 'chiefs-vs-bills-prediction').game);
    expect(buf).toMatchObject({ final: true, winner: { abbrev: 'BUF' }, covered: 'push', totalResult: 'under', chance: null });
    const det = gameFacts(findGame(week, 'bears-vs-lions-prediction').game);
    expect(det.winner.abbrev).toBe('CHI');
    expect(det.covered.abbrev).toBe('CHI');
    expect(det.totalResult).toBe('over');
  });
});

describe('game page', () => {
  it('an upcoming game: title, lines, kickoff, matchups, structured data', () => {
    const html = page('seahawks-vs-49ers-prediction');
    expect(html).toContain('<title>Seahawks vs 49ers Prediction, Odds and Pick (Week 12) | Maximus Sports</title>');
    expect(html).toContain('rel="canonical" href="https://maximussports.ai/nfl/seahawks-vs-49ers-prediction"');
    expect(html).toContain('SEA -1.5');
    expect(html).toContain('49ers +1.5');
    expect(html).toContain('The Seahawks are 1.5-point favorites on the road over the 49ers.');
    expect(html).toContain('Sunday, November 29 at 4:25 PM ET');
    expect(html).toContain('Levi&#39;s Stadium');
    expect(html).toContain('Edge: 49ers');
    expect(html).toContain('"@type":"SportsEvent"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('href="/nfl/games/seahawks-at-49ers"');
    expect(html).toContain(`href="/ask?q=${encodeURIComponent('Break down Seahawks at 49ers')}"`);
    expect(html).toContain('href="/nfl/raiders-vs-browns-prediction"');
    expect(html).not.toContain('<script src');
  });

  it('keeps a members’ call off the page', () => {
    const html = page('seahawks-vs-49ers-prediction');
    expect(html).toContain('3 calls');
    expect(html).toContain('opens with a free account');
    expect(html).not.toMatch(/Recommended<\/span>|class="pickLabel"/);
  });

  it('shows a top-three pick with its price, book and time, and never its reason', () => {
    const html = page('raiders-vs-browns-prediction');
    expect(html).toContain('<div class="pickLabel">Over 38</div>');
    expect(html).toContain('-110 at Circa Sports');
    expect(html).toContain('No. 2 pick of the week');
    expect(html).toContain('Locked Fri, Nov 27, 8:40 PM ET');
    expect(html).not.toContain('the market is 39.5');
    const det = page('bears-vs-lions-prediction');
    expect(det).toContain('<div class="pickLabel">DET +116</div>');
    expect(det).toContain('at FanDuel');
    expect(det).not.toContain('+116 +116');
  });

  it('gives away no reasons and no model numbers on any game', () => {
    for (const g of week.games) {
      const html = words(renderNflGame(week, g));
      expect(html).not.toMatch(/\b(wind|threshold|weights?|Madden|PFF|no-vig|devig)\b/i);
      expect(html).not.toMatch(/\b(our locks?|a lock\b|lock of the|guaranteed\b|free money|sure thing|risk-free)/i);
      if (g.pick?.why) expect(html).not.toContain(g.pick.why);
      // An edge is a word, never the figure behind it.
      for (const r of g.matchup.rows) expect(html).not.toMatch(new RegExp(`(Edge|edge)[^<]*${String(Math.abs(r.edge)).replace('.', '\\.')}`));
      expect(html).not.toMatch(/conviction|expected value/i);
    }
  });

  it('a finished game: the score, the closing lines and the graded pick', () => {
    const html = page('chiefs-vs-bills-prediction');
    expect(html).toContain('<title>Chiefs vs Bills: Final Score, Spread and Total Result (Week 12) | Maximus Sports</title>');
    expect(html).toContain('The Bills beat the Chiefs 13–10.');
    expect(html).toContain('Closing Spread');
    expect(html).toContain('Result: push');
    expect(html).toContain('Result: under, 23 points');
    expect(html).toContain('<span class="tag won">Won</span>');
    expect(html).toContain('Who won Chiefs vs Bills?');
    expect(html).not.toContain('Who the market expects to win');
  });

  it('a matchup that is not on: no index, and the games that are', () => {
    const html = renderNoGame(week, 'cowboys-vs-eagles-prediction');
    expect(html).toContain('Cowboys vs Eagles');
    expect(html).toContain('content="noindex, follow"');
    expect(html).toContain('href="/nfl/seahawks-vs-49ers-prediction"');
    expect(renderNoGame(null, 'junk')).toContain('That game');
  });
});

describe('NFL picks page', () => {
  it('links each game on the schedule to its page', () => {
    const T = (h) => new Date(Date.UTC(2026, 10, 26, 18) + h * 3600e3).toISOString();
    const board = { week: 12, byGame: [{ gameId: 'g1', startTime: T(7), awayTeam: { shortName: 'KC', name: 'Kansas City Chiefs' }, homeTeam: { shortName: 'BUF', name: 'Buffalo Bills' }, market: { spreadHome: -3, total: 46.5 } }] };
    const html = renderNflPicks(board, { now: Date.parse(T(0)) });
    expect(html).toContain('<a href="/nfl/chiefs-vs-bills-prediction">Kansas City Chiefs at Buffalo Bills</a>');
    expect(html).toContain('"url":"https://maximussports.ai/nfl/chiefs-vs-bills-prediction"');
  });
});
