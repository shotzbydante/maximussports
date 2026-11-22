/**
 * Post-game review. Pure.
 *
 * After a game ends every stored pick on it is reviewed, win or lose:
 *
 *   1. How it finished: by how many points the ticket won or lost.
 *   2. Was the number good: the locked ticket priced at the closing line.
 *   3. What the game said: yards, turnovers and return touchdowns, turned
 *      into points with a fit on five seasons of box scores, so a result
 *      that turnovers or a return score decided can be told apart from one
 *      the play on the field earned.
 *   4. What changed after the pick was made: the line, the quarterback,
 *      the wind forecast.
 *
 * One review changes nothing. Reviews are added to a ledger, and a line in
 * the ledger is only raised for a decision once it has enough results over
 * enough weeks (TREND_RULES). Even then the next step is a backtest or a
 * shadow run, never a direct change to the engine.
 */

import { closingLineValue } from './locks.js';
import { unitsFor } from './distribution.js';

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const r1 = (v) => (isNum(v) ? Math.round(v * 10) / 10 : null);
const r3 = (v) => (isNum(v) ? Math.round(v * 1000) / 1000 : null);

/**
 * Points from the box score. Least-squares fit on 1,359 regular-season
 * games, 2021 to 2025 (nflverse team stats and results):
 *
 *   margin = 0.9 (home) + 0.065 x yards gained more than the opponent
 *            + 4.25 x turnovers won + 5.4 x return touchdowns   (error 9.2)
 *   total  = -19.8 + 0.0863 x combined yards + 6.5 x return touchdowns
 *                                                              (error 9.5)
 *
 * Turnovers add nothing to the total once yards are known (-0.09 +/- 0.18).
 * The error is about nine points either way, so these numbers describe a
 * game; they do not re-grade it.
 */
export const REVIEW_PARAMS = Object.freeze({
  homeEdge: 0.9,
  marginPerYard: 0.065,
  marginPerTurnover: 4.25,
  marginPerReturnTd: 5.4,
  totalBase: -19.8,
  totalPerYard: 0.0863,
  totalPerReturnTd: 6.5,
  fitGames: 1359,
  fitSeasons: '2021 to 2025',
  /** Decided by this many points or fewer: a coin flip. */
  coinFlipPoints: 3,
  decisivePoints: 10,
  /** The play on the field has to disagree with the result by this much to be called luck. */
  luckPoints: 6,
  /** Expected value at the close within this band of zero is "about fair". */
  fairBand: 0.005,
  /** A swing this large between lock and close is the market moving. */
  moveBand: 0.01,
  windShiftMph: 5,
  minModelGap: 1,
  bigModelGap: 3,
  windMph: 10,
});

/**
 * When a line in the ledger may be acted on. A single game can never get
 * there: the smallest sample is 30 results, and a decision needs 60 results
 * spread over at least four different weeks.
 */
export const TREND_RULES = Object.freeze({
  watchResults: 30,
  watchStdErrors: 1.5,
  decideResults: 60,
  decideWeeks: 4,
  decideStdErrors: 2,
});

/**
 * An NFL week runs Tuesday to Monday. Kickoffs are stored in UTC, where a
 * Monday night game starts early on Tuesday, so the clock is set back half
 * a day before the week is counted.
 */
export function weekKeyOf(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const TUESDAY = Date.UTC(2020, 8, 8);
  return `w${Math.floor((t - 12 * 3_600_000 - TUESDAY) / (7 * 86_400_000))}`;
}

