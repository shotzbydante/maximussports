/**
 * The Daily Brief: what the morning email says, worked out from data.
 *
 * Pure. Given what the app already serves (the NFL scorecard and brief, last
 * night's NBA finals, the NBA picks ledger, board and brief), this returns a
 * view model the template only has to lay out. Nothing here writes a
 * sentence about a result that the numbers do not carry.
 *
 * Order of the email: football first (what happened, then what is next),
 * then the NBA (last night, then tonight).
 *
 * Words used for our calls, the same as the app:
 *   pick  a recommended bet: one book's price that beats the market's fair price
 *   lean  the model's side on every other market, tracked and graded, not a bet
 */
import { pickLiveStatus } from '../../features/nfl/picks/pickLive.js';
import { maximusPicks, nbaPickSummary } from '../../features/nba/picks/pickSummary.js';

const ET = 'America/New_York';
const SETTLED = new Set(['won', 'lost', 'push']);
const MARKET_ORDER = { runline: 0, total: 1, moneyline: 2 };

/* ── Dates and small formatters ──────────────────────────────────────────── */

export const ymdET = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export function shiftYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const noon = (ymd) => new Date(`${ymd}T12:00:00Z`);
const weekday = (ymd) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(noon(ymd));
const longDate = (ymd) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(noon(ymd));
const hourET = (iso) => Number(new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hour12: false }).format(new Date(iso))) % 24;
export const clockET = (iso) => `${new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))} ET`;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const american = (n) => (isNum(n) ? `${n > 0 ? '+' : ''}${n}` : '');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
/** NFL slugs are the nickname ("49ers", "commanders"). */
const nickname = (slug) => cap(String(slug || ''));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NUMBER_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const inWords = (n) => NUMBER_WORD[n] ?? String(n);

export function tally(list = []) {
  const r = { won: 0, lost: 0, push: 0 };
  for (const p of list) if (SETTLED.has(p.status)) r[p.status] += 1;
  return r;
}
export const recordText = (r) => (r ? `${r.won}-${r.lost}${r.push ? `-${r.push}` : ''}` : '');
const played = (r) => (r ? r.won + r.lost + r.push : 0);

/* ── NFL ─────────────────────────────────────────────────────────────────── */

const SCORE = /^([A-Z]{2,4}) (\d+), ([A-Z]{2,4}) (\d+)$/;

function finalOf(pick) {
  const m = SCORE.exec(pick.finalScore || '');
  if (!m) return null;
  const away = { abbrev: m[1], score: Number(m[2]), name: nickname(pick.awayTeam) };
  const home = { abbrev: m[3], score: Number(m[4]), name: nickname(pick.homeTeam) };
  const tied = away.score === home.score;
  return { away, home, winner: tied ? null : (away.score > home.score ? away : home), loser: tied ? null : (away.score > home.score ? home : away) };
}

const call = (p) => ({
  label: p.label,
  market: p.market,
  status: p.status,
  recommended: p.pickRole === 'hero',
  price: american(p.price),
  book: p.book || '',
  note: p.review?.note || '',
});

/** Yesterday's football: records, the recommended picks, and every game with our calls on it. */
function nflRecap(slate) {
  const settled = (slate?.picks || []).filter((p) => SETTLED.has(p.status));
  if (!settled.length) return null;

  const byGame = new Map();
  for (const p of settled) {
    const final = finalOf(p);
    if (!final) continue;
    if (!byGame.has(p.gameId)) byGame.set(p.gameId, { gameId: String(p.gameId), startTime: p.startTime, ...final, calls: [] });
    byGame.get(p.gameId).calls.push(call(p));
  }
  const games = [...byGame.values()].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  for (const g of games) g.calls.sort((a, b) => (MARKET_ORDER[a.market] ?? 9) - (MARKET_ORDER[b.market] ?? 9));

  const recommended = settled.filter((p) => p.pickRole === 'hero');
  // The game people stayed up for: the last kickoff, when it was a night game or the only game.
  const last = games[games.length - 1];
  const spotlight = last && last.winner && (games.length === 1 || hourET(last.startTime) >= 19) ? last : null;

  return {
    day: weekday(slate.date),
    picks: tally(recommended),
    leans: tally(settled.filter((p) => p.pickRole !== 'hero')),
    totals: tally(settled.filter((p) => p.market === 'total')),
    all: tally(settled),
    recommended: recommended.map((p) => {
      const f = finalOf(p);
      return { ...call(p), matchup: `${p.awayAbbrev} at ${p.homeAbbrev}`, final: f ? `${f.away.abbrev} ${f.away.score}, ${f.home.abbrev} ${f.home.score}` : '' };
    }),
    spotlight,
    games,
  };
}

