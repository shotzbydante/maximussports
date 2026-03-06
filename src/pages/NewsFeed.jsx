import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { fetchHome } from '../api/home';
import { TEAMS } from '../data/teams';
import ConferenceLogo from '../components/shared/ConferenceLogo';
import YouTubeVideoCard from '../components/shared/YouTubeVideoCard';
import YouTubeVideoModal from '../components/shared/YouTubeVideoModal';
import { getCached, setCached } from '../utils/ytClientCache';
import { track } from '../analytics/index';
import { getPublicationLogoUrl } from '../utils/publicationLogos';
import styles from './NewsFeed.module.css';

const INTEL_FEED_KEY = 'yt:news:intelFeed';
const INTEL_FEED_TTL = 15 * 60 * 1000; // 15 min client-side cache

// ─── YouTube query helpers ────────────────────────────────────────────────────

/** Publisher names to append for relevance bias (key: lowercased source name) */
const PUBLISHER_BIAS = {
  'espn':           'ESPN',
  'cbs sports':     'CBS Sports',
  'fox sports':     'FOX Sports',
  'the athletic':   'The Athletic',
  'bleacher report':'Bleacher Report',
  'nbc sports':     'NBC Sports',
};

/**
 * Sanitize a news headline for use as a YouTube search query.
 */
