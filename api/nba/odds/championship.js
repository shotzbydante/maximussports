/**
 * GET /api/nba/odds/championship — NBA championship winner odds by team slug.
 */

import { getJson, setJson, MAX_TTL_SECONDS } from '../../_globalCache.js';
import { NBA_TEAMS } from '../../../src/sports/nba/teams.js';

const KV_KEY = 'odds:championship:nba:v1';
const TTL_SECONDS = Math.min(60 * 60, MAX_TTL_SECONDS);
const ODDS_API_SPORT = 'basketball_nba_championship_winner';

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

const SLUG_ALIASES = buildAliasMap();

function buildAliasMap() {
  const m = {};
  for (const t of NBA_TEAMS) {
    const lower = t.name.toLowerCase();
    m[lower] = t.slug;
    const parts = lower.split(' ');
    if (parts.length >= 2) {
      m[parts[parts.length - 1]] = t.slug;
      m[parts.slice(1).join(' ')] = t.slug;
    }
    m[t.abbrev.toLowerCase()] = t.slug;
    m[t.slug] = t.slug;
  }
  // Extra aliases for common alternative names
  m['sixers'] = 'phi';
  m['cavs'] = 'cle';
  m['blazers'] = 'por';
  m['wolves'] = 'min';
  m['mavs'] = 'dal';
  return m;
}

function outcomeToSlug(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (SLUG_ALIASES[n]) return SLUG_ALIASES[n];
  for (const t of NBA_TEAMS) {
    if (n.includes(t.name.toLowerCase())) return t.slug;
  }
  const parts = n.split(' ');
  const last = parts[parts.length - 1];
  if (SLUG_ALIASES[last]) return SLUG_ALIASES[last];
  return null;
}

function aggregateBookmakers(events) {
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
      const slug = outcomeToSlug(name);
      if (!slug) { if (unmapped.length < 20) unmapped.push(name); continue; }
      const american = typeof o.price === 'number' ? o.price : null;
      if (american == null) continue;
      if (!slugToAmericans[slug]) slugToAmericans[slug] = [];
      slugToAmericans[slug].push(american);
    }
  }

  const odds = {};
  for (const [slug, americans] of Object.entries(slugToAmericans)) {
    if (!americans.length) continue;
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cached = await getJson(KV_KEY);
    const age = cached?.updatedAt ? ageSeconds(cached.updatedAt) : null;
    const hasCached = cached?.odds && Object.keys(cached.odds).length > 0;
    if (hasCached && age != null && age < TTL_SECONDS) {
      return res.status(200).json({ odds: cached.odds, source: 'kv_hit', cacheAgeSec: age });
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      if (hasCached) return res.status(200).json({ odds: cached.odds, source: 'stale_cache' });
      return res.status(200).json({ odds: {}, source: 'no_api_key' });
    }

    const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds?regions=us&markets=outrights&oddsFormat=american&apiKey=${apiKey}`;
    const r = await fetch(url);

    if (r.status === 429 || r.status === 402) {
      if (hasCached) return res.status(200).json({ odds: cached.odds, source: 'stale_cache', note: 'rate_limited' });
      return res.status(200).json({ odds: {}, source: 'rate_limited' });
    }
    if (!r.ok) {
      if (hasCached) return res.status(200).json({ odds: cached.odds, source: 'stale_cache' });
      return res.status(200).json({ odds: {}, source: 'error' });
    }

    const data = await r.json();
    const events = Array.isArray(data) ? data : data?.data ?? [];
    const { odds } = aggregateBookmakers(events);
    const updatedAt = new Date().toISOString();

    if (Object.keys(odds).length > 0) {
      await setJson(KV_KEY, { odds, updatedAt }, { exSeconds: TTL_SECONDS });
    }

    return res.status(200).json({ odds, source: 'fetched', updatedAt });
  } catch (err) {
    const cached = await getJson(KV_KEY).catch(() => null);
    if (cached?.odds && Object.keys(cached.odds).length > 0) {
      return res.status(200).json({ odds: cached.odds, source: 'stale_cache', note: err?.message });
    }
    return res.status(200).json({ odds: {}, source: 'error', note: err?.message });
  }
}
