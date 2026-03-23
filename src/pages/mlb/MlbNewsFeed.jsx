/**
 * MLB News Feed — v2 premium intelligence/media surface.
 *
 * v2 upgrades:
 *   - True League filter (All / AL / NL) + contextual Division filter
 *   - "What Matters Now" curated story layer
 *   - Editorial dedupe + diversity scoring
 *   - MLB-relevance filtering for Betting Intel
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import { MLB_TEAMS } from '../../sports/mlb/teams';
import styles from './MlbNewsFeed.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLISHER_CONFIG = {
  'yahoo sports':    { lines: ['YAHOO', 'SPORTS'],  bg: 'linear-gradient(135deg, #3d0070 0%, #7b1fa2 100%)' },
  'cbs sports':      { lines: ['CBS', 'SPORTS'],    bg: 'linear-gradient(135deg, #12235a 0%, #1565c0 100%)' },
  'espn':            { lines: ['ESPN'],              bg: 'linear-gradient(135deg, #6d0000 0%, #c62828 100%)' },
  'fox sports':      { lines: ['FOX', 'SPORTS'],    bg: 'linear-gradient(135deg, #2a1200 0%, #d84315 100%)' },
  'the athletic':    { lines: ['THE', 'ATHLETIC'],  bg: 'linear-gradient(135deg, #111 0%, #2d3748 100%)' },
  'bleacher report': { lines: ['B/R'],              bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' },
  'mlb.com':         { lines: ['MLB'],              bg: 'linear-gradient(135deg, #001a3e 0%, #002D72 100%)' },
  'associated press':{ lines: ['AP'],               bg: 'linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%)' },
  'ap news':         { lines: ['AP'],               bg: 'linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%)' },
  'action network':  { lines: ['ACTION'],           bg: 'linear-gradient(135deg, #0d1117 0%, #1a1a2e 100%)' },
  'covers':          { lines: ['COVERS'],           bg: 'linear-gradient(135deg, #0a2540 0%, #1565c0 100%)' },
  'vsin':            { lines: ['VSiN'],             bg: 'linear-gradient(135deg, #0d47a1 0%, #1976d2 100%)' },
  'sports illustrated': { lines: ['SI'],            bg: 'linear-gradient(135deg, #8b0000 0%, #cc0000 100%)' },
  'nbc':             { lines: ['NBC'],              bg: 'linear-gradient(135deg, #1a1a8a 0%, #3f51b5 100%)' },
};

const SIGNAL_PATTERNS = [
  { re: /\binjur(y|ies|ed|ing)\b/i,                          tag: 'Injury',    cls: 'signalInjury'    },
  { re: /\btrade[sd]?\b|\btrading\b/i,                       tag: 'Trade',     cls: 'signalTrade'     },
  { re: /\bfree agent|sign(s|ed|ing)\b/i,                    tag: 'Signing',   cls: 'signalSigning'   },
  { re: /\bprospect(s)?\b|\bcall[- ]?up\b/i,                 tag: 'Prospect',  cls: 'signalProspect'  },
  { re: /\b(opening day|spring training)\b/i,                 tag: 'Season',    cls: 'signalSeason'    },
  { re: /\b(playoff|postseason|world series|pennant)\b/i,     tag: 'Playoff',   cls: 'signalPlayoff'   },
  { re: /\b(odds|betting|wager|futures|moneyline|spread)\b/i, tag: 'Betting',   cls: 'signalBetting'   },
];

const CHANNEL_BADGE_MAP = {
  espn:         { label: 'ESPN',     color: '#CC0000' },
  mlb:          { label: 'MLB',      color: '#002D72' },
  'fox sports': { label: 'FOX',      color: '#003F7D' },
  jomboy:       { label: 'Jomboy',   color: '#FF6B00' },
  sny:          { label: 'SNY',      color: '#002B5C' },
  nesn:         { label: 'NESN',     color: '#003DA5' },
};

const TEAM_TOKENS = MLB_TEAMS.map(t => ({
  full: t.name.toLowerCase(),
  abbrev: t.abbrev.toLowerCase(),
  league: t.league,
  division: t.division,
}));

const MLB_BETTING_KEYWORDS = /\b(mlb|baseball|pitcher|pitching|moneyline|run line|totals|innings|win total|world series|pennant|division winner|opening day|spring training|batting|home run|strikeout)\b/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectDivision(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  for (const { full, division } of TEAM_TOKENS) {
    if (lower.includes(full)) return division;
  }
  for (const { abbrev, division } of TEAM_TOKENS) {
    if (lower.includes(abbrev)) return division;
  }
  return null;
}

function detectLeague(title) {
  const div = detectDivision(title);
  if (!div) return null;
  return div.startsWith('AL') ? 'AL' : 'NL';
}

function detectSignal(title) {
  if (!title) return null;
  for (const { re, tag, cls } of SIGNAL_PATTERNS) {
    if (re.test(title)) return { tag, cls };
  }
  return null;
}

function getChannelBadge(channelTitle) {
  const ch = (channelTitle || '').toLowerCase();
  for (const [key, val] of Object.entries(CHANNEL_BADGE_MAP)) {
    if (ch.includes(key)) return val;
  }
  return null;
}

function getPublisherChip(source) {
  const s = (source || '').toLowerCase();
  for (const [key, val] of Object.entries(PUBLISHER_CONFIG)) {
    if (s.includes(key)) return val;
  }
  return { lines: [source?.toUpperCase()?.slice(0, 8) || 'NEWS'], bg: 'linear-gradient(135deg, #555 0%, #777 100%)' };
}

function formatRelTime(pubDate) {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function enrichItem(raw, i) {
  return {
    id: raw.link || raw.id || `item-${i}`,
    title: raw.title || '',
    source: raw.source || 'News',
    time: raw.time || formatRelTime(raw.pubDate),
    link: raw.link || null,
    image: raw.image || null,
    signal: detectSignal(raw.title),
    division: detectDivision(raw.title),
    league: detectLeague(raw.title),
  };
}

/** Normalize title for dedupe comparison. */
function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Score similarity between two normalized titles (Jaccard on word sets). */
function titleSimilarity(a, b) {
  const sa = new Set(a.split(' '));
  const sb = new Set(b.split(' '));
  let inter = 0;
  for (const w of sa) { if (sb.has(w)) inter++; }
  const union = new Set([...sa, ...sb]).size;
  return union > 0 ? inter / union : 0;
}

