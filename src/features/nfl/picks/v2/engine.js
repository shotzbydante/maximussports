/**
 * NFL engine, per-game analysis. Pure.
 *
 * Takes one normalized game (ESPN schedule, per-book odds, injury report)
 * plus the week's model data (nflverse-based ratings, quarterbacks, unit
 * grades, schedule) and returns everything the picks builder and the UI
 * need to describe the game:
 *
 *   projection   what the ratings say, with quarterback and weather applied
 *   consensus    what the books say, as an implied margin and total
 *   fair         the number bets are priced against
 *   quarterbacks who is expected to start and what that is worth
 *   units        phase-by-phase grades and the lopsided matchups
 *   situations   schedule, travel, coaching and weather spots with records
 *   flags        anything that should stop a pick being recommended
 *
 * How the fair number is set
 * --------------------------
 * fair = consensus + modelWeight x (projection - consensus) + validated adjustments
 *
 * `modelWeight` is the share of the ratings' disagreement with the market
 * that has shown up in results. Measured over 4,096 games from 2011 to
 * 2025 (scripts/nfl/backtest.mjs) it is 0.04 with a standard error of 0.08
 * on sides and 0.13 with a standard error of 0.09 on totals. Neither can
 * be told apart from zero. So the default is zero, the fair number is the
 * market's, and a pick has to earn its place on price.
 */

import { projectGame } from './project.js';
import { qbAdjustment, teamQbMix } from './qb.js';
import { buildConsensus } from './market.js';
import { gameSituations } from './situations.js';
import { unitMismatches } from './units.js';
import { homeWinProb } from './distribution.js';
import { isGameIndoors, resolveGameVenue } from '../../../../sports/nfl/venues.js';

export const ENGINE_DEFAULTS = Object.freeze({
  /** Share of the model-vs-market gap added to the fair number. Backtested at zero. */
  modelWeight: Object.freeze({ side: 0, total: 0 }),
});

const ABBREV_TO_NFLVERSE = Object.freeze({ LAR: 'LA', WSH: 'WAS' });

export function toNflverse(abbrev) {
  const a = String(abbrev || '').toUpperCase();
  return ABBREV_TO_NFLVERSE[a] || a;
}