function sanitizeHeroQuery(title, source) {
  const q = (title ?? '')
    .replace(/[^\w\s'''-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const pub = PUBLISHER_BIAS[(source || '').toLowerCase()];
  if (pub && (q.length + 1 + pub.length) <= 120) {
    return `${q} ${pub}`;
  }
  return q;
}

const ytDebug = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugYT');

// ─── Constants ───────────────────────────────────────────────────────────────

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

const CONF_INITIALS = {
  'Big Ten':  'B10',
  'SEC':      'SEC',
  'ACC':      'ACC',
  'Big 12':   'B12',
  'Big East': 'BE',
  'Others':   '—',
};

/* ─── Publisher branding for no-image fallback cards ──────────────────────── */
const PUBLISHER_CONFIG = {
  'yahoo sports':  { lines: ['YAHOO', 'SPORTS'],   bg: 'linear-gradient(135deg, #3d0070 0%, #7b1fa2 100%)' },
  'cbs sports':    { lines: ['CBS', 'SPORTS'],     bg: 'linear-gradient(135deg, #12235a 0%, #1565c0 100%)' },
  'espn':          { lines: ['ESPN'],              bg: 'linear-gradient(135deg, #6d0000 0%, #c62828 100%)' },
  'fox sports':    { lines: ['FOX', 'SPORTS'],     bg: 'linear-gradient(135deg, #2a1200 0%, #d84315 100%)' },
  'the athletic':  { lines: ['THE', 'ATHLETIC'],   bg: 'linear-gradient(135deg, #111 0%, #2d3748 100%)' },
  '247sports':     { lines: ['247', 'SPORTS'],     bg: 'linear-gradient(135deg, #1a0000 0%, #991b1b 100%)' },
  'bleacher report': { lines: ['B/R'],             bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' },
};

function getPublisherConfig(source) {
  return PUBLISHER_CONFIG[(source || '').toLowerCase()] ?? null;
}

const SIGNAL_PATTERNS = [
  { re: /\bupset\b/i,                                        tag: 'Upset',     cls: styles.signalUpset     },
  { re: /\binjur(y|ies|ed|ing)\b/i,                          tag: 'Injury',    cls: styles.signalInjury    },
  { re: /\brecruit(ing|ment|s|ed)?\b/i,                       tag: 'Recruiting',cls: styles.signalRecruiting },
  { re: /\b(fired|hired|resign(s|ed)?|coaching staff)\b/i,   tag: 'Coaching',  cls: styles.signalCoaching  },
  { re: /\b(ranked|ranking|rankings|top 25|ap poll)\b/i,     tag: 'Rankings',  cls: styles.signalRankings  },
  { re: /\bbubble\b/i,                                        tag: 'Bubble',    cls: styles.signalBubble    },
  { re: /\btransfer portal\b/i,                               tag: 'Transfer',  cls: styles.signalTransfer  },
];

// Build a fast lookup: [{ tokens, conference }]
const TEAM_TOKENS = TEAMS.map((t) => ({
  tokens: t.name.toLowerCase().split(/\s+/),
  full: t.name.toLowerCase(),
  conference: t.conference,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectConference(title) {
  if (!title) return null;
  const lower = title.toLowerCase();

  if (/\bbig ten\b/i.test(lower)) return 'Big Ten';
  if (/\b(sec)\b/i.test(lower)) return 'SEC';
  if (/\b(acc)\b/i.test(lower)) return 'ACC';
  if (/\bbig 12\b|\bbig twelve\b/i.test(lower)) return 'Big 12';
  if (/\bbig east\b/i.test(lower)) return 'Big East';

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
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1)  return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  <  7)  return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function enrichItem(raw, i) {
  return {
    id:         raw.link || raw.id || `item-${i}`,
    title:      raw.title || '',
    source:     raw.source || 'News',
    time:       formatRelTime(raw.pubDate),
    pubDate:    raw.pubDate || null,
    link:       raw.link || null,
    conference: raw.conference || detectConference(raw.title),
    signal:     detectSignal(raw.title),
    excerpt:    raw.excerpt || raw.description || '',
    _type:      'article',
  };
}

function getConfStyle(conf) {
  return CONF_COLORS[conf] || { bg: 'rgba(100,100,100,0.08)', text: 'var(--color-text-muted)' };
}

function getGradient(conf) {
  return CONF_GRADIENT[conf] || CONF_GRADIENT.default;
}

function getInitials(conf, source) {
  if (conf && CONF_INITIALS[conf]) return CONF_INITIALS[conf];
  if (source) return source.slice(0, 3).toUpperCase();
  return '—';
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

function ImgPlaceholder({ conference, source, size = 'hero' }) {
  const isStream = size === 'stream';
  const logoUrl = isStream ? getPublicationLogoUrl(source) : null;
  const pub = getPublisherConfig(source);
  const background = pub ? pub.bg : getGradient(conference);
  return (
    <div
      className={`${styles.imgPlaceholder} ${isStream ? styles.imgPlaceholderStream : ''}`}
      style={{ background }}
      aria-hidden
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={styles.pubLogoImg}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : pub ? (
        <span className={`${styles.publisherWrap} ${isStream ? styles.publisherWrapStream : ''}`}>
          {pub.lines.map((line, i) => (
            <span key={i} className={styles.publisherLine}>{line}</span>
          ))}
        </span>
      ) : (
        <span className={isStream ? styles.imgInitialsStream : styles.imgInitials}>
          {getInitials(conference, source)}
        </span>
      )}
    </div>
  );
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

// Content-mode options
const CONTENT_MODES = [
  { id: 'all',    label: 'All'     },
  { id: 'videos', label: 'Videos'  },
  { id: 'stories',label: 'Stories' },
];

export default function NewsFeed() {
  const [rawItems, setRawItems] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [activeConf, setActiveConf] = useState('All');
  const [contentMode, setContentMode] = useState('all'); // 'all' | 'videos' | 'stories'

  // Hero video (article-related) — desktop only
  const [heroVideo, setHeroVideo] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);

  // Track news_view once on mount
  useEffect(() => {
    track('news_view', { view: 'all', conference: null });
  }, []);

  // Content-mode change handler
  const handleModeChange = useCallback((mode) => {
    setContentMode(mode);
    track('news_filter_change', { filter: 'content_mode', value: mode });
  }, []);

  // Tracked conf filter change handler
  const handleConfChange = useCallback((conf) => {
    setActiveConf(conf);
    if (conf !== activeConf) {
      track('news_filter_change', { filter: 'conference', value: conf });
      if (conf !== 'All') {
        track('news_view', { view: 'conference', conference: conf });
      }
    }
  }, [activeConf]);

  // Tracked video open
  const handleVideoSelect = useCallback((video, source = 'news') => {
    track('video_modal_open', {
      video_id: video?.videoId,
      title:    (video?.title ?? '').slice(0, 100),
      source,
      feed:     activeConf === 'All' ? 'intel' : 'conference',
    });
    setActiveVideo(video);
  }, [activeConf]);

  // Tracked article open
  const handleArticleOpen = useCallback((item, position, feed = 'all') => {
    const url = (item?.link ?? '').split('?')[0].slice(0, 200); // strip query params
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

  // Intel Feed videos — blended NCAAM content, cache-first
  const [intelVideos, setIntelVideos] = useState(() => getCached(INTEL_FEED_KEY) ?? []);

  useEffect(() => {
    setLoading(true);
    fetchHome()
      .then((data) => setRawItems(data?.headlines || []))
      .catch((err)  => setError(err?.message || 'Failed to load news'))
      .finally(()   => setLoading(false));
  }, []);

  // Intel Feed: fetch once on mount, cache 15 min — single call replaces multiple per-team calls
  useEffect(() => {
    if (getCached(INTEL_FEED_KEY)) return; // already cached
    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (ytDebug) qs.set('debugYT', '1');
    fetch(`/api/youtube/intelFeed${qs.toString() ? `?${qs}` : ''}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? [];
        setCached(INTEL_FEED_KEY, items, INTEL_FEED_TTL);
        setIntelVideos(items);
        if (ytDebug) console.log(`[IntelFeed] ${items.length} videos loaded`);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const enriched = useMemo(() => rawItems.map(enrichItem), [rawItems]);

  // Fetch one video for the hero story whenever the hero title or source changes (desktop)
  const heroTitle  = enriched[0]?.title  ?? null;
  const heroSource = enriched[0]?.source ?? null;
  useEffect(() => {
    if (!heroTitle) return;
    let cancelled = false;
    const q = sanitizeHeroQuery(heroTitle, heroSource);
    const qs = new URLSearchParams({ q, maxResults: '1' });
    if (ytDebug) qs.set('debugYT', '1');
    fetch(`/api/youtube/search?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setHeroVideo(data.items?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setHeroVideo(null);
      });
    return () => { cancelled = true; };
  }, [heroTitle, heroSource]);

  const displayHeroVideo = heroTitle ? heroVideo : null;

  // Derive which conferences actually appear in the data
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

  // Non-ALL conference view uses the existing magazine sections
  const hero       = filtered[0]     ?? null;
  const topStories = filtered.slice(1, 5);
  const stream     = filtered.slice(5);

  return (
    <div className={styles.page}>
      {/* ── Premium page header ── */}
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <div>
            <h1 className={styles.pageTitle}>News Feed</h1>
            <p className={styles.pageSubtitle}>Curated videos and headlines</p>
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

          {/* Conference pills inline on the right — only when viewing all content */}
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

      {!loading && !error && enriched.length === 0 && (
        <p className={styles.empty}>No basketball news available. Check back soon.</p>
      )}

      <YouTubeVideoModal
        video={activeVideo}
        onClose={() => {
          if (activeVideo) track('video_modal_close', { video_id: activeVideo.videoId });
          setActiveVideo(null);
        }}
      />

      {!loading && !error && enriched.length > 0 && (
        <div className={styles.content}>

          {/* ══════════════════════════════════════════════════════════════
              ALL VIEW — clean two-section layout (mobile + desktop)
              ══════════════════════════════════════════════════════════════ */}
          {activeConf === 'All' && (
            <>
              {/* Section 1: Top Videos — 2-col mobile / 3-col desktop */}
              {intelVideos.length > 0 && contentMode !== 'stories' && (
                <section className={styles.topVideosSection} aria-label="Top videos">
                  <div className={styles.sectionHeadingRow}>
                    <h2 className={styles.sectionHeading}>Top Videos</h2>
                    {contentMode === 'all' && (
                      <button
                        type="button"
                        className={styles.sectionCta}
                        onClick={handleSeeMoreVideos}
                      >
                        See more videos →
                      </button>
                    )}
                  </div>
                  <div className={styles.topVideosGrid}>
                    {intelVideos.slice(0, contentMode === 'videos' ? 12 : 6).map((v, idx) => (
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

              {/* Section 2: Stories — 10 in "all" mode, all items in "stories" mode */}
              {enriched.length > 0 && contentMode !== 'videos' && (
                <section
                  className={styles.topStoriesDesktopSection}
                  aria-label={contentMode === 'stories' ? 'All stories' : 'Top stories'}
                >
                  <div className={styles.sectionHeadingRow}>
                    <h2 className={styles.sectionHeading}>
                      {contentMode === 'stories' ? 'All Stories' : 'Top Stories'}
                    </h2>
                    {contentMode === 'all' && (
                      <button
                        type="button"
                        className={styles.sectionCta}
                        onClick={handleSeeMoreStories}
                      >
                        See more stories →
                      </button>
                    )}
                  </div>
                  <div className={styles.streamList} role="list">
                    {(contentMode === 'all' ? enriched.slice(0, 10) : enriched).map((item, idx) => (
                      <Fragment key={item.id}>
                        <a
                          href={item.link || '#'}
                          target={item.link ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          className={styles.streamCard}
                          aria-label={item.title}
                          role="listitem"
                          onClick={() => handleArticleOpen(item, idx, 'top-stories')}
                        >
                          <div className={styles.streamThumb} aria-hidden>
                            <ImgPlaceholder conference={item.conference} source={item.source} size="stream" />
                          </div>
                          <div className={styles.streamBody}>
                            <div className={styles.streamMeta}>
                              <SourceBadge source={item.source} />
                              {item.conference && <ConfPill conference={item.conference} />}
                              {item.signal && <SignalTag signal={item.signal} />}
                              <span className={styles.time}>{item.time}</span>
                            </div>
                            <p className={styles.streamHeadline}>{item.title}</p>
                            {item.excerpt && <p className={styles.streamExcerpt}>{item.excerpt}</p>}
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

              {/* Ad slot — hidden in videos-only mode */}
              {contentMode !== 'videos' && (
                <div className={styles.adSlot} aria-hidden data-slot="sponsored-hero">
                  Sponsored · Premium analysis
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CONFERENCE-FILTERED VIEW — articles only (existing layout)
              ══════════════════════════════════════════════════════════════ */}
          {activeConf !== 'All' && (
            <>
              {/* ── MOBILE: article stream ── */}
              {filtered.length > 0 && (
                <section className={styles.mobileArticleStream} aria-label="News stream">
                  <div className={styles.streamList} role="list">
                    {filtered.map((item) => (
                      <a
                        key={item.id}
                        href={item.link || '#'}
                        target={item.link ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className={`${styles.streamCard} ${styles.mobileStreamCard}`}
                        aria-label={item.title}
                        role="listitem"
                      >
                        <div className={styles.streamThumb} aria-hidden>
                          <ImgPlaceholder conference={item.conference} source={item.source} size="stream" />
                        </div>
                        <div className={styles.streamBody}>
                          <div className={styles.streamMeta}>
                            <SourceBadge source={item.source} />
                            {item.conference && <ConfPill conference={item.conference} />}
                            {item.signal && <SignalTag signal={item.signal} />}
                            <span className={styles.time}>{item.time}</span>
                          </div>
                          <p className={styles.streamHeadline}>{item.title}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* ── DESKTOP: magazine layout ── */}

              {hero && (
                <section className={`${styles.heroSection} ${styles.desktopOnly}`} aria-label="Lead story">
                  <a
                    href={hero.link || '#'}
                    target={hero.link ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className={styles.heroCard}
                    aria-label={hero.title}
                  >
                    <div className={styles.heroImageWrap}>
                      <ImgPlaceholder conference={hero.conference} source={hero.source} size="hero" />
                      <div className={styles.heroOverlay} aria-hidden />
                      <div className={styles.heroBadgeWrap}>
                        <span className={styles.heroBadgeLead}>Lead Story</span>
                      </div>
                      <div className={styles.heroBody}>
                        {hero.conference && (
                          <div className={styles.heroConfRow}>
                            <ConferenceLogo conference={hero.conference} size={14} />
                            <span className={styles.heroConfLabel}>{hero.conference}</span>
                          </div>
                        )}
                        <h2 className={styles.heroHeadline}>{hero.title}</h2>
                        {hero.excerpt && (
                          <p className={styles.heroExcerpt}>{hero.excerpt}</p>
                        )}
                        <div className={styles.heroMeta}>
                          <SourceBadge source={hero.source} />
                          {hero.signal && <SignalTag signal={hero.signal} />}
                          <span className={styles.heroTime}>{hero.time}</span>
                        </div>
                      </div>
                    </div>
                  </a>
                </section>
              )}

              <div className={`${styles.adSlot} ${styles.desktopOnly}`} aria-hidden data-slot="sponsored-hero">
                Sponsored · Premium analysis
              </div>

              {topStories.length > 0 && (
                <section className={`${styles.topStoriesSection} ${styles.desktopOnly}`} aria-label="Top stories">
                  <h2 className={styles.sectionHeading}>Top Stories</h2>
                  <div className={styles.topStoriesGrid}>
                    {topStories.map((item) => (
                      <a
                        key={item.id}
                        href={item.link || '#'}
                        target={item.link ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className={styles.storyCard}
                        aria-label={item.title}
                      >
                        <div className={styles.storyThumb}>
                          <ImgPlaceholder conference={item.conference} source={item.source} size="card" />
                        </div>
                        <div className={styles.storyBody}>
                          <div className={styles.storyMeta}>
                            <SourceBadge source={item.source} />
                            {item.conference && <ConfPill conference={item.conference} />}
                            <span className={styles.time}>{item.time}</span>
                          </div>
                          <h3 className={styles.storyHeadline}>{item.title}</h3>
                          {item.signal && (
                            <div className={styles.storySignalRow}>
                              <SignalTag signal={item.signal} />
                            </div>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {displayHeroVideo && (
                <section className={`${styles.heroVideoSection} ${styles.desktopOnly}`} aria-label="Related video">
                  <h2 className={styles.sectionHeading}>Related Video</h2>
                  <YouTubeVideoCard
                    video={displayHeroVideo}
                    onSelect={setActiveVideo}
                    compact
                  />
                </section>
              )}

              <div className={`${styles.adSlot} ${styles.desktopOnly}`} aria-hidden data-slot="premium-analysis">
                Premium analysis · Betting insights
              </div>

              {stream.length > 0 && (
                <section className={`${styles.streamSection} ${styles.desktopOnly}`} aria-label="News stream">
                  <h2 className={styles.sectionHeading}>Latest News</h2>
                  <div className={styles.streamList} role="list">
                    {stream.map((item, idx) => (
                      <Fragment key={item.id}>
                        <a
                          href={item.link || '#'}
                          target={item.link ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          className={styles.streamCard}
                          aria-label={item.title}
                          role="listitem"
                          onClick={() => handleArticleOpen(item, idx + 5, activeConf)}
                        >
                          <div className={styles.streamThumb} aria-hidden>
                            <ImgPlaceholder conference={item.conference} source={item.source} size="stream" />
                          </div>
                          <div className={styles.streamBody}>
                            <div className={styles.streamMeta}>
                              <SourceBadge source={item.source} />
                              {item.conference && <ConfPill conference={item.conference} />}
                              {item.signal && <SignalTag signal={item.signal} />}
                              <span className={styles.time}>{item.time}</span>
                            </div>
                            <p className={styles.streamHeadline}>{item.title}</p>
                            {item.excerpt && (
                              <p className={styles.streamExcerpt}>{item.excerpt}</p>
                            )}
                          </div>
                        </a>
                        {(idx + 1) % 8 === 0 && (
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
            </>
          )}

          {filtered.length === 0 && activeConf !== 'All' && (
            <p className={styles.empty}>No stories for this conference right now.</p>
          )}

        </div>
      )}
    </div>
  );
}
