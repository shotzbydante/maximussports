/**
 * Shared YouTube Data API v3 helpers for server-side use only.
 *
 * Exports:
 *   ytSearch({ q, maxResults }) → normalized item array
 *   scoreItem(item, teamName?)  → relevance score (higher = more relevant)
 */

import { ALLOWLIST } from './_allowlist.js';

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const MIN_MAX = 1;
const MAX_MAX = 10;

// ─── ytSearch ────────────────────────────────────────────────────────────────

/**
 * Call YouTube Data API v3 search and return a normalized item array.
 *
 * @param {{ q: string, maxResults?: number }} params
 * @returns {Promise<Array<{ videoId, title, channelTitle, publishedAt, thumbUrl }>>}
 */
export async function ytSearch({ q, maxResults = 6 }) {
  if (!q || typeof q !== 'string' || !q.trim()) {
    throw new Error('ytSearch: q is required');
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set');

  const clamped = Math.min(MAX_MAX, Math.max(MIN_MAX, parseInt(maxResults, 10) || 6));

  const params = new URLSearchParams({
    part:       'snippet',
    type:       'video',
    safeSearch: 'none',
    q:          q.trim(),
    maxResults: String(clamped),
    key:        apiKey,
  });

  const res = await fetch(`${YT_SEARCH_URL}?${params}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  return (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId:      item.id.videoId,
      title:        item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      publishedAt:  item.snippet?.publishedAt ?? null,
      thumbUrl:     item.snippet?.thumbnails?.medium?.url
                    ?? item.snippet?.thumbnails?.default?.url
                    ?? null,
    }));
}

// ─── scoreItem ───────────────────────────────────────────────────────────────

/**
 * Compute a relevance score for a YouTube search result item.
 * Higher scores are more relevant. Does NOT filter — caller sorts descending.
 *
 * @param {{ channelTitle: string, title: string, publishedAt: string|null }} item
 * @param {string} [teamName]
 * @returns {number}
 */
export function scoreItem(item, teamName) {
  let score = 0;

  // +50 for trusted publisher
  const ch = (item.channelTitle ?? '').toLowerCase();
  if (ALLOWLIST.some((a) => ch.includes(a.toLowerCase()))) {
    score += 50;
  }

  // +15 for "Highlights" in title
  if (/highlights/i.test(item.title)) score += 15;

  // +10 if team name appears in title
  if (teamName && item.title.toLowerCase().includes(teamName.toLowerCase())) {
    score += 10;
  }

  // Recency bonus: up to +20 for videos published within the last 30 days
  if (item.publishedAt) {
    const ageDays = (Date.now() - new Date(item.publishedAt).getTime()) / 86_400_000;
    if (ageDays <= 1)  score += 20;
    else if (ageDays <= 3)  score += 15;
    else if (ageDays <= 7)  score += 10;
    else if (ageDays <= 14) score += 5;
    else if (ageDays <= 30) score += 2;
  }

  return score;
}
