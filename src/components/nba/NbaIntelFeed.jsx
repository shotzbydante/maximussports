/**
 * NbaIntelFeed — news + video intel feed for NBA Home.
 * Two-column layout: videos left, headlines right.
 * Mirrors MLB MlbIntelFeed architecture.
 */

import { useState, useEffect } from 'react';
import { fetchNbaHeadlines } from '../../api/nbaNews';
import styles from './NbaIntelFeed.module.css';

const CHANNEL_BADGE = {
  espn: { label: 'ESPN', color: '#CC0000' },
  nba: { label: 'NBA', color: '#1d428a' },
  'house of highlights': { label: 'HoH', color: '#FF6B00' },
  'bleacher report': { label: 'B/R', color: '#0a0a0a' },
};

const PUBLISHER_CHIP = {
  'espn': { bg: 'linear-gradient(135deg, #6d0000, #c62828)' },
  'cbs sports': { bg: 'linear-gradient(135deg, #12235a, #1565c0)' },
  'yahoo sports': { bg: 'linear-gradient(135deg, #3d0070, #7b1fa2)' },
  'the athletic': { bg: 'linear-gradient(135deg, #111, #2d3748)' },
  'fox sports': { bg: 'linear-gradient(135deg, #2a1200, #d84315)' },
  'nba.com': { bg: 'linear-gradient(135deg, #001a3e, #1d428a)' },
  'bleacher report': { bg: 'linear-gradient(135deg, #0a0a0a, #1a1a2e)' },
  'associated press': { bg: 'linear-gradient(135deg, #1a1a1a, #4a4a4a)' },
  'ap news': { bg: 'linear-gradient(135deg, #1a1a1a, #4a4a4a)' },
};

function getPublisherBg(source) {
  const s = (source || '').toLowerCase();
  for (const [key, val] of Object.entries(PUBLISHER_CHIP)) {
    if (s.includes(key)) return val.bg;
  }
  return 'linear-gradient(135deg, #555, #777)';
}

function getChannelBadge(channel) {
  const ch = (channel || '').toLowerCase();
  for (const [key, val] of Object.entries(CHANNEL_BADGE)) {
    if (ch.includes(key)) return val;
  }
  return null;
}

function VideoCard({ video, hero }) {
  const badge = getChannelBadge(video.channelTitle);
  return (
    <a href={`https://www.youtube.com/watch?v=${video.videoId}`}
      target="_blank" rel="noopener noreferrer"
      className={hero ? styles.videoHero : styles.videoCard}>
      <div className={styles.videoThumb}>
        <img src={video.thumbUrl} alt={video.title} loading="lazy" />
        <span className={styles.playIcon}>{'\u25B6'}</span>
      </div>
      <div className={styles.videoInfo}>
        {badge && <span className={styles.channelBadge} style={{ '--badge-color': badge.color }}>{badge.label}</span>}
        <span className={hero ? styles.videoTitleHero : styles.videoTitle}>{video.title}</span>
        <span className={styles.videoMeta}>{video.channelTitle}</span>
      </div>
    </a>
  );
}

function HeadlineRow({ item }) {
  const bg = getPublisherBg(item.source);
  return (
    <div className={styles.headlineRow}>
      <div className={styles.pubChip} style={{ background: bg }}>
        <span>{(item.source || 'NEWS').toUpperCase().slice(0, 6)}</span>
      </div>
      <div className={styles.headlineBody}>
        <div className={styles.headlineMeta}>
          <span className={styles.headlineSource}>{item.source}</span>
          {item.time && <span className={styles.headlineTime}>{item.time}</span>}
        </div>
        {item.link ? (
          <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.headlineLink}>{item.title}</a>
        ) : (
          <span className={styles.headlineText}>{item.title}</span>
        )}
      </div>
    </div>
  );
}

export default function NbaIntelFeed() {
  const [videos, setVideos] = useState([]);
  const [headlines, setHeadlines] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [headlinesLoading, setHeadlinesLoading] = useState(true);
  const [headlinesExpanded, setHeadlinesExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/nba/youtube/team?teamSlug=bos&maxResults=8')
      .then(r => r.json())
      .then(d => setVideos(d.items ?? []))
      .catch(() => {})
      .finally(() => setVideosLoading(false));
  }, []);

  useEffect(() => {
    fetchNbaHeadlines()
      .then(d => setHeadlines(d.headlines ?? []))
      .catch(() => {})
      .finally(() => setHeadlinesLoading(false));
  }, []);

  const heroVideo = videos[0] || null;
  const gridVideos = videos.slice(1, 5);
  const shownHeadlines = headlinesExpanded ? headlines.slice(0, 16) : headlines.slice(0, 6);

  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>Intelligence</div>
      <h2 className={styles.title}>NBA Intel Feed</h2>

      <div className={styles.feedGrid}>
        {/* Videos */}
        <div className={styles.videosCol}>
          <h3 className={styles.colTitle}>Top Videos</h3>
          {videosLoading ? (
            <div className={styles.skeleton}><div className={styles.skelBlock} /><div className={styles.skelBlock} /></div>
          ) : heroVideo ? (
            <>
              <VideoCard video={heroVideo} hero />
              {gridVideos.length > 0 && (
                <div className={styles.videoGrid}>
                  {gridVideos.map(v => <VideoCard key={v.videoId} video={v} />)}
                </div>
              )}
            </>
          ) : (
            <p className={styles.empty}>No videos available right now.</p>
          )}
        </div>

        {/* Headlines */}
        <div className={styles.headlinesCol}>
          <h3 className={styles.colTitle}>Headlines</h3>
          {headlinesLoading ? (
            <div className={styles.skeleton}>{[1, 2, 3].map(n => <div key={n} className={styles.skelLine} />)}</div>
          ) : headlines.length === 0 ? (
            <p className={styles.empty}>No headlines available.</p>
          ) : (
            <>
              <div className={styles.headlineList}>
                {shownHeadlines.map((h, i) => <HeadlineRow key={h.id || i} item={h} />)}
              </div>
              {headlines.length > 6 && (
                <button type="button" className={styles.expandBtn}
                  onClick={() => setHeadlinesExpanded(v => !v)}>
                  {headlinesExpanded ? 'Show fewer' : `Show all ${headlines.length} headlines`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