const RETURN_TD = /(interception|fumble|kickoff|punt|blocked[^,]*|missed (fg|field goal)) return touchdown|blocked (punt|fg|field goal)[^,]* touchdown|fumble recovery \(opp/i;

// ── Box score ────────────────────────────────────────────────────────────

function statOf(team, name) {
  const s = (team?.statistics || []).find((x) => x?.name === name);
  return s ? String(s.displayValue ?? s.value ?? '') : null;
}
function firstNumber(text) {
  if (text == null) return null;
  const m = String(text).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function madeOf(text) {
  const m = String(text || '').match(/^(\d+)\s*[-/]\s*(\d+)/);
  return m ? { made: Number(m[1]), tries: Number(m[2]) } : null;
}

/**
 * The facts of a finished game from ESPN's game summary.
 * Every field is optional: a summary that is missing a block gives nulls
 * for it, and `ok` is true as long as yards are present for both teams.
 */
export function gameFacts(summary) {
  const teams = summary?.boxscore?.teams || [];
  const side = (homeAway) => teams.find((t) => t?.homeAway === homeAway) || null;
  const H = side('home'), A = side('away');
  const yards = { home: firstNumber(statOf(H, 'totalYards')), away: firstNumber(statOf(A, 'totalYards')) };
  if (!isNum(yards.home) || !isNum(yards.away)) return { ok: false };

  const comp = summary?.header?.competitions?.[0] || null;
  const sideOfTeamId = new Map();
  for (const t of teams) if (t?.team?.id != null) sideOfTeamId.set(String(t.team.id), t.homeAway);
  for (const c of comp?.competitors || []) if (c?.id != null || c?.team?.id != null) sideOfTeamId.set(String(c.team?.id ?? c.id), c.homeAway);

  // Return touchdowns: scoring plays when the summary lists them, the
  // defensive touchdown count otherwise (which misses kick returns).
  let returnTds = null;
  if (Array.isArray(summary?.scoringPlays)) {
    returnTds = { home: 0, away: 0 };
    for (const p of summary.scoringPlays) {
      if (!RETURN_TD.test(String(p?.type?.text || ''))) continue;
      const s = sideOfTeamId.get(String(p?.team?.id ?? ''));
      if (s === 'home' || s === 'away') returnTds[s] += 1;
    }
  } else {
    const h = firstNumber(statOf(H, 'defensiveTouchdowns')), a = firstNumber(statOf(A, 'defensiveTouchdowns'));
    if (isNum(h) && isNum(a)) returnTds = { home: h, away: a };
  }

  const period = num(comp?.status?.period);
  const quarters = Math.max(0, ...(comp?.competitors || []).map((c) => (c?.linescores || []).length));
  const passers = { home: [], away: [] };
  for (const block of summary?.boxscore?.players || []) {
    const s = sideOfTeamId.get(String(block?.team?.id ?? ''));
    if (s !== 'home' && s !== 'away') continue;
    const passing = (block?.statistics || []).find((x) => x?.name === 'passing');
    for (const a of passing?.athletes || []) {
      const att = madeOf(a?.stats?.[0]);
      const name = a?.athlete?.displayName || null;
      if (name && att) passers[s].push({ name, attempts: att.tries });
    }
    passers[s].sort((x, y) => y.attempts - x.attempts);
  }

  return {
    ok: true,
    yards,
    turnovers: { home: firstNumber(statOf(H, 'turnovers')), away: firstNumber(statOf(A, 'turnovers')) },
    returnTds,
    redZone: { home: madeOf(statOf(H, 'redZoneAttempts')), away: madeOf(statOf(A, 'redZoneAttempts')) },
    overtime: (isNum(period) && period > 4) || quarters > 4,
    passers,
  };
}

/**
 * Turn the facts into points. Home view for the margin.
 * `play` is the part the yardage accounts for; turnovers and return
 * touchdowns are counted apart because they do not repeat week to week.
 */
export function boxScoreRead(facts, final, params = REVIEW_PARAMS) {
  if (!facts?.ok || !isNum(final?.home) || !isNum(final?.away)) return null;
  const p = { ...REVIEW_PARAMS, ...params };
  const yardGap = facts.yards.home - facts.yards.away;
  const to = facts.turnovers || {};
  const turnoverGap = isNum(to.home) && isNum(to.away) ? to.away - to.home : null;   // turnovers the home team won
  const rt = facts.returnTds || null;
  const returnGap = rt ? rt.home - rt.away : null;
  const playMargin = p.homeEdge + p.marginPerYard * yardGap;
  const turnoverPoints = isNum(turnoverGap) ? p.marginPerTurnover * turnoverGap : 0;
  const returnPoints = isNum(returnGap) ? p.marginPerReturnTd * returnGap : 0;
  const margin = final.home - final.away;
  const playTotal = p.totalBase + p.totalPerYard * (facts.yards.home + facts.yards.away);
  const returnTotal = rt ? p.totalPerReturnTd * (rt.home + rt.away) : 0;
  const total = final.home + final.away;
  return {
    margin: {
      actual: margin, play: r1(playMargin), turnovers: r1(turnoverPoints), returns: r1(returnPoints),
      rest: r1(margin - playMargin - turnoverPoints - returnPoints),
      yardGap, turnoverGap, returnGap,
    },
    total: {
      actual: total, play: r1(playTotal), returns: r1(returnTotal), rest: r1(total - playTotal - returnTotal),
      yards: facts.yards.home + facts.yards.away, returnTds: rt ? rt.home + rt.away : null,
    },
  };
}

// ── What was known before kickoff ────────────────────────────────────────

/**
 * The compact pre-game record kept for each game, from one `byGame` entry
 * of the picks board. The last one saved before kickoff is what the review
 * reads: it is what the engine believed when the game started.
 */
export function gameContext(g, { now = new Date() } = {}) {
  if (!g?.gameId) return null;
  const qb = (q) => (q ? { name: q.starter || null, uncertain: !!q.uncertain, changed: !!q.changed } : null);
  const top = g.units?.mismatches?.[0] || null;
  // Unit grades are keyed by nflverse codes; everything else here uses ESPN's.
  const espn = (code) => ({ LA: 'LAR', WAS: 'WSH' }[code] || code);
  return {
    gameId: String(g.gameId),
    capturedAt: now.toISOString(),
    week: g.week ?? null,
    startTime: g.startTime || null,
    home: g.homeTeam?.abbrev || g.homeTeam?.shortName || null,
    away: g.awayTeam?.abbrev || g.awayTeam?.shortName || null,
    spreadHome: g.market?.spreadHome ?? null,
    total: g.market?.total ?? null,
    model: g.projection ? { margin: g.projection.margin ?? null, total: g.projection.total ?? null } : null,
    indoor: g.environment?.indoor ?? null,
    wind: g.environment?.wind ?? null,
    talent: g.talent ? { leansTo: g.talent.leansTo || null, netHome: g.talent.netHome ?? null } : null,
    spots: (g.situations || []).filter((t) => t?.key && t.team).map((t) => ({ key: t.key, team: t.team })),
    qbs: { home: qb(g.quarterbacks?.home), away: qb(g.quarterbacks?.away) },
    unitEdge: top ? { team: espn(top.gap > 0 ? top.offenseTeam : top.defenseTeam), gap: Math.abs(top.gap) } : null,
  };
}

// ── One pick ─────────────────────────────────────────────────────────────

function resultOf(p) {
  return Array.isArray(p?.pick_results) ? p.pick_results[0] : p?.pick_results;
}
const roleOf = (p) => p?.rationale?.pickRole || (p?.tier === 'tracking' ? 'tracking' : 'hero');
const isWindPick = (p) => p?.payload?.modelSource === 'nfl_v2_wind' || /mph wind/i.test(String(p?.rationale?.headline || ''));
const pts = (v) => { const a = Math.abs(v); return `${Number.isInteger(a) ? a : a.toFixed(1)} ${a === 1 ? 'point' : 'points'}`; };
const pct = (v) => `${v >= 0 ? '+' : '-'}${Math.abs(v * 100).toFixed(1)}%`;
const lastName = (name) => String(name || '').trim().split(/\s+/).slice(-1)[0].toLowerCase().replace(/[^a-z]/g, '');

/** Points the ticket won (positive) or lost (negative) by. */
export function decidedBy({ market, side, line, home, away }) {
  if (!isNum(home) || !isNum(away)) return null;
  if (market === 'total') return isNum(line) ? (side === 'over' ? home + away - line : line - (home + away)) : null;
  const diff = side === 'home' ? home - away : away - home;
  if (market === 'runline') return isNum(line) ? diff + line : null;
  if (market === 'moneyline') return diff;
  return null;
}

/**
 * Review one graded pick.
 *
 * @param {object} args
 * @param {object} args.pick      `picks` row (with `pick_results` joined, or pass `result`)
 * @param {object} [args.result]  `pick_results` row
 * @param {object} [args.close]   `nfl_line_snapshots` row: the last consensus before kickoff
 * @param {object} [args.context] gameContext() saved before kickoff
 * @param {object} [args.facts]   gameFacts()
 * @param {{home:string, away:string}} [args.teams] abbreviations, for the wording
 * @returns {object|null} null when the pick has no final result yet
 */
export function reviewPick({ pick, result = resultOf(pick), close = null, context = null, facts = null, teams = {} }, params = REVIEW_PARAMS) {
  const p = { ...REVIEW_PARAMS, ...params };
  const status = result?.status;
  if (!pick || !['won', 'lost', 'push'].includes(status)) return null;
  const market = pick.market_type, side = pick.selection_side;
  const line = num(pick.line_value), price = num(pick.price_american);
  const home = num(result.final_home_score), away = num(result.final_away_score);
  const role = roleOf(pick);
  const H = teams.home || context?.home || 'Home', A = teams.away || context?.away || 'Away';
  const mine = side === 'home' ? H : side === 'away' ? A : null;
  const theirs = side === 'home' ? A : side === 'away' ? H : null;

  // 1. How it finished
  const by = decidedBy({ market, side, line, home, away });
  const closeness = !isNum(by) ? null : Math.abs(by) <= p.coinFlipPoints ? 'coin_flip' : Math.abs(by) >= p.decisivePoints ? 'decisive' : 'clear';

  // 2. Was the number good
  const computed = close ? closingLineValue(pick, close) : null;
  const clvEv = num(pick.clv_ev) ?? computed?.clvEv ?? null;
  const clvPoints = num(pick.clv_points) ?? computed?.clvPoints ?? null;
  const closingLine = num(pick.closing_line) ?? computed?.closingLine ?? null;
  const evAtLock = num(pick.expected_value);
  const moved = isNum(clvEv) && isNum(evAtLock) ? r3(clvEv - evAtLock) : null;
  const value = !isNum(clvEv) ? null : clvEv >= p.fairBand ? 'plus' : clvEv <= -p.fairBand ? 'minus' : 'fair';
  const move = !isNum(moved) ? null : moved >= p.moveBand ? 'toward' : moved <= -p.moveBand ? 'against' : 'flat';

  // 3. What the game said
  const read = boxScoreRead(facts, { home, away }, p);
  let playBy = null;
  if (read) {
    if (market === 'total') playBy = isNum(line) ? (side === 'over' ? read.total.play - line : line - read.total.play) : null;
    else {
      const playMargin = side === 'home' ? read.margin.play : -read.margin.play;
      playBy = market === 'runline' ? (isNum(line) ? playMargin + line : null) : playMargin;
    }
  }
  let luck = null;
  if (isNum(playBy) && status !== 'push') {
    if (status === 'won' && playBy <= -p.luckPoints) luck = 'fortunate';
    else if (status === 'lost' && playBy >= p.luckPoints) luck = 'unlucky';
    else luck = 'in_line';
  }

  const factors = [];
  if (read && market === 'total') {
    factors.push({ key: 'yards', text: `The offenses gained ${read.total.yards} yards, which usually produces about ${Math.round(read.total.play)} points; the game had ${read.total.actual}.` });
    if (read.total.returnTds > 0) {
      factors.push({ key: 'return_tds', text: `${read.total.returnTds} return touchdown${read.total.returnTds === 1 ? '' : 's'} added about ${Math.round(read.total.returns)} points the offenses did not score.` });
    }
    const rzH = facts?.redZone?.home, rzA = facts?.redZone?.away;
    if (rzH && rzA && rzH.tries + rzA.tries >= 4) {
      const made = rzH.made + rzA.made, tries = rzH.tries + rzA.tries;
      if (made / tries <= 0.4 || made / tries >= 0.8) factors.push({ key: 'red_zone', text: `The teams converted ${made} of ${tries} red-zone trips.` });
    }
  } else if (read && mine) {
    const m = read.margin;
    const sign = side === 'home' ? 1 : -1;
    if (m.yardGap !== 0) {
      const ahead = m.yardGap > 0 ? H : A, behind = m.yardGap > 0 ? A : H;
      factors.push({ key: 'yards', text: `${ahead} outgained ${behind} by ${Math.abs(m.yardGap)} yards, usually worth about ${pts(Math.round(Math.abs(m.yardGap) * p.marginPerYard))}.` });
    }
    if (isNum(m.turnoverGap) && Math.abs(m.turnoverGap) >= 2) {
      const won = m.turnoverGap > 0 ? H : A;
      const to = facts.turnovers;
      factors.push({ key: 'turnovers', forPick: Math.sign(m.turnoverGap) === sign, text: `${won} won the turnovers ${Math.max(to.home, to.away)}-${Math.min(to.home, to.away)}, usually worth about ${pts(Math.round(Math.abs(m.turnovers)))}.` });
    }
    if (isNum(m.returnGap) && m.returnGap !== 0) {
      const team = m.returnGap > 0 ? H : A;
      const n = Math.abs(m.returnGap);
      factors.push({ key: 'return_tds', forPick: Math.sign(m.returnGap) === sign, text: `${team} scored ${n === 1 ? 'a return touchdown' : `${n} more return touchdowns`}.` });
    }
  }
  if (facts?.overtime) factors.push({ key: 'overtime', text: 'It went to overtime.' });
  for (const s of ['home', 'away']) {
    const list = facts?.passers?.[s] || [];
    if (list.length >= 2 && list[1].attempts >= 8) {
      factors.push({ key: 'two_quarterbacks', team: s === 'home' ? H : A, text: `${s === 'home' ? H : A} used two quarterbacks (${list[0].name} and ${list[1].name}).` });
    }
  }

  // 4. What changed after the pick was made
  const missed = [];
  if (move === 'against' && isNum(closingLine) && isNum(line) && closingLine !== line) {
    missed.push({ key: 'line_moved_against', text: `The market moved against it after the lock: it closed at ${fmtClose(market, closingLine)} against our ${fmtClose(market, line)}.` });
  } else if (move === 'against') {
    missed.push({ key: 'line_moved_against', text: 'The price moved against it after the lock.' });
  }
  for (const s of ['home', 'away']) {
    const expected = context?.qbs?.[s]?.name;
    const actual = facts?.passers?.[s]?.[0]?.name;
    if (expected && actual && lastName(expected) !== lastName(actual)) {
      missed.push({ key: 'qb_change', team: s === 'home' ? H : A, text: `${s === 'home' ? H : A} started ${actual} at quarterback; the engine expected ${expected}.` });
    }
  }
  if (isWindPick(pick)) {
    const atLock = num(String(pick?.rationale?.headline || pick?.payload?.rationale?.headline || '').match(/(\d+) mph wind/)?.[1]);
    const atKick = num(context?.wind);
    if (isNum(atLock) && isNum(atKick) && Math.abs(atLock - atKick) >= p.windShiftMph) {
      missed.push({ key: 'wind_forecast', text: `The wind forecast was ${Math.round(atLock)} mph at the lock and ${Math.round(atKick)} mph by kickoff.` });
    }
  }

  // Verdict
  let verdict;
  if (status === 'push') verdict = 'push';
  else if (role !== 'hero' || !value) verdict = status;
  else verdict = `${value === 'minus' ? 'bad_number' : 'good_number'}_${status}`;

  const tags = { market, role, tier: pick.tier || null };
  if (market === 'total') tags.side = side;
  else {
    tags.venue = side;
    if (market === 'runline' && isNum(line)) tags.side = line > 0 ? 'underdog' : line < 0 ? 'favorite' : 'pickem';
    if (market === 'moneyline' && isNum(price)) tags.side = price > 0 ? 'underdog' : 'favorite';
  }
  if (role === 'hero') {
    tags.kind = isWindPick(pick) ? 'wind' : 'price';
    if (pick.book) tags.book = pick.book;
    const lead = (Date.parse(pick.start_time || '') - Date.parse(pick.locked_at || '')) / 3_600_000;
    if (Number.isFinite(lead)) tags.lead = lead < 24 ? 'under_24h' : lead < 48 ? '24_to_48h' : 'over_48h';
  }

  const review = {
    pickId: pick.id,
    gameId: String(pick.game_id),
    week: context?.week ?? pick?.payload?.week ?? null,
    weekKey: weekKeyOf(pick.start_time || context?.startTime),
    slateDate: pick.slate_date || null,
    startTime: pick.start_time || context?.startTime || null,
    role, market, side, line, price, book: pick.book || null,
    team: mine, opponent: theirs,
    status,
    units: num(result.units) ?? unitsFor(status, price),
    final: { home, away },
    by: r1(by),
    closeness,
    clv: { ev: clvEv, points: clvPoints, closingLine, evAtLock, moved, value, move },
    play: read ? { by: r1(playBy), luck, margin: read.margin, total: read.total } : null,
    factors: factors.slice(0, 4),
    missed,
    verdict,
    tags,
  };
  review.note = reviewNote(review);
  return review;
}

function fmtClose(market, v) {
  if (market === 'total') return `${v}`;
  return v > 0 ? `+${v}` : `${v}`;
}

/** The one or two sentences shown beside a graded pick. */
export function reviewNote(r) {
  if (!r) return null;
  const out = [];
  if (r.status === 'push') out.push('Landed on the number: a push.');
  else if (isNum(r.by)) {
    const verb = r.status === 'won' ? 'Won' : 'Lost';
    const flip = r.closeness === 'coin_flip' ? (Math.abs(r.by) <= 0.5 ? ': the hook' : ': inside a field goal') : '';
    out.push(`${verb} by ${pts(r.by)}${flip}.`);
  }
  if (r.role === 'hero' && r.clv?.value) {
    if (r.clv.value === 'plus') out.push(`Still a good bet at the close (${pct(r.clv.ev)}).`);
    else if (r.clv.value === 'fair') out.push('The edge was gone by kickoff: at the closing number it was a fair bet, no more.');
    else out.push(`The market moved against it: ${pct(r.clv.ev)} at the closing number.`);
  }
  const missed = r.missed?.find((m) => m.key !== 'line_moved_against');
  if (missed) out.push(missed.text);
  if (r.play?.luck === 'unlucky') out.push(`${luckLead(r)} ${topFactor(r, false) || ''}`.trim());
  else if (r.play?.luck === 'fortunate') out.push(`${luckLead(r)} ${topFactor(r, true) || ''}`.trim());
  else if (r.factors?.[0]) out.push(r.factors[0].text);
  return out.join(' ');
}

function luckLead(r) {
  if (r.market === 'total') return r.play.luck === 'unlucky' ? 'The yardage pointed our way.' : 'The yardage pointed the other way.';
  return r.play.luck === 'unlucky' ? `${r.team} had the better of the play.` : `${r.opponent} had the better of the play.`;
}
function topFactor(r, forPick) {
  const f = (r.factors || []).find((x) => x.key !== 'yards' && (x.forPick === undefined || x.forPick === forPick));
  return f?.text || (r.factors || []).find((x) => x.key === 'yards')?.text || null;
}

// ── Signals: each input graded against the closing line ──────────────────

function sideResult(byPoints) {
  return byPoints > 0 ? 'won' : byPoints < 0 ? 'lost' : 'push';
}

/**
 * Grade every input the engine shows (ratings, roster talent, wind, the
 * schedule spots) against the closing spread and total, whether or not it
 * led to a pick. This is how an input with no weight earns one, or how one
 * with weight loses it.
 *
 * @returns {Array<{signal, gameId, week, team?, side?, status, by}>}
 */
export function reviewSignals({ context, close, final }, params = REVIEW_PARAMS) {
  const p = { ...REVIEW_PARAMS, ...params };
  const out = [];
  if (!context || !isNum(final?.home) || !isNum(final?.away)) return out;
  const spread = num(close?.spread_home) ?? num(context.spreadHome);
  const total = num(close?.total) ?? num(context.total);
  const base = { gameId: context.gameId, week: context.week ?? null, weekKey: weekKeyOf(context.startTime) };
  const homeBy = isNum(spread) ? final.home + spread - final.away : null;       // home against the spread
  const teamBy = (team) => (!isNum(homeBy) ? null : team === context.home ? homeBy : team === context.away ? -homeBy : null);
  const pushSide = (signal, team) => {
    const by = teamBy(team);
    if (isNum(by)) out.push({ ...base, signal, team, status: sideResult(by), by: r1(by) });
  };

  if (context.talent?.leansTo) pushSide('talent', context.talent.leansTo);
  if (isNum(context.model?.margin) && isNum(spread)) {
    const gap = context.model.margin + spread;                // positive: the ratings like the home side
    if (Math.abs(gap) >= p.minModelGap) {
      const team = gap > 0 ? context.home : context.away;
      pushSide('ratings_side', team);
      if (Math.abs(gap) >= p.bigModelGap) pushSide('ratings_side_3plus', team);
    }
  }
  if (isNum(context.model?.total) && isNum(total)) {
    const gap = context.model.total - total;
    if (Math.abs(gap) >= p.minModelGap) {
      const side = gap > 0 ? 'over' : 'under';
      const by = side === 'over' ? final.home + final.away - total : total - (final.home + final.away);
      out.push({ ...base, signal: 'ratings_total', side, status: sideResult(by), by: r1(by) });
    }
  }
  if (context.indoor === false && isNum(context.wind) && context.wind >= p.windMph && isNum(total)) {
    const by = total - (final.home + final.away);
    out.push({ ...base, signal: 'wind_under', side: 'under', status: sideResult(by), by: r1(by) });
  }
  for (const s of context.spots || []) pushSide(`spot_${s.key}`, s.team);
  if (context.unitEdge?.team) pushSide('unit_edge', context.unitEdge.team);
  return out;
}

// ── The ledger ───────────────────────────────────────────────────────────

export const SIGNAL_LABELS = Object.freeze({
  talent: 'Roster talent lean, against the closing spread',
  ratings_side: 'Ratings side (1+ points from the line), against the closing spread',
  ratings_side_3plus: 'Ratings side (3+ points from the line), against the closing spread',
  ratings_total: 'Ratings total (1+ points from the line), against the closing total',
  wind_under: 'Under in 10+ mph wind, against the closing total',
  unit_edge: 'Biggest unit mismatch, against the closing spread',
  spot_bodyClock: 'West-coast team, early kickoff',
  spot_divisionRoadDog: 'Division road underdog',
  spot_offBye: 'Off a bye',
  spot_shortWeekRoad: 'Road team on a short week',
  spot_lookahead: 'Look-ahead spot',
  spot_firstYearCoach: 'First-year head coach',
});

/** What happens to a ledger line that has reached the decision bar. */
export const NEXT_STEP = Object.freeze({
  talent: 'Give roster talent a small weight in a shadow copy of the engine and compare closing-line value for four weeks.',
  ratings_side: 'Re-run the 2011 to 2025 backtest with this season added before the model weight moves off zero.',
  ratings_side_3plus: 'Re-run the 2011 to 2025 backtest with this season added before the model weight moves off zero.',
  ratings_total: 'Re-run the 2011 to 2025 backtest with this season added before the model weight moves off zero.',
  wind_under: 'Re-fit the wind ramp on 2003 to date and compare the slope with the one in use.',
  default: 'Run the change as a shadow configuration for four weeks before it touches a recommended pick.',
});

function meanSe(values) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: null, se: null, z: null };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { n, mean, se: null, z: null };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  return { n, mean, se, z: se > 0 ? mean / se : null };
}

