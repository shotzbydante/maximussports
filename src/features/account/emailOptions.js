/**
 * What people choose between when they pick their emails.
 *
 * The server sends several narrow email types per sport (briefing, picks,
 * team digest). People do not think in those terms, so the choices here are
 * fewer and each one says what arrives and when. One choice can switch
 * several server types on together; `keys` are the preference keys it owns
 * (see api/_lib/emailDefaults.js).
 *
 * A sport's daily email is offered while that sport is in season and moves
 * under "Offseason" when it is not, following the workspace config.
 */
import { WORKSPACES, SeasonState } from '../../workspaces/config';

const inSeason = (workspaceId) => WORKSPACES[workspaceId]?.seasonState === SeasonState.ACTIVE;

export const EMAIL_OPTIONS = [
  {
    id: 'daily',
    keys: ['global_briefing'],
    label: 'The Daily Brief',
    when: 'Every morning',
    description: 'One email for every sport in season: the stories that matter, the day’s best picks with prices, and last night’s results.',
  },
  {
    id: 'nfl',
    keys: ['nfl_picks'],
    workspace: 'nfl',
    label: 'NFL Picks',
    when: 'Thursday afternoon and Sunday morning',
    description: 'The week’s recommended picks with the price, the sportsbook and the reasoning, the lean on every other game, and your teams’ matchups.',
  },
  {
    id: 'alerts',
    keys: ['nfl_pick_alerts'],
    workspace: 'nfl',
    pro: true,
    label: 'NFL Pick Alerts',
    when: 'The moment a pick locks',
    description: 'One short email each time Maximus locks a recommended pick, with the line, the price and the sportsbook, before the market moves. Included with Pro.',
  },
  {
    id: 'ncaam',
    keys: ['ncaam_briefing', 'ncaam_picks'],
    workspace: 'cbb',
    label: 'College Basketball Daily',
    when: 'Daily in season',
    description: 'The morning briefing and the day’s picks against the spread.',
  },
  {
    id: 'mlb',
    keys: ['mlb_briefing', 'mlb_picks'],
    workspace: 'mlb',
    label: 'MLB Daily',
    when: 'Daily in season',
    description: 'The morning briefing and the day’s picks: moneylines, run lines and totals.',
  },
  {
    id: 'teams',
    keys: ['mlb_team_digest', 'ncaam_team_digest'],
    label: 'Your Teams',
    when: 'Game days in season',
    description: 'Scores, news and the next matchup for the baseball and college basketball teams you follow. NFL teams are covered in NFL Picks.',
  },
];

/** What a brand-new account starts with: the daily brief and football. */
export const SIGNUP_PREFS = {
  global_briefing: true,
  nfl_picks: true,
  ncaam_briefing: false,
  ncaam_picks: false,
  ncaam_team_digest: false,
  mlb_briefing: false,
  mlb_picks: false,
  mlb_team_digest: false,
};

/** On when any of its emails is on. */
export function isOptionOn(prefs, option) {
  return option.keys.some((k) => prefs?.[k] === true);
}

/** Flip a choice: every key it owns moves together. */
export function toggleOption(prefs, option) {
  const next = !isOptionOn(prefs, option);
  return { ...prefs, ...Object.fromEntries(option.keys.map((k) => [k, next])) };
}

/** Choices split into the ones that send now and the ones waiting for a season. */
export function groupOptions(options = EMAIL_OPTIONS) {
  const current = [];
  const offseason = [];
  for (const o of options) (o.workspace && !inSeason(o.workspace) ? offseason : current).push(o);
  return { current, offseason };
}
