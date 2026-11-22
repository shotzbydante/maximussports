/**
 * Game situations: the scheduling, travel, coaching and weather spots
 * bettors talk about, each with its record against the closing spread.
 * Pure.
 *
 * Every record below was measured on nflverse results and closing lines,
 * 2003 through 2025 (6,100+ games). One spot has held up well enough to
 * move the fair number: strong wind and unders. The rest are shown as
 * context with their record, and they do not move a pick, because the
 * closing line has already priced them. `weight` is the points each spot
 * adds to the fair margin or total; it is zero unless the evidence earns it.
 *
 * To re-measure after a season, run `node scripts/nfl/backtest.mjs --situations`.
 */

import { getNflVenue } from '../../../../sports/nfl/venues.js';

export const SITUATION_RECORDS = Object.freeze({
  bodyClock: { won: 204, lost: 209, since: 2003, recent: { won: 76, lost: 68, since: 2018 } },
  divisionRoadDog: { won: 733, lost: 640, since: 2003, recent: { won: 250, lost: 211, since: 2018 } },
  offBye: { won: 353, lost: 339, since: 2003, recent: { won: 108, lost: 119, since: 2018 } },
  shortWeekRoad: { won: 138, lost: 143, since: 2003, recent: { won: 65, lost: 65, since: 2018 } },
  lookahead: { won: 283, lost: 291, since: 2003, recent: { won: 101, lost: 107, since: 2018 } },
  letdown: { won: 229, lost: 247, since: 2003, recent: { won: 73, lost: 67, since: 2018 } },
  firstYearCoach: { won: 488, lost: 503, since: 2003, recent: { won: 191, lost: 211, since: 2018 } },
  windUnder: { won: 312, lost: 235, since: 2003, recent: { won: 91, lost: 68, since: 2018 } },
  /** Unders in sustained wind of 10 to 15 mph. */
  windUnderModerate: { won: 535, lost: 456, since: 2003, recent: { won: 191, lost: 129, since: 2018 } },
});

export const SITUATION_PARAMS = Object.freeze({
  /**
   * Wind and the fair total: a ramp, not a switch.
   *
   * Across 1,560 outdoor games with sustained wind of 10 mph or more
   * (2003 to 2025), each mph above 10 was worth 0.18 +/- 0.07 points to the
   * under against the closing total, levelling off at 20 mph. Below 10 mph
   * wind shows nothing. That slope is cut by the same 0.7 the old flat rule
   * used, because we act on a forecast and the history is measured wind.
   * So: 0.12 points off the fair total per mph above 10, to a most of 1.2
   * points at 20 mph. (`node scripts/nfl/backtest.mjs --situations`.)
   */
  windStartMph: 10,
  windFullMph: 20,
  windShiftPerMph: -0.12,
  /** Sustained wind, mph, that the record books split on: 10 to 15, and 15 or more. */
  windMph: 15,
  /** A forecast further out than this is not trusted to move a number. */
  windMaxHoursOut: 48,
  earlyKickoffEtHour: 13.1,
  firstYearGames: 17,
  veteranGames: 48,
});

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * Points the wind takes off a fair total: nothing up to the start of the
 * ramp, then the same amount for every extra mph, capped at the top.
 * 10 mph -> 0, 15 mph -> -0.6, 20 mph and above -> -1.2.
 */
export function windTotalShift(mph, params = SITUATION_PARAMS) {
  if (!isNum(mph) || mph <= params.windStartMph) return 0;
  const over = Math.min(mph, params.windFullMph) - params.windStartMph;
  return Math.round(params.windShiftPerMph * over * 100) / 100;
}

/** The under's record in wind like this, and how to name the band. */
export function windUnderRecord(mph, params = SITUATION_PARAMS) {
  const strong = mph >= params.windMph;
  const record = strong ? SITUATION_RECORDS.windUnder : SITUATION_RECORDS.windUnderModerate;
  return {
    record,
    pct: Math.round((100 * record.won) / (record.won + record.lost)),
    band: strong ? `wind of ${params.windMph} mph or more` : `wind of ${params.windStartMph} to ${params.windMph} mph`,
  };
}
function pct(r) { return `${((100 * r.won) / (r.won + r.lost)).toFixed(1)}%`; }
function recordText(r, what = 'against the spread') {
  return `${r.won}-${r.lost} ${what} since ${r.since} (${pct(r)})`;
}

function clock(hour) {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Kickoff hour in Eastern time as a decimal (13.0 = 1:00 PM ET). */
export function kickoffEtHour(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date(t));
    const h = Number(parts.find((x) => x.type === 'hour')?.value);
    const m = Number(parts.find((x) => x.type === 'minute')?.value);
    return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : null;
  } catch { return null; }
}

