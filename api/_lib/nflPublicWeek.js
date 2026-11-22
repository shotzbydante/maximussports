/**
 * The NFL week as the logged-out home page shows it.
 *
 * Every game of the week with its score or its lines and its biggest
 * position-group matchups, and the three highest-conviction picks in full.
 * A call on any other game is for members, so it never leaves the server:
 * this is the only place the public payload is built, and a game outside
 * the top three carries no pick at all.
 *
 * Which week: the one ESPN calls current, until 5 AM Eastern on the Tuesday
 * after its last kickoff. From then the next week is shown, a day before
 * ESPN's own scoreboard turns over. If the next week has no games yet
 * (the offseason, a bye before the Super Bowl) the finished week stays up.
 *
 * Picks come from the locked rows in storage, the same tickets that get
 * graded. A recommended pick locks the moment it is recommended; a lean
 * locks about a day before kickoff. Recommended picks rank first, then
 * leans, each by conviction, one per game.
 */

import { createCache, coalesce } from '../_cache.js';
import { fetchScoreboardPage, SEASON_TYPE } from '../nfl/live/_normalize.js';
import { enrichGamesWithOdds } from '../nfl/live/_odds.js';
import { getLockedPicks, getLineSnapshots, resolvePicks } from './nflPicksStore.js';
import { getNflTalent, getNflTalentLeague } from './nflTalent.js';
import { getNflInjuries } from './nflInjuries.js';
import { pickLiveStatus } from '../../src/features/nfl/picks/pickLive.js';
import { talentMatchups } from '../../src/features/nfl/picks/v2/talent.js';
import { getNflTeamBySlug, getNflLogoUrl } from '../../src/sports/nfl/teams.js';

export const FEATURED_MAX = 3;
export const MATCHUP_ROWS = 3;
/** Expected value below this is rounding, not value. Mirrors the picks board. */
const VALUE_FLOOR = 0.005;
const HOUR = 3_600_000;
const ROLL_HOUR_ET = 5;
/** A week's last game is over well inside four hours of its kickoff. */
const GAME_ALLOWANCE_MS = 4 * HOUR;

const cache = createCache(30_000);
const CACHE_KEY = 'nfl:public-week:v1';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);

const ET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23',
});
function etWeekdayHour(ms) {
  const parts = ET_PARTS.formatToParts(new Date(ms));
  return {
    weekday: parts.find((p) => p.type === 'weekday')?.value,
    hour: Number(parts.find((p) => p.type === 'hour')?.value),
  };
}

/**
 * When a week gives way to the next one: 5 AM Eastern on the first Tuesday
 * after its last game. Stepped an hour at a time so daylight saving takes
 * care of itself.
 *
 * @param {Array<{ startTime: string }>} games
 * @returns {number|null} epoch ms, or null when no game has a kickoff time
 */
export function rolloverAt(games = []) {
  const kicks = games.map((g) => Date.parse(g?.startTime || '')).filter(Number.isFinite);
  if (kicks.length === 0) return null;
  let t = Math.ceil((Math.max(...kicks) + GAME_ALLOWANCE_MS) / HOUR) * HOUR;
  for (let i = 0; i < 8 * 24; i += 1, t += HOUR) {
    const { weekday, hour } = etWeekdayHour(t);
    if (weekday === 'Tue' && hour === ROLL_HOUR_ET) return t;
  }
  return null;
}

/** The scoreboard pages to try for "the week after this one", in order. */
export function nextWeekCandidates({ week, seasonType, seasonYear } = {}) {
  if (week == null || seasonType == null) return [];
  const at = (w, type) => ({ week: w, seasonType: type, year: seasonYear ?? undefined });
  if (seasonType === SEASON_TYPE.REGULAR) return [week >= 18 ? at(1, SEASON_TYPE.POST) : at(week + 1, SEASON_TYPE.REGULAR)];
  // Postseason week 4 is the Pro Bowl; the Super Bowl is week 5.
  if (seasonType === SEASON_TYPE.POST) return week >= 5 ? [] : [at(week === 3 ? 5 : week + 1, SEASON_TYPE.POST)];
  if (seasonType === SEASON_TYPE.PRE) return [at(week + 1, SEASON_TYPE.PRE), at(1, SEASON_TYPE.REGULAR)];
  return [];
}

