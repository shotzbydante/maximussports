/**
 * YouTube RSS fallback — zero quota cost.
 * Fetches from YouTube's public Atom feed (search_query parameter).
 * No new dependencies. Pure string/regex XML parsing.
 *
 * Items returned match the normalized shape used by ytSearch in _yt.js:
 *   { videoId, title, channelTitle, channelId, description, publishedAt, thumbUrl }
 */

const YT_RSS_BASE = 'https://www.youtube.com/feeds/videos.xml';
const RSS_TIMEOUT_MS = 8000;

// Minimal HTML entity decoding for the subset YouTube uses in titles/names
function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Parse a YouTube Atom RSS feed XML string into normalized video items.
 * Returns same shape as ytSearch output.
 *
 * @param {string} xml
 * @returns {Array<{ videoId, title, channelTitle, channelId, description, publishedAt, thumbUrl }>}
 */
export function parseYtRssXml(xml) {
  const items = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;

  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];

    const videoIdMatch = block.match(/<yt:videoId>\s*([\w-]+)\s*<\/yt:videoId>/);
    const videoId = videoIdMatch?.[1] ?? null;
    if (!videoId) continue;

    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    const pubMatch = block.match(/<published>([\s\S]*?)<\/published>/);
    const publishedAt = pubMatch?.[1]?.trim() ?? null;

    // Author block: <author><name>...</name><uri>...</uri></author>
    const authorMatch = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/);
    const channelTitle = authorMatch ? decodeEntities(authorMatch[1].trim()) : '';

    const channelIdMatch = block.match(/<yt:channelId>\s*([\w-]+)\s*<\/yt:channelId>/);
    const channelId = channelIdMatch?.[1] ?? null;

    // Prefer media:thumbnail url attr; fallback to mqdefault
    const thumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const thumbUrl = thumbMatch?.[1] ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    // media:description (optional, used for scoring)
    const descMatch = block.match(/<media:description>([\s\S]*?)<\/media:description>/);
    const description = descMatch ? decodeEntities(descMatch[1].trim()).slice(0, 200) : '';

    items.push({ videoId, title, channelTitle, channelId, description, publishedAt, thumbUrl });
  }

  return items;
}

/**
 * Fetch YouTube RSS for a search query. Consumes zero quota.
 * Returns normalized items in the same shape as ytSearch.
 *
 * @param {{ q: string, debug?: boolean }} params
 * @returns {Promise<Array>}
 */
export async function ytRssSearch({ q, debug = false }) {
  if (!q || typeof q !== 'string' || !q.trim()) {
    throw new Error('ytRssSearch: q is required');
  }

  const url = `${YT_RSS_BASE}?search_query=${encodeURIComponent(q.trim())}`;
  if (debug) console.log(`[ytRss] search q="${q}" url=${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)' },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`YouTube RSS HTTP ${res.status} for q="${q}"`);
    }

    const xml = await res.text();
    const items = parseYtRssXml(xml);

    if (debug) console.log(`[ytRss] q="${q}" → ${items.length} items from RSS`);
    return items;
  } finally {
    clearTimeout(timer);
  }
}
