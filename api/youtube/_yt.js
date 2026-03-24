/**
 * Shared YouTube Data API v3 helpers for server-side use only.
 *
 * Exports:
 *   ytSearch({ q, maxResults, debug? })   → normalized item array
 *   ytVideosDetails(videoIds[])           → map { videoId: { durationSeconds } }
 *   scoreItem(item, teamName?)            → relevance score (higher = more relevant)
 *   isItemAllowlisted(item)               → boolean
 *   parseISO8601Duration(str)             → seconds | null
 */

import { ALLOWLIST } from './_allowlist.js';
import { getJson, setJson } from '../_globalCache.js';

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YT_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const MIN_MAX = 1;
const MAX_MAX = 10;
const YT_FETCH_TIMEOUT_MS = 8000;

// ─── Quota circuit breaker ────────────────────────────────────────────────────
//
// When YouTube Data API returns 403 (quota exhausted), we write a KV flag keyed
// by UTC date: yt:quota_exhausted:YYYY-MM-DD
// For the rest of that UTC day all Data API calls are skipped automatically.
// The flag TTL is set to seconds-until-midnight so it self-expires at reset time.

function quotaBreakerKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `yt:quota_exhausted:${y}-${m}-${day}`;
}

function secondsUntilMidnightUtc() {
  const now = new Date();
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  ));
  return Math.max(60, Math.ceil((midnight - now) / 1000));
}

/**
 * Returns true when the daily YouTube quota circuit breaker is active (403 was
 * already received today). Always resolves; never throws.
 */
export async function isQuotaExhausted() {
  try {
    const val = await getJson(quotaBreakerKey());
    return val === true || val === '1' || val === 1;
  } catch {
    return false; // fail open — don't block calls if KV is unavailable
  }
}

/**
 * Mark YouTube Data API quota as exhausted for the rest of today (UTC).
 * TTL auto-expires at midnight so the breaker resets with YouTube's daily quota.
 * Fire-and-forget; never throws.
 */
async function markQuotaExhausted() {
  try {
    await setJson(quotaBreakerKey(), true, { exSeconds: secondsUntilMidnightUtc() });
    console.warn('[ytSearch] quota exhausted — circuit breaker set until midnight UTC');
  } catch {
    // Non-fatal: log already written, proceed
  }
}

// ─── Allowlist helper ─────────────────────────────────────────────────────────

export function isItemAllowlisted(item) {
  const ch = (item.channelTitle ?? '').toLowerCase();
  return ALLOWLIST.some((a) => ch.includes(a.toLowerCase()));
}

// ─── ytSearch ────────────────────────────────────────────────────────────────

/**
 * Call YouTube Data API v3 search and return a normalized item array.
 *
 * @param {{ q: string, maxResults?: number, debug?: boolean }} params
 * @returns {Promise<Array<{ videoId, title, channelTitle, publishedAt, thumbUrl }>>}
 */
export async function ytSearch({ q, maxResults = 6, publishedAfter, debug = false }) {
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

  if (publishedAfter) params.set('publishedAfter', publishedAfter);

  const t0 = debug ? Date.now() : 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YT_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${YT_SEARCH_URL}?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403 || res.status === 429) {
      console.error(`[ytSearch] quota/rate-limit (${res.status}) for q="${q}":`, text.slice(0, 200));
      // Activate circuit breaker so further Data API calls are skipped for the rest of the UTC day
      markQuotaExhausted().catch(() => {});
    }
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (debug) {
    console.log(`[ytSearch] q="${q}" returned ${data.items?.length ?? 0} results in ${Date.now() - t0}ms`);
  }

  return (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId:      item.id.videoId,
      channelId:    item.snippet?.channelId ?? null,
      title:        item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      description:  item.snippet?.description ?? '',
      publishedAt:  item.snippet?.publishedAt ?? null,
      thumbUrl:     item.snippet?.thumbnails?.medium?.url
                    ?? item.snippet?.thumbnails?.default?.url
                    ?? null,
    }));
}

// ─── ytVideosDetails ──────────────────────────────────────────────────────────

/**
 * Fetch contentDetails for a list of videoIds in a single API call.
 * Returns a map: { [videoId]: { durationSeconds: number | null } }
 *
 * @param {string[]} videoIds
 * @param {{ debug?: boolean }} [opts]
 * @returns {Promise<Record<string, { durationSeconds: number | null }>>}
 */
export async function ytVideosDetails(videoIds, { debug = false } = {}) {
  if (!videoIds?.length) return {};

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return {};

  const params = new URLSearchParams({
    part: 'contentDetails',
    id:   videoIds.join(','),
    key:  apiKey,
  });

  const t0 = debug ? Date.now() : 0;
  let data;
  try {
    const res = await fetch(`${YT_VIDEOS_URL}?${params}`);
    if (!res.ok) return {};
    data = await res.json();
  } catch {
    return {};
  }

  if (debug) {
    console.log(`[ytVideosDetails] fetched ${data.items?.length ?? 0} details in ${Date.now() - t0}ms`);
  }

  const map = {};
  for (const item of data.items ?? []) {
    map[item.id] = {
      durationSeconds: parseISO8601Duration(item.contentDetails?.duration),
    };
  }
  return map;
}

