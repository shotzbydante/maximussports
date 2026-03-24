import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchHome } from '../api/home';
import { TEAMS } from '../data/teams';
import ConferenceLogo from '../components/shared/ConferenceLogo';
import YouTubeVideoCard from '../components/shared/YouTubeVideoCard';
import YouTubeVideoModal from '../components/shared/YouTubeVideoModal';
import { getCached, setCached, getStaleIntelFeed, setStaleIntelFeed, getStaleIntelFeedAge } from '../utils/ytClientCache';
import { track } from '../analytics/index';
import { decodeDisplayText } from '../utils/decodeEntities';
import { getPublicationLogoUrl, getSourceBrandLogo } from '../utils/publicationLogos';
import SEOHead, { buildOgImageUrl } from '../components/seo/SEOHead';
import styles from './NewsFeed.module.css';

const INTEL_FEED_KEY = 'yt:news:intelFeed';
const INTEL_FEED_TTL = 15 * 60 * 1000;
const BETTING_VIDEO_KEY = 'yt:news:bettingFeed';
const BETTING_VIDEO_TTL = 15 * 60 * 1000;
const BETTING_NEWS_KEY = 'yt:news:bettingNews';
const BETTING_NEWS_TTL = 15 * 60 * 1000;

// ─── Constants ────────────────────────────────────────────────────────────────

const CONF_ORDER = [
  'All', 'Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East',
  'AAC', 'WCC', 'Mountain West', 'A-10',
];

const CONF_COLORS = {
  'Big Ten':       { bg: 'rgba(29, 78, 216, 0.1)',  text: '#1d4ed8' },
  'SEC':           { bg: 'rgba(194, 65,  12, 0.1)',  text: '#c2410c' },
  'ACC':           { bg: 'rgba(109, 40, 217, 0.1)',  text: '#6d28d9' },
  'Big 12':        { bg: 'rgba(185, 28,  28, 0.1)',  text: '#b91c1c' },
  'Big East':      { bg: 'rgba(55,  48, 163, 0.1)',  text: '#3730a3' },
  'AAC':           { bg: 'rgba(21, 128,  61, 0.1)',  text: '#15803d' },
  'WCC':           { bg: 'rgba(120, 53, 15, 0.1)',   text: '#78350f' },
  'Mountain West': { bg: 'rgba(30, 64, 175, 0.1)',   text: '#1e40af' },
  'A-10':          { bg: 'rgba(136, 19, 55, 0.1)',   text: '#881337' },
};

const PUBLISHER_CONFIG = {
  'yahoo sports':    { lines: ['YAHOO', 'SPORTS'],   bg: 'linear-gradient(135deg, #3d0070 0%, #7b1fa2 100%)' },
  'cbs sports':      { lines: ['CBS', 'SPORTS'],     bg: 'linear-gradient(135deg, #12235a 0%, #1565c0 100%)' },
  'espn':            { lines: ['ESPN'],              bg: 'linear-gradient(135deg, #6d0000 0%, #c62828 100%)' },
  'fox sports':      { lines: ['FOX', 'SPORTS'],     bg: 'linear-gradient(135deg, #2a1200 0%, #d84315 100%)' },
  'the athletic':    { lines: ['THE', 'ATHLETIC'],   bg: 'linear-gradient(135deg, #111 0%, #2d3748 100%)' },
  '247sports':       { lines: ['247', 'SPORTS'],     bg: 'linear-gradient(135deg, #1a0000 0%, #991b1b 100%)' },
  'bleacher report': { lines: ['B/R'],               bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' },
  'associated press':{ lines: ['AP'],                bg: 'linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%)' },
  'action network':  { lines: ['ACTION'],            bg: 'linear-gradient(135deg, #0d1117 0%, #1a1a2e 100%)' },
  'covers':          { lines: ['COVERS'],            bg: 'linear-gradient(135deg, #0a2540 0%, #1565c0 100%)' },
  'vsin':            { lines: ['VSiN'],              bg: 'linear-gradient(135deg, #0d47a1 0%, #1976d2 100%)' },
};

const SIGNAL_PATTERNS = [
  { re: /\bupset\b/i,                                        tag: 'Upset',      cls: 'signalUpset'      },
  { re: /\binjur(y|ies|ed|ing)\b/i,                          tag: 'Injury',     cls: 'signalInjury'     },
  { re: /\brecruit(ing|ment|s|ed)?\b/i,                       tag: 'Recruiting', cls: 'signalRecruiting' },
  { re: /\b(fired|hired|resign(s|ed)?|coaching staff)\b/i,   tag: 'Coaching',   cls: 'signalCoaching'   },
  { re: /\b(ranked|ranking|rankings|top 25|ap poll)\b/i,     tag: 'Rankings',   cls: 'signalRankings'   },
  { re: /\bbubble\b/i,                                        tag: 'Bubble',     cls: 'signalBubble'     },
  { re: /\btransfer portal\b/i,                               tag: 'Transfer',   cls: 'signalTransfer'   },
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
  if (/\baac\b|\bamerican athletic\b/i.test(lower)) return 'AAC';
  if (/\bwcc\b|\bwest coast conference\b/i.test(lower)) return 'WCC';
  if (/\bmountain west\b/i.test(lower))       return 'Mountain West';
  if (/\ba-10\b|\batlantic 10\b/i.test(lower)) return 'A-10';
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
    _score:    raw._score ?? 0,
  };
}

