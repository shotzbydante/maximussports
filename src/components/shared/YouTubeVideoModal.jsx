/**
 * YouTubeVideoModal — full-screen overlay that embeds the video iframe.
 * Iframe is rendered ONLY when the modal is open.
 *
 * Accessibility:
 *   - Focus is moved to the close button on open.
 *   - Tab key is trapped within the modal while open.
 *   - ESC key, backdrop click, or X button close the modal.
 *   - Body scroll is locked while open and restored on close/unmount.
 */
import { useEffect, useCallback, useRef } from 'react';
import { track } from '../../analytics/index';
import styles from './YouTubeVideoModal.module.css';

const FOCUSABLE_SELECTORS = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function YouTubeVideoModal({ video, onClose, source = 'unknown' }) {
  const open = !!video;
  const panelRef   = useRef(null);
  const closeBtnRef = useRef(null);

  // ── Analytics: open / close ───────────────────────────────────────────────
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      track('video_modal_open', {
        video_id: video?.videoId,
        title:    (video?.title ?? '').slice(0, 100),
        source,
      });
    }
    if (!open && prevOpenRef.current) {
      track('video_modal_close', { source });
    }
    prevOpenRef.current = open;
  }, [open, video, source]);

  // ── Focus close button when modal opens ───────────────────────────────────
  useEffect(() => {
    if (open && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [open]);

  // ── Scroll lock + keyboard handling ──────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }

      // Focus trap on Tab / Shift+Tab
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll(FOCUSABLE_SELECTORS),
        ).filter((el) => !el.disabled);
        if (!focusable.length) return;

        const first = focusable[0];
        const last  = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
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
      <div className={styles.panel} ref={panelRef}>
        {/* Header */}
        <div className={styles.header}>
          <p className={styles.title}>{video.title}</p>
          <button
            ref={closeBtnRef}
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
