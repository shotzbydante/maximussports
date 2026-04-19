/**
 * Pure grouping helpers for picks rendering.
 *
 *   groupByMatchup(picks)          — one card per (gameId); primary pick = best bet-score;
 *                                    others become compact "siblings" on the same card.
 *   annotateDoubleheaders(picks)   — when two games share (awaySlug, homeSlug, slateDate)
 *                                    tag them Game 1 / Game 2 by startTime ordering.
 *   groupByMarketType(picks)       — for subsection rendering inside a tier.
 *
 * Deterministic: stable sort by (bet_score desc, original index asc).
 */

const MARKET_ORDER = { moneyline: 0, runline: 1, total: 2 };
const MARKET_LABEL_SINGULAR = {
  moneyline: "Pick 'Em",
  runline: 'Spread',
  total: 'Total',
};
const MARKET_LABEL_PLURAL = {
  moneyline: "Pick 'Ems",
  runline: 'Spreads',
  total: 'Game Totals',
};
// Tier-3 moneylines carry the "Value Leans" product label instead.
const VALUE_LEAN_LABEL = 'Value Leans';
const VALUE_LEAN_LABEL_SINGULAR = 'Value Lean';

/**
 * Choose the label for a market-type subgroup, with a tier-aware twist:
 * Tier-3 moneylines are the product's "Value Leans".
 */
export function subgroupLabel(marketType, tier, count = 2) {
  const plural = count !== 1;
  if (marketType === 'moneyline' && tier === 'tier3') {
    return plural ? VALUE_LEAN_LABEL : VALUE_LEAN_LABEL_SINGULAR;
  }
  return plural ? MARKET_LABEL_PLURAL[marketType] || marketType
                : MARKET_LABEL_SINGULAR[marketType] || marketType;
}

/**
 * Group picks by gameId. Returns a Map keyed by gameId containing:
 *   { primary, siblings: [...] }
 *
 * primary = highest bet-score pick for the game.
 * siblings = remaining picks for the same game, sorted by bet-score desc.
 *
 * @param {Array} picks - array of canonical v2 picks with .gameId, .betScore
 * @returns {Array<{ primary, siblings }>} — preserves the original tier order
 *          (first-pick-per-game wins the slot) so the tier sort is respected.
 */
export function groupByMatchup(picks = []) {
  const byGame = new Map();
  picks.forEach((p, idx) => {
    const key = p?.gameId || p?.id;
    if (!key) return;
    if (!byGame.has(key)) {
      byGame.set(key, { _order: idx, picks: [] });
    }
    byGame.get(key).picks.push(p);
  });

  const result = [];
  for (const [, entry] of byGame) {
    const sorted = entry.picks
      .slice()
      .sort((a, b) => (b.betScore?.total ?? 0) - (a.betScore?.total ?? 0));
    result.push({
      _order: entry._order,
      primary: sorted[0],
      siblings: sorted.slice(1),
    });
  }
  result.sort((a, b) => a._order - b._order);
  return result.map(({ primary, siblings }) => ({ primary, siblings }));
}

/**
 * Detect doubleheaders within a list of picks and attach { game: 1 | 2 } to
 * each pick for UI to render a "Game 1 / Game 2" annotation.
 *
 * A doubleheader is two distinct gameIds that share (awaySlug, homeSlug) on
 * the same slateDate. Ordered by startTime ascending.
 *
 * Mutates a copy; returns the annotated list.
 */
export function annotateDoubleheaders(picks = [], { slateDate = null } = {}) {
  const dateKey = p => {
    if (slateDate) return slateDate;
    const iso = p.matchup?.startTime;
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
    } catch { return iso.slice(0, 10); }
  };

  // Map (away|home|date) → set of gameIds
  const matchupIndex = new Map();
  for (const p of picks) {
    const away = p.matchup?.awayTeam?.slug;
    const home = p.matchup?.homeTeam?.slug;
    if (!away || !home) continue;
    const key = `${away}|${home}|${dateKey(p)}`;
    if (!matchupIndex.has(key)) matchupIndex.set(key, new Map());
    const gameMap = matchupIndex.get(key);
    if (!gameMap.has(p.gameId)) {
      gameMap.set(p.gameId, p.matchup?.startTime || '');
    }
  }

  // For any matchup key with >1 distinct gameId, compute game ordinal
  const gameOrdinal = new Map(); // gameId → ordinal (1-based)
  for (const [, gameMap] of matchupIndex) {
    if (gameMap.size < 2) continue;
    const ordered = Array.from(gameMap.entries())
      .sort(([, t1], [, t2]) => String(t1).localeCompare(String(t2)));
    ordered.forEach(([gid], i) => gameOrdinal.set(gid, i + 1));
  }

  if (gameOrdinal.size === 0) return picks;

  return picks.map(p => {
    const g = gameOrdinal.get(p.gameId);
    if (!g) return p;
    return { ...p, _doubleheaderGame: g };
  });
}

/**
 * Group picks by market_type for tier-internal subsection rendering.
 * Returns an array of { marketType, picks } in canonical order (ML → RL → Total).
 */
export function groupByMarketType(matchupCards = []) {
  const byMarket = new Map();
  for (const card of matchupCards) {
    const primary = card.primary || card;
    const m = primary?.market?.type || primary?.pick?.marketType;
    if (!m) continue;
    if (!byMarket.has(m)) byMarket.set(m, []);
    byMarket.get(m).push(card);
  }
  const out = [];
  const keys = Array.from(byMarket.keys()).sort(
    (a, b) => (MARKET_ORDER[a] ?? 99) - (MARKET_ORDER[b] ?? 99)
  );
  for (const k of keys) out.push({ marketType: k, cards: byMarket.get(k) });
  return out;
}