/**
 * @param {object} ctx
 * @param {string} ctx.homeAbbrev, ctx.awayAbbrev
 * @param {string} ctx.startTime          ISO kickoff
 * @param {boolean} [ctx.divisional]
 * @param {boolean} [ctx.neutral]
 * @param {number}  [ctx.spreadHome]      consensus home line
 * @param {{home?:number, away?:number}} [ctx.rest]
 * @param {{home?:{name,games}, away?:{name,games}}} [ctx.coaches]
 * @param {{home?:boolean, away?:boolean}} [ctx.nextIsDivision]
 * @param {{indoor?:boolean|null, wind?:number, hoursOut?:number}} [ctx.env]
 * @returns {{ tags: Array<object>, adjustments: Array<object> }}
 */
export function gameSituations(ctx = {}, params = SITUATION_PARAMS) {
  const p = { ...SITUATION_PARAMS, ...params };
  const tags = [];
  const adjustments = [];
  const R = SITUATION_RECORDS;
  const home = getNflVenue(ctx.homeAbbrev);
  const away = getNflVenue(ctx.awayAbbrev);
  const et = kickoffEtHour(ctx.startTime);
  const spread = ctx.spreadHome;

  if (!ctx.neutral && home && away && isNum(et) && away.tz === 3 && home.tz <= 1 && et <= p.earlyKickoffEtHour) {
    tags.push({
      key: 'bodyClock', team: ctx.awayAbbrev, weight: 0,
      label: 'West-coast team, early kickoff',
      note: `${ctx.awayAbbrev} kicks off at ${clock(et - 3)} Pacific. West-coast teams in an early eastern kickoff are ${recordText(R.bodyClock)}. The line already prices it.`,
    });
  }
  if (ctx.divisional && isNum(spread) && spread < 0 && !ctx.neutral) {
    tags.push({
      key: 'divisionRoadDog', team: ctx.awayAbbrev, weight: 0,
      label: 'Division road underdog',
      note: `Road underdogs in division games are ${recordText(R.divisionRoadDog)}, a lean too small to bet on its own.`,
    });
  }
  const rh = ctx.rest?.home, ra = ctx.rest?.away;
  if (isNum(rh) && isNum(ra) && (rh >= 13) !== (ra >= 13) && Math.min(rh, ra) >= 6) {
    const team = rh >= 13 ? ctx.homeAbbrev : ctx.awayAbbrev;
    tags.push({
      key: 'offBye', team, weight: 0,
      label: 'Off a bye',
      note: `${team} is coming off a bye. Teams with that rest edge are ${recordText(R.offBye)}.`,
    });
  }
  if (isNum(ra) && ra <= 5 && !ctx.neutral) {
    tags.push({
      key: 'shortWeekRoad', team: ctx.awayAbbrev, weight: 0,
      label: 'Road team on a short week',
      note: `Road teams on Thursday short rest are ${recordText(R.shortWeekRoad)}.`,
    });
  }
  for (const side of ['home', 'away']) {
    const fav = side === 'home' ? (isNum(spread) ? -spread : null) : spread;
    const team = side === 'home' ? ctx.homeAbbrev : ctx.awayAbbrev;
    if (isNum(fav) && fav >= 6 && !ctx.divisional && ctx.nextIsDivision?.[side]) {
      tags.push({
        key: 'lookahead', team, weight: 0,
        label: 'Look-ahead spot',
        note: `${team} is a big favorite with a division game next week. Favorites in that spot are ${recordText(R.lookahead)}: no trap in the numbers.`,
      });
    }
    const mine = ctx.coaches?.[side], theirs = ctx.coaches?.[side === 'home' ? 'away' : 'home'];
    if (mine?.name && theirs?.name && isNum(mine.games) && isNum(theirs.games)
      && mine.games < p.firstYearGames && theirs.games >= p.veteranGames) {
      tags.push({
        key: 'firstYearCoach', team, weight: 0,
        label: 'First-year head coach',
        note: `${mine.name} is in his first season as a head coach, against ${theirs.name} (${theirs.games} games). First-year coaches in that matchup are ${recordText(R.firstYearCoach)}.`,
      });
    }
  }

  const env = ctx.env || {};
  const windShift = env.indoor === false ? windTotalShift(env.wind, p) : 0;
  if (windShift !== 0) {
    const trusted = !isNum(env.hoursOut) || env.hoursOut <= p.windMaxHoursOut;
    const { record, band } = windUnderRecord(env.wind, p);
    const perMph = Math.abs(p.windShiftPerMph);
    const most = Math.abs(windTotalShift(p.windFullMph, p));
    tags.push({
      key: 'windUnder', team: null, weight: trusted ? windShift : 0, mph: env.wind, band,
      label: `Wind ${Math.round(env.wind)} mph`,
      note: `Sustained wind of ${Math.round(env.wind)} mph is forecast, worth ${Math.abs(windShift).toFixed(1)} points off the fair total: ${perMph} for each mph above ${p.windStartMph}, to a most of ${most.toFixed(1)} at ${p.windFullMph} mph. In ${band}, unders are ${recordText(record, 'against the closing total')}.`
        + (trusted ? '' : ' The forecast is too far out to move the number yet.'),
    });
    if (trusted) adjustments.push({ key: 'windUnder', market: 'total', points: windShift });
  }
  return { tags, adjustments };
}
