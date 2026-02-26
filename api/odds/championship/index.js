/**
 * GET /api/odds/championship — NCAAB championship winner odds by team slug.
 * Aggregates across ALL bookmakers (single API response, no extra quota). Maps outcome names to slugs,
 * computes bestChanceAmerican (shortest odds) and bestPayoutAmerican (longest odds) per slug.
 * Early exit if KV has fresh data. On 429/error, returns stale KV or empty with oddsMeta.
 */

import { getJson, setJson, MAX_TTL_SECONDS } from '../../_globalCache.js';
import { getTeamSlug, buildChampionshipLookup, normalize, stripLastWords } from '../../../src/utils/teamSlug.js';
import { TEAMS } from '../../../data/teams.js';

const CHAMPIONSHIP_KV_KEY = 'odds:championship:ncaab:v1';
const CHAMPIONSHIP_TTL_SECONDS = Math.min(60 * 60, MAX_TTL_SECONDS); // 60 min
const ODDS_API_SPORT = 'basketball_ncaab_championship_winner';
const UNMAPPED_SAMPLE_MAX = 20;

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function ageSecondsFromUpdatedAt(updatedAt) {
  if (!updatedAt) return null;
  try {
    return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  } catch {
    return null;
  }
}

/** American odds → implied probability (higher = better chance). */
function impliedProbFromAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

