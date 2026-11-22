/**
 * NFL odds enrichment.
 *
 * Replaces the single-book line that ships on ESPN's scoreboard with a
 * multi-book consensus from The Odds API (americanfootball_nfl) when
 * ODDS_API_KEY is configured. Without a key, or when the API is rate
 * limited, games keep their ESPN line untouched.
 *
 * The opening line always comes from ESPN, which is the only source here
 * that carries one.
 */

import { createCache, coalesce } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';
import { resolveNflTeam } from '../../../src/sports/nfl/teams.js';

const ODDS_SPORT = 'americanfootball_nfl';
const ODDS_BASE = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT}/odds`;
const FETCH_TIMEOUT_MS = 6000;

// NFL lines move slowly outside of injury news; five minutes keeps the
// request count low across a full week of traffic. The KV copy lets every
// serverless instance share one pull, which matters now that a cron builds
// the board around the clock: each pull costs three Odds API credits.
const cache = createCache(5 * 60 * 1000);
const KV_KEY = 'nfl:odds:week:v2';
const KV_FRESH_MS = 4 * 60 * 1000;
const KV_TTL_SEC = 6 * 3600;

/** Credits left on the Odds API key, as of the last call this instance made. */
let quota = { remaining: null, used: null, at: null };
export function getOddsQuota() { return quota; }

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median of a set of American prices, taken in probability space. */
function roundHalf(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 2) / 2 : v;
}

function medianAmerican(prices) {
  if (!prices || prices.length === 0) return null;
  const toProb = (a) => (a < 0 ? -a / (-a + 100) : 100 / (a + 100));
  const p = median(prices.map(toProb));
  if (p == null || p <= 0 || p >= 1) return null;
  const american = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100;
  return Math.round(american);
}

async function fetchOddsApi() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      apiKey, regions: 'us', markets: 'spreads,totals,h2h',
      oddsFormat: 'american', dateFormat: 'iso',
    });
    const r = await fetch(`${ODDS_BASE}?${params}`, { signal: controller.signal });
    const remaining = Number(r.headers?.get?.('x-requests-remaining'));
    const used = Number(r.headers?.get?.('x-requests-used'));
    quota = {
      remaining: Number.isFinite(remaining) ? remaining : null,
      used: Number.isFinite(used) ? used : null,
      at: new Date().toISOString(),
    };
    if (!r.ok) { console.warn(`[nfl/_odds] Odds API ${r.status}`); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[nfl/_odds] fetch error:', err?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseOddsEvent(ev) {
  const home = resolveNflTeam(ev?.home_team);
  const away = resolveNflTeam(ev?.away_team);
  if (!home || !away) return null;

  const spreads = [], totals = [], homeMls = [], awayMls = [];
  const bookmakers = ev.bookmakers || [];
  // One entry per book with its own line and both prices. The consensus
  // fields below are kept for display; the picks engine prices each book.
  const books = [];
  const price = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  for (const bm of bookmakers) {
    const book = { key: bm.key, title: bm.title || bm.key, lastUpdate: bm.last_update || null };
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads') {
        const homeOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === home.slug);
        const awayOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === away.slug);
        if (homeOut?.point != null) {
          spreads.push(homeOut.point);
          book.spread = {
            homeLine: homeOut.point, homePrice: price(homeOut.price), awayPrice: price(awayOut?.price),
            lastUpdate: mkt.last_update || book.lastUpdate,
          };
        }
      } else if (mkt.key === 'totals') {
        const over = (mkt.outcomes || []).find((o) => o.name === 'Over');
        const under = (mkt.outcomes || []).find((o) => o.name === 'Under');
        if (over?.point != null) {
          totals.push(over.point);
          book.total = {
            line: over.point, overPrice: price(over.price), underPrice: price(under?.price),
            lastUpdate: mkt.last_update || book.lastUpdate,
          };
        }
      } else if (mkt.key === 'h2h') {
        const homeOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === home.slug);
        const awayOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === away.slug);
        if (homeOut?.price != null) homeMls.push(homeOut.price);
        if (awayOut?.price != null) awayMls.push(awayOut.price);
        if (homeOut?.price != null && awayOut?.price != null) {
          book.h2h = { home: homeOut.price, away: awayOut.price, lastUpdate: mkt.last_update || book.lastUpdate };
        }
      }
    }
    if (book.spread || book.total || book.h2h) books.push(book);
  }

  return {
    homeSlug: home.slug,
    awaySlug: away.slug,
    commenceTime: ev.commence_time || null,
    // With an even number of books the median can land on a quarter point
    // (-15.5 and -16 give -15.75). No book posts that, so snap to the half.
    spreadHome: roundHalf(median(spreads)),
    total: roundHalf(median(totals)),
    moneyline: { home: medianAmerican(homeMls), away: medianAmerican(awayMls) },
    booksCount: bookmakers.length,
    books,
  };
}

/**
 * Merge consensus odds into normalized games.
 * Matching is by team pair AND kickoff within three days, so a divisional
 * rematch later in the season can never price this week's game.
 */
export function mergeOdds(games, oddsEvents) {
  if (!Array.isArray(oddsEvents) || oddsEvents.length === 0) return games;

  return games.map((game) => {
    const homeSlug = game.teams?.home?.slug;
    const awaySlug = game.teams?.away?.slug;
    if (!homeSlug || !awaySlug) return game;

    const kick = Date.parse(game.startTime || '');
    const match = oddsEvents.find((o) => {
      if (o.homeSlug !== homeSlug || o.awaySlug !== awaySlug) return false;
      const t = Date.parse(o.commenceTime || '');
      if (!Number.isFinite(kick) || !Number.isFinite(t)) return true;
      return Math.abs(kick - t) <= 3 * 86_400_000;
    });
    if (!match) return game;

    const spread = match.spreadHome ?? game.market?.pregameSpread ?? null;
    const total = match.total ?? game.market?.pregameTotal ?? null;
    const moneyline = (match.moneyline?.home != null && match.moneyline?.away != null)
      ? match.moneyline
      : game.market?.moneyline ?? null;

    const homeAbbrev = game.teams.home.abbrev;
    const spreadDisplay = spread != null
      ? `${homeAbbrev} ${spread > 0 ? `+${spread}` : spread === 0 ? 'PK' : spread}`
      : game.betting?.spreadDisplay || '—';
    const totalDisplay = total != null ? `O/U ${total}` : game.betting?.totalDisplay || '—';

    return {
      ...game,
      market: {
        ...game.market,
        pregameSpread: spread,
        pregameTotal: total,
        moneyline,
        booksCount: match.booksCount || 0,
        books: match.books || [],
        source: 'consensus',
      },
      betting: { spreadDisplay, totalDisplay },
    };
  });
}

export async function enrichGamesWithOdds(games) {
  if (!games || games.length === 0) return games;
  if (!process.env.ODDS_API_KEY) return games;

  const cacheKey = 'nfl:odds:week';
  let oddsEvents = cache.get(cacheKey);

  if (!oddsEvents) {
    const shared = await getJson(KV_KEY).catch(() => null);
    if (Array.isArray(shared?.events) && Date.now() - (shared.at || 0) < KV_FRESH_MS) {
      oddsEvents = shared.events;
      cache.set(cacheKey, oddsEvents);
    }
  }

  if (!oddsEvents) {
    const raw = await coalesce(cacheKey, fetchOddsApi);
    if (raw && raw.length > 0) {
      oddsEvents = raw.map(parseOddsEvent).filter(Boolean);
      cache.set(cacheKey, oddsEvents);
      setJson(KV_KEY, { at: Date.now(), events: oddsEvents }, { exSeconds: KV_TTL_SEC }).catch(() => {});
    } else {
      // The API failed or is out of credits: serve the last pull, marked
      // stale by its own timestamps, instead of falling back to one book.
      const stale = cache.getMaybeStale(cacheKey);
      if (stale?.value) oddsEvents = stale.value;
      else {
        const lastKnown = await getJson(KV_KEY).catch(() => null);
        if (Array.isArray(lastKnown?.events)) oddsEvents = lastKnown.events;
      }
    }
  }

  return mergeOdds(games, oddsEvents);
}
