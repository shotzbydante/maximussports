/**
 * Betting Intel Feed — curated betting-oriented college basketball videos.
 * GET /api/youtube/bettingFeed
 *
 * Mirrors the intelFeed reliability strategy but with betting-specific queries
 * and a reversed scoring model that favors betting/picks/odds content.
 *
 * Response: { status, updatedAt, items: [{videoId, title, channelTitle, publishedAt, thumbUrl, score}] }
 */

import { ytSearch, isQuotaExhausted, parseISO8601Duration } from './_yt.js';
import { ytRssSearch, safeRssQuery } from './_ytRss.js';
import { BETTING_ALLOWLIST } from './_allowlist.js';
import { getJson, setJson } from '../_globalCache.js';

const KV_FRESH_KEY     = 'yt:bettingFeed:fresh:v1';
const KV_LASTKNOWN_KEY = 'yt:bettingFeed:lastKnown:v1';
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return true;
  });
}

function isBettingAllowlisted(item) {
  const ch = (item.channelTitle ?? '').toLowerCase();
  return BETTING_ALLOWLIST.some((a) => ch.includes(a.toLowerCase()));
}

function classifyBettingItem(item) {
  const title = (item.title ?? '').toLowerCase();
  const channel = (item.channelTitle ?? '').toLowerCase();
  const combined = `${title} ${channel}`;

  const REJECT = [
    /\bwomen'?s?\s*basketball\b/i, /\bwbb\b/i, /\bncaaw\b/i,
    /\bfootball\b/i, /\bnfl\b/i, /\bncaaf\b/i,
    /\bsoccer\b/i, /\bhockey\b/i, /\bnhl\b/i, /\bmlb\b/i,
  ];
  if (REJECT.some((re) => re.test(combined))) return 'reject';

  const BETTING_SIGNALS = [
    /\bbet(s|ting)?\b/i, /\bpick(s)?\b/i, /\bspread(s)?\b/i,
    /\bover\s*\/?\s*under\b/i, /\btotal(s)?\b/i, /\bodds\b/i,
    /\bline(s)?\b/i, /\bmoneyline\b/i, /\bparlay(s)?\b/i,
    /\bprop(s)?\b/i, /\bfuture(s)?\b/i, /\bwager(s|ing)?\b/i,
    /\bsportsbook\b/i, /\bhandicap(ping)?\b/i, /\bbracketology\b/i,
    /\bfree\s*pick/i, /\bbest\s*bet/i, /\block(s|ed)?\b/i,
    /\bfade\b/i, /\baction\b/i, /\bmarket\b/i,
  ];

  const BASKETBALL_SIGNALS = [
    /\bncaa\b/i, /\bncaab\b/i, /\bcollege\s*basketball\b/i,
    /\bmarch\s*madness\b/i, /\bfinal\s*four\b/i, /\bbasketball\b/i,
    /\bcbb\b/i, /\bbracket\b/i,
  ];

  const hasBetting = BETTING_SIGNALS.some((re) => re.test(combined));
  const hasBasketball = BASKETBALL_SIGNALS.some((re) => re.test(combined));

  if (hasBetting && hasBasketball) return 'accept';
  if (hasBetting && isBettingAllowlisted(item)) return 'accept';
  if (hasBasketball && isBettingAllowlisted(item) && hasBetting) return 'accept';

  return 'no_match';
}

function scoreBettingItem(item) {
  let score = 0;
  const title = (item.title ?? '').toLowerCase();

  if (isBettingAllowlisted(item)) score += 25;

  if (/\bbet(s|ting)?\b/i.test(title)) score += 15;
  if (/\bpick(s)?\b/i.test(title)) score += 15;
  if (/\bspread|over\/?under|odds|line|parlay/i.test(title)) score += 10;
  if (/\bcollege\s*basketball|ncaab|ncaam|cbb/i.test(title)) score += 12;
  if (/\bmarch\s*madness|final\s*four|tournament/i.test(title)) score += 15;
  if (/\bbracket/i.test(title)) score += 8;

  if (item.publishedAt) {
    const ageDays = (Date.now() - new Date(item.publishedAt).getTime()) / 86_400_000;
    if      (ageDays <= 1)  score += 35;
    else if (ageDays <= 2)  score += 28;
    else if (ageDays <= 3)  score += 22;
    else if (ageDays <= 7)  score += 12;
    else if (ageDays <= 14) score += 2;
    else                    score -= 15;
  }

  if (/\breaction\b/i.test(title)) score -= 10;
  if (/\bfull\s*game\b/i.test(title)) score -= 20;
  if (/\blive\s*stream\b/i.test(title) && !isBettingAllowlisted(item)) score -= 15;
  if (/\bpromo(tion)?s?\b/i.test(title)) score -= 15;
  if (/\bsign\s*up\b/i.test(title)) score -= 15;

  return score;
}

