/**
 * Intel Feed — Videos + Headlines widget.
 *
 * mode="all"       (default) — combined card: Top Videos → Headlines.
 *                              Backwards-compatible; used on /news and any
 *                              other existing page.
 * mode="videos"    — standalone Top Videos card only.
 *                    Owns the YouTube fetch + 10-min cache.
 * mode="headlines" — standalone Headlines card only.
 *                    Skips the YouTube fetch entirely.
 *
 * limitVideos     — max video items rendered in "videos" / "all" mode (default 4).
 * limitHeadlines  — max headline items rendered in "headlines" mode (default 6).
 *                   "all" mode uses its own DEFAULT_HEADLINES constant.
 */

import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import YouTubeVideoCard from '../shared/YouTubeVideoCard';
import YouTubeVideoModal from '../shared/YouTubeVideoModal';
import {
  getCached, setCached,
  getStaleHomeFeedVideos, setStaleHomeFeedVideos,
} from '../../utils/ytClientCache';
import { decodeDisplayText } from '../../utils/decodeEntities';
import styles from './NewsFeed.module.css';

const VIDEO_CACHE_KEY   = 'yt:home:topVideos';
const VIDEO_CACHE_TTL   = 10 * 60 * 1000;
const VIDEO_MAX         = 8;
const HERO_TILE_COUNT   = 2;
const DEFAULT_COMPACT   = 2;
const DEFAULT_HEADLINES = 5;

/**
 * Client-side defense filter: reject videos with EXPLICIT women's basketball signals.
 * Server-side classifier handles the nuanced tournament ambiguity logic.
 * Client-side only catches clear women's content from stale caches.
 */
const WOMEN_CLIENT_RE = /\bwomen'?s?\b|\bwomens\b|\bwbb\b|\bncaaw\b|\blady\b|\bwnba\b/i;

