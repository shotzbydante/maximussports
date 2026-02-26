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
const MOVEMENT_KEY_PREFIX = 'odds:movement:';
const KV_VERSION = 'v1';
const TTL_SHORT_SEC = 120;
const TTL_LONG_SEC = 300;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_MIN_INTERVAL_SEC = 300;
const MOVEMENT_MAX_SNAPSHOTS = 48;
const MOVEMENT_MAX_AGE_SEC = 24 * 60 * 60;
const MOVEMENT_WINDOW_MINUTES = 60;

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function kvKey(slug) {
  return `${KV_KEY_PREFIX}${slug}:${KV_VERSION}`;
}

function movementKey(eventId) {
  return `${MOVEMENT_KEY_PREFIX}${eventId}:${KV_VERSION}`;
}

/**
 * Compute movement over window: from = snapshot closest to (now - window), to = current.
 */
function computeMovement(snapshots, currentConsensus, windowMinutes) {
  const out = emptyMovement();
  out.windowMinutes = windowMinutes;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return out;
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const targetFrom = now - windowMs;
  let fromSnap = null;
  let minDist = Infinity;
  for (const s of snapshots) {
    const t = s?.t ? new Date(s.t).getTime() : 0;
    if (Number.isNaN(t)) continue;
    const dist = Math.abs(t - targetFrom);
    if (dist < minDist && t <= now) {
      minDist = dist;
      fromSnap = s;
    }
  }
  if (!fromSnap && snapshots.length > 0) fromSnap = snapshots[0];
  const toSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const from = fromSnap?.consensus;
  const to = currentConsensus || toSnap?.consensus;
  out.samples = snapshots.length;
  if (from?.spread != null && to?.spread != null) {
    out.spread = { from: from.spread, to: to.spread, delta: to.spread - from.spread };
  }
  if (from?.total != null && to?.total != null) {
    out.total = { from: from.total, to: to.total, delta: to.total - from.total };
  }
  if (from?.moneyline != null && to?.moneyline != null) {
    out.moneyline = { from: from.moneyline, to: to.moneyline, delta: to.moneyline - from.moneyline };
  }
  return out;
}

/**
 * Append snapshot to movement history; trim to max length and prune >24h. Only append if last is older than min interval.
 * Returns the trimmed snapshot list (for computing movement).
 */