const EV = (v) => (isNum(v) && v > 0 ? `+${(v * 100).toFixed(1)}% EV` : '');
const isLean = (p) => /^(model )?lean\b/i.test(p.why || '');

/** Games still to kick off today, each with our pick, our leans and the brief's read of it. */
function nflToday(slate, brief, now) {
  const pending = (slate?.picks || []).filter((p) => p.status === 'pending' && Date.parse(p.startTime) > now.getTime());
  if (!pending.length) return null;
  const read = new Map((brief?.next || []).map((n) => [String(n.gameId), n.text]));
  const byGame = new Map();
  for (const p of pending) {
    if (!byGame.has(p.gameId)) {
      byGame.set(p.gameId, {
        gameId: String(p.gameId), startTime: p.startTime, kickoff: clockET(p.startTime),
        away: { abbrev: p.awayAbbrev, name: nickname(p.awayTeam) },
        home: { abbrev: p.homeAbbrev, name: nickname(p.homeTeam) },
        picks: [], leans: [], read: read.get(String(p.gameId)) || '',
      });
    }
    const g = byGame.get(p.gameId);
    if (p.pickRole === 'hero') g.picks.push({ label: p.label, price: american(p.price), book: p.book || '', ev: EV(p.expectedValue), why: p.why || '' });
    else if (isLean(p)) g.leans.push(p.label);
  }
  const games = [...byGame.values()].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  return { when: games.every((g) => hourET(g.startTime) >= 17) ? 'tonight' : 'today', games };
}

function nflSeason(scorecard) {
  const s = scorecard?.season;
  if (!s) return null;
  const hero = s.performance?.hero;
  const picks = s.byPickRole?.hero || null;
  const leans = s.byPickRole?.tracking || null;
  if (!played(picks) && !played(leans)) return null;
  return {
    picks, leans,
    units: isNum(hero?.units) && played(picks) ? hero.units : null,
    beatClosePct: isNum(hero?.beatClosePct) && hero.clvSample >= 5 ? hero.beatClosePct : null,
  };
}

function nflSection({ scorecard, brief, now }) {
  const today = ymdET(now);
  const slates = scorecard?.slates || [];
  const yesterday = nflRecap(slates.find((s) => s.date === shiftYmd(today, -1)));
  const upcoming = nflToday(slates.find((s) => s.date === today), brief, now);
  const hasBrief = Boolean(brief?.headline);
  if (!yesterday && !upcoming && !hasBrief) return null;
  return {
    week: scorecard?.week ?? null,
    yesterday,
    today: upcoming,
    season: nflSeason(scorecard),
    // The brief is written about what is next, so it belongs with a game day or a quiet day, not under last night's results alone.
    headline: brief?.headline || '',
    dek: brief?.dek || '',
    numbers: (brief?.numbers || []).slice(0, 3),
    take: brief?.take || '',
    also: brief?.also || '',
    // On a day with no game and no results, the brief's own list of what is next carries the section.
    next: !yesterday && !upcoming ? (brief?.next || []).slice(0, 3).map((n) => n.text) : [],
  };
}

/* ── NBA ─────────────────────────────────────────────────────────────────── */

function nbaGrade(pick, game) {
  const market = pick.market === 'spread' ? 'runline' : pick.market;
  return pickLiveStatus(
    { market, side: pick.side, line: pick.line },
    { status: 'final', teams: { home: { score: game.home.score, abbrev: game.home.abbrev }, away: { score: game.away.score, abbrev: game.away.abbrev } } },
  );
}

