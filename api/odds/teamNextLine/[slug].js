/**
 * GET /api/odds/teamNextLine/:slug — Next game consensus odds for a team.
 * Does not modify /api/team/:slug. Uses same schedule source; one Odds API call on cache miss.
 * KV: odds:teamNextLine:{slug}:v1. TTL 120s (or 300s if event > 12h away).
 */

import { getJson, setJson } from '../../_globalCache.js';
import { fetchTeamIdsSource, fetchScheduleSource } from '../../_sources.js';
import { getTeamBySlug } from '../../../src/data/teams.js';

const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds';
const KV_KEY_PREFIX = 'odds:teamNextLine:';
const KV_VERSION = 'v1';
const TTL_SHORT_SEC = 120;
const TTL_LONG_SEC = 300;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function kvKey(slug) {
  return `${KV_KEY_PREFIX}${slug}:${KV_VERSION}`;
}

function ageSecFrom(cachedAtIso) {
  if (!cachedAtIso) return null;
  try {
    return Math.floor((Date.now() - new Date(cachedAtIso).getTime()) / 1000);
  } catch {
    return null;
  }
}

/** Normalize for matching (mirror client odds.js). */
function normName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\b(university|univ\.?|college|of|state)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return na.replace(/\s+/g, '') === nb.replace(/\s+/g, '');
}

function emptyPayload(stage, source, errorNote) {
  const updatedAt = new Date().toISOString();
  return {
    nextEvent: null,
    consensus: { spread: null, spreadPrice: null, total: null, totalPrice: null, moneyline: null },
    outliers: { bestSpreadOutlier: null, bestTotalOutlier: null },
    contributingBooks: { spreads: 0, totals: 0, h2h: 0 },
    oddsMeta: { stage, source, elapsedMs: 0, updatedAt, cacheAgeSec: null, ...(errorNote && { errorNote }) },
  };
}

/** Find next upcoming event from schedule (commence time >= now). */
function getNextEvent(events, teamName, homeAway) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const now = Date.now();
  const upcoming = events
    .filter((e) => !e.isFinal && e.date)
    .filter((e) => new Date(e.date).getTime() >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return upcoming[0] || null;
}

