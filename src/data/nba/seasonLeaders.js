/**
 * NBA Season Leaders — canonical category registry.
 *
 * Single source of truth for the 5 NBA stat categories used in the Daily
 * Briefing slides + caption + team intel.
 *
 * Postseason values are PER-GAME AVERAGES (PPG / APG / RPG / SPG / BPG),
 * mirroring the ESPN postseason leaders editorial table. Display uses
 * one decimal place. The slide abbrev stays compact (PTS / AST / REB /
 * STL / BLK) so the layout stays readable; the underlying value carries
 * the per-game average.
 *
 *   `key` = internal category key.
 *   `label` = public display label.
 *   `abbrev` = compact label for dense layouts (PTS/AST/REB/STL/BLK).
 *   `icon` = caption emoji.
 *   `espnAlt` = alternate ESPN category names — averages first, totals
 *               kept for back-compat in case ESPN renames mid-season.
 */

export const LEADER_CATEGORIES = [
  { key: 'pts', label: 'Points',   abbrev: 'PTS', icon: '🔥', espnAlt: ['avgPoints',   'pointsPerGame',   'points',   'totalPoints']   },
  { key: 'ast', label: 'Assists',  abbrev: 'AST', icon: '🎯', espnAlt: ['avgAssists',  'assistsPerGame',  'assists',  'totalAssists']  },
  { key: 'reb', label: 'Rebounds', abbrev: 'REB', icon: '💪', espnAlt: ['avgRebounds', 'reboundsPerGame', 'rebounds', 'totalRebounds'] },
  { key: 'stl', label: 'Steals',   abbrev: 'STL', icon: '⚡', espnAlt: ['avgSteals',   'stealsPerGame',   'steals',   'totalSteals']   },
  { key: 'blk', label: 'Blocks',   abbrev: 'BLK', icon: '🛡️', espnAlt: ['avgBlocks',   'blocksPerGame',   'blocks',   'totalBlocks']   },
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
