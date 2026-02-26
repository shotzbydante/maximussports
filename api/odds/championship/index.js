/**
 * GET /api/odds/championship — NCAAB championship winner odds by team slug.
 * Fetches outrights from The Odds API (server-side only), maps outcomes to slugs, caches in KV.
 * Early exit if KV has fresh data. On 429/error, returns stale KV or empty with oddsMeta.
 */

import { getJson, setJson, MAX_TTL_SECONDS } from '../../_globalCache.js';
import { getTeamSlug, buildChampionshipLookup, normalize, stripLastWords } from '../../../src/utils/teamSlug.js';

const CHAMPIONSHIP_KV_KEY = 'odds:championship:ncaab:v1';
const CHAMPIONSHIP_TTL_SECONDS = Math.min(60 * 60, MAX_TTL_SECONDS); // 60 min
const ODDS_API_SPORT = 'basketball_ncaab_championship_winner';
const PREFERRED_BOOKS = ['fanduel', 'draftkings']; // stable single-book choice

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function ageSecondsFromUpdatedAt(updatedAt) {
  if (!updatedAt) return null;
  try {
    return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  } catch {
    return null;
  }
}

function buildOddsMeta(stage, source, elapsedMs, updatedAt, cacheAgeSec, errorNote) {
  const meta = {
    stage,
    source,
    elapsedMs: elapsedMs ?? null,
    updatedAt: updatedAt ?? new Date().toISOString(),
    cacheAgeSec: cacheAgeSec ?? null,
  };
  if (errorNote) meta.errorNote = errorNote;
  return meta;
}

/**
 * Pick one bookmaker: prefer PREFERRED_BOOKS, else first with outrights market.
 */
function pickBookmaker(events) {
  const event = Array.isArray(events) ? events[0] : null;
  const bookmakers = event?.bookmakers ?? [];
  const withOutrights = bookmakers.filter((bm) =>
    (bm.markets ?? []).some((m) => (m.key || '').toLowerCase() === 'outrights')
  );
  if (withOutrights.length === 0) return null;
  const keyNorm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
  for (const pref of PREFERRED_BOOKS) {
    const byKey = withOutrights.find((b) => keyNorm(b.key).includes(pref));
    if (byKey) return byKey;
    const byTitle = withOutrights.find((b) => keyNorm(b.title).includes(pref));
    if (byTitle) return byTitle;
  }
  return withOutrights[0];
}

/**
 * Resolve outcome name to slug: getTeamSlug first, then lookup (normalized, strip mascot).
 */
function outcomeNameToSlug(name, lookup) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = getTeamSlug(trimmed);
  if (slug) return slug;
  const n = normalize(trimmed);
  if (lookup[n]) return lookup[n];
  const n1 = normalize(stripLastWords(trimmed, 1));
  if (n1 && lookup[n1]) return lookup[n1];
  const n2 = normalize(stripLastWords(trimmed, 2));
  if (n2 && lookup[n2]) return lookup[n2];
  return null;
}

/**
 * Build slug -> { american, book, updatedAt, source, cacheAgeSec } from one bookmaker.
 * Uses robust mapping (getTeamSlug + runtime lookup). Logs unmapped outcome names (max 20).
 */