function getConfStyle(conf) {
  return CONF_COLORS[conf] || { bg: 'rgba(100,100,100,0.08)', text: 'var(--color-text-muted)' };
}

function getPublisherConfig(source) {
  return PUBLISHER_CONFIG[(source || '').toLowerCase()] ?? null;
}

function getGradient(conf) {
  const CONF_GRADIENT = {
    'Big Ten':  'linear-gradient(135deg, #1e3a5f 0%, #2d5a96 100%)',
    'SEC':      'linear-gradient(135deg, #3d1a00 0%, #c85000 100%)',
    'ACC':      'linear-gradient(135deg, #2d1b69 0%, #6d28d9 100%)',
    'Big 12':   'linear-gradient(135deg, #4a0000 0%, #991b1b 100%)',
    'Big East': 'linear-gradient(135deg, #1a1a3e 0%, #3730a3 100%)',
    default:    'linear-gradient(135deg, #1e2a3a 0%, #374151 100%)',
  };
  return CONF_GRADIENT[conf] || CONF_GRADIENT.default;
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
  return <span className={`${styles.signalTag} ${styles[signal.cls] || ''}`}>{signal.tag}</span>;
}

function LogoChip({ source, conference }) {
  const [failed, setFailed] = useState(false);
  const brandLogo = !failed ? getSourceBrandLogo(source) : null;
  const logoUrl = !failed && !brandLogo ? getPublicationLogoUrl(source) : null;
  const pub = getPublisherConfig(source);
  const fallbackBg = pub ? pub.bg : getGradient(conference);
  const initials = source
    ? source.replace(/^(?:the|a)\s+/i, '').slice(0, 2).toUpperCase()
    : '—';

  if (brandLogo) {
    return (
      <div className={styles.logoChip} style={{ background: '#fff' }}>
        <img src={brandLogo} alt="" className={styles.logoChipBrand} loading="lazy" onError={() => setFailed(true)} />
      </div>
    );
  }
  if (logoUrl) {
    return (
      <div className={styles.logoChip}>
        <img src={logoUrl} alt="" className={styles.logoChipImg} loading="lazy" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className={styles.logoChip} style={{ background: fallbackBg }}>
      <span className={styles.logoChipInitials}>{initials}</span>
    </div>
  );
}

function StreamThumbCell({ item }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  if (item.thumbnail && !thumbFailed) {
    return (
      <img src={item.thumbnail} alt="" className={styles.streamThumbImage} loading="lazy" onError={() => setThumbFailed(true)} />
    );
  }
  return <LogoChip source={item.source} conference={item.conference} />;
}

function FeaturedArticleCard({ item, onOpen }) {
  if (!item) return null;
  return (
    <a
      href={item.link || '#'}
      target={item.link ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={styles.featuredArticle}
      onClick={() => onOpen?.(item, 0, 'featured')}
    >
      <div className={styles.featuredArticleThumb}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className={styles.featuredArticleImg} loading="eager" />
        ) : (
          <div className={styles.featuredArticleFallback} style={{ background: getGradient(item.conference) }}>
            <LogoChip source={item.source} conference={item.conference} />
          </div>
        )}
      </div>
      <div className={styles.featuredArticleBody}>
        <div className={styles.streamMeta}>
          <SourceBadge source={item.source} />
          {item.time && <span className={styles.metaDot} aria-hidden>·</span>}
          {item.time && <span className={styles.streamTime}>{item.time}</span>}
          {item.conference && <ConfPill conference={item.conference} />}
        </div>
        <p className={styles.featuredArticleTitle}>{decodeDisplayText(item.title)}</p>
        {item.excerpt && <p className={styles.featuredArticleExcerpt}>{item.excerpt}</p>}
        {item.signal && <SignalTag signal={item.signal} />}
      </div>
    </a>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className={styles.content}>
      <div className={styles.heroZoneSkeleton}>
        <div className={styles.skeletonHero} />
        <div className={styles.skeletonFeatured} />
      </div>
      <div className={styles.skeletonGrid}>
        {[1, 2, 3, 4].map((n) => <div key={n} className={styles.skeletonCard} />)}
      </div>
      <div className={styles.skeletonStream}>
        {[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className={styles.skeletonRow} />)}
      </div>
    </div>
  );
}

