/**
 * YouTubeVideoCard — thumbnail card for a single YouTube video.
 * Clicking fires onSelect(video); no iframe is rendered here.
 */
import { track } from '../../analytics/index';
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

export default function YouTubeVideoCard({ video, onSelect, compact = false }) {
  const { title, channelTitle, publishedAt, thumbUrl, durationSeconds } = video;

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

  return (
    <div
      className={`${styles.card} ${compact ? styles.compact : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Play video: ${title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Thumbnail */}
      <div className={styles.thumb}>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className={styles.thumbImg}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.thumbFallback} aria-hidden />
        )}
        {/* Play overlay */}
        <div className={styles.playOverlay} aria-hidden>
          <div className={styles.playRing}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M6 4.5L16 10L6 15.5V4.5Z" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* Duration pill */}
        {formatDuration(durationSeconds) && (
          <span className={styles.duration} aria-label={`Duration: ${formatDuration(durationSeconds)}`}>
            {formatDuration(durationSeconds)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
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
