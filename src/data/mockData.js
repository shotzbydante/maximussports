/**
 * Mock data for March Madness Intelligence Hub MVP
 */

export const dailyReport = {
  date: '2025-03-20',
  headline: 'UConn & Duke Lead Field as Bracket Chaos Looms',
  summary: 'Defending champ UConn remains the favorite while Duke surges. Upset watch on mid-major sleepers.',
  keyInsights: [
    { label: 'Top Threat', value: 'UConn', trend: 'up' },
    { label: 'Bracket Buster', value: 'Saint Mary\'s', trend: 'up' },
    { label: 'Overrated', value: 'Kentucky', trend: 'down' },
  ],
};

export const topMatchups = [
  {
    id: '1',
    home: { name: 'UConn', seed: 1, record: '28-3', logo: null },
    away: { name: 'Vermont', seed: 16, record: '22-8', logo: null },
    spread: '-22.5',
    overUnder: 142.5,
    tipTime: '7:10 PM ET',
    channel: 'TBS',
    upsetAlert: false,
  },
  {
    id: '2',
    home: { name: 'Duke', seed: 2, record: '26-5', logo: null },
    away: { name: 'Colgate', seed: 15, record: '24-9', logo: null },
    spread: '-18.0',
    overUnder: 138.0,
    tipTime: '2:45 PM ET',
    channel: 'CBS',
    upsetAlert: false,
  },
  {
    id: '3',
    home: { name: 'San Diego St', seed: 5, record: '24-7', logo: null },
    away: { name: 'UAB', seed: 12, record: '21-10', logo: null },
    spread: '-4.5',
    overUnder: 131.5,
    tipTime: '9:40 PM ET',
    channel: 'truTV',
    upsetAlert: true,
  },
];

export const oddsMovement = [
  { team: 'UConn vs Vermont', open: '-20.5', current: '-22.5', movement: 'down' },
  { team: 'Duke vs Colgate', open: '-16.0', current: '-18.0', movement: 'down' },
  { team: 'SDSU vs UAB', open: '-6.0', current: '-4.5', movement: 'up' },
  { team: 'Houston vs Longwood', open: '-23.0', current: '-21.5', movement: 'up' },
];

export const newsFeed = [
  {
    id: 'n1',
    title: 'Zach Edey reportedly cleared for tournament',
    source: 'ESPN',
    time: '2h ago',
    sentiment: 'positive',
    excerpt: 'Purdue center expected to play full minutes after minor knee scare.',
  },
  {
    id: 'n2',
    title: 'Jay Wright: "Kentucky is the most vulnerable 2-seed"',
    source: 'The Athletic',
    time: '4h ago',
    sentiment: 'negative',
    excerpt: 'Former Villanova coach sounds alarm on Wildcats\' defense.',
  },
  {
    id: 'n3',
    title: 'Bracketology: Last four in, first four out',
    source: 'CBS Sports',
    time: '6h ago',
    sentiment: 'neutral',
    excerpt: 'Bubble teams sweating Selection Sunday with 48 hours to go.',
  },
];

export const redditSentiment = [
  { team: 'UConn', subreddit: 'r/CollegeBasketball', sentiment: 0.78, posts: 124 },
  { team: 'Duke', subreddit: 'r/CollegeBasketball', sentiment: 0.65, posts: 98 },
  { team: 'Houston', subreddit: 'r/CollegeBasketball', sentiment: 0.72, posts: 67 },
  { team: 'Kentucky', subreddit: 'r/CollegeBasketball', sentiment: 0.42, posts: 156 },
];

export const statCards = [
  { label: 'Upset Alerts Today', value: 3, trend: 'up', subtext: '12-seed games' },
  { label: 'Avg Spread Movement', value: '2.1 pts', trend: 'neutral', subtext: 'Sharp action' },
  { label: 'Bracket Filled', value: '94%', trend: 'up', subtext: 'vs 89% last year' },
  { label: 'News Velocity', value: 47, trend: 'up', subtext: 'Headlines today' },
];

export const rankingsContext = {
  apTop5: ['UConn', 'Houston', 'Purdue', 'Arizona', 'Tennessee'],
  bracketFavorites: ['UConn', 'Duke', 'Houston', 'Purdue'],
  biggestMovers: [
    { team: 'Saint Mary\'s', direction: 'up', spots: 3 },
    { team: 'Kentucky', direction: 'down', spots: 2 },
  ],
};