function diversityPass(scored, maxPerChannel = 3) {
  const counts = {};
  return scored.filter((item) => {
    const ch = (item.channelTitle ?? '').toLowerCase();
    counts[ch] = (counts[ch] || 0) + 1;
    return counts[ch] <= maxPerChannel;
  });
}

function processItems(allItems, debug) {
  const accepted = allItems.filter((item) => {
    const cls = classifyBettingItem(item);
    if (debug && cls !== 'accept') console.log(`[bettingFeed] reject: "${(item.title ?? '').slice(0, 60)}" → ${cls}`);
    return cls === 'accept';
  });

  const deduped = dedupeById(accepted);
  const scored = deduped.map((item) => ({
    videoId:      item.videoId,
    title:        item.title,
    channelTitle: item.channelTitle,
    publishedAt:  item.publishedAt,
    thumbUrl:     item.thumbUrl,
    score:        scoreBettingItem(item),
  }));
  scored.sort((a, b) => b.score - a.score);
  const diverse = diversityPass(scored);
  return diverse.slice(0, 15);
}

async function fetchFromDataApi(debug) {
  const year = new Date().getFullYear();
  const publishedAfter = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const queries = [
    { q: `March Madness betting picks ${year}`, maxResults: 10 },
    { q: `NCAA tournament odds best bets today ${year}`, maxResults: 10 },
    { q: `college basketball March Madness spread picks`, maxResults: 8 },
    { q: `NCAAB March Madness bracket betting analysis ${year}`, maxResults: 8 },
  ];

  const results = await Promise.allSettled(
    queries.map(async ({ q, maxResults }) => {
      const items = await ytSearch({ q, maxResults, publishedAfter, debug });
      return items;
    })
  );

  const allItems = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  if (debug) console.log(`[bettingFeed] data-api raw count: ${allItems.length}`);
  if (allItems.length === 0) throw new Error('data-api returned empty results');

  return processItems(allItems, debug);
}

async function fetchFromRss(debug) {
  const q = safeRssQuery('March Madness NCAA basketball betting picks');
  if (debug) console.log(`[bettingFeed] trying RSS fallback q="${q}"`);
  const items = await ytRssSearch({ q, debug });
  if (debug) console.log(`[bettingFeed] RSS raw count: ${items.length}`);
  if (items.length === 0) throw new Error('RSS returned empty results');
  return processItems(items, debug);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const urlObj = new URL(req.url || '/', 'http://localhost');
  const debug = urlObj.searchParams.get('debugYT') === '1'
    || urlObj.searchParams.get('debugVideos') === '1';

  try {
    const cached = await getJson(KV_FRESH_KEY);
    if (cached?.items?.length > 0) {
      if (debug) console.log(`[bettingFeed] KV fresh HIT — ${cached.items.length} items`);
      return res.status(200).json({ ...cached, _path: debug ? 'kv_fresh' : undefined });
    }
  } catch (kvErr) {
    if (debug) console.log(`[bettingFeed] KV read error: ${kvErr.message}`);
  }

  const quotaActive = await isQuotaExhausted();
  let items = null;
  let apiPath = 'unknown';

  if (quotaActive) {
    try {
      const lastKnown = await getJson(KV_LASTKNOWN_KEY);
      if (lastKnown?.items?.length > 0) {
        return res.status(200).json({ ...lastKnown, status: 'ok_stale', _path: debug ? 'kv_stale_breaker' : undefined });
      }
    } catch {}

    try {
      items = await fetchFromRss(debug);
      apiPath = 'rss_fallback_breaker';
    } catch (rssErr) {
      if (debug) console.log(`[bettingFeed] RSS fallback FAILED: ${rssErr.message}`);
    }
  } else {
    try {
      items = await fetchFromDataApi(debug);
      apiPath = 'data-api';
    } catch (apiErr) {
      try {
        items = await fetchFromRss(debug);
        apiPath = 'rss_fallback';
      } catch {}
    }
  }

  if (items && items.length > 0) {
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };
    setJson(KV_FRESH_KEY, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    setJson(KV_LASTKNOWN_KEY, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});
    return res.status(200).json({ ...payload, _path: debug ? apiPath : undefined });
  }

  if (!quotaActive) {
    try {
      const lastKnown = await getJson(KV_LASTKNOWN_KEY);
      if (lastKnown?.items?.length > 0) {
        return res.status(200).json({ ...lastKnown, status: 'ok_stale', _path: debug ? 'kv_stale_rescue' : undefined });
      }
    } catch {}
  }

  return res.status(200).json({ status: 'error', updatedAt: new Date().toISOString(), items: [] });
}
