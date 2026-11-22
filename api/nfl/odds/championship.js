/**
 * GET /api/nfl/odds/championship — Super Bowl winner odds by team slug.
 * Same response contract as /api/mlb/odds/championship and the NBA one.
 */

import { getJson, setJson, MAX_TTL_SECONDS } from '../../_globalCache.js';
import { resolveNflTeam } from '../../../src/sports/nfl/teams.js';

export const NFL_CHAMP_KV_KEY = 'odds:championship:nfl:v1';
const TTL_SECONDS = Math.min(60 * 60, MAX_TTL_SECONDS);
const ODDS_API_SPORT = 'americanfootball_nfl_super_bowl_winner';

function ageSeconds(updatedAt) {
  if (!updatedAt) return null;
  try { return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000); }
  catch { return null; }
}

function impliedProb(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

export function aggregateBookmakers(events) {
  const slugToAmericans = Object.create(null);
  const unmapped = [];
  const event = Array.isArray(events) ? events[0] : null;
  const bookmakers = event?.bookmakers ?? [];
  const withOutrights = bookmakers.filter((bm) =>
    (bm.markets ?? []).some((m) => (m.key || '').toLowerCase() === 'outrights')
  );

  for (const bm of withOutrights) {
    const outrights = (bm.markets ?? []).find((m) => (m.key || '').toLowerCase() === 'outrights');
    for (const o of (outrights?.outcomes ?? [])) {
      const name = (o.name || '').trim();
      if (!name) continue;
      const slug = resolveNflTeam(name)?.slug;
      if (!slug) { if (unmapped.length < 20) unmapped.push(name); continue; }
      if (typeof o.price !== 'number') continue;
      (slugToAmericans[slug] ||= []).push(o.price);
    }
  }

  const odds = {};
  for (const [slug, americans] of Object.entries(slugToAmericans)) {
    let bestChanceAmerican = americans[0];
    let bestPayoutAmerican = americans[0];
    let bestProb = impliedProb(americans[0]);
    let worstProb = bestProb;
    for (let i = 1; i < americans.length; i++) {
      const p = impliedProb(americans[i]);
      if (p != null && (bestProb == null || p > bestProb)) { bestProb = p; bestChanceAmerican = americans[i]; }
      if (p != null && (worstProb == null || p < worstProb)) { worstProb = p; bestPayoutAmerican = americans[i]; }
    }
    odds[slug] = { bestChanceAmerican, bestPayoutAmerican, booksCount: withOutrights.length, samplesCount: americans.length };
  }
  return { odds, unmapped, bookmakerCount: bookmakers.length };
}

/**
 * Load Super Bowl odds: KV when fresh, otherwise The Odds API, falling back
 * to whatever KV still holds. Exported so the season model and briefing
 * read the same numbers in process, and so a cold cache on those pages
 * still produces title prices.
 *
 * @returns {Promise<{ odds: object, source: string, updatedAt?: string, cacheAgeSec?: number, note?: string }>}
 */
export async function getNflChampionshipOdds() {
  // KV is optional (absent in local development); never let it block a fetch.
  const cached = await getJson(NFL_CHAMP_KV_KEY).catch(() => null);
  try {
    const age = cached?.updatedAt ? ageSeconds(cached.updatedAt) : null;
    const hasCached = cached?.odds && Object.keys(cached.odds).length > 0;
    const stale = (extra = {}) => ({ odds: cached.odds, source: 'stale_cache', updatedAt: cached.updatedAt, ...extra });

    if (hasCached && age != null && age < TTL_SECONDS) {
      return { odds: cached.odds, source: 'kv_hit', cacheAgeSec: age, updatedAt: cached.updatedAt };
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) return hasCached ? stale() : { odds: {}, source: 'no_api_key' };

    const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds?regions=us&markets=outrights&oddsFormat=american&apiKey=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (r.status === 429 || r.status === 402) {
      return hasCached ? stale({ note: 'rate_limited' }) : { odds: {}, source: 'rate_limited' };
    }
    if (!r.ok) return hasCached ? stale() : { odds: {}, source: 'error' };

    const data = await r.json();
    const events = Array.isArray(data) ? data : data?.data ?? [];
    const { odds } = aggregateBookmakers(events);
    const updatedAt = new Date().toISOString();

    if (Object.keys(odds).length > 0) {
      await setJson(NFL_CHAMP_KV_KEY, { odds, updatedAt }, { exSeconds: TTL_SECONDS }).catch(() => {});
    }
    return { odds, source: 'fetched', updatedAt };
  } catch (err) {
    if (cached?.odds && Object.keys(cached.odds).length > 0) {
      return { odds: cached.odds, source: 'stale_cache', updatedAt: cached.updatedAt, note: err?.message };
    }
    return { odds: {}, source: 'error', note: err?.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json(await getNflChampionshipOdds());
}
