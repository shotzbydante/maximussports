/**
 * The NFL daily post: what we hit, what is on tonight, and the games to watch
 * over the next week. Three slides, built from the normalized studio payload
 * pieces so the slides and the caption read the same facts.
 *
 * "Hits" lists winning calls only, by request. It never states or implies a
 * record: the slide says "the ones that hit" and points at the full record,
 * which is public at /record with the losses on it.
 */

const ET = 'America/New_York';
const DAY_MS = 86_400_000;
export const HITS_MAX = 5;
export const AHEAD_MAX = 6;

export function ymdET(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}
const dayName = (d, style = 'long') => new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: style }).format(new Date(d));
const dayNameOfYmd = (ymd, style = 'long') => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: style }).format(new Date(`${ymd}T12:00:00Z`));

/** The fourth Thursday of November, as an Eastern date. */
export function isThanksgiving(d) {
  const ymd = ymdET(d);
  const [y, m, day] = ymd.split('-').map(Number);
  if (m !== 11) return false;
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - first + 7) % 7);
  return day === firstThursday + 21;
}

const MARKET_WORD = { total: 'Total', runline: 'Spread', moneyline: 'Moneyline' };

/** How a winning call landed, in a few words. */
function marginNote(pick) {
  const by = pick.review?.by;
  if (by == null) return null;
  const n = Math.abs(Number(by));
  const pts = `${n % 1 === 0 ? n : n.toFixed(1)} ${n === 1 ? 'point' : 'points'}`;
  if (pick.market === 'moneyline') return `Won by ${pts}`;
  return `Covered by ${pts}`;
}

/**
 * Winning calls from the most recent graded day, recommended picks first,
 * then leans by how comfortably they got home.
 */
export function buildHits(scorecard, now) {
  const today = ymdET(now);
  const slates = (scorecard?.slates || [])
    .filter((s) => s.date < today && (s.picks || []).some((p) => p.status === 'won'))
    .sort((a, b) => b.date.localeCompare(a.date));
  const slate = slates[0];
  if (!slate) return null;
  const ageDays = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${slate.date}T12:00:00Z`)) / DAY_MS);
  if (ageDays > 3) return null; // stale wins are not news

  const won = slate.picks.filter((p) => p.status === 'won' && !p.provisional);
  const role = (p) => (p.pickRole === 'hero' ? 0 : 1);
  const sorted = [...won].sort((a, b) => role(a) - role(b) || Math.abs(b.review?.by ?? 0) - Math.abs(a.review?.by ?? 0));
  const rows = sorted.slice(0, HITS_MAX).map((p) => ({
    id: p.id,
    label: p.label,
    market: MARKET_WORD[p.market] || p.market,
    recommended: p.pickRole === 'hero',
    matchup: `${p.awayAbbrev} @ ${p.homeAbbrev}`,
    awaySlug: p.awayTeam,
    homeSlug: p.homeTeam,
    finalScore: p.finalScore || null,
    note: marginNote(p),
    priceLabel: p.price != null ? (p.price > 0 ? `+${p.price}` : `${p.price}`) : null,
  }));
  const byMarket = {};
  for (const p of won) byMarket[p.market] = (byMarket[p.market] || 0) + 1;
  return {
    date: slate.date,
    dayName: dayNameOfYmd(slate.date),
    isYesterday: ageDays === 1,
    count: won.length,
    recommendedCount: won.filter((p) => p.pickRole === 'hero').length,
    totalsCount: byMarket.total || 0,
    spreadsCount: byMarket.runline || 0,
    moneylinesCount: byMarket.moneyline || 0,
    more: Math.max(0, won.length - rows.length),
    rows,
  };
}

const NIGHT_HOUR_ET = 19;
function hourET(d) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hour12: false }).format(new Date(d))) % 24;
}

/** Why a game is worth circling. Standalone windows and close lines lead. */
function watchScore(g) {
  const day = dayName(g.startTime, 'short');
  let s = 0;
  if (isThanksgiving(g.startTime)) s += 6;
  else if (day !== 'Sun') s += 5;                      // Wed, Thu, Fri, Sat, Mon: the only game on
  else if (hourET(g.startTime) >= NIGHT_HOUR_ET) s += 4; // Sunday night
  if (g.spreadHome != null) s += Math.max(0, 3 - Math.abs(Number(g.spreadHome)) / 2); // a field goal or less scores highest
  if (g.picks?.length) s += 2;
  return s;
}

function windowLabel(g) {
  if (isThanksgiving(g.startTime)) return 'Thanksgiving';
  const day = dayName(g.startTime, 'short');
  const night = hourET(g.startTime) >= NIGHT_HOUR_ET;
  if (day === 'Mon') return 'Monday night';
  if (day === 'Thu') return 'Thursday night';
  if (day === 'Sun' && night) return 'Sunday night';
  if (day === 'Sun') return 'Sunday';
  return `${dayName(g.startTime)}${night ? ' night' : ''}`;
}

const brief = (g) => ({
  id: g.id,
  away: g.away,
  home: g.home,
  startTime: g.startTime,
  window: windowLabel(g),
  kickoffDay: g.kickoffDay,
  kickoffTime: g.kickoffTime,
  network: g.network || null,
  spreadLabel: g.spreadLabel || null,
  total: g.total ?? null,
  pick: g.picks?.[0] || null,
});

/**
 * @param {object} o
 * @param {object} o.scorecard   /api/nfl/picks/scorecard
 * @param {Array}  o.games       this week's normalized games
 * @param {Array}  o.nextGames   next week's normalized games
 * @param {Date}   o.now
 */
export function buildNflDaily({ scorecard, games = [], nextGames = [], nextLabel = null, now = new Date() }) {
  const today = ymdET(now);
  const upcoming = [...games, ...nextGames]
    .filter((g) => g.status === 'upcoming' && g.startTime && g.away && g.home)
    .filter((g, i, all) => all.findIndex((x) => x.id === g.id) === i)
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

  const todays = upcoming.filter((g) => ymdET(g.startTime) === today);
  // The standalone or latest game leads when several kick off today.
  const lead = [...todays].sort((a, b) => (b.picks?.length || 0) - (a.picks?.length || 0) || String(b.startTime).localeCompare(String(a.startTime)))[0] || null;

  const horizon = Date.parse(`${today}T12:00:00Z`) + 8 * DAY_MS;
  const later = upcoming.filter((g) => ymdET(g.startTime) > today && Date.parse(g.startTime) < horizon);
  const key = [...later].sort((a, b) => watchScore(b) - watchScore(a)).slice(0, AHEAD_MAX)
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

  const hits = buildHits(scorecard, now);
  const thanksgivingGames = later.filter((g) => isThanksgiving(g.startTime)).length;

  return {
    todayName: dayName(now),
    hits,
    tonight: lead ? { ...brief(lead), game: lead, others: todays.length - 1 } : null,
    ahead: {
      label: nextLabel,
      games: key.map(brief),
      totalGames: later.length,
      firstDay: later[0] ? dayName(later[0].startTime) : null,
      thanksgivingGames,
    },
    ready: !!(hits || lead || key.length),
  };
}
