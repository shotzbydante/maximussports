/**
 * YouTubeVideoCard — thumbnail card for a single YouTube video.
 * Clicking fires onSelect(video); no iframe is rendered here.
 */
import { useState } from 'react';
import { track } from '../../analytics/index';
import { decodeDisplayText } from '../../utils/decodeEntities';
import styles from './YouTubeVideoCard.module.css';

function formatRelTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1)  return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  <  7)  return `${days}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const CHANNEL_BADGE_MAP = {
  'espn': { label: 'ESPN', color: '#c62828' },
  'cbs sports': { label: 'CBS', color: '#1565c0' },
  'cbs sports hq': { label: 'CBS', color: '#1565c0' },
  'fox sports': { label: 'FOX', color: '#d84315' },
  'nbc sports': { label: 'NBC', color: '#2e7d32' },
  'bleacher report': { label: 'B/R', color: '#1a1a2e' },
  'the athletic': { label: 'ATH', color: '#2d3748' },
  'big ten network': { label: 'B1G', color: '#1e3a5f' },
  'acc network': { label: 'ACC', color: '#6d28d9' },
  'sec network': { label: 'SEC', color: '#c2410c' },
  'pac-12 networks': { label: 'P12', color: '#0f766e' },
  'big 12 conference': { label: 'B12', color: '#991b1b' },
  'big east conference': { label: 'BE', color: '#3730a3' },
  'stadium': { label: 'STD', color: '#374151' },
  'on3': { label: 'ON3', color: '#111827' },
  'draftkings': { label: 'DK', color: '#0a6e3a' },
  'draftkings network': { label: 'DK', color: '#0a6e3a' },
  'fanduel': { label: 'FD', color: '#1565c0' },
  'fanduel tv': { label: 'FD', color: '#1565c0' },
  'action network': { label: 'ACT', color: '#1a1a2e' },
  'vsin': { label: 'VSiN', color: '#0d47a1' },
  'barstool sports': { label: 'BSS', color: '#111' },
};

function getChannelBadge(channelTitle) {
  if (!channelTitle) return null;
  const key = channelTitle.toLowerCase();
  for (const [match, badge] of Object.entries(CHANNEL_BADGE_MAP)) {
    if (key.includes(match)) return badge;
  }
  return null;
}

export default function YouTubeVideoCard({ video, onSelect, compact = false, hero = false }) {
  const { title, channelTitle, publishedAt, thumbUrl, durationSeconds } = video;
  const [imgError, setImgError] = useState(false);
  const badge = getChannelBadge(channelTitle);

  const heroThumb = thumbUrl && !imgError
    ? thumbUrl.replace(/\/mqdefault\.jpg$/, '/hqdefault.jpg')
    : thumbUrl;

  function handleClick(e) {
    e.preventDefault();
    track('video_play_click', {
      video_id: video.videoId,
      title:    (video.title ?? '').slice(0, 100),
      channel:  video.channelTitle,
    });
    onSelect?.(video);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      track('video_play_click', {
        video_id: video.videoId,
        title:    (video.title ?? '').slice(0, 100),
        channel:  video.channelTitle,
      });
      onSelect?.(video);
    }
  }

  const cardClass = [
    styles.card,
    compact ? styles.compact : '',
    hero ? styles.hero : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClass}
      role="button"
      tabIndex={0}
      aria-label={`Play video: ${title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.thumb}>
        {(hero ? heroThumb : thumbUrl) && !imgError ? (
          <img
            src={hero ? heroThumb : thumbUrl}
            alt=""
            className={styles.thumbImg}
            loading={hero ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={styles.thumbFallback} aria-hidden>
            <span className={styles.thumbFallbackSource}>{channelTitle || 'Video'}</span>
          </div>
        )}
        <div className={styles.playOverlay} aria-hidden>
          <div className={styles.playRing}>
            <svg width={hero ? '24' : '18'} height={hero ? '24' : '18'} viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M6 4.5L16 10L6 15.5V4.5Z" fill="currentColor" />
            </svg>
          </div>
        </div>

        {badge && (
          <span className={styles.channelBadge} style={{ background: badge.color }}>
            {badge.label}
          </span>
        )}

        {formatDuration(durationSeconds) && (
          <span className={styles.duration} aria-label={`Duration: ${formatDuration(durationSeconds)}`}>
            {formatDuration(durationSeconds)}
          </span>
        )}
      </div>

      <div className={styles.body}>
        <p className={styles.title}>{decodeDisplayText(title)}</p>
        <div className={styles.meta}>
          {channelTitle && (
            <span className={styles.channel}>{channelTitle}</span>
          )}
          {publishedAt && (
            <span className={styles.time}>{formatRelTime(publishedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
