/**
 * YouTube video search proxy. GET /api/youtube/search?q=...&maxResults=6
 *
 * Keeps YOUTUBE_API_KEY server-side only. Minimises the YouTube payload before
 * forwarding it to the client. Cached at the CDN edge for 1 hour.
 *
 * Query params:
 *   q           — required search term, max 120 characters
 *   maxResults  — 1–10, default 6
 *
 * Success response (200):
 *   { status:"ok", q, items:[{ videoId, title, channelTitle, publishedAt, thumbUrl }] }
 *
 * Error responses:
 *   400  { status:"error", message }   — bad / missing params
 *   500  { status:"error", message, details? }  — upstream failure
 */

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const DEFAULT_MAX   = 6;
const MIN_MAX       = 1;
const MAX_MAX       = 10;
const MAX_Q_LEN     = 120;

export default async function handler(req, res) {
  // CORS + cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  // ── Parameter parsing & validation ──────────────────────────────────────────
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rawQ = url.searchParams.get('q');
  const rawMax = url.searchParams.get('maxResults');

  const q = typeof rawQ === 'string' ? rawQ.trim() : '';
  if (!q) {
    return res.status(400).json({ status: 'error', message: 'Missing required param: q' });
  }
  if (q.length > MAX_Q_LEN) {
    return res.status(400).json({
      status: 'error',
      message: `Param q exceeds max length of ${MAX_Q_LEN} characters`,
    });
  }

  const parsedMax = parseInt(rawMax, 10);
  const maxResults = isNaN(parsedMax)
    ? DEFAULT_MAX
    : Math.min(MAX_MAX, Math.max(MIN_MAX, parsedMax));

  // ── API key guard ────────────────────────────────────────────────────────────
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('[api/youtube/search] YOUTUBE_API_KEY is not set');
    // Return HTTP 200 so the client can read the status field and show the right message.
    return res.status(200).json({ status: 'error_no_key', items: [], message: 'YouTube API key not configured' });
  }

  // ── Upstream fetch ───────────────────────────────────────────────────────────
  const params = new URLSearchParams({
    part:         'snippet',
    type:         'video',
    safeSearch:   'none',
    q,
    maxResults:   String(maxResults),
    key:          apiKey,
  });

  let ytData;
  try {
    const upstream = await fetch(`${YT_SEARCH_URL}?${params.toString()}`);
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error(`[api/youtube/search] YouTube API ${upstream.status}:`, text.slice(0, 300));
      const isQuota = upstream.status === 403 || upstream.status === 429;
      // Return HTTP 200 with a typed status so the client can display the correct reason.
      return res.status(200).json({
        status:  isQuota ? 'error_quota' : 'error',
        items:   [],
        message: `YouTube API returned ${upstream.status}`,
      });
    }
    ytData = await upstream.json();
  } catch (err) {
    console.error('[api/youtube/search] fetch error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to reach YouTube API' });
  }

  // ── Minimise payload ─────────────────────────────────────────────────────────
  const items = (ytData.items ?? []).map((item) => ({
    videoId:      item.id?.videoId ?? null,
    title:        item.snippet?.title ?? '',
    channelTitle: item.snippet?.channelTitle ?? '',
    publishedAt:  item.snippet?.publishedAt ?? null,
    thumbUrl:     item.snippet?.thumbnails?.medium?.url
                  ?? item.snippet?.thumbnails?.default?.url
                  ?? null,
  }));

  return res.status(200).json({ status: 'ok', q, items });
}
