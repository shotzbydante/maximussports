/**
 * Intel Feed — combined Videos + Headlines view.
 * Videos are fetched on mount (with 10-min client cache).
 * Each section is independently expandable.
 */

import { useState, useEffect, useRef } from 'react';
import YouTubeVideoCard from '../shared/YouTubeVideoCard';
import YouTubeVideoModal from '../shared/YouTubeVideoModal';
import { getCached, setCached } from '../../utils/ytClientCache';
import styles from './NewsFeed.module.css';

const VIDEO_CACHE_KEY  = 'yt:home:topVideos';
const VIDEO_CACHE_TTL  = 10 * 60 * 1000;
const VIDEO_QUERY      = 'college basketball highlights';
const VIDEO_MAX        = 8;
const HERO_TILE_COUNT  = 2;
const DEFAULT_COMPACT  = 2; // compact rows shown before "show more"
const DEFAULT_HEADLINES = 5;

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

export default function NewsFeed({ items = [], source = 'Mock', loading = false }) {
  const [videoItems, setVideoItems] = useState(() => getCached(VIDEO_CACHE_KEY) ?? []);
  const [videosLoading, setVideosLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const [headlinesExpanded, setHeadlinesExpanded] = useState(false);
  // Prevent duplicate fetches across re-renders
  const fetchInitiatedRef = useRef(false);

  // Fetch on mount; skip if cache is already fresh
  useEffect(() => {
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    if (getCached(VIDEO_CACHE_KEY) != null) return;

    setVideosLoading(true);
    const controller = new AbortController();
    fetch(
      `/api/youtube/search?q=${encodeURIComponent(VIDEO_QUERY)}&maxResults=${VIDEO_MAX}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        const fetched = data.items ?? [];
        setCached(VIDEO_CACHE_KEY, fetched, VIDEO_CACHE_TTL);
        setVideoItems(fetched);
      })
      .catch(() => {})
      .finally(() => setVideosLoading(false));

    return () => controller.abort();
  }, []);

  // Derived video slices
  const heroVideos    = videoItems.slice(0, HERO_TILE_COUNT);
  const compactVideos = videoItems.slice(HERO_TILE_COUNT);
  const visibleCompact = videosExpanded
    ? compactVideos
    : compactVideos.slice(0, DEFAULT_COMPACT);
  const hiddenVideoCount = videosExpanded
    ? 0
    : Math.max(0, compactVideos.length - DEFAULT_COMPACT);

  // Derived headline slices
  const visibleItems = headlinesExpanded
    ? items
    : items.slice(0, DEFAULT_HEADLINES);
  const hiddenHeadlineCount = headlinesExpanded
    ? 0
    : Math.max(0, items.length - DEFAULT_HEADLINES);

  return (
    <div className={styles.widget}>
      {/* Widget header */}
      <div className={styles.widgetHeader}>
        <span className={styles.title}>Intel Feed</span>
      </div>

      {/* ── Section: Top Videos ─────────────────────────────────────── */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Top Videos</p>

        {videosLoading ? (
          <VideoSkeletons />
        ) : videoItems.length === 0 ? (
          <p className={styles.empty}>No video highlights right now.</p>
        ) : (
          <>
            {/* 2-column hero tiles */}
            <div className={styles.videoHeroGrid}>
              {heroVideos.map((video) => (
                <div key={video.videoId} className={styles.videoHeroTile}>
                  <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact={false} />
                </div>
              ))}
            </div>

            {/* Compact additional videos */}
            {visibleCompact.length > 0 && (
              <div className={styles.videoCompactList}>
                {visibleCompact.map((video) => (
                  <div key={video.videoId} className={styles.videoCompactItem}>
                    <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact />
                  </div>
                ))}
              </div>
            )}

            {/* Expand / collapse */}
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

      {/* ── Section: Headlines ──────────────────────────────────────── */}
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
                          {item.title}
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

            {/* Expand / collapse */}
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
