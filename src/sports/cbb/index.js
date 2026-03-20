/**
 * CBB sport adapter — re-exports existing college basketball logic.
 *
 * This adapter layer lets shared components import from a sport-neutral
 * path while the actual logic remains in its current locations.
 * Over time, CBB-specific code can be consolidated here.
 */

export { TEAMS, getTeamBySlug, getTeamsGroupedByConference } from '../../data/teams';
export { fetchHomeFast, fetchHomeSlow, mergeHomeData } from '../../api/home';
export { fetchTeamPage } from '../../api/team';
export { mergeGamesWithOdds } from '../../api/odds';
export { buildMaximusPicks, buildPicksSummary } from '../../utils/maximusPicksModel';
