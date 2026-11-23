/**
 * Ask Maximus tools: what the model can look up and what it can show.
 *
 * Read tools return facts. Every number in a result is already formatted
 * the way it may be quoted ("+3.5%", "-110", "KC -3"), and the system
 * prompt forbids any number that did not come from one. Policy is applied
 * here, before the model sees anything: a pick the account's plan does not
 * include is left out of the result, so there is nothing to leak.
 *
 * Display tools take ids only. The server builds each card from the data
 * row (cards.js) and stores it with the answer.
 *
 * A turn's context (`ctx`):
 *   connector  AskDataConnector, one per turn (memoized)
 *   limits     from policy.limitsFor(tier)
 *   cards      cards collected from display tools this turn (output)
 */

import { resolveNflTeam, getNflTeamBySlug } from '../../../src/sports/nfl/teams.js';
import { openPickIds, rankPicks, isFresh, LIVE_FRESH_MS } from './policy.js';
import {
  pickCard, inPlayPickCard, gameCard, recordCard, lockedCard, chipsCard,
  fmtOdds, fmtLine, fmtPct, kickoffET, MARKET_LABEL,
} from './cards.js';

const MARKET_ARG = { spread: 'runline', moneyline: 'moneyline', total: 'total' };
const MAX_CARDS = 8;
const QUOTE_RULE = 'Quote numbers exactly as written here. Do not calculate, round or estimate new ones.';

const stamp = (asOfMs) => (asOfMs ? `${new Date(asOfMs).toLocaleString('en-US', {
  weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
}).replace(',', '')} ET` : null);

const followups = {
  type: 'array',
  maxItems: 3,
  items: { type: 'string' },
  description: 'Up to 3 short follow-up questions the user might tap next, each under 40 characters, written as the user would say them.',
};

export const TOOL_DEFS = [
  {
    name: 'get_picks',
    description: 'Maximus\'s NFL picks for this week: recommended picks (a book\'s price beats the market) and, where the plan allows, model leans. Also returns recommended picks whose games have already kicked off, with where each stands. Use for any question about picks, best bets, what Maximus likes, or how this week\'s picks are doing.',
    input_schema: {
      type: 'object',
      properties: {
        market: { type: 'string', enum: ['spread', 'moneyline', 'total'], description: 'Only this market.' },
        team: { type: 'string', description: 'Only picks on this team\'s game. Team name, nickname or abbreviation.' },
        include_leans: { type: 'boolean', description: 'Also return model leans that are not recommended picks. Default false.' },
      },
    },
  },
  {
    name: 'get_slate',
    description: 'Every NFL game this week: teams, kickoff, live score or final, and the consensus spread, total and moneyline. Use for schedule, scores and "what are the lines" questions.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_game',
    description: 'Everything Maximus has on one game this week: lines, weather, quarterbacks, unit-against-unit mismatches, schedule spots, injuries to watch, and the picks on it. Use for "break down", "analysis" and "why" questions about a matchup.',
    input_schema: {
      type: 'object',
      properties: { team: { type: 'string', description: 'Either team in the game. Name, nickname or abbreviation.' } },
      required: ['team'],
    },
  },
  {
    name: 'get_record',
    description: 'How Maximus\'s published NFL picks have done: season and recent record, units, return and closing-line value, with the most recent graded picks. Use for any question about track record or accuracy.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_injuries',
    description: 'One team\'s current injury report.',
    input_schema: {
      type: 'object',
      properties: { team: { type: 'string', description: 'Team name, nickname or abbreviation.' } },
      required: ['team'],
    },
  },
  {
    name: 'get_standings',
    description: 'NFL standings: record, division rank and playoff seed. Pass a team for that team and its division, or nothing for every division leader.',
    input_schema: { type: 'object', properties: { team: { type: 'string' } } },
  },
  {
    name: 'show_picks',
    description: 'Show picks to the user as cards. Pass ids from get_picks or get_game, best first. The server builds each card with the teams, line, price, book and reason, so do not repeat those in your words. Ends your turn.',
    input_schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_CARDS },
        followups,
      },
      required: ['ids'],
    },
  },
  {
    name: 'show_games',
    description: 'Show games to the user as cards with score or kickoff and the consensus lines. Pass game_id values from get_slate or get_game. Ends your turn.',
    input_schema: {
      type: 'object',
      properties: {
        game_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_CARDS },
        followups,
      },
      required: ['game_ids'],
    },
  },
  {
    name: 'show_record',
    description: 'Show the graded record card. Ends your turn.',
    input_schema: { type: 'object', properties: { followups } },
  },
];

export const DISPLAY_TOOLS = new Set(['show_picks', 'show_games', 'show_record']);

