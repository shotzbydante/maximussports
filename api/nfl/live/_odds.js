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
import { resolveNflTeam } from '../../../src/sports/nfl/teams.js';

const ODDS_SPORT = 'americanfootball_nfl';
const ODDS_BASE = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT}/odds`;
const FETCH_TIMEOUT_MS = 6000;

// NFL lines move slowly outside of injury news; five minutes keeps the
// request count low across a full week of traffic.
const cache = createCache(5 * 60 * 1000);

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median of a set of American prices, taken in probability space. */
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

  for (const bm of bookmakers) {
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads') {
        const homeOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === home.slug);
        if (homeOut?.point != null) spreads.push(homeOut.point);
      } else if (mkt.key === 'totals') {
        const over = (mkt.outcomes || []).find((o) => o.name === 'Over');
        if (over?.point != null) totals.push(over.point);
      } else if (mkt.key === 'h2h') {
        const homeOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === home.slug);
        const awayOut = (mkt.outcomes || []).find((o) => resolveNflTeam(o.name)?.slug === away.slug);
        if (homeOut?.price != null) homeMls.push(homeOut.price);
        if (awayOut?.price != null) awayMls.push(awayOut.price);
      }
    }
  }

  return {
    homeSlug: home.slug,
    awaySlug: away.slug,
    commenceTime: ev.commence_time || null,
    spreadHome: median(spreads),
    total: median(totals),
    moneyline: { home: medianAmerican(homeMls), away: medianAmerican(awayMls) },
    booksCount: bookmakers.length,
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
    const raw = await coalesce(cacheKey, fetchOddsApi);
    if (raw && raw.length > 0) {
      oddsEvents = raw.map(parseOddsEvent).filter(Boolean);
      cache.set(cacheKey, oddsEvents);
    } else {
      const stale = cache.getMaybeStale(cacheKey);
      if (stale?.value) oddsEvents = stale.value;
    }
  }

  return mergeOdds(games, oddsEvents);
}
