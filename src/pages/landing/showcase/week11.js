/**
 * Real examples for the guest landing page, from NFL Week 11 of the 2026
 * season (games of November 19 to 23).
 *
 * The board (EVERY_GAME) is the "Every game" tabs as production ranked
 * them on Sunday morning, November 22, before the early kickoffs.
 *
 * The ticket and the matchup are Baltimore at Carolina, which finished
 * 35-33 to the Panthers. The ticket shows the two calls locked on that
 * game Saturday night, with how each was graded: both were leans (tracked,
 * not recommended), and both won. The matchup is the roster talent view
 * for the same game. It is a snapshot, so the page labels it with the
 * week. Refresh it from the picks table and /api/nfl/talent when the
 * examples get old.
 *
 * Left out on purpose: thresholds, weights, tiers, how a fair price is
 * built, and the Madden and PFF inputs behind a talent score.
 */

const logo = (code) => `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`;

export const TEAMS = {
  BAL: { abbrev: 'BAL', nickname: 'Ravens', logo: logo('bal') },
  CAR: { abbrev: 'CAR', nickname: 'Panthers', logo: logo('car') },
  ARI: { abbrev: 'ARI', nickname: 'Cardinals', logo: logo('ari') },
  KC: { abbrev: 'KC', nickname: 'Chiefs', logo: logo('kc') },
  NO: { abbrev: 'NO', nickname: 'Saints', logo: logo('no') },
  CHI: { abbrev: 'CHI', nickname: 'Bears', logo: logo('chi') },
  CIN: { abbrev: 'CIN', nickname: 'Bengals', logo: logo('cin') },
  WSH: { abbrev: 'WSH', nickname: 'Commanders', logo: logo('wsh') },
  MIN: { abbrev: 'MIN', nickname: 'Vikings', logo: logo('min') },
  SF: { abbrev: 'SF', nickname: '49ers', logo: logo('sf') },
  MIA: { abbrev: 'MIA', nickname: 'Dolphins', logo: logo('mia') },
  BUF: { abbrev: 'BUF', nickname: 'Bills', logo: logo('buf') },
  LV: { abbrev: 'LV', nickname: 'Raiders', logo: logo('lv') },
  DEN: { abbrev: 'DEN', nickname: 'Broncos', logo: logo('den') },
  NYJ: { abbrev: 'NYJ', nickname: 'Jets', logo: logo('nyj') },
  LAC: { abbrev: 'LAC', nickname: 'Chargers', logo: logo('lac') },
};

export const WEEK = { label: 'Week 11', games: 12, calls: 36, recommended: 3, books: 12 };

/**
 * The ticket: two calls on one game, as locked, then as graded.
 * Final: Panthers 35, Ravens 33. Baltimore lost by 2 and covered +2.5;
 * 68 points went over 43.5.
 */
export const TICKET = {
  away: { ...TEAMS.BAL, score: 33 },
  home: { ...TEAMS.CAR, score: 35 },
  status: 'Final',
  kickoff: 'Sun 1:00 PM ET',
  network: 'Fox',
  venue: 'Bank of America Stadium',
  city: 'Charlotte, NC',
  lines: [
    { market: 'Spread', value: 'BAL +2.5', picked: true },
    { market: 'Moneyline', value: 'CAR -149', sub: 'BAL +127' },
    { market: 'Over/under', value: '43.5', picked: true },
  ],
  calls: [
    {
      pick: 'Ravens +2.5', team: 'BAL', market: 'Spread', price: '+100', book: 'Caesars',
      result: 'won',
      graded: 'Baltimore lost by 2, inside the 2.5.',
      why: 'Ratings made it Carolina by 2.4; the market said 2.5.',
    },
    {
      pick: 'Over 43.5', team: null, market: 'Over/under', price: '-112', book: 'BetMGM',
      result: 'won',
      graded: '68 points, 24.5 over the number.',
      why: 'Ratings projected 45.8 points against a total of 43.5.',
    },
  ],
  locked: 'Both locked Sat 11:02 PM ET',
  graded: 'Graded Sunday: 2 for 2',
};

