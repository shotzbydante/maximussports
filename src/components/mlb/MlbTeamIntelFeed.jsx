/**
 * MLB Team Intel Feed — team-specific news + videos for MLB team pages.
 * Mirrors the NCAAM team page news/video pattern.
 */

import { useState, useEffect } from 'react';
import styles from './MlbTeamIntelFeed.module.css';

const PUBLISHER_BADGES = {
  'cbs sports': { label: 'CBS SPORTS', color: '#0052A5' },
  'yahoo sports': { label: 'YAHOO SPORTS', color: '#6001D2' },
  espn: { label: 'ESPN', color: '#CC0000' },
  'the athletic': { label: 'THE ATHLETIC', color: '#2A2A2A' },
  'fox sports': { label: 'FOX SPORTS', color: '#003F7D' },
  'mlb.com': { label: 'MLB.COM', color: '#002D72' },
  'ap news': { label: 'AP NEWS', color: '#E3120B' },
  bleacher: { label: 'B/R', color: '#000' },
};

function getPublisherBadge(source) {
  const s = (source || '').toLowerCase();
  for (const [key, val] of Object.entries(PUBLISHER_BADGES)) {
    if (s.includes(key)) return val;
  }
  return { label: source || 'NEWS', color: '#555' };
}

const CHANNEL_BADGE_MAP = {
  espn: { label: 'ESPN', color: '#CC0000' },
  mlb: { label: 'MLB', color: '#002D72' },
  'fox sports': { label: 'FOX', color: '#003F7D' },
};

function getChannelBadge(channelTitle) {
  const ch = (channelTitle || '').toLowerCase();
  for (const [key, val] of Object.entries(CHANNEL_BADGE_MAP)) {
    if (ch.includes(key)) return val;
  }
  return null;
}

function formatTimeAgo(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch { return ''; }
}

export default function MlbTeamIntelFeed({ teamSlug, teamName, headlines = [] }) {
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [newsExpanded, setNewsExpanded] = useState(false);

  useEffect(() => {
    if (!teamSlug) { setVideosLoading(false); return; }
    fetch(`/api/mlb/youtube/team?teamSlug=${encodeURIComponent(teamSlug)}&maxResults=6`)
      .then((r) => r.json())
      .then((d) => setVideos(d.items ?? []))
      .catch(() => {})
      .finally(() => setVideosLoading(false));
  }, [teamSlug]);

  const visibleNews = newsExpanded ? headlines.slice(0, 12) : headlines.slice(0, 5);
  const hasMoreNews = headlines.length > 5;

  return (
    <div className={styles.root}>
      {/* Videos rail */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{teamName} Videos</h3>
        {videosLoading ? (
          <div className={styles.videoGrid}>
            {[1, 2, 3].map((n) => <div key={n} className={styles.skelCard} />)}
          </div>
        ) : videos.length === 0 ? (
          <p className={styles.muted}>No team videos found yet.</p>
        ) : (
          <div className={styles.videoGrid}>
            {videos.slice(0, 4).map((v) => {
              const badge = getChannelBadge(v.channelTitle);
              const ago = v.publishedAt ? formatTimeAgo(v.publishedAt) : '';
              return (
                <a
                  key={v.videoId}
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.videoCard}
                >
                  <div className={styles.videoThumb}>
                    <img src={v.thumbUrl} alt={v.title} loading="lazy" />
                    <span className={styles.playIcon}>▶</span>
                  </div>
                  <div className={styles.videoInfo}>
                    {badge && (
                      <span className={styles.channelBadge} style={{ '--badge-color': badge.color }}>
                        {badge.label}
                      </span>
                    )}
                    <span className={styles.videoTitle}>{v.title}</span>
                    <span className={styles.videoMeta}>{v.channelTitle}{ago ? ` · ${ago}` : ''}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* News section */}
      {headlines.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{teamName} News</h3>
          <ul className={styles.newsList}>
            {visibleNews.map((h, i) => {
              const pub = getPublisherBadge(h.source);
              return (
                <li key={h.id || i} className={styles.newsItem}>
                  <span className={styles.publisherBadge} style={{ '--pub-color': pub.color }}>
                    {pub.label}
                  </span>
                  <div className={styles.newsBody}>
                    {h.link ? (
                      <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.newsLink}>
                        {h.title}
                      </a>
                    ) : (
                      <span className={styles.newsLink}>{h.title}</span>
                    )}
                    {h.time && <span className={styles.newsTime}>{h.time}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMoreNews && (
            <button type="button" className={styles.expandBtn} onClick={() => setNewsExpanded(!newsExpanded)}>
              {newsExpanded ? 'Show less' : `View all ${headlines.length} headlines`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
