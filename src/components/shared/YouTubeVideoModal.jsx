/**
 * YouTubeVideoModal — full-screen overlay that embeds the video iframe.
 * Iframe is rendered ONLY when the modal is open.
 * Closes on X button, ESC key, or backdrop click.
 */
import { useEffect, useCallback } from 'react';
import styles from './YouTubeVideoModal.module.css';

export default function YouTubeVideoModal({ video, onClose }) {
  const open = !!video;

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose?.();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.videoId}?rel=0&modestbranding=1&autoplay=1`;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <p className={styles.title}>{video.title}</p>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close video"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Embed */}
        <div className={styles.embedWrap}>
          <iframe
            className={styles.iframe}
            src={embedUrl}
            title={video.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Footer meta */}
        {video.channelTitle && (
          <div className={styles.footer}>
            <span className={styles.channel}>{video.channelTitle}</span>
          </div>
        )}
      </div>
    </div>
  );
}