function mapOutcomesToSlugs(bookmaker, updatedAt, source, cacheAgeSec) {
  const odds = {};
  const lookup = buildChampionshipLookup();
  const markets = bookmaker?.markets ?? [];
  const outrights = markets.find((m) => (m.key || '').toLowerCase() === 'outrights');
  const outcomes = outrights?.outcomes ?? [];
  const book = (bookmaker?.title || '').trim() || null;
  const unmapped = [];

  for (const o of outcomes) {
    const name = (o.name || '').trim();
    if (!name) continue;
    const slug = outcomeNameToSlug(name, lookup);
    if (!slug) {
      unmapped.push(name);
      continue;
    }
    const american = typeof o.price === 'number' ? o.price : null;
    odds[slug] = {
      american,
      book,
      updatedAt: updatedAt || new Date().toISOString(),
      source,
      cacheAgeSec,
    };
  }
  if (isDev && unmapped.length > 0) {
    console.log('[api/odds/championship] unmapped outcome names (max 20):', unmapped.slice(0, 20));
  }
  return odds;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const startedAt = Date.now();

  try {
    const cached = await getJson(CHAMPIONSHIP_KV_KEY);
    const ageSec = cached?.updatedAt ? ageSecondsFromUpdatedAt(cached.updatedAt) : null;
    const hasRealData = cached?.odds && typeof cached.odds === 'object' && Object.keys(cached.odds).length > 0;
    const isFresh = ageSec != null && ageSec < CHAMPIONSHIP_TTL_SECONDS;

    if (hasRealData && isFresh) {
      const elapsedMs = Date.now() - startedAt;
      if (isDev) console.log('[api/odds/championship] KV hit', { keys: Object.keys(cached.odds).length, ageSec });
      return res.status(200).json({
        odds: cached.odds,
        oddsMeta: buildOddsMeta('kv_hit', 'kv_hit', elapsedMs, cached.updatedAt, ageSec),
      });
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      if (hasRealData) {
        return res.status(200).json({
          odds: cached.odds,
          oddsMeta: buildOddsMeta('stale_cache', 'stale_cache', Date.now() - startedAt, cached.updatedAt, ageSec, 'no_api_key'),
        });
      }
      return res.status(200).json({
        odds: {},
        oddsMeta: buildOddsMeta('error', 'error', Date.now() - startedAt, new Date().toISOString(), null, 'no_api_key'),
      });
    }

    const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds?regions=us&markets=outrights&oddsFormat=american&apiKey=${apiKey}`;
    const fetchRes = await fetch(url);

    if (isDev && fetchRes.headers) {
      const remaining = fetchRes.headers.get('x-requests-remaining');
      const used = fetchRes.headers.get('x-requests-used');
      if (remaining != null || used != null) {
        console.log('[api/odds/championship] quota', { xRequestsRemaining: remaining, xRequestsUsed: used });
      }
    }

    if (fetchRes.status === 429 || fetchRes.status === 402) {
      if (hasRealData) {
        return res.status(200).json({
          odds: cached.odds,
          oddsMeta: buildOddsMeta('rate_limited', 'stale_cache', Date.now() - startedAt, cached.updatedAt, ageSec, 'rate_limited'),
        });
      }
      return res.status(200).json({
        odds: {},
        oddsMeta: buildOddsMeta('rate_limited', 'error', Date.now() - startedAt, new Date().toISOString(), null, 'rate_limited'),
      });
    }

    if (!fetchRes.ok) {
      if (hasRealData) {
        return res.status(200).json({
          odds: cached.odds,
          oddsMeta: buildOddsMeta('error', 'stale_cache', Date.now() - startedAt, cached.updatedAt, ageSec, `http_${fetchRes.status}`),
        });
      }
      return res.status(200).json({
        odds: {},
        oddsMeta: buildOddsMeta('error', 'error', Date.now() - startedAt, new Date().toISOString(), null, `http_${fetchRes.status}`),
      });
    }

    const data = await fetchRes.json();
    const events = Array.isArray(data) ? data : data?.data ?? [];
    const bookmaker = pickBookmaker(events);
    const updatedAt = new Date().toISOString();
    const odds = bookmaker ? mapOutcomesToSlugs(bookmaker, updatedAt, 'computed', 0) : {};

    if (Object.keys(odds).length > 0) {
      await setJson(CHAMPIONSHIP_KV_KEY, {
        odds,
        updatedAt,
        oddsMeta: buildOddsMeta('fetched', 'computed', Date.now() - startedAt, updatedAt, 0),
      }, { exSeconds: CHAMPIONSHIP_TTL_SECONDS });
    }

    const elapsedMs = Date.now() - startedAt;
    return res.status(200).json({
      odds,
      oddsMeta: buildOddsMeta('fetched', 'computed', elapsedMs, updatedAt, 0),
    });
  } catch (err) {
    if (isDev) console.warn('[api/odds/championship] error', err?.message);
    const cached = await getJson(CHAMPIONSHIP_KV_KEY).catch(() => null);
    const hasRealData = cached?.odds && typeof cached.odds === 'object' && Object.keys(cached.odds).length > 0;
    const ageSec = cached?.updatedAt ? ageSecondsFromUpdatedAt(cached.updatedAt) : null;

    if (hasRealData) {
      return res.status(200).json({
        odds: cached.odds,
        oddsMeta: buildOddsMeta('error', 'stale_cache', Date.now() - startedAt, cached.updatedAt, ageSec, err?.message || 'fetch_failed'),
      });
    }
    return res.status(200).json({
      odds: {},
      oddsMeta: buildOddsMeta('error', 'error', Date.now() - startedAt, new Date().toISOString(), null, err?.message || 'fetch_failed'),
    });
  }
}
