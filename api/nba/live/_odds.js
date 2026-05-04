/* global process */
/**
 * NBA odds enrichment for live intelligence.
 * Fetches game-level odds from The Odds API (basketball_nba) and merges into canonical objects.
 */

import { createCache, coalesce } from '../../_cache.js';

const ODDS_SPORT = 'basketball_nba';
const ODDS_BASE = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT}/odds`;
const FETCH_TIMEOUT_MS = 6000;
const cache = createCache(90_000);

const TEAM_NAME_ALIASES = {
  atl: ['hawks', 'atlanta hawks'],
  bos: ['celtics', 'boston celtics'],
  bkn: ['nets', 'brooklyn nets'],
  cha: ['hornets', 'charlotte hornets'],
  chi: ['bulls', 'chicago bulls'],
  cle: ['cavaliers', 'cleveland cavaliers', 'cavs'],
  dal: ['mavericks', 'dallas mavericks', 'mavs'],
  den: ['nuggets', 'denver nuggets'],
  det: ['pistons', 'detroit pistons'],
  gsw: ['warriors', 'golden state warriors'],
  hou: ['rockets', 'houston rockets'],
  ind: ['pacers', 'indiana pacers'],
  lac: ['clippers', 'la clippers', 'los angeles clippers'],
  lal: ['lakers', 'los angeles lakers', 'la lakers'],
  mem: ['grizzlies', 'memphis grizzlies'],
  mia: ['heat', 'miami heat'],
  mil: ['bucks', 'milwaukee bucks'],
  min: ['timberwolves', 'minnesota timberwolves', 'wolves'],
  nop: ['pelicans', 'new orleans pelicans'],
  nyk: ['knicks', 'new york knicks', 'ny knicks'],
  okc: ['thunder', 'oklahoma city thunder'],
  orl: ['magic', 'orlando magic'],
  phi: ['76ers', 'philadelphia 76ers', 'sixers'],
  phx: ['suns', 'phoenix suns'],
  por: ['trail blazers', 'portland trail blazers', 'blazers'],
  sac: ['kings', 'sacramento kings'],
  sas: ['spurs', 'san antonio spurs'],
  tor: ['raptors', 'toronto raptors'],
  uta: ['jazz', 'utah jazz'],
  was: ['wizards', 'washington wizards'],
};

const nameToSlug = {};
for (const [slug, aliases] of Object.entries(TEAM_NAME_ALIASES)) {
  for (const alias of aliases) nameToSlug[alias.toLowerCase()] = slug;
  nameToSlug[slug.toLowerCase()] = slug;
}

function resolveSlug(oddsName) {
  if (!oddsName) return null;
  const lower = oddsName.toLowerCase().trim();
  if (nameToSlug[lower]) return nameToSlug[lower];
  for (const [name, slug] of Object.entries(nameToSlug)) {
    if (lower.includes(name) || name.includes(lower)) return slug;
  }
  return null;
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
    if (!r.ok) { console.warn(`[nba/_odds] Odds API ${r.status}`); return null; }
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[nba/_odds] fetch error:', err?.message);
    return null;
  } finally { clearTimeout(timer); }
}

function parseOddsEvent(ev) {
  const homeSlug = resolveSlug(ev.home_team);
  const awaySlug = resolveSlug(ev.away_team);
  if (!homeSlug || !awaySlug) return null;

  const bookmakers = ev.bookmakers || [];
  const spreads = [], totals = [], homeMls = [], awayMls = [];

  for (const bm of bookmakers) {
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads' && mkt.outcomes?.length >= 2) {
        const homeOut = mkt.outcomes.find((o) => resolveSlug(o.name) === homeSlug) || mkt.outcomes[0];
        if (homeOut?.point != null) spreads.push(homeOut.point);
      }
      if (mkt.key === 'totals' && mkt.outcomes?.length >= 2) {
        const over = mkt.outcomes.find((o) => o.name === 'Over');
        if (over?.point != null) totals.push(over.point);
      }
      if (mkt.key === 'h2h' && mkt.outcomes?.length >= 2) {
        // v8: capture BOTH home and away moneylines so the builder can
        // compute per-side implied probabilities. Pre-v8 we only kept
        // the home price and wrote `moneyline: <number>`, which broke
        // toMatchup (which expects `{ away, home }`) and silently
        // dropped every Pick 'Em pick.
        const homeOut = mkt.outcomes.find((o) => resolveSlug(o.name) === homeSlug);
        const awayOut = mkt.outcomes.find((o) => resolveSlug(o.name) === awaySlug);
        if (homeOut?.price != null) homeMls.push(homeOut.price);
        if (awayOut?.price != null) awayMls.push(awayOut.price);
      }
    }
  }

  const median = (arr) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    homeSlug, awaySlug, commenceTime: ev.commence_time,
    spread: median(spreads), total: median(totals),
    moneyline: { home: median(homeMls), away: median(awayMls) },
    booksCount: bookmakers.length,
  };
}

export async function enrichGamesWithOdds(games) {
  if (!games || games.length === 0) return games;
  if (!process.env.ODDS_API_KEY) return games;

  const cacheKey = 'nba:odds:daily';
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

  if (!oddsEvents || oddsEvents.length === 0) return games;

  return games.map((game) => {
    const homeSlug = game.teams?.home?.slug;
    const awaySlug = game.teams?.away?.slug;
    if (!homeSlug || !awaySlug) return game;

    const match = oddsEvents.find((o) =>
      (o.homeSlug === homeSlug && o.awaySlug === awaySlug) ||
      (o.homeSlug === awaySlug && o.awaySlug === homeSlug)
    );
    if (!match) return game;

    const reversed = match.homeSlug !== homeSlug;
    const spread = match.spread != null ? (reversed ? -match.spread : match.spread) : game.market?.pregameSpread;
    const total = match.total ?? game.market?.pregameTotal;
    // v8: moneyline is now an `{ away, home }` object. When the matchup
    // pair is flipped (Odds API ordered teams differently), swap sides.
    let mlAway = null, mlHome = null;
    if (match.moneyline) {
      if (reversed) {
        mlAway = match.moneyline.home ?? null;
        mlHome = match.moneyline.away ?? null;
      } else {
        mlAway = match.moneyline.away ?? null;
        mlHome = match.moneyline.home ?? null;
      }
    }
    // Preserve any pre-existing structured shape; otherwise build one.
    const existingMl = game.market?.moneyline;
    const moneyline = (mlAway != null || mlHome != null)
      ? { away: mlAway, home: mlHome }
      : (existingMl && typeof existingMl === 'object' && !Array.isArray(existingMl))
        ? existingMl
        : null;

    // pregameEdge derivation uses the home moneyline (legacy single-
    // number form expected by the arbitrage formula).
    let fairSpread = null, pregameEdge = null, confidence = null;
    if (mlHome != null && spread != null) {
      const impliedProb = mlHome < 0 ? Math.abs(mlHome) / (Math.abs(mlHome) + 100) : 100 / (mlHome + 100);
      const probDelta = impliedProb - 0.5;
      fairSpread = -(probDelta * 16.67);
      fairSpread = Math.round(fairSpread * 10) / 10;
      if (spread != null && fairSpread != null) pregameEdge = Math.round((fairSpread - spread) * 10) / 10;
      const booksNorm = Math.min((match.booksCount || 1) / 8, 1);
      confidence = Math.round(booksNorm * 100) / 100;
    }

    const spreadDisplay = spread != null ? (spread > 0 ? `+${spread}` : `${spread}`) : game.betting?.spreadDisplay || '\u2014';
    const totalDisplay = total != null ? `O/U ${total}` : game.betting?.totalDisplay || '\u2014';

    return {
      ...game,
      market: { ...game.market, pregameSpread: spread ?? game.market?.pregameSpread, pregameTotal: total ?? game.market?.pregameTotal, moneyline: moneyline ?? game.market?.moneyline },
      // `model.fairTotal` is intentionally NOT populated from the market
      // total. There is no fair-total model in the NBA pipeline today
      // (see docs/nba-home-picks-ui-categories-history-and-improvement-audit-v4.md);
      // mirroring the market would produce a 0-edge totals candidate every
      // game and silently inflate the totals coverage. Leaving it null
      // makes the totals gate fail for the right reason — until a real
      // pace/efficiency total prior is wired in. The UI's ByMarketSummary
      // surfaces this absence explicitly via `totalsInactive: true`.
      model: { ...game.model, pregameEdge: pregameEdge ?? game.model?.pregameEdge, confidence: confidence ?? game.model?.confidence, fairSpread: fairSpread ?? game.model?.fairSpread, fairTotal: game.model?.fairTotal ?? null },
      betting: { spreadDisplay, totalDisplay },
    };
  });
}
