/**
 * NBA News Feed — headlines and intelligence surface.
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchNbaHeadlines } from '../../api/nbaNews';
import { NBA_TEAMS } from '../../sports/nba/teams';
import styles from './NbaNewsFeed.module.css';

const PUBLISHER_CONFIG = {
  'yahoo sports':    { lines: ['YAHOO', 'SPORTS'],  bg: 'linear-gradient(135deg, #3d0070 0%, #7b1fa2 100%)' },
  'cbs sports':      { lines: ['CBS', 'SPORTS'],    bg: 'linear-gradient(135deg, #12235a 0%, #1565c0 100%)' },
  'espn':            { lines: ['ESPN'],              bg: 'linear-gradient(135deg, #6d0000 0%, #c62828 100%)' },
  'fox sports':      { lines: ['FOX', 'SPORTS'],    bg: 'linear-gradient(135deg, #2a1200 0%, #d84315 100%)' },
  'the athletic':    { lines: ['THE', 'ATHLETIC'],  bg: 'linear-gradient(135deg, #111 0%, #2d3748 100%)' },
  'bleacher report': { lines: ['B/R'],              bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' },
  'nba.com':         { lines: ['NBA'],              bg: 'linear-gradient(135deg, #001a3e 0%, #1d428a 100%)' },
  'associated press':{ lines: ['AP'],               bg: 'linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%)' },
  'ap news':         { lines: ['AP'],               bg: 'linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%)' },
  'action network':  { lines: ['ACTION'],           bg: 'linear-gradient(135deg, #0d1117 0%, #1a1a2e 100%)' },
  'covers':          { lines: ['COVERS'],           bg: 'linear-gradient(135deg, #0a2540 0%, #1565c0 100%)' },
};

const SIGNAL_PATTERNS = [
  { re: /\binjur(y|ies|ed|ing)\b/i,                             tag: 'Injury',   cls: 'signalInjury'   },
  { re: /\btrade[sd]?\b|\btrading\b/i,                          tag: 'Trade',    cls: 'signalTrade'    },
  { re: /\bfree agent|sign(s|ed|ing)\b/i,                       tag: 'Signing',  cls: 'signalSigning'  },
  { re: /\brookie|draft|prospect\b/i,                            tag: 'Prospect', cls: 'signalProspect' },
  { re: /\b(playoff|postseason|finals|conference finals)\b/i,    tag: 'Playoff',  cls: 'signalPlayoff'  },
  { re: /\b(odds|betting|wager|futures|moneyline|spread)\b/i,   tag: 'Betting',  cls: 'signalBetting'  },
];

const TEAM_TOKENS = NBA_TEAMS.map(t => ({
  full: t.name.toLowerCase(),
  abbrev: t.abbrev.toLowerCase(),
  conference: t.conference,
}));

function detectConference(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
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
    signal: detectSignal(raw.title),
    conference: detectConference(raw.title),
  };
}

function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a, b) {
  const sa = new Set(a.split(' '));
  const sb = new Set(b.split(' '));
  let inter = 0;
  for (const w of sa) { if (sb.has(w)) inter++; }
  const union = new Set([...sa, ...sb]).size;
  return union > 0 ? inter / union : 0;
}

function dedupeAndRank(items) {
  if (items.length <= 1) return items;
  const normed = items.map(it => ({ ...it, _norm: normalizeTitle(it.title) }));
  const kept = [];
  const seenSources = {};
  for (const item of normed) {
    const isDupe = kept.some(k => titleSimilarity(k._norm, item._norm) > 0.65);
    if (isDupe) continue;
    const srcKey = (item.source || '').toLowerCase();
    seenSources[srcKey] = (seenSources[srcKey] || 0) + 1;
    if (seenSources[srcKey] > 3 && kept.length < 12) continue;
    kept.push(item);
  }
  return kept;
}

function LogoChip({ source }) {
  const pub = getPublisherChip(source);
  return (
    <div className={styles.logoChip} style={{ background: pub.bg }}>
      {pub.lines.map((l, i) => <span key={i}>{l}</span>)}
    </div>
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

export default function NbaNewsFeed() {
  const [confFilter, setConfFilter] = useState('All');
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNbaHeadlines()
      .then(d => setHeadlines(dedupeAndRank((d.headlines ?? []).map(enrichItem))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (confFilter === 'All') return headlines;
    return headlines.filter(h => h.conference === confFilter || !h.conference);
  }, [headlines, confFilter]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>NBA Intelligence Feed</h1>
        <p className={styles.subtitle}>Headlines, analysis, and intelligence across the NBA</p>
      </header>

      <div className={styles.controls}>
        <div className={styles.filterRow}>
          {['All', 'Eastern', 'Western'].map(c => (
            <button key={c} type="button"
              className={`${styles.filterPill} ${confFilter === c ? styles.filterPillActive : ''}`}
              onClick={() => setConfFilter(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.skeleton}>
          {[1, 2, 3, 4].map(n => <div key={n} className={styles.skelLine} />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className={styles.emptyMsg}>No headlines match the current filter.</p>
      ) : (
        <div className={styles.headlineStream}>
          {filtered.slice(0, 25).map((item, i) => (
            <HeadlineRow key={item.id || i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
