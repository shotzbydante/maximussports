/**
 * Tournament helpers — reusable utilities for March Madness intelligence.
 *
 * Supports two data modes:
 *   1. PROJECTED — pre-Selection Sunday, uses PROJECTED_FIELD
 *   2. OFFICIAL  — post-Selection Sunday, uses live bracket data
 *
 * Call `setOfficialBracketData(bracket)` once the official bracket loads
 * to switch all downstream lookups from projected to official.
 *
 * All exported functions read from whichever source is active.
 * Surfaces that consume this module (Content Studio, Upset Radar, emails,
 * seed breakdowns) automatically get the correct data.
 */

import { PROJECTED_FIELD } from '../data/projectedField';
import { REGIONS, SEED_MATCHUP_ORDER } from '../config/bracketology';
import { resolveBracketMatchup, warnUniformBatch } from './bracketMatchupResolver';
import { getTournamentPrior, TOURNAMENT_PRIOR_META } from './tournamentPrior';

// ── Internal state: active tournament field ───────────────────────
let _activeField = PROJECTED_FIELD;
let _activeMode = 'projected';

let _seedBySlug = {};
let _seedByName = {};
let _teamsByRegion = {};
let _teamsBySeed = {};
let _allTournamentSlugs = new Set();

function rebuildLookups(field) {
  _seedBySlug = {};
  _seedByName = {};
  _teamsByRegion = {};
  _teamsBySeed = {};
  _allTournamentSlugs = new Set();

  for (const t of field) {
    _seedBySlug[t.slug] = t.seed;
    _seedByName[t.name.toLowerCase()] = t.seed;
    if (t.shortName) _seedByName[t.shortName.toLowerCase()] = t.seed;

    if (!_teamsByRegion[t.region]) _teamsByRegion[t.region] = [];
    _teamsByRegion[t.region].push(t);

    if (!_teamsBySeed[t.seed]) _teamsBySeed[t.seed] = [];
    _teamsBySeed[t.seed].push(t);

    _allTournamentSlugs.add(t.slug);
  }
}

// Initialize with projected field
rebuildLookups(PROJECTED_FIELD);

/**
 * Switch tournament helpers to use official bracket data.
 * Call this once the official ESPN bracket is loaded.
 *
 * Extracts the flat team list from bracket.regions[].matchups[] and
 * rebuilds all lookup maps so every downstream function uses official data.
 *
 * @param {object} bracket — official bracket with .regions[].matchups[]
 * @returns {boolean} true if switch succeeded
 */
export function setOfficialBracketData(bracket) {
  if (!bracket?.regions || bracket.regions.length === 0) return false;

  const teams = [];
  for (const region of bracket.regions) {
    for (const matchup of (region.matchups || [])) {
      for (const team of [matchup.topTeam, matchup.bottomTeam]) {
        if (!team || team.isPlaceholder || !team.slug) continue;
        teams.push({
          slug: team.slug,
          name: team.name || team.shortName || team.slug,
          shortName: team.shortName || team.name || team.slug,
          seed: team.seed,
          region: team.region || region.name,
          conference: team.conference || null,
          record: team.record || null,
          logo: team.logo || null,
          teamId: team.teamId || null,
        });
      }
    }
  }

  if (teams.length === 0) {
    console.warn(`[tournamentHelpers] Official bracket has 0 teams — keeping projected field`);
    return false;
  }

  if (teams.length < 32) {
    console.warn(`[tournamentHelpers] Official bracket has only ${teams.length} teams — accepting partial data`);
  }

  _activeField = teams;
  _activeMode = teams.length >= 64 ? 'official' : 'official_partial';
  rebuildLookups(teams);
  console.log(`[tournamentHelpers] Switched to ${_activeMode} bracket data (${teams.length} teams)`);
  return true;
}

/**
 * Reset to projected field (useful for testing or pre-Selection state).
 */
export function resetToProjectedField() {
  _activeField = PROJECTED_FIELD;
  _activeMode = 'projected';
  rebuildLookups(PROJECTED_FIELD);
}

/**
 * Returns the current data mode: 'projected' or 'official'.
 */
export function getTournamentDataMode() {
  return _activeMode;
}

/**
 * Returns the active tournament field (flat array of team objects).
 */
export function getActiveTournamentField() {
  return _activeField;
}

/**
 * Look up a team's tournament seed by slug or name.
 * Returns null for non-tournament teams.
 */
export function getTeamSeed(slugOrName) {
  if (!slugOrName) return null;
  if (_seedBySlug[slugOrName] != null) return _seedBySlug[slugOrName];
  const lower = slugOrName.toLowerCase().trim();
  if (_seedByName[lower] != null) return _seedByName[lower];
  for (const key of Object.keys(_seedByName)) {
    if (lower.includes(key) || key.includes(lower)) return _seedByName[key];
  }
  return null;
}

