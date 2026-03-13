/**
 * Trusted sports publisher allowlist for YouTube relevance scoring.
 * Channel names are matched case-insensitively.
 */
export const ALLOWLIST = [
  // National broadcast networks
  'ESPN',
  'CBS Sports',
  'CBS Sports HQ',
  'FOX Sports',
  'NBC Sports',
  'Bleacher Report',
  'The Athletic',
  // Conference networks (premium regional coverage)
  'Big Ten Network',
  'ACC Network',
  'SEC Network',
  'Pac-12 Networks',
  'Big 12 Conference',
  'Big East Conference',
  // National talk / premium digital
  'The Rich Eisen Show',
  'Stadium',
  'On3',
];

/**
 * Betting-specific channel allowlist for the Betting Intel feed.
 * Includes sportsbook media, betting shows, and picks-oriented channels.
 */
export const BETTING_ALLOWLIST = [
  ...ALLOWLIST,
  'ESPN BET',
  'DraftKings',
  'DraftKings Network',
  'FanDuel',
  'FanDuel TV',
  'Caesars Sportsbook',
  'BetMGM',
  'Action Network',
  'VSiN',
  'Bet365',
  'WagerTalk',
  'Odds Shark',
  'The Action Network',
  'Pat McAfee',
  'Barstool Sports',
  'Penn Entertainment',
  'Covers',
  'Pick Dawgz',
  'Sportsbook Review',
];