/** In-character status line while a tool runs. Never "searching". */
export const TOOL_STATUS = {
  get_picks: 'Pulling the board',
  get_slate: 'Checking the slate',
  get_game: 'Breaking down the matchup',
  get_record: 'Opening the ledger',
  get_injuries: 'Reading the injury report',
  get_standings: 'Checking the standings',
};

// ── Fact shaping ────────────────────────────────────────────────────────────

const abbr = (t) => t?.abbrev || t?.shortName || '';
const matchup = (away, home) => `${abbr(away)} at ${abbr(home)}`;
const fullMatchup = (away, home) => `${away?.name || abbr(away)} at ${home?.name || abbr(home)}`;

function pickFact(p) {
  const lock = p.lock || null;
  const price = lock?.price ?? p.market?.priceAmerican;
  const m = p.matchup || {};
  return {
    id: p.id,
    pick: p.selection?.label,
    market: MARKET_LABEL[p.market?.type] || p.market?.type,
    price: fmtOdds(price) || null,
    book: lock?.book || p.book?.title || null,
    game: fullMatchup(m.awayTeam, m.homeTeam),
    kickoff: kickoffET(m.startTime),
    status: p.pickRole === 'hero' ? 'recommended' : 'lean (tracked and graded, not recommended)',
    conviction: `${p.conviction?.score ?? Math.round((p.betScore?.total || 0) * 100)} of 100`,
    expected_value: typeof p.ev === 'number' ? fmtPct(lock?.evAtLock ?? p.ev) : null,
    fair_price: p.fair?.priceAmerican != null ? fmtOdds(p.fair.priceAmerican) : null,
    why: p.why || p.rationale?.why || null,
    detail: (p.rationale?.bullets || []).slice(0, p.pickRole === 'hero' ? 4 : 2),
    locked_at: lock?.lockedAt ? stamp(Date.parse(lock.lockedAt)) : null,
  };
}

function inPlayFact(row) {
  return {
    id: `live-${row.id}`,
    pick: row.label,
    price: fmtOdds(row.price) || null,
    book: row.book || null,
    game: matchup(row.away, row.home),
    game_status: row.gameStatus,
    score: row.away?.score != null && row.home?.score != null
      ? `${row.away.abbrev} ${row.away.score}, ${row.home.abbrev} ${row.home.score}` : null,
    clock: row.clock || null,
    standing: row.status?.verdict || null,
    standing_text: row.status?.text || null,
    why: row.why || row.whyShort || null,
  };
}

function gameFact(g) {
  const { away, home } = g.teams || {};
  const mk = g.market || {};
  const live = g.status === 'live';
  return {
    game_id: String(g.gameId),
    game: fullMatchup(away, home),
    short: matchup(away, home),
    status: g.status,
    kickoff: kickoffET(g.startTime),
    score: away?.score != null && home?.score != null && g.status !== 'upcoming'
      ? `${away.abbrev} ${away.score}, ${home.abbrev} ${home.score}` : null,
    clock: live ? g.gameState?.periodLabel || null : null,
    records: [away, home].filter((t) => t?.record).map((t) => `${t.abbrev} ${t.record}`).join(', ') || null,
    spread: mk.pregameSpread != null ? `${home.abbrev} ${fmtLine(mk.pregameSpread)}` : null,
    total: mk.pregameTotal != null ? `${mk.pregameTotal}` : null,
    moneyline: mk.moneyline?.home != null && mk.moneyline?.away != null
      ? `${home.abbrev} ${fmtOdds(mk.moneyline.home)}, ${away.abbrev} ${fmtOdds(mk.moneyline.away)}` : null,
    lines_from: mk.booksCount ? `consensus of ${mk.booksCount} books` : (mk.pregameSpread != null ? 'market consensus' : null),
    network: g.broadcast?.network || null,
  };
}

const resolveTeamArg = (v) => resolveNflTeam(String(v || '').replace(/^the\s+/i, ''));

function inGame(teamSlug) {
  return (x) => x?.awayTeam?.slug === teamSlug || x?.homeTeam?.slug === teamSlug
    || x?.matchup?.awayTeam?.slug === teamSlug || x?.matchup?.homeTeam?.slug === teamSlug
    || x?.teams?.away?.slug === teamSlug || x?.teams?.home?.slug === teamSlug
    || x?.away?.slug === teamSlug || x?.home?.slug === teamSlug;
}