const POST_LABEL = { 1: 'Wild Card', 2: 'Divisional Round', 3: 'Conference Championships', 5: 'Super Bowl' };
export function weekLabel({ week, seasonType } = {}) {
  if (week == null) return 'This week';
  if (seasonType === SEASON_TYPE.POST) return POST_LABEL[week] || 'Playoffs';
  if (seasonType === SEASON_TYPE.PRE) return `Preseason Week ${week}`;
  return `Week ${week}`;
}

const isRecommended = (row) => !!row?.tier && row.tier !== 'tracking';
const conviction = (row) => num(row?.payload?.conviction?.score) ?? Math.round((num(row?.bet_score) || 0) * 100);
const MARKET_ORDER = { runline: 0, total: 1, moneyline: 2 };

/** A moneyline lean is only a call when a book pays more than fair. Otherwise it is just a price. */
function isCall(row) {
  if (row.market_type !== 'moneyline' || isRecommended(row)) return true;
  const ev = num(row.expected_value);
  return ev != null && ev >= VALUE_FLOOR;
}

function stronger(a, b) {
  return (isRecommended(b) - isRecommended(a))
    || (conviction(b) - conviction(a))
    || ((num(b.expected_value) ?? -1) - (num(a.expected_value) ?? -1))
    || ((MARKET_ORDER[a.market_type] ?? 9) - (MARKET_ORDER[b.market_type] ?? 9))
    || String(a.locked_at || '').localeCompare(String(b.locked_at || ''));
}

/**
 * The week's top picks: the strongest locked call on each game, then the
 * strongest games. Recommended picks come before leans.
 *
 * @param {Array} rows   locked rows from the picks table
 * @param {Array} games  the week's games (rows for other games are ignored)
 * @returns {Array} up to `max` rows, strongest first, one per game
 */
export function featuredRows(rows = [], games = [], max = FEATURED_MAX) {
  const ids = new Set(games.map((g) => String(g.gameId)));
  const best = new Map();
  for (const row of resolvePicks(rows)) {
    const key = String(row.game_id);
    if (!ids.has(key) || !row.locked_at || !isCall(row)) continue;
    const cur = best.get(key);
    if (!cur || stronger(row, cur) < 0) best.set(key, row);
  }
  return [...best.values()].sort(stronger).slice(0, max);
}

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const sentence = (t) => (t && !/[.!?]$/.test(t) ? `${t}.` : t);

/**
 * One line on why, in the engine's own words. Newer picks carry a short
 * reason; older ones fall back to what the stored headline says after the
 * pick's label.
 */
export function publicWhy(row) {
  const r = row?.payload?.rationale || row?.rationale || {};
  const direct = row?.payload?.whyShort || r.whyShort || row?.payload?.why || r.why;
  if (direct) return sentence(cap(String(direct).replace(/^Lean:\s*/i, '').trim()));
  const headline = String(r.headline || '').trim();
  if (!headline) return '';
  const lean = headline.match(/^Model lean: .*?\. (.+)$/);
  if (lean) return sentence(cap(lean[1]));
  const cut = headline.indexOf(': ');
  return sentence(cap(cut > 0 ? headline.slice(cut + 2) : headline));
}

function team(t) {
  if (!t) return null;
  return {
    slug: t.slug || null,
    abbrev: t.abbrev || '',
    name: t.name || 'TBD',
    nickname: getNflTeamBySlug(t.slug)?.nickname || t.name || 'TBD',
    logo: t.logo || null,
    score: t.score ?? null,
    record: t.record || null,
  };
}

function pickLabel(row, game) {
  const stored = row.payload?.selection?.label;
  if (stored) return stored;
  const line = num(row.line_value);
  if (row.market_type === 'total') return `${row.selection_side === 'over' ? 'Over' : 'Under'} ${line}`;
  const side = row.selection_side === 'home' ? game.teams.home : game.teams.away;
  if (row.market_type === 'runline') return `${side.abbrev} ${line === 0 ? 'PK' : signed(line)}`;
  return `${side.abbrev} ${signed(num(row.price_american))}`;
}

/** A featured pick, reduced to what the home page prints. */
export function publicPick(row, game, rank) {
  const recommended = isRecommended(row);
  const ev = num(row.expected_value);
  const side = row.selection_side === 'home' ? game.teams.home : row.selection_side === 'away' ? game.teams.away : null;
  return {
    rank,
    role: recommended ? 'recommended' : 'lean',
    market: row.market_type,
    side: row.selection_side,
    line: num(row.line_value),
    price: num(row.price_american),
    book: row.book || row.payload?.book?.title || null,
    label: pickLabel(row, game),
    team: side ? { slug: side.slug || null, abbrev: side.abbrev || '', logo: side.logo || null } : null,
    conviction: conviction(row),
    value: recommended && ev != null && ev > 0 ? ev : null,
    lockedAt: row.locked_at,
    why: publicWhy(row),
    result: pickLiveStatus({ market: row.market_type, side: row.selection_side, line: num(row.line_value) }, game),
  };
}