// ─── Content mode + top-level tab ─────────────────────────────────────────────

const CONTENT_MODES = [
  { id: 'all',     label: 'All'     },
  { id: 'videos',  label: 'Videos'  },
  { id: 'stories', label: 'Stories' },
];

const INTEL_TABS = [
  { id: 'basketball', label: 'Basketball Intel' },
  { id: 'betting',    label: 'Betting Intel' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function NewsFeed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam === 'betting' ? 'betting' : 'basketball');

  const [rawItems, setRawItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeConf, setActiveConf] = useState('All');
  const [contentMode, setContentMode] = useState('all');
  const [activeVideo, setActiveVideo] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Basketball videos
  const [intelVideos, setIntelVideos] = useState(() => {
    const cached = getCached(INTEL_FEED_KEY);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const stale = getStaleIntelFeed();
    return Array.isArray(stale) && stale.length > 0 ? stale : [];
  });
  const [intelFeedStatus, setIntelFeedStatus] = useState(null);

  // Betting content
  const [bettingVideos, setBettingVideos] = useState([]);
  const [bettingNews, setBettingNews] = useState([]);
  const [bettingLoading, setBettingLoading] = useState(false);

  useEffect(() => {
    track('news_view', { view: 'all', tab: activeTab, conference: null });
  }, []);

  // Sync tab to URL
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setActiveConf('All');
    if (tab === 'betting') {
      setSearchParams({ tab: 'betting' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
    track('news_tab_change', { tab });
  }, [setSearchParams]);

  const handleModeChange = useCallback((mode) => {
    setContentMode(mode);
    track('news_filter_change', { filter: 'content_mode', value: mode });
  }, []);

  const handleConfChange = useCallback((conf) => {
    setActiveConf(conf);
    track('news_filter_change', { filter: 'conference', value: conf });
  }, []);

  const handleVideoSelect = useCallback((video, source = 'news') => {
    track('video_modal_open', { video_id: video?.videoId, title: (video?.title ?? '').slice(0, 100), source });
    setActiveVideo(video);
  }, []);

  const handleArticleOpen = useCallback((item, position, feed = 'all') => {
    const url = (item?.link ?? '').split('?')[0].slice(0, 200);
    track('intel_item_open', { type: 'article', id: url, title: (item?.title ?? '').slice(0, 100), source: item?.source, position, feed });
  }, []);

  const handleSeeMoreVideos = useCallback(() => {
    handleModeChange('videos');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [handleModeChange]);

  const handleSeeMoreStories = useCallback(() => {
    handleModeChange('stories');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [handleModeChange]);

  // Fetch basketball headlines
  useEffect(() => {
    setLoading(true);
    fetchHome()
      .then((data) => {
        setRawItems(data?.headlines || []);
        setLastUpdated(new Date());
      })
      .catch((err) => setError(err?.message || 'Failed to load news'))
      .finally(() => setLoading(false));
  }, []);

  // Intel Feed videos
  useEffect(() => {
    const cached = getCached(INTEL_FEED_KEY);
    if (Array.isArray(cached) && cached.length > 0) return;

    const controller = new AbortController();
    const confParam = activeConf !== 'All' ? `&conference=${encodeURIComponent(activeConf)}` : '';
    fetch(`/api/youtube/intelFeed?maxResults=18${confParam}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? [];
        setIntelFeedStatus(data.status ?? 'ok');
        if (items.length > 0) {
          setCached(INTEL_FEED_KEY, items, INTEL_FEED_TTL);
          setStaleIntelFeed(items);
          setIntelVideos(items);
          setLastUpdated(new Date());
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setIntelFeedStatus('error');
      });
    return () => controller.abort();
  }, []);

  // Re-fetch videos when conference changes
  useEffect(() => {
    if (activeConf === 'All') return;
    const controller = new AbortController();
    fetch(`/api/youtube/intelFeed?conference=${encodeURIComponent(activeConf)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.items?.length > 0) {
          setIntelVideos(data.items);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeConf]);

  // Betting content — fetch on first tab switch
  useEffect(() => {
    if (activeTab !== 'betting') return;
    if (bettingVideos.length > 0 || bettingLoading) return;

    setBettingLoading(true);

    const cachedVideos = getCached(BETTING_VIDEO_KEY);
    const cachedNews = getCached(BETTING_NEWS_KEY);
    if (cachedVideos?.length > 0) setBettingVideos(cachedVideos);
    if (cachedNews?.length > 0) setBettingNews(cachedNews);
    if (cachedVideos?.length > 0 && cachedNews?.length > 0) {
      setBettingLoading(false);
      return;
    }

    Promise.allSettled([
      !cachedVideos?.length ? fetch('/api/youtube/bettingFeed').then((r) => r.json()) : Promise.resolve(null),
      !cachedNews?.length ? fetch('/api/news/betting').then((r) => r.json()) : Promise.resolve(null),
    ]).then(([videoResult, newsResult]) => {
      if (videoResult?.status === 'fulfilled' && videoResult.value?.items?.length > 0) {
        setCached(BETTING_VIDEO_KEY, videoResult.value.items, BETTING_VIDEO_TTL);
        setBettingVideos(videoResult.value.items);
      }
      if (newsResult?.status === 'fulfilled' && newsResult.value?.items?.length > 0) {
        setCached(BETTING_NEWS_KEY, newsResult.value.items, BETTING_NEWS_TTL);
        setBettingNews(newsResult.value.items);
      }
    }).finally(() => setBettingLoading(false));
  }, [activeTab, bettingVideos.length, bettingLoading]);

  // Enrich and sort
  const enriched = useMemo(() => {
    const items = rawItems.map(enrichItem);
    return items.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      if (!a.pubDate && !b.pubDate) return 0;
      if (!a.pubDate) return 1;
      if (!b.pubDate) return -1;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });
  }, [rawItems]);

  const enrichedBettingNews = useMemo(() => {
    return bettingNews.map(enrichItem);
  }, [bettingNews]);

  // Conference filter
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

  const heroVideo = intelVideos[0] || null;
  const supportingVideos = intelVideos.slice(1, 5);
  const remainingVideos = intelVideos.slice(5);
  const featuredArticle = filtered[0] || null;
  const topHeadlines = filtered.slice(1, 7);
  const streamArticles = filtered.slice(7);

  const bettingHeroVideo = bettingVideos[0] || null;
  const bettingSupportingVideos = bettingVideos.slice(1, 5);
  const bettingRemainingVideos = bettingVideos.slice(5);

  const hasContent = enriched.length > 0 || intelVideos.length > 0;
  const hasBettingContent = bettingVideos.length > 0 || bettingNews.length > 0;

  const updatedAgo = lastUpdated ? formatRelTime(lastUpdated.toISOString()) : null;

  return (
    <div className={styles.page}>
      <SEOHead
        title="College Basketball Intel — NCAAB Videos, Headlines & Betting Analysis"
        description="Your college basketball command center. Curated videos, headlines, analysis, and betting intel across every major conference. Powered by Maximus Sports."
        canonicalPath="/ncaam/news"
        ogImage={buildOgImageUrl({ title: 'Intel Feed', subtitle: 'Headlines, analysis & betting intel', type: 'Team Intel' })}
      />

      {/* ── Premium page header ── */}
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <div>
            <h1 className={styles.pageTitle}>College Basketball Intel</h1>
            <p className={styles.pageSubtitle}>Videos, headlines, and analysis across every major conference</p>
          </div>
          <div className={styles.headerRight}>
            {updatedAgo && (
              <span className={styles.freshnessLabel}>Updated {updatedAgo}</span>
            )}
            {activeConf !== 'All' && activeTab === 'basketball' && (
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
        </div>

        {/* Segmented control — Basketball Intel / Betting Intel */}
        <div className={styles.segmentedControl} role="tablist" aria-label="Intel type">
          {INTEL_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={`${styles.segmentedBtn} ${activeTab === id ? styles.segmentedBtnActive : ''}`}
              onClick={() => handleTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content-mode pills + conference filters (basketball tab only) */}
        {activeTab === 'basketball' && (
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
        )}
      </header>

      {/* ── States ── */}
      {loading && <LoadingSkeleton />}
      {error && <p className={styles.error}>{error}</p>}

      <YouTubeVideoModal
        video={activeVideo}
        onClose={() => {
          if (activeVideo) track('video_modal_close', { video_id: activeVideo.videoId });
          setActiveVideo(null);
        }}
      />

      {/* ═══════════════════════════════════════════════════════
          BASKETBALL INTEL TAB
          ═══════════════════════════════════════════════════════ */}
      {!loading && !error && activeTab === 'basketball' && hasContent && (
        <div className={styles.content}>

          {/* ── HERO ZONE ── */}
          {contentMode === 'all' && (heroVideo || featuredArticle) && (
            <section className={styles.heroZone} aria-label="Featured content">
              {heroVideo && (
                <div className={styles.heroVideoWrap}>
                  <YouTubeVideoCard
                    video={heroVideo}
                    onSelect={(v) => handleVideoSelect(v, 'hero')}
                    hero
                  />
                </div>
              )}
              {featuredArticle && (
                <FeaturedArticleCard item={featuredArticle} onOpen={handleArticleOpen} />
              )}
            </section>
          )}

          {/* ── SUPPORTING VIDEOS ── */}
          {(contentMode === 'all' || contentMode === 'videos') && supportingVideos.length > 0 && (
            <section className={styles.supportingVideosSection} aria-label="More videos">
              <div className={styles.sectionHeadingRow}>
                <h2 className={styles.sectionHeading}>
                  {contentMode === 'videos' ? 'All Videos' : 'Top Videos'}
                </h2>
                {contentMode === 'all' && intelVideos.length > 5 && (
                  <button type="button" className={styles.sectionCta} onClick={handleSeeMoreVideos}>
                    See all videos ({intelVideos.length}) →
                  </button>
                )}
              </div>
              <div className={styles.supportingVideosGrid}>
                {(contentMode === 'videos' ? intelVideos.slice(1) : supportingVideos).map((v, idx) => (
                  <div key={v.videoId || idx} className={styles.supportingVideoItem}>
                    <YouTubeVideoCard video={v} onSelect={(v) => handleVideoSelect(v, 'intelFeed')} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Videos-only hero ── */}
          {contentMode === 'videos' && heroVideo && (
            <section className={styles.heroZone} aria-label="Featured video" style={{ marginBottom: 'var(--space-lg)' }}>
              <div className={styles.heroVideoWrapFull}>
                <YouTubeVideoCard video={heroVideo} onSelect={(v) => handleVideoSelect(v, 'hero')} hero />
              </div>
            </section>
          )}

          {contentMode === 'videos' && intelVideos.length === 0 && (
            <div className={styles.emptyBlock}>
              <div className={styles.emptyIcon} aria-hidden>▶</div>
              <p className={styles.emptyTitle}>
                {intelFeedStatus === 'error_no_key' ? 'Video service not configured' : 'No videos right now'}
              </p>
              <p className={styles.emptyReason}>
                {intelFeedStatus === 'error_no_key'
                  ? 'YouTube is not configured for this environment.'
                  : 'Videos are temporarily unavailable. Please check back soon.'}
              </p>
            </div>
          )}

          {/* ── TOP HEADLINES GRID ── */}
          {(contentMode === 'all' || contentMode === 'stories') && topHeadlines.length > 0 && (
            <section className={styles.topHeadlinesSection} aria-label="Top headlines">
              <div className={styles.sectionHeadingRow}>
                <h2 className={styles.sectionHeading}>
                  {contentMode === 'stories' ? 'All Stories' : 'Top Headlines'}
                </h2>
                {contentMode === 'all' && filtered.length > 7 && (
                  <button type="button" className={styles.sectionCta} onClick={handleSeeMoreStories}>
                    See all stories ({filtered.length}) →
                  </button>
                )}
              </div>
              <div className={styles.topHeadlinesGrid}>
                {(contentMode === 'stories' ? filtered : topHeadlines).map((item, idx) => (
                  <a
                    key={item.id}
                    href={item.link || '#'}
                    target={item.link ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className={styles.headlineCard}
                    onClick={() => handleArticleOpen(item, idx, 'headlines')}
                  >
                    <div className={styles.headlineCardThumb}>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className={styles.headlineCardImg} loading="lazy" />
                      ) : (
                        <div className={styles.headlineCardFallback} style={{ background: getGradient(item.conference) }}>
                          <LogoChip source={item.source} conference={item.conference} />
                        </div>
                      )}
                    </div>
                    <div className={styles.headlineCardBody}>
                      <div className={styles.streamMeta}>
                        <SourceBadge source={item.source} />
                        {item.time && <span className={styles.streamTime}>{item.time}</span>}
                      </div>
                      <p className={styles.headlineCardTitle}>{decodeDisplayText(item.title)}</p>
                      <div className={styles.headlineCardFooter}>
                        {item.conference && <ConfPill conference={item.conference} />}
                        {item.signal && <SignalTag signal={item.signal} />}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ── LATEST STREAM ── */}
          {contentMode === 'all' && streamArticles.length > 0 && (
            <section className={styles.streamSection} aria-label="Latest stream">
              <div className={styles.sectionHeadingRow}>
                <h2 className={styles.sectionHeading}>Latest Stream</h2>
              </div>
              <div className={styles.streamList} role="list">
                {streamArticles.map((item, idx) => (
                  <a
                    key={item.id}
                    href={item.link || '#'}
                    target={item.link ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className={styles.streamCard}
                    role="listitem"
                    onClick={() => handleArticleOpen(item, idx + 7, 'stream')}
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
                      <p className={styles.streamHeadline}>{decodeDisplayText(item.title)}</p>
                      {item.excerpt && <p className={styles.streamExcerpt}>{item.excerpt}</p>}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {contentMode !== 'videos' && filtered.length === 0 && enriched.length > 0 && (
            <p className={styles.empty}>
              No stories for this conference right now.{' '}
              <button type="button" className={styles.emptyAction} onClick={() => handleConfChange('All')}>
                Clear filter
              </button>
            </p>
          )}

          {contentMode !== 'videos' && enriched.length === 0 && intelVideos.length === 0 && (
            <p className={styles.empty}>No basketball news available. Check back soon.</p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          BETTING INTEL TAB
          ═══════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'betting' && (
        <div className={styles.content}>
          {bettingLoading && <LoadingSkeleton />}

          {!bettingLoading && hasBettingContent && (
            <>
              {/* ── BETTING HERO ZONE ── */}
              {bettingHeroVideo && (
                <section className={styles.heroZone} aria-label="Featured betting content">
                  <div className={styles.heroVideoWrap}>
                    <YouTubeVideoCard
                      video={bettingHeroVideo}
                      onSelect={(v) => handleVideoSelect(v, 'bettingHero')}
                      hero
                    />
                  </div>
                  {enrichedBettingNews[0] && (
                    <FeaturedArticleCard item={enrichedBettingNews[0]} onOpen={handleArticleOpen} />
                  )}
                </section>
              )}

              {/* ── SUPPORTING BETTING VIDEOS ── */}
              {bettingSupportingVideos.length > 0 && (
                <section className={styles.supportingVideosSection} aria-label="Betting videos">
                  <div className={styles.sectionHeadingRow}>
                    <h2 className={styles.sectionHeading}>Betting Videos</h2>
                  </div>
                  <div className={styles.supportingVideosGrid}>
                    {bettingSupportingVideos.map((v, idx) => (
                      <div key={v.videoId || idx} className={styles.supportingVideoItem}>
                        <YouTubeVideoCard video={v} onSelect={(v) => handleVideoSelect(v, 'bettingFeed')} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── REMAINING BETTING VIDEOS ── */}
              {bettingRemainingVideos.length > 0 && (
                <section className={styles.supportingVideosSection} aria-label="More betting videos">
                  <div className={styles.supportingVideosGrid}>
                    {bettingRemainingVideos.map((v, idx) => (
                      <div key={v.videoId || idx} className={styles.supportingVideoItem}>
                        <YouTubeVideoCard video={v} onSelect={(v) => handleVideoSelect(v, 'bettingFeed')} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── BETTING HEADLINES ── */}
              {enrichedBettingNews.length > 1 && (
                <section className={styles.streamSection} aria-label="Betting headlines">
                  <div className={styles.sectionHeadingRow}>
                    <h2 className={styles.sectionHeading}>Betting Headlines</h2>
                  </div>
                  <div className={styles.streamList} role="list">
                    {enrichedBettingNews.slice(1).map((item, idx) => (
                      <a
                        key={item.id}
                        href={item.link || '#'}
                        target={item.link ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className={styles.streamCard}
                        role="listitem"
                        onClick={() => handleArticleOpen(item, idx, 'betting-stream')}
                      >
                        <div className={styles.streamThumb} aria-hidden>
                          <StreamThumbCell item={item} />
                        </div>
                        <div className={styles.streamBody}>
                          <div className={styles.streamMeta}>
                            <SourceBadge source={item.source} />
                            {item.time && <span className={styles.metaDot} aria-hidden>·</span>}
                            {item.time && <span className={styles.streamTime}>{item.time}</span>}
                          </div>
                          <p className={styles.streamHeadline}>{decodeDisplayText(item.title)}</p>
                          {item.excerpt && <p className={styles.streamExcerpt}>{item.excerpt}</p>}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!bettingLoading && !hasBettingContent && (
            <div className={styles.emptyBlock}>
              <div className={styles.emptyIcon} aria-hidden>📊</div>
              <p className={styles.emptyTitle}>Betting intel loading</p>
              <p className={styles.emptyReason}>
                Betting content sources are being fetched. Check back in a moment.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