/** Fetch raw odds for a date window (one external call). */
async function fetchOddsForDateRange(apiKey, fromIso, toIso) {
  const params = new URLSearchParams({
    regions: 'us',
    markets: 'spreads,totals,h2h',
    oddsFormat: 'american',
    dateFormat: 'iso',
    commenceTimeFrom: fromIso,
    commenceTimeTo: toIso,
    apiKey,
  });
  const res = await fetch(`${ODDS_BASE}?${params.toString()}`);
  if (isDev && res.headers) {
    const rem = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (rem != null || used != null) console.log('[teamNextLine] quota', { xRequestsRemaining: rem, xRequestsUsed: used });
  }
  if (!res.ok) throw new Error(`Odds API: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Match our next game to an Odds API event by home/away names and date. */
function matchOddsEvent(events, homeTeam, awayTeam, gameDateStr) {
  const targetDate = gameDateStr ? gameDateStr.slice(0, 10) : '';
  for (const ev of events || []) {
    const evDate = ev.commence_time ? ev.commence_time.slice(0, 10) : '';
    if (evDate !== targetDate) continue;
    if (namesMatch(ev.home_team, homeTeam) && namesMatch(ev.away_team, awayTeam)) return ev;
  }
  return null;
}

/** Extract per-book spread/total/moneyline for our team (isHome). */
function extractBookOdds(bookmakers, ourTeamName, isHome) {
  const books = [];
  for (const bm of bookmakers || []) {
    const key = (bm.key || bm.title || '').toLowerCase().replace(/\s+/g, '');
    const title = (bm.title || bm.key || '').trim();
    let spread = null;
    let spreadPrice = null;
    let total = null;
    let totalPrice = null;
    let moneyline = null;
    for (const mkt of bm.markets || []) {
      if (mkt.key === 'spreads' && mkt.outcomes?.length >= 2) {
        const ourOut = mkt.outcomes.find((o) => namesMatch(o.name, ourTeamName))
          || mkt.outcomes.find((o) => (o.name || '').toLowerCase() === (isHome ? 'home' : 'away'))
          || (isHome ? mkt.outcomes[0] : mkt.outcomes[1]);
        if (ourOut?.point != null) {
          spread = ourOut.point;
          spreadPrice = ourOut.price != null ? ourOut.price : null;
        }
      }
      if (mkt.key === 'totals' && mkt.outcomes?.length >= 2) {
        const over = mkt.outcomes.find((o) => o.name === 'Over');
        if (over?.point != null) {
          total = over.point;
          totalPrice = over.price != null ? over.price : null;
        }
      }
      if (mkt.key === 'h2h' && mkt.outcomes?.length >= 2) {
        const ourOut = mkt.outcomes.find((o) => namesMatch(o.name, ourTeamName));
        if (ourOut?.price != null) moneyline = ourOut.price;
      }
    }
    books.push({ key, title, spread, spreadPrice, total, totalPrice, moneyline });
  }
  return books;
}

function median(values) {
  const arr = values.filter((v) => v != null && !Number.isNaN(v));
  if (arr.length === 0) return null;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function buildConsensusAndOutliers(bookOdds, consensusSpread, consensusTotal, consensusMoneyline) {
  const spreads = bookOdds.map((b) => b.spread).filter((v) => v != null);
  const totals = bookOdds.map((b) => b.total).filter((v) => v != null);
  const moneylines = bookOdds.map((b) => b.moneyline).filter((v) => v != null);

  let bestSpreadOutlier = null;
  if (consensusSpread != null && spreads.length > 1) {
    let maxDelta = -1;
    for (const b of bookOdds) {
      if (b.spread == null) continue;
      const delta = Math.abs(b.spread - consensusSpread);
      if (delta > maxDelta) {
        maxDelta = delta;
        bestSpreadOutlier = { bookKey: b.key, bookTitle: b.title, spread: b.spread, deltaFromConsensus: b.spread - consensusSpread };
      }
    }
  }

  let bestTotalOutlier = null;
  if (consensusTotal != null && totals.length > 1) {
    let maxDelta = -1;
    for (const b of bookOdds) {
      if (b.total == null) continue;
      const delta = Math.abs(b.total - consensusTotal);
      if (delta > maxDelta) {
        maxDelta = delta;
        bestTotalOutlier = { bookKey: b.key, bookTitle: b.title, total: b.total, deltaFromConsensus: b.total - consensusTotal };
      }
    }
  }

  return {
    consensus: {
      spread: consensusSpread,
      spreadPrice: median(bookOdds.map((b) => b.spreadPrice)),
      total: consensusTotal,
      totalPrice: median(bookOdds.map((b) => b.totalPrice)),
      moneyline: consensusMoneyline,
    },
    contributingBooks: { spreads: spreads.length, totals: totals.length, h2h: moneylines.length },
    outliers: { bestSpreadOutlier, bestTotalOutlier },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slug = typeof req.query?.slug === 'string' ? req.query.slug.trim() : null;
  if (!slug) return res.status(400).json(emptyPayload('error', 'error', 'missing_slug'));

  const startedAt = Date.now();
  const team = getTeamBySlug(slug);
  if (!team) return res.status(200).json(emptyPayload('error', 'error', 'unknown_team'));

  try {
    const cached = await getJson(kvKey(slug));
    const cacheAgeSec = cached?.cachedAt ? ageSecFrom(cached.cachedAt) : null;
    const ttl = cached?.ttlSec ?? TTL_SHORT_SEC;
    if (cached?.nextEvent && cacheAgeSec != null && cacheAgeSec < ttl) {
      const elapsedMs = Date.now() - startedAt;
      const { cachedAt: _ca, ttlSec: _ttl, ...rest } = cached;
      return res.status(200).json({
        ...rest,
        oddsMeta: { ...(cached.oddsMeta || {}), stage: 'kv_hit', source: 'kv_hit', elapsedMs, cacheAgeSec },
      });
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      if (cached?.nextEvent) {
        const { cachedAt: _ca, ttlSec: _ttl, ...rest } = cached;
        return res.status(200).json({
          ...rest,
          oddsMeta: { ...(cached.oddsMeta || {}), stage: 'error', source: 'stale_cache', elapsedMs: Date.now() - startedAt, cacheAgeSec, errorNote: 'no_api_key' },
        });
      }
      return res.status(200).json(emptyPayload('error', 'error', 'no_api_key'));
    }

    const teamIdsData = await fetchTeamIdsSource();
    const slugToId = teamIdsData?.slugToId || {};
    const teamId = slugToId[slug] || null;
    if (!teamId) return res.status(200).json(emptyPayload('no_upcoming', 'computed', 'no_team_id'));

    const schedule = await fetchScheduleSource(teamId);
    const events = schedule?.events || [];
    const nextEv = getNextEvent(events, team.name, null);
    if (!nextEv) {
      const payload = emptyPayload('no_upcoming', 'computed');
      payload.oddsMeta.elapsedMs = Date.now() - startedAt;
      return res.status(200).json(payload);
    }

    const gameDate = new Date(nextEv.date);
    const fromIso = gameDate.toISOString().slice(0, 10) + 'T00:00:00Z';
    const toIso = gameDate.toISOString().slice(0, 10) + 'T23:59:59Z';

    let rawEvents = [];
    try {
      rawEvents = await fetchOddsForDateRange(apiKey, fromIso, toIso);
    } catch (err) {
      if (isDev) console.warn('[teamNextLine] fetch odds', err?.message);
      if (cached?.nextEvent) {
        const { cachedAt: _ca, ttlSec: _ttl, ...rest } = cached;
        return res.status(200).json({
          ...rest,
          oddsMeta: { ...(cached.oddsMeta || {}), stage: 'error', source: 'stale_cache', elapsedMs: Date.now() - startedAt, cacheAgeSec, errorNote: err?.message },
        });
      }
      return res.status(200).json({ ...emptyPayload('error', 'error', err?.message), oddsMeta: { ...emptyPayload().oddsMeta, elapsedMs: Date.now() - startedAt } });
    }

    const oddsEvent = matchOddsEvent(rawEvents, nextEv.homeTeam, nextEv.awayTeam, nextEv.date);
    if (!oddsEvent) {
      const payload = {
        nextEvent: {
          eventId: nextEv.id,
          commenceTime: nextEv.date,
          homeTeam: nextEv.homeTeam,
          awayTeam: nextEv.awayTeam,
          opponent: nextEv.opponent,
          isHome: nextEv.homeAway === 'home',
          sportKey: 'basketball_ncaab',
        },
        consensus: { spread: null, spreadPrice: null, total: null, totalPrice: null, moneyline: null },
        outliers: { bestSpreadOutlier: null, bestTotalOutlier: null },
        contributingBooks: { spreads: 0, totals: 0, h2h: 0 },
        oddsMeta: { stage: 'fetched', source: 'computed', elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), cacheAgeSec: null, errorNote: 'no_matching_odds_event' },
      };
      return res.status(200).json(payload);
    }

    const isHome = nextEv.homeAway === 'home';
    const bookOdds = extractBookOdds(oddsEvent.bookmakers, team.name, isHome);
    const consensusSpread = median(bookOdds.map((b) => b.spread));
    const consensusTotal = median(bookOdds.map((b) => b.total));
    const consensusMoneyline = median(bookOdds.map((b) => b.moneyline));
    const { consensus, contributingBooks, outliers } = buildConsensusAndOutliers(bookOdds, consensusSpread, consensusTotal, consensusMoneyline);

    const nextEvent = {
      eventId: oddsEvent.id,
      commenceTime: oddsEvent.commence_time,
      homeTeam: oddsEvent.home_team,
      awayTeam: oddsEvent.away_team,
      opponent: nextEv.opponent,
      isHome,
      sportKey: 'basketball_ncaab',
    };
    const updatedAt = new Date().toISOString();
    const elapsedMs = Date.now() - startedAt;
    const eventCommenceMs = new Date(nextEv.date).getTime();
    const ttlSec = eventCommenceMs - Date.now() > TWELVE_HOURS_MS ? TTL_LONG_SEC : TTL_SHORT_SEC;

    const payload = {
      nextEvent,
      consensus,
      outliers,
      contributingBooks,
      oddsMeta: { stage: 'fetched', source: 'computed', elapsedMs, updatedAt, cacheAgeSec: 0 },
      cachedAt: updatedAt,
      ttlSec,
    };
    await setJson(kvKey(slug), payload, { exSeconds: ttlSec });
    delete payload.cachedAt;
    delete payload.ttlSec;
    payload.oddsMeta.cacheAgeSec = 0;
    return res.status(200).json(payload);
  } catch (err) {
    if (isDev) console.warn('[teamNextLine]', err?.message);
    const cached = await getJson(kvKey(slug)).catch(() => null);
    const cacheAgeSec = cached?.cachedAt ? ageSecFrom(cached.cachedAt) : null;
    if (cached?.nextEvent) {
      const { cachedAt: _ca, ttlSec: _ttl, ...rest } = cached;
      return res.status(200).json({
        ...rest,
        oddsMeta: { ...(cached.oddsMeta || {}), stage: 'error', source: 'stale_cache', elapsedMs: Date.now() - startedAt, cacheAgeSec, errorNote: err?.message },
      });
    }
    return res.status(200).json({ ...emptyPayload('error', 'error', err?.message), oddsMeta: { ...emptyPayload().oddsMeta, elapsedMs: Date.now() - startedAt } });
  }
}