function isLikelyMensVideo(video) {
  const title = (video.title || '').replace(/&#39;/g, "'").replace(/[\u2018\u2019]/g, "'");
  // Only reject if there's an explicit women's signal — leave tournament ambiguity to server
  if (WOMEN_CLIENT_RE.test(title)) return false;
  return true;
}

// Only treat non-empty cached arrays as valid — avoids serving a stale empty result.
function getValidCache(key) {
  const cached = getCached(key);
  return Array.isArray(cached) && cached.length > 0 ? cached : null;
}

function VideoSkeletons() {
  return (
    <div className={styles.videoSkeletons}>
      <div className={styles.videoHeroGrid}>
        {Array.from({ length: HERO_TILE_COUNT }).map((_, i) => (
          <div key={i} className={styles.videoSkeletonTile} />
        ))}
      </div>
      {Array.from({ length: DEFAULT_COMPACT }).map((_, i) => (
        <div key={i} className={styles.videoSkeletonRow} />
      ))}
    </div>
  );
}

export default function NewsFeed({
  items = [],
  source = 'Mock',
  loading = false,
  mode = 'all',
  limitVideos = 4,
  limitHeadlines = 6,
}) {
  const [videoItems, setVideoItems] = useState(() => {
    const live = getValidCache(VIDEO_CACHE_KEY);
    if (live) return live.filter(isLikelyMensVideo);
    const stale = getStaleHomeFeedVideos();
    return Array.isArray(stale) && stale.length > 0 ? stale.filter(isLikelyMensVideo) : [];
  });
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState(false);
  const [videoApiStatus, setVideoApiStatus] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const [headlinesExpanded, setHeadlinesExpanded] = useState(false);
  const fetchInitiatedRef = useRef(false);

  useEffect(() => {
    // Headlines-only card never needs video data — skip fetch entirely.
    if (mode === 'headlines') return;
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    // Only skip if we have a valid non-empty cache entry
    if (getValidCache(VIDEO_CACHE_KEY) != null) return;

    setVideosLoading(true);
    const controller = new AbortController();
    // Use intelFeed (circuit breaker + KV + RSS) instead of raw search proxy
    fetch(`/api/youtube/intelFeed`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) {
          setVideoApiStatus(`http_${r.status}`);
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        setVideoApiStatus(data.status ?? 'ok');
        const fetched = (data.items ?? []).filter(isLikelyMensVideo);
        // Only cache non-empty successful results — prevents serving a stale empty state
        if (fetched.length > 0) {
          setCached(VIDEO_CACHE_KEY, fetched, VIDEO_CACHE_TTL);
          setStaleHomeFeedVideos(fetched);
          setVideoItems(fetched);
        } else {
          // If live fetch returned empty, keep any stale results visible
          const stale = getStaleHomeFeedVideos();
          if (!stale?.length) setVideoItems([]);
          // else leave stale items in state — don't replace with empty
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setVideosError(true);
          // Keep any stale results visible — don't wipe on error
          const stale = getStaleHomeFeedVideos();
          if (!stale?.length) setVideoItems([]);
        }
      })
      .finally(() => setVideosLoading(false));

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video slice helpers ────────────────────────────────────────────────
  // Capped modes use limitVideos; "all" mode exposes all items + expand toggle.
  const cappedVideos    = mode === 'all' ? videoItems : videoItems.slice(0, limitVideos);
  const heroVideos      = cappedVideos.slice(0, HERO_TILE_COUNT);
  const compactVideos   = cappedVideos.slice(HERO_TILE_COUNT);
  // Expand/collapse only active in "all" mode
  const visibleCompact  = videosExpanded ? compactVideos : compactVideos.slice(0, DEFAULT_COMPACT);
  const hiddenVideoCount = videosExpanded ? 0 : Math.max(0, compactVideos.length - DEFAULT_COMPACT);

  // ── Headline slice helpers ─────────────────────────────────────────────
  const headlineLimit       = mode === 'all' ? DEFAULT_HEADLINES : limitHeadlines;
  const visibleItems        = headlinesExpanded ? items : items.slice(0, headlineLimit);
  const hiddenHeadlineCount = headlinesExpanded ? 0 : Math.max(0, items.length - headlineLimit);

  // ── mode="videos" ── standalone Top Videos card ───────────────────────
  if (mode === 'videos') {
    const hasError = videosError || (videoApiStatus && videoApiStatus !== 'ok' && videoApiStatus !== 'ok_stale');

    if (!videosLoading && cappedVideos.length === 0) {
      const title  = 'No videos right now';
      const reason = hasError
        ? 'Videos are temporarily unavailable. Please check back soon.'
        : 'No highlights found. Check back soon.';

      return (
        <div className={styles.widget}>
          <div className={styles.widgetHeader}>
            <span className={styles.title}>Top Videos</span>
          </div>
          <div className={styles.section}>
            <div className={styles.videosEmpty}>
              <p className={styles.videosEmptyTitle}>{title}</p>
              {reason && <p className={styles.videosEmptyReason}>{reason}</p>}
            </div>
          </div>
          <Link to="/news" className={styles.cardCta}>View Intel Feed →</Link>
        </div>
      );
    }

    return (
      <div className={styles.widget}>
        <div className={styles.widgetHeader}>
          <span className={styles.title}>Top Videos</span>
        </div>
        <div className={styles.section}>
          {videosLoading ? (
            <VideoSkeletons />
          ) : (
            <div className={styles.videoUniformGrid}>
              {cappedVideos.map((video) => (
                <div key={video.videoId} className={styles.videoUniformTile}>
                  <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact={false} />
                </div>
              ))}
            </div>
          )}
        </div>
        <Link to="/news" className={styles.cardCta}>View more videos →</Link>
        <YouTubeVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      </div>
    );
  }

  // ── mode="headlines" ── standalone Headlines card ─────────────────────
  if (mode === 'headlines') {
    if (!loading && items.length === 0) return null;
    return (
      <div className={styles.widget}>
        <div className={styles.widgetHeader}>
          <span className={styles.title}>Headlines</span>
        </div>
        <div className={styles.section}>
          {loading ? (
            <div className={styles.loadingList}>
              {[1, 2, 3].map((n) => (
                <div key={n} className={styles.skeletonItem}>
                  <div className={styles.skeletonBadge} />
                  <div
                    className={styles.skeletonLine}
                    style={{ width: n === 1 ? '100%' : n === 2 ? '88%' : '75%' }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <ul className={styles.list}>
                {visibleItems.map((item) => {
                  const src = item.source || source;
                  return (
                    <li key={item.id} className={styles.item}>
                      <div className={styles.itemMeta}>
                        <span className={styles.sourceBadge}>{src}</span>
                        <span className={styles.time}>{item.time}</span>
                      </div>
                      <div className={styles.headline}>
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            {decodeDisplayText(item.title)}
                          </a>
                        ) : (
                          item.title
                        )}
                      </div>
                      {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
                    </li>
                  );
                })}
              </ul>
              {(hiddenHeadlineCount > 0 || headlinesExpanded) && (
                <button
                  type="button"
                  className={styles.expandBtn}
                  onClick={() => setHeadlinesExpanded((v) => !v)}
                >
                  {headlinesExpanded
                    ? 'Show less'
                    : `+${hiddenHeadlineCount} more headline${hiddenHeadlineCount !== 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}
        </div>
        <Link to="/news" className={styles.cardCta}>View full Intel Feed →</Link>
      </div>
    );
  }

  // ── mode="all" ── legacy combined card (default, backwards-compatible) ─
  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <span className={styles.title}>Intel Feed</span>
      </div>

      {/* ── Section: Top Videos ───────────────────────────────────────── */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Top Videos</p>

        {videosLoading ? (
          <VideoSkeletons />
        ) : videoItems.length === 0 ? (
          <p className={styles.empty}>No video highlights right now.</p>
        ) : (
          <>
            <div className={styles.videoHeroGrid}>
              {heroVideos.map((video) => (
                <div key={video.videoId} className={styles.videoHeroTile}>
                  <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact={false} />
                </div>
              ))}
            </div>
            {visibleCompact.length > 0 && (
              <div className={styles.videoCompactList}>
                {visibleCompact.map((video) => (
                  <div key={video.videoId} className={styles.videoCompactItem}>
                    <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact />
                  </div>
                ))}
              </div>
            )}
            {(hiddenVideoCount > 0 || videosExpanded) && (
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => setVideosExpanded((v) => !v)}
              >
                {videosExpanded
                  ? 'Show less'
                  : `+${hiddenVideoCount} more video${hiddenVideoCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Section: Headlines ────────────────────────────────────────── */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Headlines</p>

        {loading ? (
          <div className={styles.loadingList}>
            {[1, 2, 3].map((n) => (
              <div key={n} className={styles.skeletonItem}>
                <div className={styles.skeletonBadge} />
                <div
                  className={styles.skeletonLine}
                  style={{ width: n === 1 ? '100%' : n === 2 ? '88%' : '75%' }}
                />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className={styles.empty}>No basketball news available. Check back soon.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {visibleItems.map((item) => {
                const src = item.source || source;
                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemMeta}>
                      <span className={styles.sourceBadge}>{src}</span>
                      <span className={styles.time}>{item.time}</span>
                    </div>
                    <div className={styles.headline}>
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.link}
                        >
                          {decodeDisplayText(item.title)}
                        </a>
                      ) : (
                        item.title
                      )}
                    </div>
                    {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
                  </li>
                );
              })}
            </ul>
            {(hiddenHeadlineCount > 0 || headlinesExpanded) && (
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => setHeadlinesExpanded((v) => !v)}
              >
                {headlinesExpanded
                  ? 'Show less'
                  : `+${hiddenHeadlineCount} more headline${hiddenHeadlineCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </>
        )}
      </div>

      <YouTubeVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
    </div>
  );
}
