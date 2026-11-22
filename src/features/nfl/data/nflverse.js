/**
 * nflverse → engine shapes. Pure: takes CSV text, returns plain objects.
 *
 * Source: https://github.com/nflverse/nflverse-data (CC BY 4.0).
 *   schedules/games.csv            results, closing lines, roof, weather, starting QBs
 *   stats_team/stats_team_week_Y   team EPA by game
 *   stats_player/stats_player_week_Y   quarterback EPA by game
 *
 * Team codes are nflverse's (LA for the Rams, LV, WAS). `NFLVERSE_TO_ABBREV`
 * maps the few that differ from the app's abbreviations.
 */

import { parseCsv, csvNum } from './csv.js';

export const NFLVERSE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
export const NFLVERSE_ATTRIBUTION = 'nflverse (CC BY 4.0)';

export const NFLVERSE_TO_ABBREV = Object.freeze({ LA: 'LAR', WAS: 'WSH' });
/** Franchises that moved or renamed inside the window the engine reads. */
const LEGACY_CODES = Object.freeze({ OAK: 'LV', SD: 'LAC', STL: 'LA' });

export function nflverseCode(code) {
  const c = String(code || '').toUpperCase();
  return LEGACY_CODES[c] || c;
}

const GAME_COLS = [
  'game_id', 'season', 'game_type', 'week', 'gameday', 'gametime', 'away_team', 'away_score',
  'home_team', 'home_score', 'location', 'espn', 'away_rest', 'home_rest',
  'away_moneyline', 'home_moneyline', 'spread_line', 'away_spread_odds', 'home_spread_odds',
  'total_line', 'under_odds', 'over_odds', 'div_game', 'roof', 'temp', 'wind',
  'away_qb_id', 'home_qb_id', 'away_qb_name', 'home_qb_name', 'away_coach', 'home_coach', 'stadium',
];

/**
 * @param {string} text  games.csv
 * @param {object} [opts]
 * @param {number} [opts.fromSeason]
 * @returns {Array<object>} one row per game, oldest first
 */
export function parseGames(text, { fromSeason = 0 } = {}) {
  const rows = parseCsv(text, { pick: GAME_COLS, filter: (r) => Number(r.season) >= fromSeason });
  return rows.map((r) => {
    const spreadLine = csvNum(r.spread_line);          // nflverse: positive = home favoured
    return {
      id: r.game_id,
      espnId: r.espn || null,
      season: Number(r.season),
      week: Number(r.week),
      type: r.game_type,                               // REG | WC | DIV | CON | SB
      date: r.gameday,
      time: r.gametime || null,
      home: nflverseCode(r.home_team),
      away: nflverseCode(r.away_team),
      homeScore: csvNum(r.home_score),
      awayScore: csvNum(r.away_score),
      neutral: r.location === 'Neutral',
      divisional: r.div_game === '1',
      roof: r.roof || null,                            // outdoors | dome | closed | open
      temp: csvNum(r.temp),
      wind: csvNum(r.wind),
      homeRest: csvNum(r.home_rest),
      awayRest: csvNum(r.away_rest),
      spreadHome: spreadLine == null ? null : -spreadLine,   // home line: -3.5 = home favoured
      spreadHomePrice: csvNum(r.home_spread_odds),
      spreadAwayPrice: csvNum(r.away_spread_odds),
      total: csvNum(r.total_line),
      overPrice: csvNum(r.over_odds),
      underPrice: csvNum(r.under_odds),
      mlHome: csvNum(r.home_moneyline),
      mlAway: csvNum(r.away_moneyline),
      homeQbId: r.home_qb_id || null,
      awayQbId: r.away_qb_id || null,
      homeQbName: r.home_qb_name || null,
      awayQbName: r.away_qb_name || null,
      homeCoach: r.home_coach || null,
      awayCoach: r.away_coach || null,
      stadium: r.stadium || null,
    };
  }).sort((a, b) => a.season - b.season || a.week - b.week || String(a.date).localeCompare(String(b.date)));
}

const TEAM_COLS = [
  'season', 'week', 'team', 'season_type', 'game_id', 'opponent_team',
  'attempts', 'sacks_suffered', 'passing_epa', 'carries', 'rushing_epa',
  'passing_yards', 'rushing_yards', 'passing_interceptions', 'sack_fumbles_lost', 'rushing_fumbles_lost',
  'def_sacks', 'def_qb_hits',
];

/** @returns {Array<object>} one row per team per game */
export function parseTeamWeeks(text) {
  return parseCsv(text, { pick: TEAM_COLS }).map((r) => {
    const attempts = csvNum(r.attempts) ?? 0;
    const sacks = csvNum(r.sacks_suffered) ?? 0;
    const carries = csvNum(r.carries) ?? 0;
    return {
      season: Number(r.season),
      week: Number(r.week),
      gameId: r.game_id,
      team: nflverseCode(r.team),
      opp: nflverseCode(r.opponent_team),
      dropbacks: attempts + sacks,
      carries,
      sacksSuffered: sacks,
      passEpa: csvNum(r.passing_epa),
      rushEpa: csvNum(r.rushing_epa),
      passYards: csvNum(r.passing_yards) ?? 0,
      rushYards: csvNum(r.rushing_yards) ?? 0,
      giveaways: (csvNum(r.passing_interceptions) ?? 0) + (csvNum(r.sack_fumbles_lost) ?? 0) + (csvNum(r.rushing_fumbles_lost) ?? 0),
      defSacks: csvNum(r.def_sacks) ?? 0,
      defQbHits: csvNum(r.def_qb_hits) ?? 0,
    };
  });
}

const PLAYER_COLS = [
  'player_id', 'player_display_name', 'position', 'season', 'week', 'game_id', 'team',
  'attempts', 'sacks_suffered', 'passing_epa', 'carries', 'rushing_epa',
];

/** Quarterback rows only: one per quarterback per game with at least one play. */
export function parseQbWeeks(text) {
  return parseCsv(text, { pick: PLAYER_COLS, filter: (r) => r.position === 'QB' })
    .map((r) => {
      const attempts = csvNum(r.attempts) ?? 0;
      const sacks = csvNum(r.sacks_suffered) ?? 0;
      const carries = csvNum(r.carries) ?? 0;
      return {
        playerId: r.player_id,
        name: r.player_display_name,
        season: Number(r.season),
        week: Number(r.week),
        gameId: r.game_id,
        team: nflverseCode(r.team),
        attempts,
        dropbacks: attempts + sacks,
        plays: attempts + sacks + carries,
        epa: (csvNum(r.passing_epa) ?? 0) + (csvNum(r.rushing_epa) ?? 0),
      };
    })
    .filter((r) => r.plays > 0);
}

/**
 * Games coached as a head coach, over every season in the file. Used to
 * tell a first-year head coach from a veteran.
 * @returns {Record<string, number>}
 */
export function parseCoachGames(text) {
  const out = {};
  const rows = parseCsv(text, { pick: ['home_coach', 'away_coach', 'home_score'], filter: (r) => r.home_score !== '' && r.home_score !== 'NA' });
  for (const r of rows) {
    if (r.home_coach) out[r.home_coach] = (out[r.home_coach] || 0) + 1;
    if (r.away_coach) out[r.away_coach] = (out[r.away_coach] || 0) + 1;
  }
  return out;
}
