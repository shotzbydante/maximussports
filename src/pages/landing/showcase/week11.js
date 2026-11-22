/**
 * Real examples for the guest landing page, captured from production on
 * Sunday, November 22, 2026 (NFL Week 11, model nfl-picks-v2.2.0).
 *
 * Everything here was on screen in the app that morning: the pick as it was
 * locked, the calls as the "Every game" tabs ranked them, and the roster
 * talent matchup for Arizona at Kansas City. It is a snapshot, so the page
 * labels it with the week. Refresh it from /api/nfl/picks/built and
 * /api/nfl/talent when the examples get old.
 *
 * Left out on purpose: thresholds, weights, tiers, how a fair price is
 * built, and the Madden and PFF inputs behind a talent score.
 */

const logo = (code) => `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`;

export const TEAMS = {
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

/** The pick ticket, as locked. */
export const TICKET = {
  away: { ...TEAMS.ARI, record: '3-7' },
  home: { ...TEAMS.KC, record: '7-2' },
  kickoff: 'Sun 1:00 PM ET',
  network: 'CBS',
  venue: 'GEHA Field at Arrowhead Stadium',
  city: 'Kansas City, MO',
  conditions: 'Outdoors, 15 mph wind, 47°F',
  lines: [
    { market: 'Spread', value: 'KC -15.5' },
    { market: 'Moneyline', value: 'KC -1500', sub: 'ARI +900' },
    { market: 'Over/under', value: '40.5', picked: true },
  ],
  pick: 'Under 40.5',
  price: '-105',
  book: 'DraftKings',
  conviction: 79,
  locked: 'Locked Sat 11:02 PM ET',
  value: '+4.7%',
  why: 'DraftKings paid -105 on the under. Across 12 sportsbooks, the fair price was -116.',
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

/** Arizona at Kansas City: unit against unit when the Chiefs have the ball. */
export const MATCHUP = {
  away: TEAMS.ARI,
  home: TEAMS.KC,
  lean: 'Roster talent leans to the Chiefs. The biggest gap: Kansas City’s quarterback against Arizona’s pass defense.',
  offense: TEAMS.KC,
  defense: TEAMS.ARI,
  rows: [
    {
      unit: 'Quarterback', grade: 89.8, players: [['Patrick Mahomes', 89.8]],
      against: 'Pass defense', againstGrade: 76.9, againstPlayers: [['Josh Sweat', 83.4], ['Budda Baker', 81.3]],
      edge: 13.9, size: 'big',
    },
    {
      unit: 'Receivers', grade: 86.1, players: [['Travis Kelce', 93.4], ['Rashee Rice', 86.9]],
      against: 'Coverage', againstGrade: 73.5, againstPlayers: [['Budda Baker', 81.3], ['Will Johnson', 77.0]],
      edge: 12.5, size: 'big',
    },
    {
      unit: 'Run game', grade: 83.1, players: [['Kenneth Walker', 97.4], ['Trey Smith', 92.9]],
      against: 'Run defense', againstGrade: 75.0, againstPlayers: [['Andrew Billings', 77.5], ['Mack Wilson Sr', 73.4]],
      edge: 9.4, size: 'big',
    },
    {
      unit: 'Pass protection', grade: 80.3, players: [['Creed Humphrey', 91.5], ['Josh Simmons', 80.0]],
      against: 'Pass rush', againstGrade: 80.2, againstPlayers: [['Josh Sweat', 83.4], ['Zaven Collins', 80.7]],
      edge: 3.2, size: 'edge',
    },
  ],
  /** League rank of 32 at each position group. */
  groups: [
    { side: 'Offense', cells: [['QB', 6, 27], ['RB', 1, 22], ['WR', 11, 26], ['TE', 4, 3], ['OT', 29, 16], ['IOL', 2, 14]] },
    { side: 'Defense', cells: [['EDGE', 20, 23], ['IDL', 19, 28], ['LB', 3, 32], ['CB', 5, 32], ['S', 27, 21]] },
  ],
  overall: { home: [5, 84.1], away: [28, 77.1] },
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
