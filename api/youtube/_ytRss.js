/**
 * YouTube RSS fallback — zero quota cost.
 * Fetches from YouTube's public Atom feed (search_query parameter).
 * No new dependencies. Pure string/regex XML parsing.
 *
 * Items returned match the normalized shape used by ytSearch in _yt.js:
 *   { videoId, title, channelTitle, channelId, description, publishedAt, thumbUrl }
 *
 * Includes multi-attempt retry with progressive query simplification:
 *   attempt 0 – sanitized original query
 *   attempt 1 – first 4 words
 *   attempt 2 – first 2 words + "basketball"
 */

const YT_RSS_BASE    = 'https://www.youtube.com/feeds/videos.xml';
const RSS_TIMEOUT_MS = 9000;
const RSS_MAX_Q_LEN  = 60; // YouTube RSS search_query length limit

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Sanitize a query for YouTube RSS search.
 * Strips quotes, problematic punctuation, and normalizes whitespace.
 * Trims to RSS_MAX_Q_LEN at a word boundary.
 *
 * @param {string} q
 * @returns {string}
 */
export function safeRssQuery(q) {
  if (!q || typeof q !== 'string') return '';
  return q
    .replace(/["'`]/g, '')           // remove quote chars that confuse RSS search
    .replace(/[#@+:|&]/g, ' ')       // replace punctuation that may cause 400
    .replace(/[^\w\s-]/g, ' ')       // strip remaining non-word chars (except hyphen)
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .slice(0, RSS_MAX_Q_LEN)         // hard cap
    .replace(/\s+\S*$/, '');         // trim at last full word boundary
}

/**
 * Return a progressively simplified query for retry attempt N.
 *
 * attempt 0 → safeRssQuery(original)
 * attempt 1 → first 4 words of safe query
 * attempt 2 → first 2 words + sport fallback
 *
 * @param {string} original
 * @param {number} attempt  0-based
 * @param {string} [sport='basketball']  sport keyword for last-resort simplification
 * @returns {string}
 */
export function simplifyRssQuery(original, attempt, sport = 'basketball') {
  const safe  = safeRssQuery(original);
  const words = safe.split(/\s+/).filter(Boolean);

  if (attempt === 0) return safe;
  if (attempt === 1) return words.slice(0, 4).join(' ') || safe;

  // attempt 2+: first two words + sport (always usable, almost never 400)
  const prefix = words.slice(0, 2).join(' ');
  return prefix ? `${prefix} ${sport}` : `${sport} highlights`;
}

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
 * Fetch YouTube RSS for a single sanitized query. Internal helper.
 * Returns null on HTTP 400 (bad query) so the caller can retry.
 * Throws for all other non-2xx codes or network errors.
 *
 * @param {string} safeQ  — already sanitized query string
 * @param {boolean} debug
 * @returns {Promise<Array|null>}  null = HTTP 400 (retry with simpler query)
 */
async function fetchRssOnce(safeQ, debug) {
  const url = `${YT_RSS_BASE}?search_query=${encodeURIComponent(safeQ)}`;
  if (debug) console.log(`[ytRss] fetch url="${url}"`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)' },
      signal: controller.signal,
    });

    if (res.status === 400) {
      if (debug) console.log(`[ytRss] HTTP 400 for q="${safeQ}" — will simplify`);
      return null; // signal: retry with simpler query
    }
    if (!res.ok) {
      throw new Error(`YouTube RSS HTTP ${res.status} for q="${safeQ}"`);
    }

    const xml = await res.text();
    return parseYtRssXml(xml);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch YouTube RSS for a search query with progressive query simplification.
 * Attempts up to 3 queries on HTTP 400; succeeds on the first non-empty response.
 * Consumes zero API quota.
 *
 * @param {{ q: string, debug?: boolean, sport?: string }} params
 * @returns {Promise<Array<{ videoId, title, channelTitle, channelId, description, publishedAt, thumbUrl }>>}
 */
export async function ytRssSearch({ q, debug = false, sport = 'basketball' }) {
  if (!q || typeof q !== 'string' || !q.trim()) {
    throw new Error('ytRssSearch: q is required');
  }

  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const queryForAttempt = simplifyRssQuery(q, attempt, sport);

    if (!queryForAttempt) {
      if (debug) console.log(`[ytRss] attempt ${attempt} produced empty query — stopping`);
      break;
    }

    if (debug && attempt > 0) {
      console.log(`[ytRss] retry attempt ${attempt} with simplified q="${queryForAttempt}" (original="${q}")`);
    }

    try {
      const items = await fetchRssOnce(queryForAttempt, debug);

      if (items === null) {
        // HTTP 400 — try a simpler query next iteration
        lastError = new Error(`YouTube RSS HTTP 400 for q="${queryForAttempt}"`);
        continue;
      }

      if (debug) {
        console.log(`[ytRss] q="${queryForAttempt}" → ${items.length} items (attempt ${attempt}${attempt > 0 ? ', simplified' : ''})`);
      }
      if (attempt > 0) {
        console.log(`[ytRss] RSS recovered via simplified query (attempt ${attempt}): "${queryForAttempt}" (original: "${q}")`);
      }
      return items;
    } catch (err) {
      lastError = err;
      if (debug) console.log(`[ytRss] attempt ${attempt} error: ${err.message}`);
      // Non-400 errors (network, 5xx) — don't retry, propagate
      throw err;
    }
  }

  // All attempts exhausted (only via HTTP 400 on all simplified queries)
  throw lastError ?? new Error(`ytRssSearch: all attempts exhausted for q="${q}"`);
}

/* ── Channel-based RSS feeds (ALWAYS work, zero quota) ──────────────────── */

// Verified channel IDs — tested 2026-03-24, all return valid RSS XML
const MBB_CHANNELS = [
  { id: 'UCiWLfSweyRNmLpgEHekhoAg', name: 'ESPN' },
  { id: 'UCja8sZ2T4ylIqjggA1Zuukg', name: 'CBS Sports' },
  { id: 'UCwNqHDsnBCKT-olwJwIFyfg', name: 'FOX Sports' },
  { id: 'UC0nOdMq78X8ifkIxnIoqfHQ', name: 'NCAA' },
  { id: 'UC9-OpMMVoNP5o10_Iyq7Ndw', name: 'Bleacher Report' },
  { id: 'UCCl9GMgbh3IbMwyMcU3YLjA', name: 'The Athletic' },
];

/**
 * Fetch latest videos from known men's basketball YouTube channels via RSS.
 * Channel feeds NEVER return 400 — they always serve XML for public channels.
 * Returns items in the same normalized shape as ytRssSearch.
 *
 * @param {{ debug?: boolean, limit?: number }} opts
 * @returns {Promise<Array>}
 */
export async function fetchChannelRssFeeds({ debug = false, limit = 20 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);

  try {
    const results = await Promise.allSettled(
      MBB_CHANNELS.map(async (ch) => {
        const url = `${YT_RSS_BASE}?channel_id=${ch.id}`;
        if (debug) console.log(`[ytRss] channel feed: ${ch.name} (${ch.id})`);
        const res = await fetch(url, {
          headers: { 'User-Agent': 'MaximusSports/1.0 (+https://maximussports.ai)' },
          signal: controller.signal,
        });
        if (!res.ok) {
          if (debug) console.log(`[ytRss] channel ${ch.name} HTTP ${res.status}`);
          return [];
        }
        const xml = await res.text();
        return parseYtRssXml(xml);
      })
    );

    const allItems = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    if (debug) console.log(`[ytRss] channel feeds total: ${allItems.length} items from ${MBB_CHANNELS.length} channels`);
    return allItems.slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}