/** Dedupe + diversity-rank a list of items. */
function dedupeAndRank(items) {
  if (items.length <= 1) return items;
  const normed = items.map(it => ({ ...it, _norm: normalizeTitle(it.title) }));
  const kept = [];
  const seenSources = {};
  const seenSignals = {};

  for (const item of normed) {
    // Skip near-duplicates
    const isDupe = kept.some(k => titleSimilarity(k._norm, item._norm) > 0.65);
    if (isDupe) continue;

    // Penalize source clustering (allow max 3 from same source in top results)
    const srcKey = (item.source || '').toLowerCase();
    seenSources[srcKey] = (seenSources[srcKey] || 0) + 1;
    if (seenSources[srcKey] > 3 && kept.length < 12) continue;

    // Track signal diversity
    const sigKey = item.signal?.tag || 'general';
    seenSignals[sigKey] = (seenSignals[sigKey] || 0) + 1;

    kept.push(item);
  }
  return kept;
}

/** Filter betting items for MLB relevance. */
function filterMlbBetting(items) {
  return items.filter(it => {
    const t = (it.title || '').toLowerCase();
    // Must mention MLB or a baseball-specific term or team
    if (MLB_BETTING_KEYWORDS.test(t)) return true;
    // Check if any MLB team is mentioned
    for (const { full, abbrev } of TEAM_TOKENS) {
      if (t.includes(full) || t.includes(abbrev)) return true;
    }
    return false;
  });
}

