/**
 * NBA Season Leaders — canonical category registry.
 *
 * Single source of truth for the 5 NBA stat categories used in the Daily
 * Briefing slides + caption + team intel.
 *
 * UPDATED for postseason TOTALS (audit Part 1):
 *   The Daily Briefing now surfaces ABSOLUTE totals across the active
 *   playoff window — total points, total assists, total rebounds, total
 *   steals, total blocks. NOT per-game averages.
 *
 *   `key` = internal category key (also matches ESPN core API category
 *           names for the totals endpoints — `points`, `assists`, etc.)
 *   `label` = public display label.
 *   `abbrev` = compact label for dense layouts (PTS/AST/REB/STL/BLK).
 *   `icon` = caption emoji.
 *   `espnAlt` = alternate ESPN category names that also map to this
 *               same totals stat (e.g. ESPN sometimes uses
 *               `totalPoints` vs `points`).
 */

export const LEADER_CATEGORIES = [
  { key: 'pts', label: 'Points',   abbrev: 'PTS', icon: '🔥', espnAlt: ['points', 'totalPoints'] },
  { key: 'ast', label: 'Assists',  abbrev: 'AST', icon: '🎯', espnAlt: ['assists', 'totalAssists'] },
  { key: 'reb', label: 'Rebounds', abbrev: 'REB', icon: '💪', espnAlt: ['rebounds', 'totalRebounds'] },
  { key: 'stl', label: 'Steals',   abbrev: 'STL', icon: '⚡', espnAlt: ['steals', 'totalSteals'] },
  { key: 'blk', label: 'Blocks',   abbrev: 'BLK', icon: '🛡️', espnAlt: ['blocks', 'totalBlocks'] },
];

export const LEADER_KEYS = LEADER_CATEGORIES.map(c => c.key);

/**
 * Reverse map: ESPN category name → our canonical key.
 *   "points" → "pts"
 *   "totalPoints" → "pts"
 *   "rebounds" → "reb"
 * Used by the leaders builder to normalize whatever ESPN returns.
 */
export const ESPN_CATEGORY_MAP = (() => {
  const m = {};
  for (const c of LEADER_CATEGORIES) {
    m[c.key] = c.key;
    for (const alt of c.espnAlt) m[alt] = c.key;
  }
  return m;
})();
