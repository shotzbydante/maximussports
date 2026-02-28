/**
 * ESPN Gamecast URL utility — men's college basketball.
 *
 * resolveGamecastUrl() prefers an ESPN-provided links[] entry when present
 * on the game object (rel: 'gamecast'), falling back to a constructed URL
 * from the numeric gameId. This means no new API calls are needed — the
 * utility works purely with data already present in the game object.
 */

const GAMECAST_BASE = 'https://www.espn.com/mens-college-basketball/game/_/gameId';

/**
 * Build the ESPN Gamecast URL from a raw game ID.
 * @param {string|number|null|undefined} gameId - ESPN event ID
 * @returns {string|null}
 */
export function getGamecastUrl(gameId) {
  if (!gameId) return null;
  return `${GAMECAST_BASE}/${gameId}`;
}

/**
 * Resolve the best Gamecast URL from a game data object.
 *
 * Checks game.links[] first (prefers rel='gamecast', then rel='summary' or
 * rel='event'), then falls back to constructing the URL from game.gameId.
 *
 * @param {{ gameId?: string|number, links?: Array<{rel?: string[], href?: string}> }|null} game
 * @returns {string|null}
 */
export function resolveGamecastUrl(game) {
  if (!game) return null;

  // Prefer ESPN-provided link
  if (Array.isArray(game.links) && game.links.length > 0) {
    const preferred = game.links.find(
      (l) => l.href && Array.isArray(l.rel) && l.rel.some((r) => r === 'gamecast')
    );
    if (preferred?.href) return preferred.href;

    const secondary = game.links.find(
      (l) =>
        l.href &&
        Array.isArray(l.rel) &&
        l.rel.some((r) => r === 'summary' || r === 'event')
    );
    if (secondary?.href) return secondary.href;
  }

  return getGamecastUrl(game.gameId);
}