/**
 * Get full tournament team data by slug.
 */
export function getTournamentTeam(slug) {
  if (!slug) return null;
  return _activeField.find(t => t.slug === slug) || null;
}

/**
 * Returns true if the team is in the tournament field.
 */
export function isTournamentTeam(slugOrName) {
  return getTeamSeed(slugOrName) != null;
}

/**
 * Returns true if a game involves two tournament teams.
 */
export function isTournamentGame(game) {
  if (!game) return false;
  const awaySlug = game.awaySlug || game.awayTeamSlug || null;
  const homeSlug = game.homeSlug || game.homeTeamSlug || null;
  const awayName = game.awayTeam || '';
  const homeName = game.homeTeam || '';
  return isTournamentTeam(awaySlug || awayName) && isTournamentTeam(homeSlug || homeName);
}

/**
 * Get all tournament teams grouped by region.
 * Returns { East: [...], West: [...], South: [...], Midwest: [...] }
 */
export function groupTeamsByRegion() {
  const result = {};
  for (const region of REGIONS) {
    result[region] = (_teamsByRegion[region] || []).sort((a, b) => a.seed - b.seed);
  }
  return result;
}

/**
 * Get all Round 1 matchups grouped by region.
 * Each matchup: { topSeed, bottomSeed, topTeam, bottomTeam, region, matchupLabel }
 */
export function getFirstRoundMatchupsByRegion() {
  const result = {};
  for (const region of REGIONS) {
    const teams = _teamsByRegion[region] || [];
    const bySeed = {};
    for (const t of teams) bySeed[t.seed] = t;

    result[region] = SEED_MATCHUP_ORDER.map(([topSeed, bottomSeed]) => ({
      topSeed,
      bottomSeed,
      topTeam: bySeed[topSeed] || null,
      bottomTeam: bySeed[bottomSeed] || null,
      region,
      matchupLabel: `#${topSeed} vs #${bottomSeed}`,
    }));
  }
  return result;
}

/**
 * Get all games matching a specific seed line.
 * E.g. getSeedLineMatchups(1) returns all four #1 vs #16 matchups.
 */
export function getSeedLineMatchups(seed) {
  if (seed < 1 || seed > 16) return [];
  const oppSeed = 17 - seed;
  const topSeed = Math.min(seed, oppSeed);
  const bottomSeed = Math.max(seed, oppSeed);

  const result = [];
  for (const region of REGIONS) {
    const teams = _teamsByRegion[region] || [];
    const bySeed = {};
    for (const t of teams) bySeed[t.seed] = t;

    if (bySeed[topSeed] && bySeed[bottomSeed]) {
      result.push({
        topSeed,
        bottomSeed,
        topTeam: bySeed[topSeed],
        bottomTeam: bySeed[bottomSeed],
        region,
        matchupLabel: `#${topSeed} vs #${bottomSeed}`,
      });
    }
  }
  return result;
}

/**
 * Get matchups for a specific seed-pair preset (e.g. "5v12", "8v9").
 */
export function getSeedPairMatchups(highSeed, lowSeed) {
  const result = [];
  for (const region of REGIONS) {
    const teams = _teamsByRegion[region] || [];
    const bySeed = {};
    for (const t of teams) bySeed[t.seed] = t;

    if (bySeed[highSeed] && bySeed[lowSeed]) {
      result.push({
        topSeed: highSeed,
        bottomSeed: lowSeed,
        topTeam: bySeed[highSeed],
        bottomTeam: bySeed[lowSeed],
        region,
        matchupLabel: `#${highSeed} vs #${lowSeed}`,
      });
    }
  }
  return result;
}

// ── Seed-line preset definitions ──────────────────────────────────
export const SEED_LINE_PRESETS = [
  { id: '1-seeds',  label: 'All No. 1 Seeds',   seeds: [1, 16], icon: '👑' },
  { id: '2-seeds',  label: 'All No. 2 Seeds',   seeds: [2, 15], icon: '🔥' },
  { id: '3-seeds',  label: 'All No. 3 Seeds',   seeds: [3, 14], icon: '⚡' },
  { id: '4-seeds',  label: 'All No. 4 Seeds',   seeds: [4, 13], icon: '🎯' },
  { id: '5-seeds',  label: 'All No. 5 Seeds',   seeds: [5, 12], icon: '💥' },
  { id: '6-seeds',  label: 'All No. 6 Seeds',   seeds: [6, 11], icon: '🔮' },
  { id: '7-seeds',  label: 'All No. 7 Seeds',   seeds: [7, 10], icon: '⚔️' },
  { id: '8v9',      label: 'All 8/9 Matchups',   seeds: [8, 9],  icon: '🪙' },
  { id: 'upset',    label: 'Upset Radar',        seeds: null,    icon: '🚨' },
];

