import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { fetchHome } from '../api/home';
import { TEAMS } from '../data/teams';
import ConferenceLogo from '../components/shared/ConferenceLogo';
import YouTubeVideoCard from '../components/shared/YouTubeVideoCard';
import YouTubeVideoModal from '../components/shared/YouTubeVideoModal';
import { getCached, setCached, getStaleIntelFeed, setStaleIntelFeed, getStaleIntelFeedAge } from '../utils/ytClientCache';
import { track } from '../analytics/index';
import { getPublicationLogoUrl } from '../utils/publicationLogos';
import SEOHead from '../components/seo/SEOHead';
import styles from './NewsFeed.module.css';

const INTEL_FEED_KEY = 'yt:news:intelFeed';
const INTEL_FEED_TTL = 15 * 60 * 1000;

const ytDebug =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugYT');

const debugVideos =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugVideos');

// ─── Constants ────────────────────────────────────────────────────────────────

const CONF_ORDER = ['All', 'Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];

const CONF_COLORS = {
  'Big Ten':  { bg: 'rgba(29, 78, 216, 0.1)',  text: '#1d4ed8' },
  'SEC':      { bg: 'rgba(194, 65,  12, 0.1)',  text: '#c2410c' },
  'ACC':      { bg: 'rgba(109, 40, 217, 0.1)',  text: '#6d28d9' },
  'Big 12':   { bg: 'rgba(185, 28,  28, 0.1)',  text: '#b91c1c' },
  'Big East': { bg: 'rgba(55,  48, 163, 0.1)',  text: '#3730a3' },
  'Others':   { bg: 'rgba(21, 128,  61, 0.1)',  text: '#15803d' },
};

const CONF_GRADIENT = {
  'Big Ten':  'linear-gradient(135deg, #1e3a5f 0%, #2d5a96 100%)',
  'SEC':      'linear-gradient(135deg, #3d1a00 0%, #c85000 100%)',
  'ACC':      'linear-gradient(135deg, #2d1b69 0%, #6d28d9 100%)',
  'Big 12':   'linear-gradient(135deg, #4a0000 0%, #991b1b 100%)',
  'Big East': 'linear-gradient(135deg, #1a1a3e 0%, #3730a3 100%)',
  'Others':   'linear-gradient(135deg, #1a3a2a 0%, #166534 100%)',
  default:    'linear-gradient(135deg, #1e2a3a 0%, #374151 100%)',
};

const PUBLISHER_CONFIG = {
  'yahoo sports':    { lines: ['YAHOO', 'SPORTS'],   bg: 'linear-gradient(135deg, #3d0070 0%, #7b1fa2 100%)' },
  'cbs sports':      { lines: ['CBS', 'SPORTS'],     bg: 'linear-gradient(135deg, #12235a 0%, #1565c0 100%)' },
  'espn':            { lines: ['ESPN'],              bg: 'linear-gradient(135deg, #6d0000 0%, #c62828 100%)' },
  'fox sports':      { lines: ['FOX', 'SPORTS'],     bg: 'linear-gradient(135deg, #2a1200 0%, #d84315 100%)' },
  'the athletic':    { lines: ['THE', 'ATHLETIC'],   bg: 'linear-gradient(135deg, #111 0%, #2d3748 100%)' },
  '247sports':       { lines: ['247', 'SPORTS'],     bg: 'linear-gradient(135deg, #1a0000 0%, #991b1b 100%)' },
  'bleacher report': { lines: ['B/R'],               bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' },
};

function getPublisherConfig(source) {
  return PUBLISHER_CONFIG[(source || '').toLowerCase()] ?? null;
}

function getGradient(conf) {
  return CONF_GRADIENT[conf] || CONF_GRADIENT.default;
}

const SIGNAL_PATTERNS = [
  { re: /\bupset\b/i,                                        tag: 'Upset',      cls: styles.signalUpset      },
  { re: /\binjur(y|ies|ed|ing)\b/i,                          tag: 'Injury',     cls: styles.signalInjury     },
  { re: /\brecruit(ing|ment|s|ed)?\b/i,                       tag: 'Recruiting', cls: styles.signalRecruiting },
  { re: /\b(fired|hired|resign(s|ed)?|coaching staff)\b/i,   tag: 'Coaching',   cls: styles.signalCoaching   },
  { re: /\b(ranked|ranking|rankings|top 25|ap poll)\b/i,     tag: 'Rankings',   cls: styles.signalRankings   },
  { re: /\bbubble\b/i,                                        tag: 'Bubble',     cls: styles.signalBubble     },
  { re: /\btransfer portal\b/i,                               tag: 'Transfer',   cls: styles.signalTransfer   },
];

const TEAM_TOKENS = TEAMS.map((t) => ({
  tokens: t.name.toLowerCase().split(/\s+/),
  full:   t.name.toLowerCase(),
  conference: t.conference,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectConference(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  if (/\bbig ten\b/i.test(lower))             return 'Big Ten';
  if (/\b(sec)\b/i.test(lower))               return 'SEC';
  if (/\b(acc)\b/i.test(lower))               return 'ACC';
  if (/\bbig 12\b|\bbig twelve\b/i.test(lower)) return 'Big 12';
  if (/\bbig east\b/i.test(lower))            return 'Big East';
  for (const { full, conference } of TEAM_TOKENS) {
    if (lower.includes(full)) return conference;
  }
  return null;
}

function detectSignal(title) {
  if (!title) return null;
  for (const { re, tag, cls } of SIGNAL_PATTERNS) {
    if (re.test(title)) return { tag, cls };
  }
  return null;
}

function formatRelTime(pubDate) {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  const diff  = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function enrichItem(raw, i) {
  return {
    id:        raw.link || raw.id || `item-${i}`,
    title:     raw.title || '',
    source:    raw.source || 'News',
    time:      formatRelTime(raw.pubDate),
    pubDate:   raw.pubDate || null,
    link:      raw.link || null,
    thumbnail: raw.image || raw.imageUrl || raw.thumbnail
               || raw.media?.[0]?.url || raw.enclosure?.url || null,
    conference: raw.conference || detectConference(raw.title),
    signal:    detectSignal(raw.title),
    excerpt:   raw.excerpt || raw.description || '',
    _type:     'article',
  };
}

function getConfStyle(conf) {
  return CONF_COLORS[conf] || { bg: 'rgba(100,100,100,0.08)', text: 'var(--color-text-muted)' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfPill({ conference }) {
  if (!conference) return null;
  const { bg, text } = getConfStyle(conference);
  return (
    <span className={styles.confPill} style={{ background: bg, color: text }}>
      <ConferenceLogo conference={conference} size={12} />
      {conference}
    </span>
  );
}

function SourceBadge({ source }) {
  return <span className={styles.sourceBadge}>{source}</span>;
}

function SignalTag({ signal }) {
  if (!signal) return null;
  return <span className={`${styles.signalTag} ${signal.cls}`}>{signal.tag}</span>;
}

/**
 * Logo chip: shows the publication favicon in a clean 36×36 container.
 * Falls back to a branded gradient with initials if the favicon fails to load.
 */
function LogoChip({ source, conference }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = !failed ? getPublicationLogoUrl(source) : null;
  const pub = getPublisherConfig(source);
  const fallbackBg = pub ? pub.bg : getGradient(conference);
  const initials = source
    ? source.replace(/^(?:the|a)\s+/i, '').slice(0, 2).toUpperCase()
    : '—';

  if (logoUrl) {
    return (
      <div className={styles.logoChip}>
        <img
          src={logoUrl}
          alt=""
          className={styles.logoChipImg}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div className={styles.logoChip} style={{ background: fallbackBg }}>
      <span className={styles.logoChipInitials}>{initials}</span>
    </div>
  );
}

/**
 * Renders article thumbnail if available; otherwise falls back to LogoChip.
 */
function StreamThumbCell({ item }) {
  const [thumbFailed, setThumbFailed] = useState(false);

  if (item.thumbnail && !thumbFailed) {
    return (
      <img
        src={item.thumbnail}
        alt=""
        className={styles.streamThumbImage}
        loading="lazy"
        onError={() => setThumbFailed(true)}
      />
    );
  }
  return <LogoChip source={item.source} conference={item.conference} />;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className={styles.content}>
      <div className={styles.skeletonHero} />
      <div className={styles.skeletonGrid}>
        {[1, 2, 3, 4].map((n) => <div key={n} className={styles.skeletonCard} />)}
      </div>
      <div className={styles.skeletonStream}>
        {[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className={styles.skeletonRow} />)}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const CONTENT_MODES = [
  { id: 'all',     label: 'All'     },
  { id: 'videos',  label: 'Videos'  },
  { id: 'stories', label: 'Stories' },
];

export default function NewsFeed() {
  const [rawItems,    setRawItems]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [activeConf,  setActiveConf]  = useState('All');
  const [contentMode, setContentMode] = useState('all');
  const [activeVideo, setActiveVideo] = useState(null);

  // Hydrate from live cache (non-empty), or fall back to stale last-known-good.
  // An empty cache entry (e.g. from a prior API error) must not be treated as valid.
  const [intelVideos, setIntelVideos] = useState(() => {
    const cached = getCached(INTEL_FEED_KEY);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const stale = getStaleIntelFeed();
    return Array.isArray(stale) && stale.length > 0 ? stale : [];
  });
  const [intelFeedStatus, setIntelFeedStatus] = useState(null);
  const [intelVideosIsStale, setIntelVideosIsStale] = useState(() => {
    const cached = getCached(INTEL_FEED_KEY);
    if (Array.isArray(cached) && cached.length > 0) return false;
    const stale = getStaleIntelFeed();
    return Array.isArray(stale) && stale.length > 0;
  });
  const [intelVideosStaleAgeMs, setIntelVideosStaleAgeMs] = useState(() => {
    const cached = getCached(INTEL_FEED_KEY);
    if (Array.isArray(cached) && cached.length > 0) return 0;
    return getStaleIntelFeedAge();
  });

  // Track news_view once on mount
  useEffect(() => {
    track('news_view', { view: 'all', conference: null });
  }, []);

  // Handlers
  const handleModeChange = useCallback((mode) => {
    setContentMode(mode);
    track('news_filter_change', { filter: 'content_mode', value: mode });
  }, []);

  const handleConfChange = useCallback((conf) => {
    setActiveConf(conf);
    if (conf !== activeConf) {
      track('news_filter_change', { filter: 'conference', value: conf });
      if (conf !== 'All') {
        track('news_view', { view: 'conference', conference: conf });
      }
    }
  }, [activeConf]);

  const handleVideoSelect = useCallback((video, source = 'news') => {
    track('video_modal_open', {
      video_id: video?.videoId,
      title:    (video?.title ?? '').slice(0, 100),
      source,
      feed:     activeConf === 'All' ? 'intel' : 'conference',
    });
    setActiveVideo(video);
  }, [activeConf]);

  const handleArticleOpen = useCallback((item, position, feed = 'all') => {
    const url = (item?.link ?? '').split('?')[0].slice(0, 200);
    track('intel_item_open', {
      type:     'article',
      id:       url,
      title:    (item?.title ?? '').slice(0, 100),
      source:   item?.source,
      position,
      feed,
    });
  }, []);

  const handleSeeMoreVideos = useCallback(() => {
    handleModeChange('videos');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [handleModeChange]);

  const handleSeeMoreStories = useCallback(() => {
    handleModeChange('stories');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [handleModeChange]);

  // Fetch news headlines
  useEffect(() => {
    setLoading(true);
    fetchHome()
      .then((data) => setRawItems(data?.headlines || []))
      .catch((err)  => setError(err?.message || 'Failed to load news'))
      .finally(()   => setLoading(false));
  }, []);

  // Intel Feed videos: fetch once per 15-min live cache window.
  // Guard: only skip fetch when live cache has non-empty results.
  // If live cache is empty/expired, show stale results immediately while refetching.
  useEffect(() => {
    const cached = getCached(INTEL_FEED_KEY);
    if (Array.isArray(cached) && cached.length > 0) {
      if (debugVideos) {
        console.log('[NewsFeed debugVideos] cache hit', {
          cachedCount: cached.length,
          mode: 'live-cache',
          component: 'src/pages/NewsFeed.jsx',
        });
      }
      setIntelVideosIsStale(false);
      return;
    }

    // Show stale last-known-good immediately while fetching fresh data
    const stale = getStaleIntelFeed();
    if (stale?.length > 0) {
      if (debugVideos) {
        console.log('[NewsFeed debugVideos] stale hit', {
          staleCount: stale.length,
          staleAgeMs: getStaleIntelFeedAge(),
          mode: 'stale',
          component: 'src/pages/NewsFeed.jsx',
        });
      }
      setIntelVideos(stale);
      setIntelVideosIsStale(true);
      setIntelVideosStaleAgeMs(getStaleIntelFeedAge());
    }

    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (ytDebug) qs.set('debugYT', '1');
    fetch(`/api/youtube/intelFeed${qs.toString() ? `?${qs}` : ''}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? [];
        setIntelFeedStatus(data.status ?? 'ok');
        if (items.length > 0) {
          // Cache fresh results and update stale last-known-good
          setCached(INTEL_FEED_KEY, items, INTEL_FEED_TTL);
          setStaleIntelFeed(items);
          setIntelVideos(items);
          setIntelVideosIsStale(false);
        } else if (!stale?.length) {
          // Only clear if we have no stale fallback to show
          setIntelVideos([]);
          setIntelVideosIsStale(false);
        }
        // If items empty but stale exists, leave stale visible (don't replace with empty)
        if (debugVideos || ytDebug) {
          console.log('[NewsFeed debugVideos] fetch complete', {
            rawFetchedCount: items.length,
            status: data.status ?? 'ok',
            staleCount: stale?.length ?? 0,
            keptStale: items.length === 0 && (stale?.length ?? 0) > 0,
            note: 'Filtering is server-side; client receives final scored list.',
            component: 'src/pages/NewsFeed.jsx',
          });
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setIntelFeedStatus('error');
          if (debugVideos) console.log('[NewsFeed debugVideos] fetch error', { error: err.message, staleCount: stale?.length ?? 0 });
        }
      });
    return () => controller.abort();
  }, []);

  // Enrich and sort by freshness (desc); items with no timestamp go last
  const enriched = useMemo(() => {
    const items = rawItems.map(enrichItem);
    return items.sort((a, b) => {
      if (!a.pubDate && !b.pubDate) return 0;
      if (!a.pubDate) return 1;
      if (!b.pubDate) return -1;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });
  }, [rawItems]);

  // Conference filter — applied on stories only, not videos
  const availableConfs = useMemo(() => {
    const seen = new Set();
    for (const item of enriched) {
      if (item.conference) seen.add(item.conference);
    }
    return CONF_ORDER.filter((c) => c === 'All' || seen.has(c));
  }, [enriched]);

  const filtered = useMemo(() => {
    if (activeConf === 'All') return enriched;
    return enriched.filter((item) => item.conference === activeConf);
  }, [enriched, activeConf]);

  const hasContent = enriched.length > 0 || intelVideos.length > 0;

  // Debug diagnostics — only active when ?debugVideos=1 is in the URL
  useEffect(() => {
    if (!debugVideos) return;
    console.log('[NewsFeed debugVideos] render state', {
      rawVideoCount:        intelVideos.length,
      videosIsStale:        intelVideosIsStale,
      videosStaleAgeHours:  intelVideosStaleAgeMs > 0 ? (intelVideosStaleAgeMs / 3_600_000).toFixed(1) : null,
      filteredStories:      filtered.length,
      mode:                 contentMode,
      activeConf,
      intelFeedStatus,
      component:            'src/pages/NewsFeed.jsx',
    });
  }, [intelVideos.length, intelVideosIsStale, intelVideosStaleAgeMs, filtered.length, contentMode, activeConf, intelFeedStatus]);

  return (
    <div className={styles.page}>
      <SEOHead
        title="College Basketball News — NCAAB Headlines, Videos & Analysis"
        description="Stay informed with curated college basketball news, video highlights, and expert analysis across every major conference. Your NCAAB intel feed powered by Maximus Sports."
        canonicalPath="/news"
      />

      {/* ── Premium page header ── */}
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <div>
            <h1 className={styles.pageTitle}>College Basketball News</h1>
            <p className={styles.pageSubtitle}>Curated NCAAB videos, headlines, and analysis</p>
          </div>
          {activeConf !== 'All' && (
            <button
              type="button"
              className={styles.confActivePill}
              onClick={() => handleConfChange('All')}
              aria-label={`Clear ${activeConf} filter`}
            >
              <ConferenceLogo conference={activeConf} size={12} />
              <span>{activeConf}</span>
              <span className={styles.confActivePillX} aria-hidden>×</span>
            </button>
          )}
        </div>

        {/* Content-mode pills — primary controls */}
        <div className={styles.contentModeBar} role="tablist" aria-label="Content type">
          {CONTENT_MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={contentMode === id}
              className={`${styles.modeChip} ${contentMode === id ? styles.modeChipActive : ''}`}
              onClick={() => handleModeChange(id)}
            >
              {label}
            </button>
          ))}

          {/* Conference pills — secondary story filter, hidden in videos-only mode */}
          {contentMode !== 'videos' && availableConfs.length > 1 && (
            <div className={styles.confPills} role="group" aria-label="Filter by conference">
              {availableConfs.filter((c) => c !== 'All').map((conf) => (
                <button
                  key={conf}
                  type="button"
                  className={`${styles.filterChip} ${styles.filterChipConf} ${activeConf === conf ? styles.filterChipActive : ''}`}
                  onClick={() => handleConfChange(activeConf === conf ? 'All' : conf)}
                  aria-pressed={activeConf === conf}
                >
                  <span className={styles.filterChipLogo}>
                    <ConferenceLogo conference={conf} size={12} />
                  </span>
                  {conf}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── States ── */}
      {loading && <LoadingSkeleton />}
      {error   && <p className={styles.error}>{error}</p>}

      <YouTubeVideoModal
        video={activeVideo}
        onClose={() => {
          if (activeVideo) track('video_modal_close', { video_id: activeVideo.videoId });
          setActiveVideo(null);
        }}
      />

      {!loading && !error && hasContent && (
        <div className={styles.content}>

          {/* ══════════════════════════════════════════════════════════════
              VIDEOS SECTION
              Visible in 'all' mode (capped to 6) and 'videos' mode (full).
              Always uses the global intel feed — not conference-filtered.
              ══════════════════════════════════════════════════════════════ */}
          {(contentMode === 'all' || contentMode === 'videos') && intelVideos.length > 0 && (
            <section className={styles.topVideosSection} aria-label="Top videos">
              <div className={styles.sectionHeadingRow}>
                <h2 className={styles.sectionHeading}>Top Videos</h2>
                <div className={styles.sectionHeadingRight}>
                  {intelVideosIsStale && intelVideosStaleAgeMs > 0 && (
                    <span className={styles.videosStaleLabel}>
                      Updated {Math.round(intelVideosStaleAgeMs / 3_600_000)}h ago
                    </span>
                  )}
                  {contentMode === 'all' && (
                    <button
                      type="button"
                      className={styles.sectionCta}
                      onClick={handleSeeMoreVideos}
                    >
                      {intelVideos.length > 6
                        ? `See more videos (${intelVideos.length}) →`
                        : 'See more videos →'}
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.topVideosGrid}>
                {(contentMode === 'videos' ? intelVideos : intelVideos.slice(0, 6)).map((v, idx) => (
                  <div key={v.videoId || idx} className={styles.topVideoItem}>
                    <YouTubeVideoCard
                      video={v}
                      onSelect={(v) => handleVideoSelect(v, 'intelFeed')}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {contentMode === 'videos' && intelVideos.length === 0 && (
            <div className={styles.videosEmptyBlock}>
              <div className={styles.videosEmptyIcon} aria-hidden>▶</div>
              <p className={styles.videosEmptyTitle}>
                {intelFeedStatus === 'error_no_key'
                  ? 'Video service not configured'
                  : 'No videos right now'}
              </p>
              <p className={styles.videosEmptyReason}>
                {intelFeedStatus === 'error_no_key'
                  ? 'YouTube is not configured for this environment.'
                  : 'Videos are temporarily unavailable. Please check back soon.'}
              </p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STORIES SECTION
              Visible in 'all' mode (capped to 10) and 'stories' mode (full).
              Respects the active conference filter.
              ══════════════════════════════════════════════════════════════ */}
          {(contentMode === 'all' || contentMode === 'stories') && filtered.length > 0 && (
            <section
              className={styles.topStoriesDesktopSection}
              aria-label={contentMode === 'stories' ? 'All stories' : 'Top stories'}
            >
              <div className={styles.sectionHeadingRow}>
                <h2 className={styles.sectionHeading}>
                  {contentMode === 'stories' ? 'All Stories' : 'Latest Headlines'}
                </h2>
                {contentMode === 'all' && (
                  <button
                    type="button"
                    className={styles.sectionCta}
                    onClick={handleSeeMoreStories}
                  >
                    {filtered.length > 10
                      ? `See more stories (${filtered.length}) →`
                      : 'See more stories →'}
                  </button>
                )}
              </div>
              <div className={styles.streamList} role="list">
                {(contentMode === 'all' ? filtered.slice(0, 10) : filtered).map((item, idx) => (
                  <Fragment key={item.id}>
                    <a
                      href={item.link || '#'}
                      target={item.link ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className={styles.streamCard}
                      aria-label={item.title}
                      role="listitem"
                      onClick={() =>
                        handleArticleOpen(
                          item,
                          idx,
                          contentMode === 'stories' ? 'stories' : 'top-stories',
                        )
                      }
                    >
                      <div className={styles.streamThumb} aria-hidden>
                        <StreamThumbCell item={item} />
                      </div>
                      <div className={styles.streamBody}>
                        <div className={styles.streamMeta}>
                          <SourceBadge source={item.source} />
                          {item.time && <span className={styles.metaDot} aria-hidden>·</span>}
                          {item.time && <span className={styles.streamTime}>{item.time}</span>}
                          {item.conference && <ConfPill conference={item.conference} />}
                          {item.signal && <SignalTag signal={item.signal} />}
                        </div>
                        <p className={styles.streamHeadline}>{item.title}</p>
                        {item.excerpt && (
                          <p className={styles.streamExcerpt}>{item.excerpt}</p>
                        )}
                      </div>
                    </a>
                    {contentMode === 'stories' && (idx + 1) % 8 === 0 && (
                      <div
                        className={`${styles.adSlot} ${styles.adSlotInline}`}
                        aria-hidden
                        data-slot="mid-feed"
                      >
                        Subscription prompt · Betting insights
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </section>
          )}

          {/* Empty state when conference filter yields no stories */}
          {contentMode !== 'videos' && filtered.length === 0 && enriched.length > 0 && (
            <p className={styles.empty}>
              No stories for this conference right now.{' '}
              <button
                type="button"
                className={styles.emptyAction}
                onClick={() => handleConfChange('All')}
              >
                Clear filter
              </button>
            </p>
          )}

          {contentMode !== 'videos' && enriched.length === 0 && (
            <p className={styles.empty}>No basketball news available. Check back soon.</p>
          )}

          {/* Ad / subscription slot */}
          {contentMode !== 'videos' && (
            <div className={styles.adSlot} aria-hidden data-slot="sponsored-hero">
              Subscription prompt · Betting insights
            </div>
          )}

        </div>
      )}
    </div>
  );
}
