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

/**
 * The ideas page: what Maximus can do, as prompts to tap. Each item sends
 * `question`. When a team is known (the page's, or the first one followed)
 * the game-level prompts name it; otherwise they ask about the whole week.
 */
export function ideas(ctx, { followed = null, shopPrices = false } = {}) {
  const team = nick(ctx?.teams?.[0]) || nick(followed);
  const game = team ? `the ${team} game` : null;
  return [
    {
      title: 'This week’s calls',
      items: [
        { emoji: '🎯', title: 'Best bets this week, with the price and the book.', sub: 'Every call comes with the line, where to get it and why I like it.', question: 'What are your best bets this week?' },
        { emoji: '🧠', title: 'Ask me why. I’ll walk through the reasoning.', sub: 'The projection, the mismatch and the price gap behind a call, and how strong it is.', question: 'Walk me through the reasoning on your strongest call' },
        { emoji: '🗓️', title: 'A call on every game on the slate.', sub: 'Strong picks first, then the leans, each marked for what it is.', question: 'Give me your call on every game this week' },
        { emoji: '📺', title: 'Game on? I’ll tell you how the picks are doing.', sub: 'Live score, and whether each pick is ahead or behind.', question: 'How are this week’s picks doing?' },
      ],
    },
    {
      title: 'Matchups, unit by unit',
      items: [
        { emoji: '🧱', title: 'Position group against position group.', sub: 'Pass rush against the line, receivers against the secondary, run game against the front. I grade each unit and find the gap.', question: game ? `Where is the biggest position-group mismatch in ${game}?` : 'Which game has the biggest position-group mismatch this week?' },
        { emoji: '🏈', title: 'Quarterback check.', sub: 'Who is starting, who is in doubt, and what that does to the price.', question: game ? `How do the quarterbacks compare in ${game}?` : 'Which quarterbacks are in doubt this week?' },
        { emoji: '🌬️', title: 'Wind, rain and cold.', sub: 'I read the forecast for each stadium and say when it should move a total.', question: game ? `Does the weather matter in ${game}?` : 'Does weather matter in any game this week?' },
        { emoji: '🪤', title: 'Trap games and tough spots.', sub: 'Short weeks, long trips and early kickoffs for teams from out west.', question: 'Any trap games or tough schedule spots this week?' },
        { emoji: '🚑', title: 'Injuries that move a line.', sub: 'The report, and which absences matter to the matchup.', question: team ? `${team} injury report` : 'Which injuries matter most this week?' },
      ],
    },
    {
      title: 'Prices',
      items: [
        { emoji: '🛒', title: 'I’ll shop every book for the best number.', sub: 'Spread, total and moneyline side by side, best price marked.', question: game ? `Which book has the best price on ${game}?` : 'Which book has the best price on your strongest call?', pro: !shopPrices },
        { emoji: '⚖️', title: 'Is the line fair?', sub: 'The market’s number against my projection, and which side it favours.', question: game ? `Is the line fair in ${game}?` : 'Which line this week is furthest from your projection?' },
      ],
    },
    {
      title: 'Teams and the season',
      items: [
        { emoji: '🏆', title: 'Playoff and title odds from thousands of simulated seasons.', sub: 'Projected wins, power rank and the road from here.', question: team ? `Will the ${team} make the playoffs?` : 'Who is most likely to win the Super Bowl?' },
        { emoji: '📊', title: 'Standings, by division or conference.', sub: 'Who is in, who is out, and who is chasing.', question: 'Show me the standings' },
        { emoji: '📰', title: 'The news that matters, with the source.', sub: 'Headlines for the league or one team, each linked to its outlet.', question: team ? `Latest ${team} news` : 'What is the biggest NFL news today?' },
      ],
    },
    {
      title: 'Keeping me honest',
      items: [
        { emoji: '📒', title: 'My record, wins and losses both.', sub: 'Every graded pick at the price it was locked at, in units.', question: 'What is your record this season?' },
        { emoji: '🔍', title: 'Which picks missed, and why.', sub: 'The misses, stated plainly, at the price they were locked at.', question: 'Which picks lost last week?' },
        { emoji: '📏', title: 'Did I beat the closing line?', sub: 'The cleanest test of whether a pick had value when it was made.', question: 'How often do your picks beat the closing line?' },
      ],
    },
  ];
}