export function normName(s) {
  return String(s || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
}

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
const r2 = (v) => (isNum(v) ? Math.round(v * 100) / 100 : null);

const SIDELINED = new Set(['out', 'ir']);
const IN_DOUBT = new Set(['questionable', 'doubtful']);

/**
 * Who starts at quarterback for one side, and how sure that is.
 * @returns {{ id, name, source, status, uncertain:boolean, reason:string|null }}
 */
export function resolveStarter({ team, scheduled, statuses = [], feedOk, mix = [], table }) {
  const statusOf = (name) => {
    const n = normName(name);
    return statuses.find((q) => normName(q.name) === n)?.status || null;
  };
  let pick = scheduled?.id ? { id: scheduled.id, name: scheduled.name, source: 'schedule' } : null;
  let reason = null;

  if (pick && SIDELINED.has(statusOf(pick.name))) {
    reason = `${pick.name} is listed ${statusOf(pick.name) === 'ir' ? 'on injured reserve' : 'out'}`;
    pick = null;
  }
  if (!pick) {
    const next = mix.find((q) => !SIDELINED.has(statusOf(q.name)));
    if (next) pick = { id: next.id, name: next.name || table?.byId?.get(next.id)?.name || null, source: 'recent' };
  }
  const status = pick ? statusOf(pick.name) : null;
  let uncertain = false;
  if (!pick) { uncertain = true; reason = reason || `no starting quarterback on file for ${team}`; }
  else if (IN_DOUBT.has(status)) { uncertain = true; reason = `${pick.name} is listed ${status}`; }
  else if (reason) { uncertain = true; reason = `${reason}; ${pick.name} is the next man up`; }
  if (!feedOk && !uncertain) { uncertain = true; reason = 'injury report unavailable'; }
  return { id: pick?.id || null, name: pick?.name || null, source: pick?.source || null, status, uncertain, reason };
}

/**
 * @param {object} args
 * @param {object} args.game     normalized game (api/nfl/live/_normalize.js) with market.books and injuries
 * @param {object} args.model    week model data (api/_lib/nflModelData.js)
 * @param {object} [args.weather] { tempF, windMph, gustMph, hoursOut, source } for outdoor games
 * @param {object} [args.config]
 * @returns {object} engine block, JSON-safe
 */
export function analyzeGame({ game, model, weather = null, config = ENGINE_DEFAULTS }) {
  const homeAbbr = game?.teams?.home?.abbrev;
  const awayAbbr = game?.teams?.away?.abbrev;
  const h = toNflverse(homeAbbr);
  const a = toNflverse(awayAbbr);
  const weightSide = config?.modelWeight?.side ?? 0;
  const weightTotal = config?.modelWeight?.total ?? 0;
  const flags = { dataGap: false, thinMarket: false, qbUncertain: false, injuryFeedDown: false };
  const notes = [];

  const sched = model?.schedule?.[String(game?.gameId)] || null;
  const neutral = !!(game?.venue?.neutralSite || sched?.neutral);
  const modelOk = !!(model?.ok && model?.ratings?.teams?.[h] && model?.ratings?.teams?.[a]);
  if (!modelOk) { flags.dataGap = true; notes.push(model?.reasons?.[0] || 'model data unavailable'); }

  // ── Quarterbacks ──
  const feedOk = !!game?.injuries && game.injuries.ok !== false;
  if (!feedOk) flags.injuryFeedDown = true;
  const quarterbacks = {};
  for (const [side, team, abbr] of [['home', h, homeAbbr], ['away', a, awayAbbr]]) {
    const mix = modelOk ? teamQbMix({ team, weights: model.ratings.weights?.[team] || [], qbIndex: model.qbIndex }) : [];
    const scheduled = sched ? { id: sched[`${side}QbId`], name: sched[`${side}QbName`] } : null;
    const starter = resolveStarter({
      team: abbr, scheduled, feedOk, mix, table: model?.qbTable,
      statuses: game?.injuries?.[side]?.quarterbackStatuses || [],
    });
    const adj = modelOk
      ? qbAdjustment({ team, starterId: starter.id, starterName: starter.name, ratings: model.ratings, table: model.qbTable, qbIndex: model.qbIndex })
      : { points: 0, starter: null, primary: null, starterShare: 0, lowSample: false, known: false };
    quarterbacks[side] = {
      team: abbr,
      starter: starter.name,
      starterId: starter.id,
      source: starter.source,
      status: starter.status,
      uncertain: starter.uncertain,
      reason: starter.reason,
      points: adj.points,
      value: adj.starter?.value ?? null,
      plays: adj.starter?.plays ?? null,
      lowSample: adj.lowSample,
      share: adj.starterShare,
      primary: adj.primary ? { name: adj.primary.name || model?.qbTable?.byId?.get(adj.primary.id)?.name || null, share: r2(adj.primary.share) } : null,
      changed: !!(adj.primary && starter.id && adj.primary.id !== starter.id),
    };
    if (starter.uncertain) flags.qbUncertain = true;
  }

  // ── Environment: where the game is played, and whether weather reaches the field ──
  const venue = resolveGameVenue({
    homeAbbrev: homeAbbr, neutralSite: neutral, venueName: game?.venue?.name || null,
    stadiumName: sched?.stadium || null, stadiumId: sched?.stadiumId || null,
  });
  const indoor = isGameIndoors({
    homeAbbrev: homeAbbr, espnIndoor: game?.venue?.indoor ?? null, nflverseRoof: sched?.roof ?? null, neutralSite: neutral, venue,
  });
  const env = {
    indoor,
    venue: venue?.stadium || game?.venue?.name || sched?.stadium || null,
    city: venue?.city || game?.venue?.city || null,
    country: venue?.country || null,
    neutral,
    roof: venue?.roof || null,
    located: !!venue,
    temp: indoor === false && isNum(weather?.tempF) ? weather.tempF : null,
    wind: indoor === false && isNum(weather?.windMph) ? weather.windMph : null,
    gust: indoor === false && isNum(weather?.gustMph) ? weather.gustMph : null,
    precip: indoor === false && isNum(weather?.precipPct) ? weather.precipPct : null,
    hoursOut: isNum(weather?.hoursOut) ? weather.hoursOut : null,
    source: indoor === false ? (weather?.source || null) : null,
  };
  env.label = environmentLabel(env);

  // ── Ratings projection ──
  const projection = modelOk ? projectGame({
    home: h, away: a, ratings: model.ratings, neutral,
    qb: { home: quarterbacks.home.points, away: quarterbacks.away.points },
    rest: { home: sched?.homeRest ?? null, away: sched?.awayRest ?? null },
    env: { indoor, temp: env.temp, wind: env.wind },
  }) : null;

  // ── Market ──
  const books = game?.market?.books || [];
  const consensus = buildConsensus(books, config?.market);
  if (!isNum(consensus.fairMargin) && !isNum(consensus.fairTotal) && !isNum(consensus.fairHomeWin)) flags.thinMarket = true;

  // ── Situations ──
  const situations = gameSituations({
    homeAbbrev: homeAbbr, awayAbbrev: awayAbbr, startTime: game?.startTime,
    divisional: !!sched?.divisional, neutral,
    spreadHome: consensus.spreadHome ?? game?.market?.pregameSpread ?? null,
    rest: { home: sched?.homeRest ?? null, away: sched?.awayRest ?? null },
    coaches: {
      home: sched?.homeCoach ? { name: sched.homeCoach, games: model?.coachGames?.[sched.homeCoach] ?? null } : null,
      away: sched?.awayCoach ? { name: sched.awayCoach, games: model?.coachGames?.[sched.awayCoach] ?? null } : null,
    },
    nextIsDivision: { home: !!model?.nextDivisional?.[h], away: !!model?.nextDivisional?.[a] },
    env,
  }, config?.situations);

  // ── Fair numbers ──
  const adjustments = [];
  let fairMargin = consensus.fairMargin;
  let fairTotal = consensus.fairTotal;
  let fairHomeWin = consensus.fairHomeWin;
  if (projection && isNum(fairMargin) && isNum(consensus.spreadHome) && weightSide !== 0) {
    const shift = weightSide * (projection.margin + consensus.spreadHome);
    fairMargin += shift;
    adjustments.push({ key: 'model', market: 'side', points: r2(shift) });
  }
  if (projection && isNum(fairTotal) && weightTotal !== 0) {
    const shift = weightTotal * (projection.total - fairTotal);
    fairTotal += shift;
    adjustments.push({ key: 'model', market: 'total', points: r2(shift) });
  }
  for (const adj of situations.adjustments) {
    if (adj.market === 'total' && isNum(fairTotal)) { fairTotal += adj.points; adjustments.push(adj); }
    if (adj.market === 'side' && isNum(fairMargin)) { fairMargin += adj.points; adjustments.push(adj); }
  }
  const sideShift = adjustments.filter((x) => x.market === 'side').reduce((s, x) => s + x.points, 0);
  if (sideShift !== 0 && isNum(consensus.fairHomeWin)) {
    // Carry a side adjustment into the moneyline through the margin it implies.
    const base = bisectMargin(consensus.fairHomeWin);
    fairHomeWin = Math.round(homeWinProb(base + sideShift) * 1000) / 1000;
  }

  const grades = model?.unitGrades || {};
  return {
    ok: modelOk && !flags.thinMarket,
    version: model?.version || null,
    asOf: model?.asOf || null,
    teams: { home: h, away: a },
    neutral,
    divisional: !!sched?.divisional,
    rest: { home: sched?.homeRest ?? null, away: sched?.awayRest ?? null },
    coaches: { home: sched?.homeCoach || null, away: sched?.awayCoach || null },
    projection,
    ratings: modelOk ? { home: pickRating(model.ratings.teams[h]), away: pickRating(model.ratings.teams[a]) } : null,
    quarterbacks,
    env,
    consensus,
    fair: { margin: r2(fairMargin), total: r2(fairTotal), homeWin: fairHomeWin, adjustments },
    modelGap: {
      // Closing spreads are an unbiased forecast of the margin (home teams
      // have covered by +0.06 on average since 2003), so the posted line is
      // what the projection is measured against.
      side: projection && isNum(consensus.spreadHome) ? r2(projection.margin + consensus.spreadHome) : null,
      total: projection && isNum(consensus.fairTotal) ? r2(projection.total - consensus.fairTotal) : null,
    },
    units: {
      home: grades[h] || null,
      away: grades[a] || null,
      mismatches: unitMismatches({ home: h, away: a, grades }).slice(0, 4),
      source: model?.unitSource || 'nflverse',
    },
    situations: situations.tags,
    flags,
    notes,
  };
}

/**
 * One line on the playing conditions: "Indoors at Ford Field",
 * "Outdoors at Soldier Field: 14 mph wind, 51°F, 55% chance of rain".
 */
export function environmentLabel(env) {
  if (!env) return null;
  const where = env.venue ? ` at ${env.venue}${env.neutral && env.city ? `, ${env.city}` : ''}` : '';
  if (env.indoor === true) return `Indoors${where}${env.roof === 'retractable' ? ' (roof closed)' : ''}`;
  if (env.indoor === null || env.indoor === undefined) {
    return env.roof === 'retractable' ? `Retractable roof${where}: open or closed not yet known` : `Roof status unknown${where}`;
  }
  const bits = [];
  if (isNum(env.wind)) bits.push(`${Math.round(env.wind)} mph wind`);
  if (isNum(env.temp)) bits.push(`${Math.round(env.temp)}°F`);
  if (isNum(env.precip) && env.precip >= 30) bits.push(`${Math.round(env.precip)}% chance of rain or snow`);
  return bits.length ? `Outdoors${where}: ${bits.join(', ')}` : `Outdoors${where}: no forecast yet`;
}

function pickRating(t) {
  return t ? { rating: t.rating, offense: t.offense, defense: t.defense, games: t.games } : null;
}

function bisectMargin(target) {
  let lo = -40, hi = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (homeWinProb(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