function buildOddsMeta(opts) {
  const { stage, source, elapsedMs, updatedAt, cacheAgeSec, errorNote, bookmakerCountReturned, mappedOutcomesCount, unmappedOutcomesSample, missingTeamsCount, coveragePct } = opts;
  const meta = {
    stage,
    source,
    elapsedMs: elapsedMs ?? null,
    updatedAt: updatedAt ?? new Date().toISOString(),
    cacheAgeSec: cacheAgeSec ?? null,
  };
  if (errorNote) meta.errorNote = errorNote;
  if (bookmakerCountReturned != null) meta.bookmakerCountReturned = bookmakerCountReturned;
  if (mappedOutcomesCount != null) meta.mappedOutcomesCount = mappedOutcomesCount;
  if (missingTeamsCount != null) meta.missingTeamsCount = missingTeamsCount;
  if (coveragePct != null) meta.coveragePct = coveragePct;
  if (isDev && Array.isArray(unmappedOutcomesSample) && unmappedOutcomesSample.length > 0) meta.unmappedOutcomesSample = unmappedOutcomesSample;
  return meta;
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
 * Aggregate outrights from ALL bookmakers: per slug collect all American prices,
 * then set bestChanceAmerican (highest implied prob) and bestPayoutAmerican (lowest implied prob).
 * Returns { odds, unmappedOutcomesSample }.
 */
function aggregateAllBookmakers(events, updatedAt) {
  const lookup = buildChampionshipLookup();
  const slugToAmericans = Object.create(null);
  const unmapped = [];

  const event = Array.isArray(events) ? events[0] : null;
  const bookmakers = event?.bookmakers ?? [];
  const withOutrights = bookmakers.filter((bm) =>
    (bm.markets ?? []).some((m) => (m.key || '').toLowerCase() === 'outrights')
  );

  for (const bm of withOutrights) {
    const outrights = (bm.markets ?? []).find((m) => (m.key || '').toLowerCase() === 'outrights');
    const outcomes = outrights?.outcomes ?? [];
    for (const o of outcomes) {
      const name = (o.name || '').trim();
      if (!name) continue;
      const slug = outcomeNameToSlug(name, lookup);
      if (!slug) {
        if (unmapped.length < UNMAPPED_SAMPLE_MAX) unmapped.push(name);
        continue;
      }
      const american = typeof o.price === 'number' ? o.price : null;
      if (american == null) continue;
      if (!slugToAmericans[slug]) slugToAmericans[slug] = [];
      slugToAmericans[slug].push(american);
    }
  }

  const odds = {};
  for (const [slug, americans] of Object.entries(slugToAmericans)) {
    if (americans.length === 0) continue;
    let bestChanceAmerican = americans[0];
    let bestPayoutAmerican = americans[0];
    let bestProb = impliedProbFromAmerican(americans[0]);
    let worstProb = bestProb;
    for (let i = 1; i < americans.length; i++) {
      const p = impliedProbFromAmerican(americans[i]);
      if (p != null && (bestProb == null || p > bestProb)) {
        bestProb = p;
        bestChanceAmerican = americans[i];
      }
      if (p != null && (worstProb == null || p < worstProb)) {
        worstProb = p;
        bestPayoutAmerican = americans[i];
      }
    }
    odds[slug] = {
      bestChanceAmerican,
      bestPayoutAmerican,
      booksCount: withOutrights.length,
      samplesCount: americans.length,
      updatedAt,
    };
  }

  return { odds, unmappedOutcomesSample: unmapped, bookmakerCountReturned: bookmakers.length };
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
      const totalTeams = (typeof TEAMS !== 'undefined' && Array.isArray(TEAMS)) ? TEAMS.length : 0;
      const mappedCount = Object.keys(cached.odds).length;
      return res.status(200).json({
        odds: cached.odds,
        oddsMeta: buildOddsMeta({
          stage: 'kv_hit',
          source: 'kv_hit',
          elapsedMs,
          updatedAt: cached.updatedAt,
          cacheAgeSec: ageSec,
          bookmakerCountReturned: cached.oddsMeta?.bookmakerCountReturned,
          mappedOutcomesCount: mappedCount,
          missingTeamsCount: totalTeams ? totalTeams - mappedCount : null,
          coveragePct: totalTeams ? Math.round((mappedCount / totalTeams) * 1000) / 10 : null,
        }),
      });
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      if (hasRealData) {
        return res.status(200).json({
          odds: cached.odds,
          oddsMeta: buildOddsMeta({ stage: 'stale_cache', source: 'stale_cache', elapsedMs: Date.now() - startedAt, updatedAt: cached.updatedAt, cacheAgeSec: ageSec, errorNote: 'no_api_key', mappedOutcomesCount: Object.keys(cached.odds).length }),
        });
      }
      return res.status(200).json({
        odds: {},
        oddsMeta: buildOddsMeta({ stage: 'error', source: 'error', elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), errorNote: 'no_api_key' }),
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
          oddsMeta: buildOddsMeta({ stage: 'rate_limited', source: 'stale_cache', elapsedMs: Date.now() - startedAt, updatedAt: cached.updatedAt, cacheAgeSec: ageSec, errorNote: 'rate_limited' }),
        });
      }
      return res.status(200).json({
        odds: {},
        oddsMeta: buildOddsMeta({ stage: 'rate_limited', source: 'error', elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), errorNote: 'rate_limited' }),
      });
    }

    if (!fetchRes.ok) {
      if (hasRealData) {
        return res.status(200).json({
          odds: cached.odds,
          oddsMeta: buildOddsMeta({ stage: 'error', source: 'stale_cache', elapsedMs: Date.now() - startedAt, updatedAt: cached.updatedAt, cacheAgeSec: ageSec, errorNote: `http_${fetchRes.status}` }),
        });
      }
      return res.status(200).json({
        odds: {},
        oddsMeta: buildOddsMeta({ stage: 'error', source: 'error', elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), errorNote: `http_${fetchRes.status}` }),
      });
    }

    const data = await fetchRes.json();
    const events = Array.isArray(data) ? data : data?.data ?? [];
    const updatedAt = new Date().toISOString();
    const { odds, unmappedOutcomesSample, bookmakerCountReturned } = aggregateAllBookmakers(events, updatedAt);
    const mappedCount = Object.keys(odds).length;
    const totalTeams = (typeof TEAMS !== 'undefined' && Array.isArray(TEAMS)) ? TEAMS.length : 0;
    const missingTeamsCount = totalTeams ? totalTeams - mappedCount : null;
    const coveragePct = totalTeams ? Math.round((mappedCount / totalTeams) * 1000) / 10 : null;
    const elapsedMs = Date.now() - startedAt;

    if (Object.keys(odds).length > 0) {
      await setJson(CHAMPIONSHIP_KV_KEY, {
        odds,
        updatedAt,
        oddsMeta: { bookmakerCountReturned, mappedOutcomesCount: mappedCount, missingTeamsCount, coveragePct },
      }, { exSeconds: CHAMPIONSHIP_TTL_SECONDS });
    }

    return res.status(200).json({
      odds,
      oddsMeta: buildOddsMeta({
        stage: 'fetched',
        source: 'computed',
        elapsedMs,
        updatedAt,
        cacheAgeSec: 0,
        bookmakerCountReturned,
        mappedOutcomesCount: mappedCount,
        unmappedOutcomesSample: isDev ? unmappedOutcomesSample : undefined,
        missingTeamsCount,
        coveragePct,
      }),
    });
  } catch (err) {
    if (isDev) console.warn('[api/odds/championship] error', err?.message);
    const cached = await getJson(CHAMPIONSHIP_KV_KEY).catch(() => null);
    const hasRealData = cached?.odds && typeof cached.odds === 'object' && Object.keys(cached.odds).length > 0;
    const ageSec = cached?.updatedAt ? ageSecondsFromUpdatedAt(cached.updatedAt) : null;

    if (hasRealData) {
      return res.status(200).json({
        odds: cached.odds,
        oddsMeta: buildOddsMeta({ stage: 'error', source: 'stale_cache', elapsedMs: Date.now() - startedAt, updatedAt: cached.updatedAt, cacheAgeSec: ageSec, errorNote: err?.message || 'fetch_failed' }),
      });
    }
    return res.status(200).json({
      odds: {},
      oddsMeta: buildOddsMeta({ stage: 'error', source: 'error', elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), errorNote: err?.message || 'fetch_failed' }),
    });
  }
}