/**
 * Get matchups for a preset by ID. Returns array of matchup objects.
 */
export function getPresetMatchups(presetId) {
  if (presetId === 'upset') return getUpsetRadarGames();
  const preset = SEED_LINE_PRESETS.find(p => p.id === presetId);
  if (!preset || !preset.seeds) return [];
  return getSeedPairMatchups(preset.seeds[0], preset.seeds[1]);
}

// ── Historical upset rates (re-exported for convenience) ──────────
export const HISTORICAL_UPSET_RATES = {
  '1v16': { rate: 0.02, label: '~2%',  description: 'Near-certain favorite' },
  '2v15': { rate: 0.08, label: '~8%',  description: 'Rare but memorable' },
  '3v14': { rate: 0.15, label: '~15%', description: 'Occasional upsets' },
  '4v13': { rate: 0.22, label: '~22%', description: 'Dangerous matchup' },
  '5v12': { rate: 0.36, label: '~36%', description: 'Iconic upset spot' },
  '6v11': { rate: 0.37, label: '~37%', description: 'Consistently volatile' },
  '7v10': { rate: 0.40, label: '~40%', description: 'Near coin flip territory' },
  '8v9':  { rate: 0.49, label: '~49%', description: 'Virtual coin flip' },
};

/**
 * Get the historical upset rate for a seed matchup.
 */
export function getHistoricalUpsetRate(highSeed, lowSeed) {
  const key = `${Math.min(highSeed, lowSeed)}v${Math.max(highSeed, lowSeed)}`;
  return HISTORICAL_UPSET_RATES[key] || null;
}

// ── Upset Radar ───────────────────────────────────────────────────
const UPSET_BANDS = [
  { high: 5, low: 12 },
  { high: 6, low: 11 },
  { high: 7, low: 10 },
  { high: 4, low: 13 },
  { high: 3, low: 14 },
  { high: 8, low: 9 },
];

/**
 * Get the top upset radar games, ranked by upset probability.
 * Uses historical priors + model context for ranking.
 */
export function getUpsetRadarGames(context = {}) {
  const candidates = [];

  for (const band of UPSET_BANDS) {
    const matchups = getSeedPairMatchups(band.high, band.low);
    for (const m of matchups) {
      if (!m.topTeam || !m.bottomTeam) continue;

      const prior = getTournamentPrior(m.topSeed, m.bottomSeed, 1, 0);
      const historicalRate = prior.historicalUpsetRate ?? 0;
      const rateInfo = getHistoricalUpsetRate(m.topSeed, m.bottomSeed);

      let modelResult = null;
      if (context.rankMap || context.championshipOdds || context.atsBySlug) {
        modelResult = resolveBracketMatchup(
          m.topTeam, m.bottomTeam, context, { round: 1 },
        );
      }

      const upsetProbability = modelResult
        ? (modelResult.isUpset ? modelResult.winProbability : 1 - modelResult.winProbability)
        : historicalRate;

      candidates.push({
        ...m,
        historicalRate,
        rateInfo,
        upsetProbability,
        modelResult,
        isUpsetPick: modelResult?.isUpset ?? false,
      });
    }
  }

  candidates.sort((a, b) => b.upsetProbability - a.upsetProbability);
  return candidates.slice(0, 8);
}

/**
 * Generate a tournament insight for a single matchup.
 * Returns { winner, loser, confidence, confidenceLabel, signals, rationale,
 *           isUpset, winProbability, historicalContext, tournamentPrior }
 */
export function getTournamentInsight(matchup, context = {}) {
  if (!matchup?.topTeam || !matchup?.bottomTeam) return null;

  const modelResult = resolveBracketMatchup(
    matchup.topTeam, matchup.bottomTeam, context, { round: 1 },
  );

  const rateInfo = getHistoricalUpsetRate(matchup.topSeed, matchup.bottomSeed);

  const historicalContext = rateInfo
    ? `${matchup.topSeed}/${matchup.bottomSeed} seed matchups: ${rateInfo.label} historical upset rate (${rateInfo.description}).`
    : null;

  return {
    ...modelResult,
    matchup,
    historicalContext,
    historicalRate: rateInfo?.rate ?? null,
  };
}

/**
 * Generate batch tournament insights for an array of matchups.
 */
export function getBatchTournamentInsights(matchups, context = {}) {
  const results = matchups.map(m => getTournamentInsight(m, context)).filter(Boolean);
  warnUniformBatch(results, `tournament-insights (${matchups.length} matchups)`);
  return results;
}

export { TOURNAMENT_PRIOR_META };
