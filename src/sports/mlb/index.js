/**
 * MLB sport adapter.
 *
 * Provides MLB-specific data access, team registry, and normalization.
 * This is the single entry point for MLB-specific logic; shared
 * components should never import CBB modules when in MLB context.
 */

export { MLB_TEAMS, MLB_DIVISIONS, getMLBTeamBySlug, getMLBTeamsGroupedByDivision } from './teams';