function planNote(lockedCount, limits) {
  if (!lockedCount) return null;
  return `${lockedCount} more recommended ${lockedCount === 1 ? 'pick is' : 'picks are'} reserved for Pro members and ${lockedCount === 1 ? 'is' : 'are'} not in this result. You may say that Pro unlocks ${lockedCount === 1 ? 'it' : 'them'}; never guess what ${lockedCount === 1 ? 'it is' : 'they are'}. This plan: ${limits.tier}.`;
}

// ── Read tools ──────────────────────────────────────────────────────────────

async function getPicks(input, ctx) {
  const [{ board, asOf, stale }, live] = await Promise.all([
    ctx.connector.picks(),
    ctx.connector.inPlay().catch(() => ({ picks: [] })),
  ]);
  const { open, lockedCount } = openPickIds(board, ctx.limits);
  const market = MARKET_ARG[input?.market] || null;
  const team = input?.team ? resolveTeamArg(input.team) : null;
  if (input?.team && !team) return { error: `No NFL team matches "${input.team}".` };

  const pool = [...(board?.heroPicks || []), ...(input?.include_leans ? board?.trackingPicks || [] : [])];
  const seen = new Set();
  const picks = rankPicks(pool)
    .filter((p) => p && open.has(p.id) && !seen.has(p.id) && seen.add(p.id))
    .filter((p) => !market || p.market?.type === market)
    .filter((p) => !team || inGame(team.slug)(p))
    .slice(0, 12)
    .map(pickFact);
  const inPlay = (live.picks || [])
    .filter((r) => !market || r.market === market)
    .filter((r) => !team || inGame(team.slug)(r))
    .map(inPlayFact);

  return {
    week: board?.slateLabel || (board?.week ? `Week ${board.week}` : null),
    as_of: stamp(asOf),
    stale: stale ? 'These prices are older than 15 minutes. Say so if you quote them.' : undefined,
    picks,
    already_kicked_off: inPlay,
    none: picks.length === 0 && inPlay.length === 0
      ? 'No recommended pick matches. Most games are a pass: a pick is published only when a book\'s price beats the market.' : undefined,
    plan_note: planNote(lockedCount, ctx.limits) || undefined,
    rule: QUOTE_RULE,
  };
}

async function getSlate(_input, ctx) {
  const { games, week, asOf } = await ctx.connector.games();
  return {
    week: week ? `Week ${week}` : null,
    as_of: stamp(asOf),
    games: games.map(gameFact),
    rule: QUOTE_RULE,
  };
}

async function getGame(input, ctx) {
  const team = resolveTeamArg(input?.team);
  if (!team) return { error: `No NFL team matches "${input?.team || ''}".` };
  const [{ games, asOf }, { board }, live] = await Promise.all([
    ctx.connector.games(),
    ctx.connector.picks().catch(() => ({ board: null })),
    ctx.connector.inPlay().catch(() => ({ picks: [] })),
  ]);
  const game = games.find(inGame(team.slug));
  if (!game) return { error: `${team.name} do not play this week (bye, or the week has not been posted).` };

  const fact = gameFact(game);
  const detail = (board?.byGame || []).find((g) => String(g.gameId) === String(game.gameId)) || null;
  const pro = ctx.limits.tier === 'pro';
  const { open } = openPickIds(board, ctx.limits);

  if (detail) {
    const env = detail.environment || {};
    fact.conditions = env.label || null;
    fact.quarterbacks = ['away', 'home'].map((side) => {
      const q = detail.quarterbacks?.[side];
      if (!q?.starter) return null;
      return `${q.team}: ${q.starter}${q.uncertain ? ` (in doubt${q.reason ? `: ${q.reason}` : ''})` : ''}${q.changed ? ' (change at quarterback)' : ''}`;
    }).filter(Boolean);
    fact.unit_mismatches = (detail.units?.mismatches || []).slice(0, 3).map((u) =>
      `${u.offenseTeam} ${String(u.offense).replace(/([A-Z])/g, ' $1').toLowerCase()} (grade ${u.offenseGrade}) against ${u.defenseTeam} ${String(u.defense).replace(/([A-Z])/g, ' $1').toLowerCase()} (grade ${u.defenseGrade})`);
    fact.schedule_spots = (detail.situations || []).map((s) => s.note).filter(Boolean).slice(0, 3);
    if (pro && detail.projection) {
      const p = detail.projection;
      const fav = p.margin >= 0 ? detail.homeTeam : detail.awayTeam;
      fact.maximus_projection = `${abbr(fav)} by ${Math.abs(p.margin)}, total ${p.total}. This is the model's lean. It is graded, but it is not a recommended pick.`;
    }
    const onGame = Object.values(detail.picks || {}).filter(Boolean);
    fact.picks_on_this_game = rankPicks(onGame).filter((p) => open.has(p.id)).map(pickFact);
    const hidden = onGame.filter((p) => p.pickRole === 'hero' && !open.has(p.id)).length;
    if (hidden) fact.plan_note = planNote(hidden, ctx.limits);
    else if (!pro) {
      fact.plan_note = 'The model projection and leans for this game are a Pro feature and are not in this result. You may say so; never guess them.';
    }
  }
  const started = (live.picks || []).filter((r) => String(r.gameId) === String(game.gameId)).map(inPlayFact);
  if (started.length) fact.picks_already_kicked_off = started;

  for (const side of ['away', 'home']) {
    const t = game.teams?.[side];
    if (!t?.slug) continue;
    const inj = await ctx.connector.injuries(t.slug).catch(() => null);
    const key = (inj?.injuries || []).filter((p) => p.status === 'out' || p.status === 'doubtful').slice(0, 6);
    if (key.length) {
      fact[`${side}_injuries`] = key.map((p) => `${p.name} (${p.position || 'n/a'}): ${p.statusLabel}${p.injury ? `, ${p.injury}` : ''}`);
    }
  }
  fact.as_of = stamp(asOf);
  if (game.status === 'live' && !isFresh(asOf, { maxAgeMs: LIVE_FRESH_MS })) fact.stale = 'Score may have moved.';
  fact.rule = QUOTE_RULE;
  return fact;
}