// ─── parseISO8601Duration ─────────────────────────────────────────────────────

/**
 * Parse a YouTube ISO 8601 duration string (e.g. "PT1H23M45S") to seconds.
 * Returns null if unparseable.
 *
 * @param {string|undefined} str
 * @returns {number|null}
 */
export function parseISO8601Duration(str) {
  if (!str) return null;
  const match = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

// ─── scoreItem ───────────────────────────────────────────────────────────────

// ─── Conference network helper ────────────────────────────────────────────────

const CONF_NET_TERMS = [
  'big ten network', 'btn', 'sec network', 'acc network',
  'pac-12 networks', 'big 12 conference', 'big east conference',
];

function isConfNetworkChannel(item) {
  const ch = (item.channelTitle ?? '').toLowerCase();
  return CONF_NET_TERMS.some((t) => ch.includes(t));
}

// ─── Basketball-only content filter ──────────────────────────────────────────

/**
 * Hard-reject patterns for non-basketball sport keywords.
 * Checked against BOTH title and channelTitle (men's-only policy).
 */
const FOOTBALL_REJECT = [
  /\bfootball\b/i,
  /\bncaaf\b/i,
  /\bcfb\b/i,
  /\bnfl\b/i,
  /\bbowl\s*game\b/i,
  /\btouchdown\b/i,
  /\bquarterback\b/i,
  /\b(?:big[\s-]?ten|sec|acc|big[\s-]?12|pac-?12)\s+football\b/i,
];

/** Hard-reject: explicit WBB / Lady / NCAAW / WNBA — always reject. */
const WOMEN_HARD = [
  /\blady\b/i,
  /\blady\s*huskers\b/i,
  /\blady\s*vols\b/i,
  /\blady\s*wildcats\b/i,
  /\blady\s*bears\b/i,
  /\blady\s*tigers\b/i,
  /\blady\s*bulldogs\b/i,
  /\blady\s*aggies\b/i,
  /\blady\s*raiders\b/i,
  /\blady\s*cardinals\b/i,
  /\blady\s*hawkeyes\b/i,
  /\blady\s*terrapins\b/i,
  /\bwbb\b/i,
  /\bncaaw\b/i,
  /\bwomen'?s?\s*basketball\b/i,
  /\bwomen'?s?\s*tournament\b/i,
  /\bwomen'?s?\s*march\s*madness\b/i,
  /\bwomen'?s?\s*final\s*four\b/i,
  /\bwomen'?s?\s*sweet\s*(?:16|sixteen)\b/i,
  /\bwomen'?s?\s*elite\s*(?:8|eight)\b/i,
  /\bwomen'?s?\s*ncaa\b/i,
  /\bwomen'?s?\s*bracket\b/i,
  /\bwomen'?s?\s*hoops\b/i,
  /\bwomen'?s?\s*game\b/i,
  /\bbig\s*ten\s*women'?s?\b/i,
  /\bsec\s*women'?s?\b/i,
  /\bacc\s*women'?s?\b/i,
  /\bbig\s*(?:12|twelve)\s*women'?s?\b/i,
  /\bwnba\b/i,
];
/** Soft: "women/women's/womens" alone — only reject when paired with sports context */
const WOMEN_SOFT = [/\bwomen\b/i, /\bwomen's\b/i, /\bwomens\b/i, /\bwomen&#39;s\b/i, /\bwomen\u2019s\b/i];
const BBALL_CONTEXT_RE = /\b(?:basketball|hoops|wbb|ncaaw|tournament|ncaa|march\s*madness|final\s*four|sweet\s*(?:16|sixteen)|elite\s*(?:8|eight)|highlights|round\s+of\s+\d+)\b/i;

/**
 * Positive MEN'S basketball signals (title or channel).
 * Required for non-trusted channels; allowlist/conf-net can also pass via basketball terms.
 */
const MENS_SIGNALS = [
  /\bmen\b/i,
  /\bmen'?s\b/i,
  /\bmens\b/i,
  /\bmbb\b/i,
  /\bncaam\b/i,
  /\bncaab\b/i,
  /\bb1gmbb\b/i,
  /\bcollege\s+basketball\b/i,
  /\bbasketball\s+highlights\b/i,
  /\b(?:sec|acc|big\s*ten)\s*mbb\b/i,
  /\bmen'?s?\s+(?:college\s+)?basketball\b/i,
];

/**
 * Basketball terms that allow allowlisted/conf-net items without explicit "men's".
 * Only used when no football/women's; title must have one of these or "highlights".
 */
const BBALL_OR_HIGHLIGHTS = [
  /\bbasketball\b/i,
  /\bhoops\b/i,
  /\bhighlights\b/i,
];

/**
 * Strong basketball signals required for non-allowlisted channels (no bare "highlights").
 */
const STRONG_BBALL_SIGNALS = [
  /\bbasketball\b/i,
  /\bhoops\b/i,
  /\bmbb\b/i,
  /\bncaam\b/i,
  /\bncaab\b/i,
  /\bcollege\s+basketball\b/i,
  /\bmen'?s?\s+(?:college\s+)?basketball\b/i,
  /\bbasketball\s+highlights\b/i,
];

/**
 * Normalize text for filtering: decode HTML entities + normalize smart quotes.
 * Ensures "women&#39;s" and "women\u2019s" match the same patterns as "women's".
 */
function normalizeForFilter(text) {
  return (text ?? '')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');  // smart double quotes
}

/**
 * Classify a YouTube item for men's basketball filtering.
 * Rejects when description/snippet contains women's/WBB signals even if title doesn't.
 * For non-allowlisted channels, requires a strong basketball signal (not just "highlights").
 *
 * @param {{ title: string, channelTitle: string, description?: string }} item
 * @returns {'accept'|'football'|'women'|'no_bball'}
 */
export function classifyBasketballItem(item) {
  const title = normalizeForFilter(item.title ?? '').trim();
  const channel = normalizeForFilter(item.channelTitle ?? '').trim();
  const description = normalizeForFilter(item.description ?? '').trim();
  const combined = `${title} ${channel}`;
  const withSnippet = `${title} ${channel} ${description}`;

  // Step 1 — hard reject: football in title OR channel
  if (FOOTBALL_REJECT.some((re) => re.test(title) || re.test(channel))) return 'football';

  // Step 2 — reject WBB: hard patterns always; women/women's/womens only when basketball context present
  if (WOMEN_HARD.some((re) => re.test(withSnippet))) return 'women';
  if (WOMEN_SOFT.some((re) => re.test(withSnippet)) && BBALL_CONTEXT_RE.test(withSnippet)) return 'women';

  // Step 3 — conference network: allow if no football/women's (already checked)
  if (isConfNetworkChannel(item)) return 'accept';

  // Step 4 — allowlisted channels: allow only if title has basketball/highlights (no explicit "men's" required)
  if (isItemAllowlisted(item)) {
    const hasBballTerm = BBALL_OR_HIGHLIGHTS.some((re) => re.test(title));
    if (hasBballTerm) return 'accept';
  }

  // Step 5 — non-allowlisted: require strong basketball signal (not just "highlights" alone)
  if (STRONG_BBALL_SIGNALS.some((re) => re.test(combined))) return 'accept';

  return 'no_bball';
}

/**
 * Determine whether a YouTube item is men's basketball content.
 * @param {{ title: string, channelTitle: string, channelId?: string }} item
 * @returns {boolean}
 */
export function isBasketballItem(item) {
  return classifyBasketballItem(item) === 'accept';
}

// ─── Scoring constants ────────────────────────────────────────────────────────

/**
 * Penalty patterns applied to non-allowlisted channels only.
 * Title patterns checked regardless of channel.
 */
const TITLE_PENALTIES_ALL = [
  { re: /\breaction\b/i,          points: 20 },
  { re: /\bbetting\s*picks?\b/i,  points: 30 },
];

const TITLE_PENALTIES_NONALLOWED = [
  { re: /\blive\s*stream\b/i,  points: 20 },
  { re: /\bfull\s*game\b/i,    points: 15 },
];

const CHANNEL_PENALTIES_NONALLOWED = [
  { re: /\bHD\b/,           points: 15 },
  { re: /\bstreams?\b/i,    points: 20 },
  { re: /\blive\b/i,        points: 15 },
];

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
  const allowlisted = isItemAllowlisted(item);

  // +50 for trusted publisher
  if (allowlisted) score += 50;

  // +15 bonus for conference network channels (premium regional coverage)
  // Applied on top of allowlist bonus since conference nets are also allowlisted
  if (isConfNetworkChannel(item)) score += 15;

  // Title bonuses
  if (/highlights/i.test(item.title)) score += 15;
  if (teamName && item.title.toLowerCase().includes(teamName.toLowerCase())) {
    score += 10;
  }

  // Recency bonus: up to +20 for videos published within the last 30 days
  if (item.publishedAt) {
    const ageDays = (Date.now() - new Date(item.publishedAt).getTime()) / 86_400_000;
    if      (ageDays <= 1)  score += 20;
    else if (ageDays <= 3)  score += 15;
    else if (ageDays <= 7)  score += 10;
    else if (ageDays <= 14) score += 5;
    else if (ageDays <= 30) score += 2;
  }

  // Penalties applied regardless of channel
  for (const { re, points } of TITLE_PENALTIES_ALL) {
    if (re.test(item.title)) score -= points;
  }

  // Penalties applied to non-allowlisted channels only
  if (!allowlisted) {
    for (const { re, points } of TITLE_PENALTIES_NONALLOWED) {
      if (re.test(item.title)) score -= points;
    }
    const ch = item.channelTitle ?? '';
    for (const { re, points } of CHANNEL_PENALTIES_NONALLOWED) {
      if (re.test(ch)) score -= points;
    }
  }

  return score;
}