const plainName = (name) => String(name || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').trim();
const SIDELINED = new Set(['out', 'doubtful', 'ir']);

/**
 * Is the quarterback the talent grades rate for this team unavailable?
 * Roster talent rates the season's starter. When he is out or on injured
 * reserve, a quarterback matchup built on his grade would describe a
 * player who is not on the field, so that row is left off the public tile.
 */
export function ratedQuarterbackOut(team, { league = null, injuries = null } = {}) {
  const rated = (league?.teams?.[team?.abbrev]?.players || [])
    .filter((p) => p.group === 'QB')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (!rated) return false;
  const name = plainName(rated.name);
  return (injuries?.teams?.[team?.slug] || [])
    .some((p) => SIDELINED.has(p.status) && plainName(p.name) === name);
}

/**
 * The biggest position-group matchups in a game: which unit, against
 * which, and who it favours. Edges only; the grades behind them and the
 * players are for members.
 *
 * @returns {{ rows: Array<{ offenseTeam, defenseTeam, offense, defense, edge, size, favours }> }|null}
 */
export function publicMatchup(game, { talent = null, league = null, injuries = null, max = MATCHUP_ROWS } = {}) {
  const home = game?.teams?.home;
  const away = game?.teams?.away;
  if (!talent || !home?.abbrev || !away?.abbrev) return null;
  const all = talentMatchups({ home: home.abbrev, away: away.abbrev, talent });
  if (!all) return null;
  const noQuarterback = new Set([home, away]
    .filter((t) => ratedQuarterbackOut(t, { league, injuries }))
    .map((t) => t.abbrev));
  const rows = all.matchups
    .filter((m) => !(m.offense === 'quarterback' && noQuarterback.has(m.offenseTeam)))
    .slice(0, max)
    .map((m) => ({
      offenseTeam: m.offenseTeam, defenseTeam: m.defenseTeam,
      offense: m.offense, defense: m.defense,
      edge: m.edge, size: m.size, favours: m.favours,
    }));
  return rows.length > 0 ? { rows } : null;
}

/** A game, reduced to what a public tile prints. No ratings, projections or engine output. */
export function publicGame(game, { close = null, matchup = null } = {}) {
  const gs = game.gameState || {};
  const m = game.market || {};
  const started = game.status === 'live' || game.status === 'final';
  // ESPN drops a game's odds once it is final, so a finished game shows the line it closed at.
  const useClose = game.status === 'final' && close && (num(close.spread_home) != null || num(close.total) != null);
  return {
    gameId: String(game.gameId),
    status: game.status,
    startTime: game.startTime || null,
    teams: { away: team(game.teams?.away), home: team(game.teams?.home) },
    state: {
      label: gs.periodLabel || null,
      live: !!gs.isLive,
      final: !!gs.isFinal,
      overtime: !!gs.isOvertime,
      possession: gs.isLive ? gs.possession || null : null,
    },
    lines: {
      spreadHome: useClose ? num(close.spread_home) : num(m.pregameSpread),
      total: useClose ? num(close.total) : num(m.pregameTotal),
      moneyline: !started && m.moneyline ? { home: num(m.moneyline.home), away: num(m.moneyline.away) } : null,
      kind: useClose ? 'closed' : game.status === 'live' ? 'live' : 'current',
    },
    venue: {
      name: game.venue?.name || null,
      city: game.venue?.city || null,
      state: game.venue?.state || null,
      neutralSite: !!game.venue?.neutralSite,
    },
    network: game.broadcast?.network || null,
    matchup,
    pick: null,
  };
}

const STATUS_ORDER = { live: 0, upcoming: 1, final: 2, postponed: 3 };

/**
 * Pure: the public payload for one week.
 *
 * @param {object} args
 * @param {object} args.page    a scoreboard page: { games, week, seasonType, seasonYear, byeTeams }
 * @param {Array}  [args.rows]  locked pick rows for the week's games
 * @param {Map}    [args.closes] closing-line snapshots keyed by game id
 * @param {object} [args.next]  { week, seasonType } of the week that takes over, when known
 * @param {object} [args.talent]   unit grades per team, for the position-group matchups
 * @param {object} [args.league]   rated starters per team, to know whose quarterback grade it is
 * @param {object} [args.injuries] the league injury report
 */
export function buildPublicWeek({
  page, rows = [], closes = new Map(), next = null, now = Date.now(),
  talent = null, league = null, injuries = null,
}) {
  const games = page?.games || [];
  const featured = featuredRows(rows, games);
  const rankOf = new Map(featured.map((row, i) => [String(row.game_id), { row, rank: i + 1 }]));

  const out = games.map((g) => {
    const pub = publicGame(g, {
      close: closes.get(String(g.gameId)) || null,
      matchup: publicMatchup(g, { talent, league, injuries }),
    });
    const hit = rankOf.get(pub.gameId);
    if (hit) pub.pick = publicPick(hit.row, g, hit.rank);
    return pub;
  }).sort((a, b) =>
    ((a.pick?.rank ?? 99) - (b.pick?.rank ?? 99))
    || ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
    || (Date.parse(a.startTime || '') - Date.parse(b.startTime || '')));

  const count = (s) => games.filter((g) => g.status === s).length;
  const counts = { live: count('live'), upcoming: count('upcoming'), final: count('final') };
  const phase = counts.live > 0 ? 'live'
    : counts.upcoming === 0 && counts.final > 0 ? 'final'
      : counts.final > 0 ? 'underway' : 'upcoming';
  const rolls = rolloverAt(games);

  return {
    ok: true,
    week: page?.week ?? null,
    seasonType: page?.seasonType ?? null,
    seasonYear: page?.seasonYear ?? null,
    label: weekLabel(page),
    phase,
    counts,
    games: out,
    featured: featured.length,
    locked: out.length - featured.length,
    byeTeams: (page?.byeTeams || []).map((slug) => {
      const t = getNflTeamBySlug(slug);
      return t ? { slug: t.slug, abbrev: t.abbrev, nickname: t.nickname, logo: getNflLogoUrl(t.slug) } : null;
    }).filter(Boolean),
    rollsAt: rolls ? new Date(rolls).toISOString() : null,
    nextLabel: next ? weekLabel(next) : null,
    generatedAt: new Date(now).toISOString(),
  };
}

/**
 * Which scoreboard page to show right now.
 * @returns {Promise<{ page, next }>} `next` names the week that takes over on Tuesday, when there is one
 */
export async function resolveDisplayWeek({ now = Date.now(), fetchPage = fetchScoreboardPage } = {}) {
  const current = await fetchPage();
  const candidates = nextWeekCandidates(current);
  const upcoming = candidates[0] ? { week: candidates[0].week, seasonType: candidates[0].seasonType } : null;
  const rolls = rolloverAt(current.games);
  if (!current.ok || rolls == null || now < rolls) return { page: current, next: upcoming };

  for (const args of candidates) {
    const page = await fetchPage(args);
    if (page.ok && page.games.length > 0) return { page, next: null };
  }
  // Nothing scheduled after this week yet: the finished week stays up.
  return { page: current, next: null };
}

/** The public week, cached for half a minute per instance. */
export async function getPublicWeek({ now = Date.now() } = {}) {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const body = await coalesce(CACHE_KEY, async () => {
    const { page, next } = await resolveDisplayWeek({ now });
    let games = page.games;
    try { games = await enrichGamesWithOdds(games); }
    catch (err) { console.warn('[nflPublicWeek] odds enrichment failed:', err?.message); }

    const ids = games.map((g) => g.gameId);
    const finals = games.filter((g) => g.status === 'final').map((g) => g.gameId);
    const [locked, closes, talent, league, injuries] = await Promise.all([
      getLockedPicks(ids),
      finals.length > 0 ? getLineSnapshots(finals) : new Map(),
      getNflTalent().catch(() => null),
      getNflTalentLeague().catch(() => null),
      getNflInjuries().catch(() => null),
    ]);
    return buildPublicWeek({ page: { ...page, games }, rows: locked.rows || [], closes, next, now, talent, league, injuries });
  });

  if (body.games.length > 0) {
    cache.set(CACHE_KEY, body);
    return body;
  }
  // An empty answer (an ESPN hiccup): prefer the last good week.
  const stale = cache.getMaybeStale(CACHE_KEY);
  return stale?.value?.games?.length > 0 ? stale.value : body;
}
