/**
 * The football week as a posting rhythm: one main post a day, tied to what
 * the audience is thinking about that day. The studio surfaces today's entry.
 */
export const NFL_WEEKLY_PLAN = {
  0: { section: 'nfl-slate', name: 'The Board', why: 'Sunday morning: every game, every line, the bets that made the cut.' },
  1: { section: 'nfl-game', name: 'Monday night breakdown', why: 'One game left. Break it down and give the verdict, even if it is no bet.' },
  2: { section: 'nfl-receipts', name: 'Receipts', why: 'The week is graded. Post the record, win or lose, before anything else.' },
  3: { section: 'nfl-team', name: 'Team cards', why: 'Midweek is for fans. Post the teams whose playoff odds moved most.' },
  4: { section: 'nfl-game', name: 'Thursday night breakdown', why: 'One game tonight. Projection, line and verdict.' },
  5: { section: 'nfl-picks', name: "Maximus's Picks", why: 'Picks are locked. Post them with the price and the reasons.' },
  6: { section: 'nfl-explain', name: 'Explainer', why: 'Quiet day before the slate. Teach one idea people will save.' },
};

/** Sunday after the late window flips from the preview to the review. */
const SUNDAY_NIGHT = { section: 'nfl-review', name: 'What We Got Wrong', why: 'Sunday night: own the misses while everyone is still talking about the games.' };

export function todaysNflPlan(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  const plan = day === 0 && hour >= 20 ? SUNDAY_NIGHT : NFL_WEEKLY_PLAN[day];
  return { ...plan, dayLabel: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] };
}