/**
 * Where a ledger line stands. Exported for tests.
 * @param {{results:number, weeks:number, z:number|null}} line
 */
export function trendStatus({ results, weeks, z }, rules = TREND_RULES) {
  if (results < rules.watchResults) return 'logging';
  const size = isNum(z) ? Math.abs(z) : 0;
  if (results >= rules.decideResults && weeks >= rules.decideWeeks && size >= rules.decideStdErrors) return 'decide';
  if (size >= rules.watchStdErrors) return 'watch';
  return 'nothing';
}

function pickLine(key, label, list, rules) {
  const graded = list.filter((r) => r.status === 'won' || r.status === 'lost' || r.status === 'push');
  const won = graded.filter((r) => r.status === 'won').length;
  const lost = graded.filter((r) => r.status === 'lost').length;
  const units = meanSe(graded.map((r) => r.units).filter(isNum));
  const clv = meanSe(graded.map((r) => r.clv?.ev).filter(isNum));
  const weeks = new Set(graded.map((r) => r.weekKey ?? r.week ?? r.slateDate).filter((w) => w != null)).size;
  // Closing-line value settles faster than results, so it is the yardstick
  // whenever most of the picks have one.
  const yardstick = clv.n >= Math.max(2, graded.length * 0.6) ? 'closing_line' : 'results';
  const z = yardstick === 'closing_line' ? clv.z : units.z;
  return {
    key, label,
    results: graded.length, weeks,
    record: { won, lost, push: graded.length - won - lost },
    units: r1(graded.reduce((s, r) => s + (isNum(r.units) ? r.units : 0), 0)),
    roiPct: units.n > 0 ? r1(units.mean * 100) : null,
    clvPct: clv.n > 0 ? r1(clv.mean * 100) : null,
    clvResults: clv.n,
    beatClosePct: clv.n > 0 ? r1((graded.filter((r) => isNum(r.clv?.ev) && r.clv.ev > 0).length / clv.n) * 100) : null,
    yardstick,
    stdErrors: r1(z),
    status: trendStatus({ results: graded.length, weeks, z }, rules),
    direction: !isNum(z) || z === 0 ? null : z > 0 ? 'working' : 'not_working',
  };
}

