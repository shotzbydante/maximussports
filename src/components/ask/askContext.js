/**
 * What Ask Maximus knows about where it was opened, and what it offers
 * there before anyone types.
 *
 * Pure functions of the path and a few numbers from /api/ask/status, so the
 * launcher's one-line prompt and the starter questions can be tested
 * without rendering anything. Nothing here calls the model.
 */

import { getNflTeamBySlug } from '../../sports/nfl/teams.js';

const nick = (slug) => getNflTeamBySlug(slug)?.nickname || null;

/**
 * The page chat was opened from.
 * @returns {{ kind: 'game'|'team'|'picks'|'home', teams: string[], key: string }}
 *   key: one per distinct context, so a prompt is offered once for each
 */
export function pageContext(pathname = '/') {
  const path = String(pathname).split('?')[0].replace(/\/+$/, '') || '/';
  const game = path.match(/^\/nfl\/games\/([a-z0-9]+)-at-([a-z0-9]+)$/);
  if (game && nick(game[1]) && nick(game[2])) return { kind: 'game', teams: [game[1], game[2]], key: `game:${game[1]}-${game[2]}` };
  const team = path.match(/^\/nfl\/teams\/([a-z0-9]+)$/);
  if (team && nick(team[1])) return { kind: 'team', teams: [team[1]], key: `team:${team[1]}` };
  if (path === '/nfl/insights') return { kind: 'picks', teams: [], key: 'picks' };
  return { kind: 'home', teams: [], key: 'home' };
}

/** Where the launcher lives: the home pages and the NFL section. Never over sign-up, checkout or admin. */
export function launcherAllowed(pathname = '/') {
  const path = String(pathname).split('?')[0].replace(/\/+$/, '') || '/';
  if (path === '/ask' || path === '/nfl/ask') return false; // the full page is already the chat
  return path === '/' || path === '/nfl' || path.startsWith('/nfl/');
}

/**
 * The launcher's one line: a reason to tap that is true right now, and the
 * question a tap sends. `status` is /api/ask/status: { week, picks, games }.
 * @returns {{ text: string, question: string }}
 */
export function peekLine(ctx, status = {}) {
  const [a, b] = ctx.teams.map(nick);
  if (ctx.kind === 'game') return { text: `${a} at ${b}. Want my read?`, question: `Break down ${a} at ${b}` };
  if (ctx.kind === 'team') return { text: `Ask me about the ${a}.`, question: `How do the ${a} look this week?` };
  const n = Number(status.picks) || 0;
  const week = status.week || 'this week';
  if (ctx.kind === 'picks') {
    return n > 0
      ? { text: `${n} ${n === 1 ? 'pick' : 'picks'} made the cut for ${week}. Ask me why.`, question: 'Why these picks this week?' }
      : { text: 'No price clears the bar yet. Ask me what is close.', question: 'Which games are closest to a pick?' };
  }
  return n > 0
    ? { text: `I like ${n} ${n === 1 ? 'bet' : 'bets'} for ${week}. Want ${n === 1 ? 'it' : 'them'}?`, question: 'What are your best bets this week?' }
    : { text: `Lines are up for ${week}. Ask me about any game.`, question: 'What are the lines this week?' };
}

/**
 * Four questions to start from, fitted to the page and the visitor.
 * @param {{ kind: string, teams: string[] }} ctx
 * @param {{ followed?: string, shopPrices?: boolean }} [who] first followed team; whether price shopping is included
 */
export function starters(ctx, { followed = null, shopPrices = false } = {}) {
  const [a, b] = ctx.teams.map(nick);
  if (ctx.kind === 'game') {
    return [
      `Break down ${a} at ${b}`,
      'Where is the biggest mismatch?',
      'Any injuries that matter here?',
      shopPrices ? 'Which book has the best price?' : 'What is your pick on this game?',
    ];
  }
  if (ctx.kind === 'team') {
    return [`How do the ${a} look this week?`, `Will the ${a} make the playoffs?`, `${a} injury report`, `Latest ${a} news`];
  }
  const mine = nick(followed);
  return [
    'What are your best bets this week?',
    mine ? `Break down the ${mine} game` : 'Which game has the biggest mismatch?',
    'How are this week’s picks doing?',
    'What is your record this season?',
  ];
}
