/**
 * NBA Season Leaders — canonical category registry.
 *
 * Single source of truth for the 5 NBA stat categories used in the Daily
 * Briefing slides + caption + team intel. Mirrors the MLB
 * `src/data/mlb/seasonLeaders.js` contract.
 *
 * `key` = ESPN core API category name (what we fetch with).
 * `label` = public display label shown on slides.
 * `abbrev` = compact label for dense layouts.
 * `icon` = caption emoji for the category header.
 */

export const LEADER_CATEGORIES = [
  { key: 'avgPoints',        label: 'Points Per Game',   abbrev: 'PPG', icon: '🔥' },
  { key: 'avgAssists',       label: 'Assists Per Game',  abbrev: 'APG', icon: '🎯' },
  { key: 'avgRebounds',      label: 'Rebounds Per Game', abbrev: 'RPG', icon: '💪' },
  { key: 'avgSteals',        label: 'Steals Per Game',   abbrev: 'SPG', icon: '⚡' },
  { key: 'avgBlocks',        label: 'Blocks Per Game',   abbrev: 'BPG', icon: '🛡️' },
];

export const LEADER_KEYS = LEADER_CATEGORIES.map(c => c.key);
