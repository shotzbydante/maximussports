/**
 * Build a finals lookup map for one slate's grading pass.
 *
 * Returns:
 *   {
 *     map:           Map<gameId, finalGame>     // primary index
 *     bySlugPair:    Map<"a|b", finalGame>      // fallback index
 *     resolveFor:    (pick) => finalGame | null // game-id first, slug-pair fallback
 *     fallbackHits:  Array<{pickId, espnGameId, pair}>  // slug-pair fallbacks taken
 *     crossDateRejections: Array<{pickId, slateDate, finalDate, pair}>
 *   }
 *
 * Cross-date safety:
 *   When a slug-pair fallback hit's final.startTime resolves to a DIFFERENT
 *   ET day than the pick's slate_date, the fallback is rejected. This is the
 *   defense against repeat playoff matchups (e.g. HOU/LAL Game 5 on date A
 *   vs Game 6 on date B) being silently cross-graded if upstream data is
 *   ever wrong.
 *
 *   The current pipeline only loads one date's finals into this map, so the
 *   guard is technically defense-in-depth — but it makes the contract
 *   explicit and prevents future regressions if the caller starts loading
 *   multi-day windows.
 */

import { etDayFromISO } from './dateWindows.js';

function slugPairKey(a, b) {
  const ax = String(a || '').toLowerCase();
  const bx = String(b || '').toLowerCase();
  return ax < bx ? `${ax}|${bx}` : `${bx}|${ax}`;
}

export { slugPairKey };

export function buildFinalsIndex(finals) {
  const map = new Map();
  const bySlugPair = new Map();
  for (const g of finals || []) {
    if (g?.gameId) map.set(String(g.gameId), g);
    const aSlug = g?.teams?.away?.slug;
    const hSlug = g?.teams?.home?.slug;
    if (aSlug && hSlug) bySlugPair.set(slugPairKey(aSlug, hSlug), g);
  }
  return { map, bySlugPair };
}

/**
 * Resolve the right final for a single pick.
 *
 * @param {object} pick — picks-table row (game_id, away_team_slug, home_team_slug, slate_date, start_time)
 * @param {{ map, bySlugPair }} index — output of buildFinalsIndex
 * @param {{ slateDate?: string }} [opts] — slate context for cross-date guard
 * @returns {{ final: object|null, via: 'game_id'|'slug_pair'|null, rejectedReason?: string }}
 */
export function resolveFinalForPick(pick, index, opts = {}) {
  if (!pick) return { final: null, via: null };

  // 1) Primary: persisted ESPN game id.
  if (pick.game_id && index.map.has(String(pick.game_id))) {
    return { final: index.map.get(String(pick.game_id)), via: 'game_id' };
  }

  // 2) Fallback: unordered team-slug pair. Defends against legacy picks
  // persisted with non-ESPN game ids.
  const pair = slugPairKey(pick.away_team_slug, pick.home_team_slug);
  if (!pair || pair === '|') return { final: null, via: null };
  const candidate = index.bySlugPair.get(pair);
  if (!candidate) return { final: null, via: null };

  // 3) Cross-date safety. The candidate must belong to the same ET day as
  // the pick's slate_date. Otherwise repeat playoff matchups can silently
  // cross-grade (HOU/LAL Game 5 → Game 6 final, or vice versa).
  const slateDate = opts.slateDate || pick.slate_date || null;
  const finalDate = etDayFromISO(candidate.startTime);
  if (slateDate && finalDate && finalDate !== slateDate) {
    return {
      final: null,
      via: null,
      rejectedReason: 'cross_date_slug_pair',
      detail: { pickSlateDate: slateDate, finalDate, pair },
    };
  }

  return { final: candidate, via: 'slug_pair' };
}
