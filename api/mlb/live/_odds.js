/* global process */
/**
 * MLB odds enrichment for live intelligence.
 * Fetches game-level odds from The Odds API (baseball_mlb) and merges into canonical objects.
 * Non-blocking: if odds fail, games still return with ESPN-embedded odds or placeholders.
 */

import { createCache, coalesce } from '../../_cache.js';

const ODDS_SPORT = 'baseball_mlb';
const ODDS_BASE = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT}/odds`;
const FETCH_TIMEOUT_MS = 6000;
const cache = createCache(90_000); // 90s fresh — odds don't change that fast

/* ── name matching ────────────────────────────────────────────────────────── */

const TEAM_NAME_ALIASES = {
  nyy: ['yankees', 'new york yankees', 'ny yankees'],
  bos: ['red sox', 'boston red sox'],
  tor: ['blue jays', 'toronto blue jays'],
  tb:  ['rays', 'tampa bay rays'],
  bal: ['orioles', 'baltimore orioles'],
  cle: ['guardians', 'cleveland guardians'],
  min: ['twins', 'minnesota twins'],
  det: ['tigers', 'detroit tigers'],
  cws: ['white sox', 'chicago white sox'],
  kc:  ['royals', 'kansas city royals'],
  hou: ['astros', 'houston astros'],
  sea: ['mariners', 'seattle mariners'],
  tex: ['rangers', 'texas rangers'],
  laa: ['angels', 'los angeles angels', 'la angels', 'anaheim angels'],
  oak: ['athletics', 'oakland athletics', 'as'],
  atl: ['braves', 'atlanta braves'],
  nym: ['mets', 'new york mets', 'ny mets'],
  phi: ['phillies', 'philadelphia phillies'],
  mia: ['marlins', 'miami marlins'],
  wsh: ['nationals', 'washington nationals'],
  chc: ['cubs', 'chicago cubs'],
  mil: ['brewers', 'milwaukee brewers'],
  stl: ['cardinals', 'st. louis cardinals', 'st louis cardinals'],
  pit: ['pirates', 'pittsburgh pirates'],
  cin: ['reds', 'cincinnati reds'],
  lad: ['dodgers', 'los angeles dodgers', 'la dodgers'],
  sd:  ['padres', 'san diego padres'],
  sf:  ['giants', 'san francisco giants', 'sf giants'],
  ari: ['diamondbacks', 'arizona diamondbacks', 'd-backs'],
  col: ['rockies', 'colorado rockies'],
};

// Build reverse: lowercase name → slug
const nameToSlug = {};
for (const [slug, aliases] of Object.entries(TEAM_NAME_ALIASES)) {
  for (const alias of aliases) nameToSlug[alias.toLowerCase()] = slug;
  nameToSlug[slug.toLowerCase()] = slug;
}

function resolveSlug(oddsName) {
  if (!oddsName) return null;
  const lower = oddsName.toLowerCase().trim();
  if (nameToSlug[lower]) return nameToSlug[lower];
  // Try partial match
  for (const [name, slug] of Object.entries(nameToSlug)) {
    if (lower.includes(name) || name.includes(lower)) return slug;
  }
  return null;
}

/* ── fetch + parse ────────────────────────────────────────────────────────── */

async function fetchOddsApi() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      apiKey,
      regions: 'us',
      markets: 'spreads,totals,h2h',
      oddsFormat: 'american',
      dateFormat: 'iso',
    });
    const r = await fetch(`${ODDS_BASE}?${params}`, { signal: controller.signal });
    if (!r.ok) {
      console.warn(`[mlb/_odds] Odds API ${r.status}`);
      return null;
    }
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[mlb/_odds] fetch error:', err?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseOddsEvent(ev) {
  const homeSlug = resolveSlug(ev.home_team);
  const awaySlug = resolveSlug(ev.away_team);
  if (!homeSlug || !awaySlug) return null;

  const bookmakers = ev.bookmakers || [];
  const spreads = [];
  const totals = [];
  const moneylines = [];

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
        const homeOut = mkt.outcomes.find((o) => resolveSlug(o.name) === homeSlug);
        if (homeOut?.price != null) moneylines.push(homeOut.price);
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
    homeSlug,
    awaySlug,
    commenceTime: ev.commence_time,
    spread: median(spreads),
    total: median(totals),
    moneyline: median(moneylines),
    booksCount: bookmakers.length,
  };
}

/* ── enrichment ───────────────────────────────────────────────────────────── */

/**
 * Enrich an array of canonical game objects with odds data.
 * Non-destructive: returns new objects with market/betting/model fields populated.
 * If odds fetch fails, returns games unchanged.
 */
export async function enrichGamesWithOdds(games) {
  if (!games || games.length === 0) return games;
  if (!process.env.ODDS_API_KEY) return games; // no key → skip silently

  const cacheKey = 'mlb:odds:daily';
  let oddsEvents = cache.get(cacheKey);

  if (!oddsEvents) {
    const raw = await coalesce(cacheKey, fetchOddsApi);
    if (raw && raw.length > 0) {
      oddsEvents = raw.map(parseOddsEvent).filter(Boolean);
      cache.set(cacheKey, oddsEvents);
    } else {
      // Try stale
      const stale = cache.getMaybeStale(cacheKey);
      if (stale?.value) oddsEvents = stale.value;
    }
  }

  if (!oddsEvents || oddsEvents.length === 0) return games;

  return games.map((game) => {
    const homeSlug = game.teams?.home?.slug;
    const awaySlug = game.teams?.away?.slug;
    if (!homeSlug || !awaySlug) return game;

    // Match by team slugs
    const match = oddsEvents.find((o) =>
      (o.homeSlug === homeSlug && o.awaySlug === awaySlug) ||
      (o.homeSlug === awaySlug && o.awaySlug === homeSlug) // reversed
    );

    if (!match) return game;

    // Determine orientation — if match is reversed, flip spread sign
    const reversed = match.homeSlug !== homeSlug;
    const spread = match.spread != null
      ? (reversed ? -match.spread : match.spread)
      : game.market?.pregameSpread;
    const total = match.total ?? game.market?.pregameTotal;
    const moneyline = match.moneyline ?? game.market?.moneyline;

    // Derive simple model edge from moneyline
    // If moneyline exists, compute implied probability and derive fair spread estimate
    let fairSpread = null;
    let pregameEdge = null;
    let confidence = null;

    if (moneyline != null && spread != null) {
      // Convert moneyline to implied probability
      const impliedProb = moneyline < 0
        ? Math.abs(moneyline) / (Math.abs(moneyline) + 100)
        : 100 / (moneyline + 100);

      // Fair spread estimate: roughly 0.5 points per 3% probability beyond 50%
      // This is a lightweight heuristic, not a full model
      const probDelta = impliedProb - 0.5;
      fairSpread = -(probDelta * 16.67); // ~16.67 points maps to full range
      fairSpread = Math.round(fairSpread * 10) / 10;

      // Edge: gap between fair and market spread
      if (spread != null && fairSpread != null) {
        pregameEdge = Math.round((fairSpread - spread) * 10) / 10;
      }

      // Confidence: based on bookmaker consensus strength
      const booksNorm = Math.min((match.booksCount || 1) / 8, 1); // 8+ books = full confidence
      confidence = Math.round(booksNorm * 100) / 100;
    }

    const spreadDisplay = spread != null
      ? (spread > 0 ? `+${spread}` : `${spread}`)
      : game.betting?.spreadDisplay || '—';
    const totalDisplay = total != null
      ? `O/U ${total}`
      : game.betting?.totalDisplay || '—';

    return {
      ...game,
      market: {
        ...game.market,
        pregameSpread: spread ?? game.market?.pregameSpread,
        pregameTotal: total ?? game.market?.pregameTotal,
        moneyline: moneyline ?? game.market?.moneyline,
      },
      model: {
        ...game.model,
        pregameEdge: pregameEdge ?? game.model?.pregameEdge,
        confidence: confidence ?? game.model?.confidence,
        fairSpread: fairSpread ?? game.model?.fairSpread,
        fairTotal: total ?? game.model?.fairTotal, // Use market total as fair total baseline
      },
      betting: {
        spreadDisplay,
        totalDisplay,
      },
    };
  });
}