/** The four "Every game" tabs, top of each list. `chip` is the label the app shows. */
export const EVERY_GAME = [
  {
    key: 'overall',
    label: 'Overall',
    note: 'The strongest call on each game, whichever market it is in.',
    rows: [
      { team: null, pick: 'Under 49', market: 'Over/under', chip: 'rec', value: '+4.8%', game: ['NO', 'CHI'], when: 'Sun 1:00 PM', price: '-110 at Circa Sports', why: 'Wind in the forecast, and a price better than fair.', score: 79 },
      { team: null, pick: 'Under 40.5', market: 'Over/under', chip: 'rec', value: '+4.7%', game: ['ARI', 'KC'], when: 'Sun 1:00 PM', price: '-105 at DraftKings', why: 'DraftKings paid -105; the fair price was -116.', score: 79 },
      { team: null, pick: 'Over 54', market: 'Over/under', chip: 'rec', value: '+2.1%', game: ['CIN', 'WSH'], when: 'Mon 8:15 PM', price: '-107 at BetRivers', why: 'BetRivers paid -107; the fair price was -112.', score: 67 },
      { team: 'MIN', pick: 'MIN +3.5', market: 'Spread', chip: 'lean', game: ['MIN', 'SF'], when: 'Sun 8:20 PM', price: '-112 at BetMGM', why: 'Ratings SF -0.3, market SF -3.5.', score: 41 },
    ],
  },
  {
    key: 'spreads',
    label: 'Spreads',
    note: 'A side against the spread for every game, ranked by conviction.',
    rows: [
      { team: 'ARI', pick: 'ARI +15.5', chip: 'lean', game: ['ARI', 'KC'], when: 'Sun 1:00 PM', price: '-108 at BetMGM', why: 'Ratings KC -11.2, market KC -15.5.', score: 47 },
      { team: 'NO', pick: 'NO +11.5', chip: 'lean', game: ['NO', 'CHI'], when: 'Sun 1:00 PM', price: '-107 at DraftKings', why: 'Ratings CHI -8, market CHI -11.5.', score: 43 },
      { team: 'MIN', pick: 'MIN +3.5', chip: 'lean', game: ['MIN', 'SF'], when: 'Sun 8:20 PM', price: '-112 at BetMGM', why: 'Ratings SF -0.3, market SF -3.5.', score: 41 },
      { team: 'WSH', pick: 'WSH +6', chip: 'lean', game: ['CIN', 'WSH'], when: 'Mon 8:15 PM', price: '-107 at DraftKings', why: 'Ratings WSH +3.6, market WSH +6.', score: 37 },
    ],
    more: 8,
  },
  {
    key: 'moneyline',
    label: 'Moneyline',
    note: 'Ranked by value, not by who is likelier to win. A moneyline is listed only when a book pays more than the fair price.',
    rows: [
      { team: 'DEN', pick: 'DEN -550', chip: 'value', value: '+0.6%', hold: 'Extreme price', game: ['LV', 'DEN'], when: 'Sun 4:25 PM', price: 'Circa Sports', why: 'Circa Sports pays -550 on DEN; the fair price is -571.', score: 34 },
    ],
    empty: '11 of 12 moneylines had no value this week, so they are not listed.',
  },
  {
    key: 'totals',
    label: 'Over/under',
    note: 'Over or under for every game, ranked by conviction.',
    rows: [
      { team: null, pick: 'Under 49', chip: 'rec', value: '+4.8%', game: ['NO', 'CHI'], when: 'Sun 1:00 PM', price: '-110 at Circa Sports', why: 'Wind in the forecast, and a price better than fair.', score: 79 },
      { team: null, pick: 'Under 40.5', chip: 'rec', value: '+4.7%', game: ['ARI', 'KC'], when: 'Sun 1:00 PM', price: '-105 at DraftKings', why: 'DraftKings paid -105; the fair price was -116.', score: 79 },
      { team: null, pick: 'Over 54', chip: 'rec', value: '+2.1%', game: ['CIN', 'WSH'], when: 'Mon 8:15 PM', price: '-107 at BetRivers', why: 'BetRivers paid -107; the fair price was -112.', score: 67 },
      { team: null, pick: 'Over 41', chip: 'lean', game: ['LV', 'DEN'], when: 'Sun 4:25 PM', price: '-110 at Circa Sports', why: 'Ratings project 42.8, market 41.', score: 34 },
    ],
    more: 8,
  },
];

