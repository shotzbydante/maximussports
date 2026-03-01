import { useState, useEffect, useRef } from 'react';
import YouTubeVideoCard from '../shared/YouTubeVideoCard';
import YouTubeVideoModal from '../shared/YouTubeVideoModal';
import { getCached, setCached } from '../../utils/ytClientCache';
import styles from './NewsFeed.module.css';

const TABS = [
  { id: 'headlines', label: 'Headlines' },
  { id: 'video',     label: 'Video' },
];

const VIDEO_CACHE_KEY = 'yt:home:topVideos';
const VIDEO_CACHE_TTL = 10 * 60 * 1000;
const VIDEO_QUERY     = 'college basketball highlights';
const VIDEO_MAX       = 8;
const HERO_TILE_COUNT = 2; // number of larger "hero" tiles

/** Section label row inside the Video tab */
function VideoSectionLabel({ label }) {
  return <p className={styles.videoSectionLabel}>{label}</p>;
}

/** Skeleton tiles for video loading state */
function VideoSkeletons({ count = 4 }) {
  return (
    <div className={styles.videoSkeletons}>
      <div className={styles.videoHeroGrid}>
        {Array.from({ length: HERO_TILE_COUNT }).map((_, i) => (
          <div key={i} className={styles.videoSkeletonTile} />
        ))}
      </div>
      <div className={styles.videoCompactList}>
        {Array.from({ length: count - HERO_TILE_COUNT }).map((_, i) => (
          <div key={i} className={styles.videoSkeletonRow} />
        ))}
      </div>
    </div>
  );
}

/**
 * Intel Feed widget — Headlines + Video tabs.
 * Video tab fetches from /api/youtube/search, cached 10 min client-side.
 */
export default function NewsFeed({ items = [], source = 'Mock', loading = false }) {
  const [activeTab, setActiveTab] = useState('headlines');
  const [videoItems, setVideoItems] = useState(() => getCached(VIDEO_CACHE_KEY) ?? []);
  const [videosLoading, setVideosLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const hasFetchedRef = useRef(false);

  // Compute display labels
  const resolvedTabs = TABS.map((tab) => {
    if (tab.id === 'headlines' && items.length > 0) {
      return { ...tab, label: `Headlines (${items.length})` };
    }
    return tab;
  });

  // Fetch top CBB videos when the Video tab is first activated
  useEffect(() => {
    if (activeTab !== 'video') return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const cached = getCached(VIDEO_CACHE_KEY);
    if (cached) {
      setVideoItems(cached);
      return;
    }

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
  }, [activeTab]);

  const heroVideos   = videoItems.slice(0, HERO_TILE_COUNT);
  const extraVideos  = videoItems.slice(HERO_TILE_COUNT);
  const cappedItems  = items.slice(0, 6);

  return (
    <div className={styles.widget}>
      {/* Header: title + content-type tabs */}
      <div className={styles.widgetHeader}>
        <span className={styles.title}>Intel Feed</span>
        <div className={styles.tabs} role="tablist" aria-label="Intel feed content type">
          {resolvedTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── VIDEO TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'video' && (
        <>
          {videosLoading ? (
            <VideoSkeletons count={VIDEO_MAX} />
          ) : videoItems.length === 0 ? (
            <p className={styles.empty}>No video highlights available right now.</p>
          ) : (
            <>
              {/* Hero tiles — 2 larger cards side-by-side */}
              <div className={styles.videoHeroGrid}>
                {heroVideos.map((video) => (
                  <div key={video.videoId} className={styles.videoHeroTile}>
                    <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact={false} />
                  </div>
                ))}
              </div>

              {/* Extra videos — compact horizontal list */}
              {extraVideos.length > 0 && (
                <>
                  <VideoSectionLabel label="More Highlights" />
                  <div className={styles.videoCompactList}>
                    {extraVideos.map((video) => (
                      <div key={video.videoId} className={styles.videoCompactItem}>
                        <YouTubeVideoCard video={video} onSelect={setActiveVideo} compact />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Headlines section below videos */}
              {cappedItems.length > 0 && (
                <>
                  <VideoSectionLabel label="Headlines" />
                  <ul className={styles.list}>
                    {cappedItems.map((item) => {
                      const src = item.source || source;
                      return (
                        <li key={item.id} className={styles.item}>
                          <div className={styles.itemMeta}>
                            <span className={styles.sourceBadge}>{src}</span>
                            <span className={styles.time}>{item.time}</span>
                          </div>
                          <div className={styles.headline}>
                            {item.link ? (
                              <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                {item.title}
                              </a>
                            ) : (
                              item.title
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}

          <YouTubeVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
        </>
      )}

      {/* ── HEADLINES TAB ───────────────────────────────────────────────── */}
      {activeTab === 'headlines' && (
        <>
          {loading ? (
            <div className={styles.loadingList}>
              {[1, 2, 3].map((n) => (
                <div key={n} className={styles.skeletonItem}>
                  <div className={styles.skeletonBadge} />
                  <div className={styles.skeletonLine} style={{ width: n === 1 ? '100%' : n === 2 ? '88%' : '75%' }} />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className={styles.empty}>No basketball news available. Check back soon.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => {
                const src = item.source || source;
                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemMeta}>
                      <span className={styles.sourceBadge}>{src}</span>
                      <span className={styles.time}>{item.time}</span>
                    </div>
                    <div className={styles.headline}>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
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
          )}
        </>
      )}
    </div>
  );
}