function signalLine(signal, list, rules) {
  const won = list.filter((s) => s.status === 'won').length;
  const lost = list.filter((s) => s.status === 'lost').length;
  const decided = won + lost;
  const weeks = new Set(list.map((s) => s.weekKey ?? s.week ?? s.gameId)).size;
  // An input that knows nothing covers half the time.
  const z = decided > 0 ? (won - decided / 2) / Math.sqrt(decided / 4) : null;
  return {
    key: signal, label: SIGNAL_LABELS[signal] || signal,
    results: decided, weeks,
    record: { won, lost, push: list.length - decided },
    winPct: decided > 0 ? r1((won / decided) * 100) : null,
    yardstick: 'results',
    stdErrors: r1(z),
    status: trendStatus({ results: decided, weeks, z }, rules),
    direction: !isNum(z) || z === 0 ? null : z > 0 ? 'working' : 'not_working',
    nextStep: NEXT_STEP[signal] || NEXT_STEP.default,
  };
}

const TAG_LABELS = {
  market: { runline: 'Spreads', moneyline: 'Moneylines', total: 'Totals' },
  side: { favorite: 'Favorites', underdog: 'Underdogs', pickem: 'Pick’em', over: 'Overs', under: 'Unders' },
  venue: { home: 'Home sides', away: 'Road sides' },
  kind: { price: 'Price picks', wind: 'Wind picks' },
  tier: { tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' },
  lead: { under_24h: 'Locked inside 24 hours', '24_to_48h': 'Locked 24 to 48 hours out', over_48h: 'Locked more than 48 hours out' },
};

/**
 * The season's ledger.
 *
 * @param {object} args
 * @param {Array} args.reviews  reviewPick() results
 * @param {Array} args.signals  reviewSignals() results
 * @returns {{ rules, recommended, tracking, signals, verdicts, findings, counts }}
 */
export function buildLedger({ reviews = [], signals = [] }, rules = TREND_RULES) {
  const group = (role) => {
    const list = reviews.filter((r) => r.role === role);
    const lines = [pickLine('all', role === 'hero' ? 'All recommended picks' : 'All model leans', list, rules)];
    for (const dim of ['market', 'side', 'venue', 'kind', 'tier', 'lead', 'book']) {
      if (role !== 'hero' && !['market', 'side', 'venue'].includes(dim)) continue;
      const values = [...new Set(list.map((r) => r.tags?.[dim]).filter(Boolean))].sort();
      if (dim !== 'book' && values.length < 2 && dim !== 'market') continue;
      for (const v of values) {
        const label = dim === 'book' ? `At ${v}` : (TAG_LABELS[dim]?.[v] || `${dim}: ${v}`);
        lines.push(pickLine(`${dim}:${v}`, label, list.filter((r) => r.tags?.[dim] === v), rules));
      }
    }
    return lines;
  };
  const recommended = group('hero');
  const tracking = group('tracking');
  const bySignal = new Map();
  for (const s of signals) {
    if (!bySignal.has(s.signal)) bySignal.set(s.signal, []);
    bySignal.get(s.signal).push(s);
  }
  const signalLines = [...bySignal.entries()].map(([k, list]) => signalLine(k, list, rules))
    .sort((a, b) => b.results - a.results);

  const verdicts = { good_number_won: 0, good_number_lost: 0, bad_number_won: 0, bad_number_lost: 0, unlucky: 0, fortunate: 0, coinFlips: 0 };
  for (const r of reviews.filter((x) => x.role === 'hero')) {
    if (r.verdict in verdicts) verdicts[r.verdict] += 1;
    if (r.play?.luck === 'unlucky') verdicts.unlucky += 1;
    if (r.play?.luck === 'fortunate') verdicts.fortunate += 1;
    if (r.closeness === 'coin_flip') verdicts.coinFlips += 1;
  }

  const all = [...recommended, ...tracking, ...signalLines];
  const counts = {
    reviews: reviews.length,
    signals: signals.length,
    lines: all.length,
    logging: all.filter((l) => l.status === 'logging').length,
    watch: all.filter((l) => l.status === 'watch').length,
    decide: all.filter((l) => l.status === 'decide').length,
  };
  return { rules, recommended, tracking, signals: signalLines, verdicts, counts, findings: ledgerFindings({ recommended, tracking, signals: signalLines, verdicts, counts }, rules) };
}

/** The ledger in plain sentences. */
export function ledgerFindings(ledger, rules = TREND_RULES) {
  const out = [];
  const rec = ledger.recommended?.[0];
  if (rec && rec.results > 0) {
    const { won, lost, push } = rec.record;
    const clv = rec.clvPct != null ? `, average closing-line value ${rec.clvPct >= 0 ? '+' : ''}${rec.clvPct}% on ${rec.clvResults}` : '';
    out.push(`Recommended picks: ${won}-${lost}${push ? `-${push}` : ''}, ${rec.units >= 0 ? '+' : ''}${rec.units} units${clv}.`);
    if (rec.results < rules.watchResults) {
      out.push(`That is ${rec.results} result${rec.results === 1 ? '' : 's'}. Nothing is read into the record before ${rules.watchResults}.`);
    }
  }
  const v = ledger.verdicts || {};
  if ((v.good_number_lost || 0) + (v.bad_number_won || 0) > 0) {
    out.push(`${v.good_number_lost || 0} lost with a good number and ${v.bad_number_won || 0} won without one: the result and the quality of the bet are tracked apart.`);
  }
  const lines = [...(ledger.recommended || []), ...(ledger.tracking || []), ...(ledger.signals || [])];
  for (const l of lines.filter((x) => x.status === 'decide')) {
    out.push(`Ready for a decision: ${l.label} is ${l.direction === 'working' ? 'ahead' : 'behind'} by ${Math.abs(l.stdErrors)} standard errors over ${l.results} results in ${l.weeks} weeks. ${l.nextStep || NEXT_STEP.default}`);
  }
  for (const l of lines.filter((x) => x.status === 'watch')) {
    out.push(`Watching: ${l.label} (${l.record.won}-${l.record.lost}, ${Math.abs(l.stdErrors)} standard errors ${l.direction === 'working' ? 'ahead' : 'behind'} over ${l.results} results). Not enough to act on.`);
  }
  if (ledger.counts && ledger.counts.decide === 0 && ledger.counts.watch === 0) {
    out.push(`No line in the ledger has reached the bar (${rules.watchResults} results to watch; ${rules.decideResults} over ${rules.decideWeeks} weeks to decide). The engine is unchanged.`);
  }
  return out;
}

/** A slate's reviews in a few counts, for logs and the stored record. */
export function summarizeReviews(reviews = []) {
  const hero = reviews.filter((r) => r.role === 'hero');
  const count = (list, status) => list.filter((r) => r.status === status).length;
  return {
    reviewed: reviews.length,
    recommended: { won: count(hero, 'won'), lost: count(hero, 'lost'), push: count(hero, 'push'), units: r1(hero.reduce((s, r) => s + (isNum(r.units) ? r.units : 0), 0)) },
    coinFlips: hero.filter((r) => r.closeness === 'coin_flip').length,
    unlucky: hero.filter((r) => r.play?.luck === 'unlucky').length,
    fortunate: hero.filter((r) => r.play?.luck === 'fortunate').length,
    missed: [...new Set(hero.flatMap((r) => (r.missed || []).map((m) => m.key)))],
  };
}