/**
 * Baltimore at Carolina: unit against unit when the Panthers have the ball.
 *
 * `edge` is from the offense's side: positive favours the offense, negative
 * the defense. Under three points the app calls a matchup even.
 *
 * The players named for Baltimore are the top-rated ones in each unit who
 * were active on Sunday. Nnamdi Madubuike and Marlon Humphrey were
 * inactive, and Lamar Jackson is on injured reserve; the grades and ranks
 * below are season roster ratings and still count all three (see `note`).
 */
export const MATCHUP = {
  away: TEAMS.BAL,
  home: TEAMS.CAR,
  lean: 'With Carolina on offense, every unit graded within three points of the Baltimore unit across from it. The game was decided by two.',
  offense: TEAMS.CAR,
  defense: TEAMS.BAL,
  rows: [
    {
      unit: 'Run game', grade: 81.8, players: [['Chuba Hubbard', 90.4], ['Damien Lewis', 89.9]],
      against: 'Run defense', againstGrade: 85.6, againstPlayers: [['Roquan Smith', 87.5], ['Trenton Simpson', 84.2]],
      edge: -2.5, size: 'even',
    },
    {
      unit: 'Quarterback', grade: 83.0, players: [['Bryce Young', 83.0]],
      against: 'Pass defense', againstGrade: 83.1, againstPlayers: [['Kyle Hamilton', 92.6], ['Trey Hendrickson', 85.7]],
      edge: 0.9, size: 'even',
    },
    {
      unit: 'Receivers', grade: 81.5, players: [['Tetairoa McMillan', 88.6], ['Darren Waller', 83.4]],
      against: 'Coverage', againstGrade: 81.9, againstPlayers: [['Kyle Hamilton', 92.6], ['Nate Wiggins', 79.3]],
      edge: -0.5, size: 'even',
    },
    {
      unit: 'Pass protection', grade: 81.3, players: [['Damien Lewis', 89.9], ['Taylor Moton', 84.0]],
      against: 'Pass rush', againstGrade: 84.2, againstPlayers: [['Trey Hendrickson', 85.7], ['Calais Campbell', 81.5]],
      edge: 0.2, size: 'even',
    },
  ],
  /** League rank of 32 at each position group: [group, home, away]. */
  groups: [
    { side: 'Offense', cells: [['QB', 15, 3], ['RB', 12, 16], ['WR', 18, 27], ['TE', 12, 17], ['OT', 14, 28], ['IOL', 13, 17]] },
    { side: 'Defense', cells: [['EDGE', 26, 17], ['IDL', 22, 10], ['LB', 8, 6], ['CB', 22, 16], ['S', 17, 10]] },
  ],
  overall: { home: [20, 81.4], away: [10, 83.6] },
  note: 'Ranks rate each team’s season roster, so Baltimore’s still count Lamar Jackson, who is on injured reserve, and two defensive starters who were inactive on Sunday.',
};

/** The football week as the board runs it. */
export const CLOCK = [
  { when: 'Three days out', what: 'Hourly updates begin', body: 'Every game is priced across the sportsbooks. From here to kickoff, the board refreshes about once an hour.' },
  { when: 'When a price is good', what: 'A pick locks', body: 'The line, the price, the sportsbook and the time are saved. That ticket is the one that gets graded.' },
  { when: 'A day before kickoff', what: 'Every lean is saved', body: 'A side and a total on every game, on the record, whether or not we recommend it.' },
  { when: 'The last 25 minutes', what: 'Eight-minute checks', body: 'The board rechecks every eight minutes, so late injury news and line moves show up on the board before the ball is kicked.' },
  { when: 'The next morning', what: 'Graded in public', body: 'Each pick is settled in units and measured against the closing line, wins and losses both.' },
];

/** What else is in the NFL section. */
export const ALSO = [
  ['Weekly briefing', 'The slate in plain English: what matters this week and why.'],
  ['Team pages', 'Every starter rated, each position group ranked against the league.'],
  ['Game matchup pages', 'Unit against unit for all of the week’s games.'],
  ['Stadium flyovers', 'An aerial pass over the stadium, with roof and kickoff weather.'],
  ['Super Bowl odds', 'Playoff and title chances, updated as results come in.'],
  ['Injuries and news', 'Quarterback status on every game card, and the headlines behind it.'],
];