/** Select top editorial "What Matters Now" picks from headlines. */
function selectWhatMatters(headlines, usedIds = new Set()) {
  // Prefer items with signals, from strong sources, that are diverse
  const candidates = headlines.filter(h => !usedIds.has(h.id));
  const scored = candidates.map(h => {
    let score = 0;
    if (h.signal) score += 3; // has a topic signal
    const src = (h.source || '').toLowerCase();
    if (['espn', 'the athletic', 'mlb.com', 'cbs sports', 'fox sports', 'ap news', 'associated press'].some(s => src.includes(s))) score += 2;
    if (h.league) score += 1; // team-specific is more interesting
    return { ...h, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);

  // Pick up to 4 with signal diversity
  const picks = [];
  const usedSignals = new Set();
  for (const item of scored) {
    if (picks.length >= 4) break;
    const sig = item.signal?.tag || 'general';
    if (usedSignals.has(sig) && picks.length >= 2) continue; // allow 1 repeat if under 2
    usedSignals.add(sig);
    picks.push(item);
  }
  return picks;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function matchesFilter(item, leagueFilter, divisionFilter) {
  if (leagueFilter === 'All' && divisionFilter === 'All') return true;
  if (leagueFilter !== 'All' && item.league !== leagueFilter && item.league !== null) return item.league === null; // show general if no team detected
  if (leagueFilter !== 'All' && item.league !== leagueFilter) return !item.league; // include untagged
  if (divisionFilter !== 'All' && item.division !== divisionFilter) return !item.division;
  return true;
}

function matchesVideoFilter(video, leagueFilter, divisionFilter) {
  const div = detectDivision(video.title);
  const league = div?.startsWith('AL') ? 'AL' : div?.startsWith('NL') ? 'NL' : null;
  if (leagueFilter !== 'All' && league !== leagueFilter) return !league;
  if (divisionFilter !== 'All' && div !== divisionFilter) return !div;
  return true;
}

// ─── Components ───────────────────────────────────────────────────────────────

function LogoChip({ source }) {
  const pub = getPublisherChip(source);
  return (
    <div className={styles.logoChip} style={{ background: pub.bg }}>
      {pub.lines.map((l, i) => <span key={i}>{l}</span>)}
    </div>
  );
}

function VideoCard({ video, hero }) {
  const badge = getChannelBadge(video.channelTitle);
  const ago = video.publishedAt ? formatRelTime(video.publishedAt) : '';
  return (
    <a href={`https://www.youtube.com/watch?v=${video.videoId}`}
      target="_blank" rel="noopener noreferrer"
      className={hero ? styles.videoCardHero : styles.videoCard}>
      <div className={styles.videoThumb}>
        <img src={video.thumbUrl} alt={video.title} loading="lazy" />
        <span className={styles.playIcon}>▶</span>
      </div>
      <div className={styles.videoInfo}>
        {badge && (
          <span className={styles.channelBadge} style={{ '--badge-color': badge.color }}>
            {badge.label}
          </span>
        )}
        <span className={hero ? styles.videoTitleHero : styles.videoTitle}>{video.title}</span>
        <span className={styles.videoMeta}>{video.channelTitle}{ago ? ` · ${ago}` : ''}</span>
      </div>
    </a>
  );
}

function HeadlineRow({ item }) {
  const signal = item.signal;
  return (
    <div className={styles.headlineRow}>
      <LogoChip source={item.source} />
      <div className={styles.headlineBody}>
        <div className={styles.headlineMeta}>
          <span className={styles.headlineSource}>{item.source}</span>
          {item.time && <span className={styles.headlineTime}>{item.time}</span>}
          {signal && <span className={`${styles.signalTag} ${styles[signal.cls] || ''}`}>{signal.tag}</span>}
        </div>
        {item.link ? (
          <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.headlineLink}>
            {item.title}
          </a>
        ) : (
          <span className={styles.headlineText}>{item.title}</span>
        )}
      </div>
    </div>
  );
}

function WhatMattersCard({ item }) {
  return (
    <a href={item.link || '#'} target={item.link ? '_blank' : undefined}
      rel="noopener noreferrer" className={styles.wmCard}>
      <div className={styles.wmCardTop}>
        {item.signal && (
          <span className={`${styles.signalTag} ${styles[item.signal.cls] || ''}`}>{item.signal.tag}</span>
        )}
        <span className={styles.wmTime}>{item.time}</span>
      </div>
      <span className={styles.wmTitle}>{item.title}</span>
      <span className={styles.wmSource}>{item.source}</span>
    </a>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MlbNewsFeed() {
  const [tab, setTab] = useState('intel');
  const [contentMode, setContentMode] = useState('all');
  const [leagueFilter, setLeagueFilter] = useState('All');
  const [divisionFilter, setDivisionFilter] = useState('All');

  const [videos, setVideos] = useState([]);
  const [headlines, setHeadlines] = useState([]);
  const [bettingVideos, setBettingVideos] = useState([]);
  const [bettingNews, setBettingNews] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [headlinesLoading, setHeadlinesLoading] = useState(true);
  const [bettingLoading, setBettingLoading] = useState(false);

  useEffect(() => {
    fetch('/api/mlb/youtube/intelFeed?maxResults=14')
      .then(r => r.json())
      .then(d => setVideos(d.items ?? []))
      .catch(() => {})
      .finally(() => setVideosLoading(false));
  }, []);

  useEffect(() => {
    fetchMlbHeadlines()
      .then(d => setHeadlines(dedupeAndRank((d.headlines ?? []).map(enrichItem))))
      .catch(() => {})
      .finally(() => setHeadlinesLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'betting') return;
    if (bettingVideos.length > 0 || bettingNews.length > 0) return;
    setBettingLoading(true);
    Promise.allSettled([
      fetch('/api/mlb/youtube/intelFeed?maxResults=8').then(r => r.json()),
      fetch('/api/news/betting').then(r => r.json()),
    ]).then(([vidRes, newsRes]) => {
      if (vidRes.status === 'fulfilled') setBettingVideos(vidRes.value.items ?? []);
      if (newsRes.status === 'fulfilled') {
        const raw = (newsRes.value.items ?? []).map(enrichItem);
        setBettingNews(filterMlbBetting(dedupeAndRank(raw)));
      }
    }).finally(() => setBettingLoading(false));
  }, [tab, bettingVideos.length, bettingNews.length]);

  // League-aware division options
  const divisionOptions = useMemo(() => {
    if (leagueFilter === 'AL') return ['All', 'AL East', 'AL Central', 'AL West'];
    if (leagueFilter === 'NL') return ['All', 'NL East', 'NL Central', 'NL West'];
    return ['All'];
  }, [leagueFilter]);

  // Reset division when league changes
  const handleLeagueChange = (lg) => {
    setLeagueFilter(lg);
    setDivisionFilter('All');
  };

  // Filtered content
  const filteredVideos = useMemo(() =>
    videos.filter(v => matchesVideoFilter(v, leagueFilter, divisionFilter)),
    [videos, leagueFilter, divisionFilter]);

  const filteredHeadlines = useMemo(() =>
    headlines.filter(h => matchesFilter(h, leagueFilter, divisionFilter)),
    [headlines, leagueFilter, divisionFilter]);

  // What Matters Now — top editorial picks
  const whatMatters = useMemo(() => {
    if (headlinesLoading || headlines.length === 0) return [];
    return selectWhatMatters(filteredHeadlines);
  }, [filteredHeadlines, headlinesLoading, headlines.length]);

  const wmIds = useMemo(() => new Set(whatMatters.map(w => w.id)), [whatMatters]);

  const heroVideo = filteredVideos[0] || null;
  const gridVideos = filteredVideos.slice(1, 7);

  // Headlines stream excludes WM picks to avoid repetition
  const streamHeadlines = useMemo(() =>
    filteredHeadlines.filter(h => !wmIds.has(h.id)),
    [filteredHeadlines, wmIds]);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>MLB Intelligence Feed</h1>
        <p className={styles.subtitle}>Videos, headlines, betting intel, and analysis across Major League Baseball</p>
      </header>

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        <button type="button"
          className={`${styles.tab} ${tab === 'intel' ? styles.tabActive : ''}`}
          onClick={() => setTab('intel')}>
          <span className={styles.tabIcon}>⚾</span> MLB Intel
        </button>
        <button type="button"
          className={`${styles.tab} ${tab === 'betting' ? styles.tabActive : ''}`}
          onClick={() => setTab('betting')}>
          <span className={styles.tabIcon}>📊</span> Betting Intel
        </button>
      </div>

      {/* ── MLB Intel Tab ── */}
      {tab === 'intel' && (
        <>
          {/* Controls */}
          <div className={styles.controls}>
            <div className={styles.filterCluster}>
              <div className={styles.modeRow}>
                {['all', 'videos', 'stories'].map(m => (
                  <button key={m} type="button"
                    className={`${styles.modePill} ${contentMode === m ? styles.modePillActive : ''}`}
                    onClick={() => setContentMode(m)}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              <div className={styles.leagueRow}>
                {['All', 'AL', 'NL'].map(lg => (
                  <button key={lg} type="button"
                    className={`${styles.leaguePill} ${leagueFilter === lg ? styles.leaguePillActive : ''}`}
                    onClick={() => handleLeagueChange(lg)}>
                    {lg}
                  </button>
                ))}
              </div>

              {divisionOptions.length > 1 && (
                <div className={styles.divisionRow}>
                  {divisionOptions.map(d => (
                    <button key={d} type="button"
                      className={`${styles.divPill} ${divisionFilter === d ? styles.divPillActive : ''}`}
                      onClick={() => setDivisionFilter(d)}>
                      {d === 'All' ? 'All Divisions' : d.replace(/^(AL|NL) /, '')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* What Matters Now */}
          {contentMode === 'all' && whatMatters.length > 0 && (
            <section className={styles.wmSection}>
              <h2 className={styles.wmSectionTitle}>What Matters Now</h2>
              <div className={styles.wmGrid}>
                {whatMatters.map((item, i) => (
                  <WhatMattersCard key={item.id || i} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Hero Zone */}
          {(contentMode === 'all' || contentMode === 'videos') && heroVideo && (
            <section className={styles.heroZone}>
              <VideoCard video={heroVideo} hero />
              {streamHeadlines[0] && contentMode === 'all' && (
                <div className={styles.featuredArticle}>
                  <LogoChip source={streamHeadlines[0].source} />
                  <div className={styles.featuredBody}>
                    {streamHeadlines[0].signal && (
                      <span className={`${styles.signalTag} ${styles[streamHeadlines[0].signal.cls] || ''}`}>
                        {streamHeadlines[0].signal.tag}
                      </span>
                    )}
                    <span className={styles.featuredTime}>{streamHeadlines[0].time}</span>
                    {streamHeadlines[0].link ? (
                      <a href={streamHeadlines[0].link} target="_blank" rel="noopener noreferrer"
                        className={styles.featuredTitle}>{streamHeadlines[0].title}</a>
                    ) : (
                      <span className={styles.featuredTitle}>{streamHeadlines[0].title}</span>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Video Grid */}
          {(contentMode === 'all' || contentMode === 'videos') && gridVideos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Latest Videos</h2>
              <div className={styles.videoGrid}>
                {gridVideos.map(v => <VideoCard key={v.videoId} video={v} />)}
              </div>
            </section>
          )}

          {videosLoading && contentMode !== 'stories' && (
            <div className={styles.skeleton}>
              {[1, 2, 3].map(n => <div key={n} className={styles.skelBlock} />)}
            </div>
          )}

          {/* Headlines Stream */}
          {(contentMode === 'all' || contentMode === 'stories') && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Headlines</h2>
              {headlinesLoading ? (
                <div className={styles.skeleton}>
                  {[1, 2, 3, 4].map(n => <div key={n} className={styles.skelLine} />)}
                </div>
              ) : streamHeadlines.length === 0 ? (
                <p className={styles.emptyMsg}>No headlines match the current filter.</p>
              ) : (
                <div className={styles.headlineStream}>
                  {streamHeadlines.slice(contentMode === 'stories' ? 0 : 1, 20).map((item, i) => (
                    <HeadlineRow key={item.id || i} item={item} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* ── Betting Intel Tab ── */}
      {tab === 'betting' && (
        <>
          <div className={styles.bettingIntro}>
            <h2 className={styles.sectionTitle}>MLB Betting Intelligence</h2>
            <p className={styles.bettingSubtitle}>
              Picks, projections, odds movement, and market analysis for Major League Baseball
            </p>
          </div>

          {bettingLoading ? (
            <div className={styles.skeleton}>
              {[1, 2, 3].map(n => <div key={n} className={styles.skelBlock} />)}
            </div>
          ) : (
            <>
              {bettingVideos.length > 0 && (
                <section className={styles.section}>
                  <h3 className={styles.sectionSubtitle}>Betting Videos</h3>
                  <div className={styles.heroZone}>
                    <VideoCard video={bettingVideos[0]} hero />
                  </div>
                  {bettingVideos.length > 1 && (
                    <div className={styles.videoGrid}>
                      {bettingVideos.slice(1, 5).map(v => <VideoCard key={v.videoId} video={v} />)}
                    </div>
                  )}
                </section>
              )}

              {bettingNews.length > 0 && (
                <section className={styles.section}>
                  <h3 className={styles.sectionSubtitle}>Betting Headlines</h3>
                  <div className={styles.headlineStream}>
                    {bettingNews.slice(0, 12).map((item, i) => (
                      <HeadlineRow key={item.id || i} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {bettingVideos.length === 0 && bettingNews.length === 0 && (
                <p className={styles.emptyMsg}>No MLB-specific betting intel available right now. Check back shortly.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