async function appendMovementSnapshot(eventId, consensus, booksUsed) {
  const key = movementKey(eventId);
  const hasAny = consensus?.spread != null || consensus?.total != null || consensus?.moneyline != null;
  if (!hasAny) return [];
  let list = await getJson(key).catch(() => null);
  if (!Array.isArray(list)) list = [];
  const now = Date.now();
  const last = list.length > 0 ? list[list.length - 1] : null;
  const lastT = last?.t ? new Date(last.t).getTime() : 0;
  if (last && (now - lastT) / 1000 < SNAPSHOT_MIN_INTERVAL_SEC) return list;
  const snapshot = {
    t: new Date().toISOString(),
    consensus: {
      spread: consensus?.spread ?? null,
      total: consensus?.total ?? null,
      moneyline: consensus?.moneyline ?? null,
    },
    booksUsed: booksUsed || { spreads: 0, totals: 0, h2h: 0 },
  };
  list.push(snapshot);
  const cut = now - MOVEMENT_MAX_AGE_SEC * 1000;
  const pruned = list.filter((s) => {
    const t = s?.t ? new Date(s.t).getTime() : 0;
    return !Number.isNaN(t) && t >= cut;
  });
  const trimmed = pruned.slice(-MOVEMENT_MAX_SNAPSHOTS);
  await setJson(key, trimmed, { exSeconds: MOVEMENT_MAX_AGE_SEC + 3600 }).catch(() => {});
  return trimmed;
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

function emptyMovement() {
  return {
    windowMinutes: MOVEMENT_WINDOW_MINUTES,
    spread: { from: null, to: null, delta: null },
    total: { from: null, to: null, delta: null },
    moneyline: { from: null, to: null, delta: null },
    samples: 0,
  };
}

function emptyPayload(stage, source, errorNote) {
  const updatedAt = new Date().toISOString();
  return {
    nextEvent: null,
    consensus: { spread: null, spreadPrice: null, total: null, totalPrice: null, moneyline: null },
    outliers: {
      spreadOutlier: null,
      spreadBestForTeam: null,
      totalOutlier: null,
      moneylineBest: null,
      bestSpreadOutlier: null,
      bestTotalOutlier: null,
    },
    movement: emptyMovement(),
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

/** Fetch raw odds: by date range, or by eventIds when known (one event = one call). */
async function fetchOddsForDateRange(apiKey, fromIso, toIso, eventId = null) {
  const params = new URLSearchParams({
    regions: 'us',
    markets: 'spreads,totals,h2h',
    oddsFormat: 'american',
    dateFormat: 'iso',
    apiKey,
  });
  if (eventId) {
    params.set('eventIds', eventId);
  } else {
    params.set('commenceTimeFrom', fromIso);
    params.set('commenceTimeTo', toIso);
  }
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

  let spreadOutlier = null;
  let spreadBestForTeam = null;
  if (consensusSpread != null && spreads.length >= 1) {
    let maxAbsDelta = -1;
    let bestSpread = null;
    for (const b of bookOdds) {
      if (b.spread == null) continue;
      const delta = Math.abs(b.spread - consensusSpread);
      if (delta > maxAbsDelta) {
        maxAbsDelta = delta;
        spreadOutlier = { bookKey: b.key, bookTitle: b.title, spread: b.spread, deltaFromConsensus: b.spread - consensusSpread };
      }
      if (bestSpread == null || b.spread > bestSpread.spread) {
        bestSpread = { bookKey: b.key, bookTitle: b.title, spread: b.spread, deltaFromConsensus: b.spread - consensusSpread };
      }
    }
    spreadBestForTeam = bestSpread;
  }

  let totalOutlier = null;
  if (consensusTotal != null && totals.length > 1) {
    let maxDelta = -1;
    for (const b of bookOdds) {
      if (b.total == null) continue;
      const delta = Math.abs(b.total - consensusTotal);
      if (delta > maxDelta) {
        maxDelta = delta;
        totalOutlier = { bookKey: b.key, bookTitle: b.title, total: b.total, deltaFromConsensus: b.total - consensusTotal };
      }
    }
  }

  let moneylineBest = null;
  if (consensusMoneyline != null && moneylines.length >= 1) {
    let best = null;
    for (const b of bookOdds) {
      if (b.moneyline == null) continue;
      if (best == null || b.moneyline > best.moneyline) {
        best = { bookKey: b.key, bookTitle: b.title, moneyline: b.moneyline, deltaFromConsensus: b.moneyline - consensusMoneyline };
      }
    }
    moneylineBest = best;
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
    outliers: {
      spreadOutlier,
      spreadBestForTeam,
      totalOutlier,
      moneylineBest,
      bestSpreadOutlier: spreadOutlier,
      bestTotalOutlier: totalOutlier,
    },
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
      let movement = rest.movement || emptyMovement();
      if (cached.nextEvent?.eventId) {
        const snapList = await getJson(movementKey(cached.nextEvent.eventId)).catch(() => null);
        if (Array.isArray(snapList) && snapList.length > 0) {
          movement = computeMovement(snapList, cached.consensus, MOVEMENT_WINDOW_MINUTES);
        }
      }
      return res.status(200).json({
        ...rest,
        movement,
        oddsMeta: { ...(cached.oddsMeta || {}), stage: 'kv_hit', source: 'kv_hit', elapsedMs, cacheAgeSec },
      });
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      if (cached?.nextEvent) {
        const { cachedAt: _ca, ttlSec: _ttl, ...rest } = cached;
        let movement = rest.movement || emptyMovement();
        if (cached.nextEvent?.eventId) {
          const snapList = await getJson(movementKey(cached.nextEvent.eventId)).catch(() => null);
          if (Array.isArray(snapList) && snapList.length > 0) movement = computeMovement(snapList, cached.consensus, MOVEMENT_WINDOW_MINUTES);
        }
        return res.status(200).json({
          ...rest,
          movement,
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
    const sameGameCached = cached?.nextEvent?.eventId && cached?.nextEvent?.commenceTime && nextEv.date && String(cached.nextEvent.commenceTime).slice(0, 16) === String(nextEv.date).slice(0, 16);
    const useEventId = sameGameCached ? cached.nextEvent.eventId : null;

    let rawEvents = [];
    try {
      rawEvents = await fetchOddsForDateRange(apiKey, fromIso, toIso, useEventId);
    } catch (err) {
      if (isDev) console.warn('[teamNextLine] fetch odds', err?.message);
      if (cached?.nextEvent) {
        const { cachedAt: _ca, ttlSec: _ttl, ...rest } = cached;
        let movement = rest.movement || emptyMovement();
        if (cached.nextEvent?.eventId) {
          const snapList = await getJson(movementKey(cached.nextEvent.eventId)).catch(() => null);
          if (Array.isArray(snapList) && snapList.length > 0) movement = computeMovement(snapList, cached.consensus, MOVEMENT_WINDOW_MINUTES);
        }
        return res.status(200).json({
          ...rest,
          movement,
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
        outliers: { spreadOutlier: null, spreadBestForTeam: null, totalOutlier: null, moneylineBest: null, bestSpreadOutlier: null, bestTotalOutlier: null },
        movement: emptyMovement(),
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

    const snapList = await appendMovementSnapshot(oddsEvent.id, consensus, contributingBooks);
    const movement = computeMovement(snapList, consensus, MOVEMENT_WINDOW_MINUTES);

    const payload = {
      nextEvent,
      consensus,
      outliers,
      movement,
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
      let movement = rest.movement || emptyMovement();
      if (cached.nextEvent?.eventId) {
        const snapList = await getJson(movementKey(cached.nextEvent.eventId)).catch(() => null);
        if (Array.isArray(snapList) && snapList.length > 0) movement = computeMovement(snapList, cached.consensus, MOVEMENT_WINDOW_MINUTES);
      }
      return res.status(200).json({
        ...rest,
        movement,
        oddsMeta: { ...(cached.oddsMeta || {}), stage: 'error', source: 'stale_cache', elapsedMs: Date.now() - startedAt, cacheAgeSec, errorNote: err?.message },
      });
    }
    return res.status(200).json({ ...emptyPayload('error', 'error', err?.message), oddsMeta: { ...emptyPayload().oddsMeta, elapsedMs: Date.now() - startedAt } });
  }
}