function nbaSection({ results = [], ledger = null, board = null, brief = null, now }) {
  const games = (results || [])
    .filter((r) => isNum(r?.away?.score) && isNum(r?.home?.score))
    .map((r) => ({
      gameId: String(r.gameId),
      away: { abbrev: r.away.abbrev, score: r.away.score, slug: r.away.slug },
      home: { abbrev: r.home.abbrev, score: r.home.score, slug: r.home.slug },
      homeWon: r.home.score > r.away.score,
    }));
  const byId = new Map(games.map((g) => [g.gameId, g]));

  const graded = Object.values(ledger || {}).map((p) => {
    const g = byId.get(String(p.gameId));
    if (!g) return null;
    const s = nbaGrade(p, g);
    if (!SETTLED.has(s.verdict)) return null;
    return { label: p.label, matchup: `${g.away.abbrev} at ${g.home.abbrev}`, status: s.verdict, text: s.text, market: p.market };
  }).filter(Boolean);

  const today = ymdET(now);
  const tonight = maximusPicks(board)
    .filter((p) => {
      const t = Date.parse(p.matchup?.startTime || '');
      return Number.isFinite(t) && t > now.getTime() && ymdET(new Date(t)) === today;
    })
    .slice(0, 3)
    .map((p) => ({
      label: p.selection?.label || '',
      matchup: `${p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.abbrev || ''} at ${p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.abbrev || ''}`,
      tip: clockET(p.matchup.startTime),
      conviction: p.conviction?.score ?? null,
      why: nbaPickSummary(p) || '',
    }));
  const pickCount = maximusPicks(board).filter((p) => Date.parse(p.matchup?.startTime || '') > now.getTime()).length;

  if (!games.length && !tonight.length && !brief?.headline) return null;
  return {
    lastNight: games.length ? { games, picks: graded, record: graded.length ? tally(graded) : null } : null,
    tonight: { picks: tonight, pickCount },
    headline: brief?.headline || '',
    dek: brief?.dek || '',
    take: brief?.take || '',
    also: brief?.also || '',
  };
}

/* ── The whole email ─────────────────────────────────────────────────────── */

function writeHeadline(nfl, nba) {
  const parts = [];
  const y = nfl?.yesterday;
  if (y?.spotlight) {
    const g = y.spotlight;
    parts.push(`${g.winner.name} ${g.winner.score}, ${g.loser.name} ${g.loser.score}.`);
  } else if (y && played(y.picks)) {
    parts.push(`${y.day}: ${recordText(y.picks)} on our picks.`);
  }
  const t = nfl?.today;
  if (t) {
    parts.push(t.games.length === 1
      ? `${t.games[0].away.name} at ${t.games[0].home.name} ${t.when}.`
      : `${cap(inWords(t.games.length))} NFL games ${t.when}.`);
  }
  if (parts.length) return parts.join(' ');
  return nfl?.headline || nba?.headline || 'The morning brief';
}

function writeDek(nfl, nba) {
  const out = [];
  const y = nfl?.yesterday;
  if (y) {
    const bits = [];
    if (played(y.picks)) bits.push(`our recommended picks went ${recordText(y.picks)}`);
    if (played(y.leans)) bits.push(`the leans went ${recordText(y.leans)}`);
    let line = `${y.day} in the NFL: ${bits.join(' and ')}`;
    if (played(y.totals) >= 3) line += `, with totals ${recordText(y.totals)}`;
    out.push(`${line}.`);
  }
  const t = nfl?.today;
  if (t) {
    const picks = t.games.flatMap((g) => g.picks.map((p) => `${p.label} in ${g.away.abbrev} at ${g.home.abbrev}`));
    out.push(picks.length ? `${cap(t.when)}’s pick: ${picks.slice(0, 2).join(', and ')}.` : `No recommended pick ${t.when}.`);
  } else if (!y && nfl?.dek) {
    out.push(nfl.dek);
  }
  if (nba) {
    const r = nba.lastNight?.record;
    const n = nba.tonight?.pickCount || 0;
    if (n && r) out.push(`In the NBA, ${plural(n, 'pick')} on tonight’s card after a ${recordText(r)} night.`);
    else if (n) out.push(`In the NBA, ${plural(n, 'pick')} on tonight’s card.`);
    else if (r) out.push(`In the NBA, our picks went ${recordText(r)} last night.`);
  }
  return out.join(' ');
}

/**
 * @param {object} input
 * @param {Date}   [input.now]
 * @param {object} [input.nfl]  { scorecard, brief }   as /api/nfl/picks/scorecard and /api/nfl/chat/homeSummary serve them
 * @param {object} [input.nba]  { results, ledger, board, brief }
 */
export function buildDailyBrief({ now = new Date(), nfl = {}, nba = {} } = {}) {
  const nflPart = nflSection({ scorecard: nfl.scorecard || null, brief: nfl.brief || null, now });
  const nbaPart = nbaSection({ results: nba.results, ledger: nba.ledger, board: nba.board, brief: nba.brief || null, now });
  const headline = writeHeadline(nflPart, nbaPart);
  return {
    date: longDate(ymdET(now)),
    headline,
    dek: writeDek(nflPart, nbaPart),
    subject: `The Daily Brief: ${headline.replace(/\.$/, '')}`,
    nfl: nflPart,
    nba: nbaPart,
    empty: !nflPart && !nbaPart,
  };
}
