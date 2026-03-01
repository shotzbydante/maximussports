/**
 * Intel Feed endpoint — curated NCAAM men's basketball videos for /news page.
 * GET /api/youtube/intelFeed
 *
 * Strategy:
 *   1. Lock teams — highest weight (lockBonus +20)
 *   2. General NCAAM highlights — broad coverage
 *   3. Top-25 / bubble — secondary weight
 *
 * Response: { status, updatedAt, items: [{videoId, title, channelTitle, publishedAt, thumbUrl, score}] }
 * CDN: public, s-maxage=900, stale-while-revalidate=3600
 */

import { TEAMS } from '../../data/teams.js';
import { ytSearch, scoreItem, classifyBasketballItem } from './_yt.js';

const LOCK_TEAMS = TEAMS.filter((t) => t.oddsTier === 'Lock');

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return true;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const urlObj = new URL(req.url || '/', 'http://localhost');
  const debug = urlObj.searchParams.get('debugYT') === '1';

  try {
    // Build queries: 2 lock team spotlights + 2 general NCAAM
    // Use keywords from team data for more relevant results
    const lockSpotlight = LOCK_TEAMS.slice(0, 2).map((t) => ({
      q: `${t.keywords || t.name + ' basketball'} highlights`,
      maxResults: 5,
      lockBonus: 20,
    }));

    // Use current year so results skew toward recent 2026 season content
    const currentYear = new Date().getFullYear();
    const queries = [
      { q: `men's college basketball highlights ${currentYear}`, maxResults: 8, lockBonus: 0 },
      { q: 'NCAA men basketball top 25 highlights', maxResults: 6, lockBonus: 0 },
      ...lockSpotlight,
    ];

    const results = await Promise.allSettled(
      queries.map(async ({ q, maxResults, lockBonus }) => {
        const items = await ytSearch({ q, maxResults, debug });
        return items.map((item) => ({ ...item, _lockBonus: lockBonus }));
      })
    );

    const allItems = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    if (debug) {
      console.log(`[intelFeed] raw count before filter: ${allItems.length}`);
    }

    // Filter: men's basketball only
    const filtered = allItems.filter((item) => classifyBasketballItem(item) === 'accept');

    if (debug) {
      console.log(`[intelFeed] after NCAAM filter: ${filtered.length}`);
    }

    // Dedupe by videoId
    const deduped = dedupeById(filtered);

    // Score: base relevance + lock bonus
    const scored = deduped.map((item) => ({
      videoId:      item.videoId,
      title:        item.title,
      channelTitle: item.channelTitle,
      publishedAt:  item.publishedAt,
      thumbUrl:     item.thumbUrl,
      score:        scoreItem(item) + (item._lockBonus || 0),
    }));

    // Sort descending by score (deterministic — no randomness)
    scored.sort((a, b) => b.score - a.score);

    res.status(200).json({
      status:    'ok',
      updatedAt: new Date().toISOString(),
      items:     scored.slice(0, 15),
    });
  } catch (err) {
    // Surface the error type so Vercel logs can distinguish quota vs missing key vs network
    const isQuota = /quota/i.test(err.message) || /429/.test(err.message);
    const isMissingKey = /YOUTUBE_API_KEY/.test(err.message);
    console.error(
      `[intelFeed] error (${isMissingKey ? 'missing_key' : isQuota ? 'quota_exceeded' : 'unknown'}):`,
      err.message,
    );
    res.status(200).json({
      status: isMissingKey ? 'error_no_key' : isQuota ? 'error_quota' : 'error',
      updatedAt: new Date().toISOString(),
      items: [],
    });
  }
}
