/**
 * Email-safe video card renderer.
 *
 * Videos cannot be embedded in email clients. Instead, each video is rendered as:
 *  - YouTube thumbnail image (via img.youtube.com CDN — no auth required)
 *  - Video title
 *  - Source label
 *  - Clickthrough link to YouTube
 *
 * The thumbnail acts as a visual "play" button and is fully clickable.
 * All rendering is table-based with inline styles for maximum email client compat.
 *
 * YouTube thumbnail URL format:
 *   https://img.youtube.com/vi/{videoId}/hqdefault.jpg   — 480×360, always available
 *   https://img.youtube.com/vi/{videoId}/maxresdefault.jpg — 1280×720, may 404 on older videos
 *
 * We use hqdefault.jpg as the safe default.
 */

const YT_THUMB_BASE = 'https://img.youtube.com/vi';

/**
 * Extract the YouTube video ID from a URL.
 * Handles standard, short, and embed URL formats.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // youtu.be/ID or youtube.com/shorts/ID
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    if (u.pathname.includes('/shorts/')) return u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    if (u.pathname.includes('/embed/')) return u.pathname.split('/embed/')[1]?.split('/')[0] || null;
    // youtube.com/watch?v=ID
    return u.searchParams.get('v') || null;
  } catch {
    // Try regex fallback for malformed URLs
    const match = url.match(/(?:v=|\/)([\w-]{11})(?:\?|&|\/|$)/);
    return match ? match[1] : null;
  }
}

/**
 * Build a YouTube thumbnail URL for a given video ID.
 * @param {string} videoId
 * @param {'hqdefault'|'mqdefault'|'sddefault'} [quality='hqdefault']
 * @returns {string}
 */
export function getYouTubeThumbnailUrl(videoId, quality = 'hqdefault') {
  return `${YT_THUMB_BASE}/${videoId}/${quality}.jpg`;
}

/**
 * Normalize a video object into the standard email video card data shape.
 *
 * Accepts YouTube API response objects as well as custom video shapes.
 *
 * @param {object} video - raw video object
 * @returns {object|null} normalized video card data, or null if unrenderable
 */
export function buildVideoCardData(video) {
  if (!video) return null;

  // Handle YouTube API v3 shape: { id: {videoId}, snippet: {title, channelTitle, thumbnails} }
  const ytId =
    video.videoId ||
    video.id?.videoId ||
    (typeof video.id === 'string' ? video.id : null) ||
    extractYouTubeVideoId(video.url || video.link || '');

  if (!ytId && !video.thumbnailUrl) return null;

  const title    = video.title || video.snippet?.title || 'Watch Video';
  const channel  = video.channel || video.channelTitle || video.snippet?.channelTitle || '';
  const watchUrl = ytId
    ? `https://www.youtube.com/watch?v=${ytId}`
    : (video.url || video.link || 'https://www.youtube.com');
  const thumbUrl = ytId
    ? getYouTubeThumbnailUrl(ytId, 'hqdefault')
    : (video.thumbnailUrl || video.thumbnail || '');

  return {
    videoId: ytId,
    title:   title.length > 80 ? title.slice(0, 78) + '…' : title,
    channel,
    watchUrl,
    thumbUrl,
  };
}

/**
 * Render a single email-safe video card.
 *
 * Layout:
 *  ┌─────────────────────────────────┐
 *  │  [thumbnail]  ▶  Title...       │
 *  │               Channel • YouTube │
 *  └─────────────────────────────────┘
 *
 * The thumbnail is left-aligned (120×67px, 16:9) with the metadata on the right.
 * On very narrow clients the thumbnail may stack — but inline styles maintain
 * minimum readability either way.
 *
 * @param {object} video      - raw video object (will be normalized internally)
 * @param {object} [opts]
 * @param {boolean} [opts.showThumb=true] - whether to show the thumbnail
 * @returns {string} HTML string
 */
export function renderEmailVideoCard(video, opts = {}) {
  const card = video?.videoId !== undefined && video?.watchUrl ? video : buildVideoCardData(video);
  if (!card) return '';

  const { showThumb = true } = opts;

  const thumbWidth  = 110;
  const thumbHeight = Math.round(thumbWidth * (9 / 16)); // ~62px

  const thumbCell = showThumb && card.thumbUrl ? `
    <td valign="top" style="width:${thumbWidth + 10}px;padding-right:10px;">
      <a href="${card.watchUrl}" target="_blank" style="display:block;text-decoration:none;">
        <div style="position:relative;display:inline-block;line-height:0;">
          <img src="${card.thumbUrl}" alt="${card.title}" width="${thumbWidth}" height="${thumbHeight}"
            style="width:${thumbWidth}px;height:${thumbHeight}px;min-width:${thumbWidth}px;border-radius:4px;display:block;border:0;outline:none;-ms-interpolation-mode:bicubic;background:#1a2234;" />
          <!-- Play icon overlay — supported in Apple Mail / Outlook desktop, cosmetic only -->
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;background:rgba(0,0,0,0.55);border-radius:50%;text-align:center;line-height:28px;font-size:12px;color:#fff;">&#9654;</div>
        </div>
      </a>
    </td>` : '';

  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
       style="background:#f9fafb;border:1px solid #e8ecf0;border-radius:6px;border-collapse:collapse;">
  <tr>
    <td style="padding:11px 14px 11px;" class="video-card-td">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          ${thumbCell}
          <td valign="middle">
            <a href="${card.watchUrl}" target="_blank"
               style="font-size:13px;font-weight:600;color:#1a1a2e;line-height:1.35;text-decoration:none;display:block;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              ${card.title}
            </a>
            <div style="margin-top:4px;">
              ${card.channel ? `<span style="font-size:11px;color:#8a94a6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${card.channel}</span>` : ''}
              ${card.channel ? `<span style="font-size:11px;color:#b0b8c4;font-family:'DM Sans',Arial,Helvetica,sans-serif;"> &middot; </span>` : ''}
              <a href="${card.watchUrl}" target="_blank"
                 style="font-size:11px;color:#2d6ca8;text-decoration:underline;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Watch on YouTube</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * Render a grid/list of video cards, wrapped in section-td padding rows.
 *
 * @param {Array} videos   - array of raw video objects
 * @param {object} [opts]
 * @param {number} [opts.max=4]          - max videos to show
 * @param {boolean} [opts.showThumb=true] - show thumbnails
 * @returns {string} HTML string (complete <tr> rows)
 */
export function renderEmailVideoList(videos, opts = {}) {
  const { max = 4, showThumb = true } = opts;
  if (!Array.isArray(videos) || videos.length === 0) return '';

  const cards = videos
    .slice(0, max)
    .map(v => renderEmailVideoCard(v, { showThumb }))
    .filter(Boolean);

  if (cards.length === 0) return '';

  return cards.map(cardHtml => `
<tr>
  <td style="padding:0 24px 7px;" class="section-td">
    ${cardHtml}
  </td>
</tr>`).join('');
}
