/**
 * MLB Intel Feed — News & Highlights section for the MLB Home page.
 * Two-column layout: videos on left, headlines on right.
 * Mirrors the NCAAM Home Intel Feed pattern.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import styles from './MlbIntelFeed.module.css';

const CHANNEL_BADGE_MAP = {
  espn: { label: 'ESPN', color: '#CC0000' },
  mlb: { label: 'MLB', color: '#002D72' },
  'fox sports': { label: 'FOX', color: '#003F7D' },
  jomboy: { label: 'Jomboy', color: '#FF6B00' },
  sny: { label: 'SNY', color: '#002B5C' },
  nesn: { label: 'NESN', color: '#003DA5' },
};

function getChannelBadge(channelTitle) {
  const ch = (channelTitle || '').toLowerCase();
  for (const [key, val] of Object.entries(CHANNEL_BADGE_MAP)) {
    if (ch.includes(key)) return val;
  }
  return null;
}

const PUBLISHER_BADGES = {
  'cbs sports': { label: 'CBS SPORTS', color: '#0052A5' },
  'yahoo sports': { label: 'YAHOO SPORTS', color: '#6001D2' },
  espn: { label: 'ESPN', color: '#CC0000' },
  'the athletic': { label: 'THE ATHLETIC', color: '#2A2A2A' },
  'fox sports': { label: 'FOX SPORTS', color: '#003F7D' },
  'mlb.com': { label: 'MLB.COM', color: '#002D72' },
  'ap news': { label: 'AP NEWS', color: '#E3120B' },
  bleacher: { label: 'B/R', color: '#000' },
  reuters: { label: 'REUTERS', color: '#FF8000' },
};

function getPublisherBadge(source) {
  const s = (source || '').toLowerCase();
  for (const [key, val] of Object.entries(PUBLISHER_BADGES)) {
    if (s.includes(key)) return val;
  }
  return { label: source || 'NEWS', color: '#555' };
}

function VideoCard({ video, hero }) {
  const badge = getChannelBadge(video.channelTitle);
  const ago = video.publishedAt ? formatTimeAgo(video.publishedAt) : '';
  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={hero ? styles.videoCardHero : styles.videoCard}
    >
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
        <span className={styles.videoTitle}>{video.title}</span>
        <span className={styles.videoMeta}>
          {video.channelTitle}{ago ? ` · ${ago}` : ''}
        </span>
      </div>
    </a>
  );
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

export default function MlbIntelFeed() {
  const [videos, setVideos] = useState([]);
  const [headlines, setHeadlines] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [headlinesLoading, setHeadlinesLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/mlb/youtube/intelFeed?maxResults=6')
      .then((r) => r.json())
      .then((d) => setVideos(d.items ?? []))
      .catch(() => {})
      .finally(() => setVideosLoading(false));
  }, []);

  useEffect(() => {
    fetchMlbHeadlines()
      .then((d) => setHeadlines(d.headlines ?? []))
      .catch(() => {})
      .finally(() => setHeadlinesLoading(false));
  }, []);

  const visibleHeadlines = expanded ? headlines.slice(0, 12) : headlines.slice(0, 6);
  const hiddenCount = Math.max(0, Math.min(headlines.length, 12) - 6);

  return (
    <section className={styles.root}>
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>Intel Feed</span>
        <h2 className={styles.title}>News & Highlights</h2>
      </div>

      <div className={styles.grid}>
        {/* Videos column */}
        <div className={styles.videosCol}>
          <h3 className={styles.colTitle}>TOP VIDEOS</h3>
          {videosLoading ? (
            <div className={styles.skeleton}><div className={styles.skelBlock} /><div className={styles.skelBlock} /></div>
          ) : videos.length === 0 ? (
            <p className={styles.muted}>No videos available yet.</p>
          ) : (
            <div className={styles.videosList}>
              {videos.slice(0, 2).map((v) => (
                <VideoCard key={v.videoId} video={v} hero />
              ))}
              {videos.length > 2 && (
                <Link to="/mlb/news" className={styles.viewMore}>View more videos →</Link>
              )}
            </div>
          )}
        </div>

        {/* Headlines column */}
        <div className={styles.headlinesCol}>
          <h3 className={styles.colTitle}>HEADLINES</h3>
          {headlinesLoading ? (
            <div className={styles.skeleton}>
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className={styles.skelLine} />
              ))}
            </div>
          ) : headlines.length === 0 ? (
            <p className={styles.muted}>No headlines available yet.</p>
          ) : (
            <>
              <ul className={styles.headlinesList}>
                {visibleHeadlines.map((h, i) => {
                  const pub = getPublisherBadge(h.source);
                  return (
                    <li key={h.id || i} className={styles.headlineItem}>
                      <span className={styles.publisherBadge} style={{ '--pub-color': pub.color }}>
                        {pub.label}
                      </span>
                      <div className={styles.headlineBody}>
                        {h.link ? (
                          <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.headlineLink}>
                            {h.title}
                          </a>
                        ) : (
                          <span>{h.title}</span>
                        )}
                        {h.time && <span className={styles.headlineTime}>{h.time}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hiddenCount > 0 && !expanded && (
                <button type="button" className={styles.expandBtn} onClick={() => setExpanded(true)}>
                  +{hiddenCount} more headline{hiddenCount !== 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
          <Link to="/mlb/news" className={styles.viewMore}>View full Intel Feed →</Link>
        </div>
      </div>
    </section>
  );
}