const recText = (r) => (r ? `${r.won}-${r.lost}${r.push ? `-${r.push}` : ''}` : null);

function perfFact(label, perf, fallback) {
  const r = perf?.record || fallback;
  if (!r || (r.won + r.lost + (r.push || 0)) === 0) return null;
  return {
    span: label,
    record: recText(r),
    win_rate: perf?.winPct != null ? `${perf.winPct}%` : null,
    units: perf?.units != null ? `${perf.units > 0 ? '+' : ''}${perf.units}` : null,
    return_per_pick: perf?.roiPct != null ? `${perf.roiPct > 0 ? '+' : ''}${perf.roiPct}%` : null,
    beat_closing_line: perf?.beatClosePct != null ? `${perf.beatClosePct}% of ${perf.clvSample} picks` : null,
  };
}

async function getRecord(_input, ctx) {
  const card = await ctx.connector.record();
  if (!card) return { error: 'The record is unavailable right now.' };
  const season = card.season;
  const days = card.window?.days || 9;
  const recent = [];
  for (const slate of card.slates || []) {
    for (const p of slate.picks || []) {
      if (p.pickRole !== 'hero' || p.status === 'pending') continue;
      recent.push({
        pick: p.label,
        game: `${p.awayAbbrev} at ${p.homeAbbrev}`,
        date: p.slateDate,
        result: p.status,
        final: p.finalScore,
        price: fmtOdds(p.price) || null,
        book: p.book,
        review: p.review?.summary || p.review?.note || (typeof p.review === 'string' ? p.review : null),
      });
    }
  }
  const out = {
    what_is_graded: 'Recommended picks, each at the line, price and book it was locked at. Leans are graded separately.',
    recommended: [
      perfFact('Season', season?.performance?.hero, season?.byPickRole?.hero),
      perfFact(`Last ${days} days`, card.performance?.hero, card.byPickRole?.hero),
    ].filter(Boolean),
    leans: [
      perfFact('Season', season?.performance?.tracking, season?.byPickRole?.tracking),
    ].filter(Boolean),
    by_market_season: season?.byMarket
      ? Object.fromEntries(Object.entries(season.byMarket).map(([k, v]) => [MARKET_LABEL[k] || k, recText(v)])) : null,
    last_graded: season?.lastGradedDate || null,
    recent_results: recent.slice(0, 8),
    rule: QUOTE_RULE,
  };
  if (out.recommended.length === 0 && recent.length === 0) out.none = 'No recommended pick has been graded yet.';
  return out;
}

async function getInjuries(input, ctx) {
  const team = resolveTeamArg(input?.team);
  if (!team) return { error: `No NFL team matches "${input?.team || ''}".` };
  const { injuries, summary, asOf, stale } = await ctx.connector.injuries(team.slug);
  return {
    team: team.name,
    as_of: stamp(asOf),
    stale: stale ? 'The injury feed is delayed; this report may be out of date. Say so.' : undefined,
    counts: { out: summary.out, doubtful: summary.doubtful, questionable: summary.questionable, injured_reserve: summary.ir },
    players: injuries.filter((p) => p.status !== 'ir').slice(0, 20).map((p) => ({
      name: p.name, position: p.position, status: p.statusLabel, injury: p.injury || null, note: p.comment || null,
    })),
    none: injuries.length === 0 ? 'No injuries listed.' : undefined,
  };
}

async function getStandings(input, ctx) {
  const { teams, asOf } = await ctx.connector.standings();
  const row = (t) => ({
    team: t.name,
    record: t.record,
    division: t.division,
    division_rank: t.divisionRank,
    playoff_seed: t.playoffSeed,
    streak: t.streak,
    point_diff: t.pointDiff,
  });
  const all = Object.values(teams || {});
  if (input?.team) {
    const team = resolveTeamArg(input.team);
    if (!team) return { error: `No NFL team matches "${input.team}".` };
    const mine = teams[team.slug];
    const division = all.filter((t) => t.division === mine?.division)
      .sort((a, b) => (a.divisionRank ?? 9) - (b.divisionRank ?? 9));
    return { as_of: stamp(asOf), team: mine ? row(mine) : null, division: division.map(row) };
  }
  const leaders = all.filter((t) => t.divisionRank === 1);
  return { as_of: stamp(asOf), division_leaders: leaders.map(row) };
}

// ── Display tools ───────────────────────────────────────────────────────────

function addChips(input, ctx) {
  const chips = chipsCard(input?.followups || []);
  if (chips) ctx.chips = chips;
}

async function showPicks(input, ctx) {
  const ids = [...new Set((input?.ids || []).map(String))].slice(0, MAX_CARDS);
  const wantsLive = ids.some((id) => id.startsWith('live-'));
  const [{ board, asOf, stale }, live] = await Promise.all([
    ctx.connector.picks(),
    wantsLive ? ctx.connector.inPlay() : Promise.resolve({ picks: [], asOf: null }),
  ]);
  const { open, lockedCount } = openPickIds(board, ctx.limits);
  const byId = new Map();
  for (const p of [...(board?.fullSlatePicks || []), ...(board?.heroPicks || [])]) if (p?.id) byId.set(p.id, p);
  const liveById = new Map((live.picks || []).map((r) => [`live-${r.id}`, r]));

  const shownIds = [];
  const unknown = [];
  let withheld = 0;
  for (const id of ids) {
    if (liveById.has(id)) { ctx.cards.push(inPlayPickCard(liveById.get(id), { asOf: live.asOf })); shownIds.push(id); }
    else if (byId.has(id) && open.has(id)) { ctx.cards.push(pickCard(byId.get(id), { asOf, stale })); shownIds.push(id); }
    else if (byId.has(id)) withheld += 1;
    else unknown.push(id);
  }
  if (lockedCount > 0 && (shownIds.length > 0 || withheld > 0)) ctx.cards.push(lockedCard(lockedCount));
  addChips(input, ctx);
  return { shown: shownIds, unknown_ids: unknown.length ? unknown : undefined, not_in_plan: withheld || undefined };
}

async function showGames(input, ctx) {
  const ids = [...new Set((input?.game_ids || []).map((id) => String(id).replace(/^game-/, '')))].slice(0, MAX_CARDS);
  const { games, asOf } = await ctx.connector.games();
  const byId = new Map(games.map((g) => [String(g.gameId), g]));
  const shownIds = [];
  const unknown = [];
  for (const id of ids) {
    if (byId.has(id)) { ctx.cards.push(gameCard(byId.get(id), { asOf })); shownIds.push(id); }
    else unknown.push(id);
  }
  addChips(input, ctx);
  return { shown: shownIds, unknown_ids: unknown.length ? unknown : undefined };
}

async function showRecord(input, ctx) {
  const card = recordCard(await ctx.connector.record(), { asOf: Date.now() });
  if (card) ctx.cards.push(card);
  addChips(input, ctx);
  return card ? { shown: ['record'] } : { shown: [], note: 'No graded record to show yet.' };
}

const EXECUTORS = {
  get_picks: getPicks,
  get_slate: getSlate,
  get_game: getGame,
  get_record: getRecord,
  get_injuries: getInjuries,
  get_standings: getStandings,
  show_picks: showPicks,
  show_games: showGames,
  show_record: showRecord,
};

/**
 * Run one tool call. Never throws: a failure comes back as `{ error }` so
 * the model can say what it could not look up instead of the turn dying.
 */
export async function runTool(name, input, ctx) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `Unknown tool ${name}.` };
  try {
    return await fn(input || {}, ctx);
  } catch (err) {
    console.error(`[ask/tools] ${name} failed: ${err?.message}`);
    return { error: 'That lookup failed. Tell the user you could not pull it up right now.' };
  }
}

/** The team a slug names, for the context line in the system prompt. */
export const teamName = (slug) => getNflTeamBySlug(slug)?.nickname || null;
