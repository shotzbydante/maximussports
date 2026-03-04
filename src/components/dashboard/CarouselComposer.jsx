import { useEffect } from 'react';
import DailyBriefingSlide1 from './slides/DailyBriefingSlide1';
import DailyBriefingSlide2 from './slides/DailyBriefingSlide2';
import DailyBriefingSlide3 from './slides/DailyBriefingSlide3';
import styles from './CarouselComposer.module.css';

/**
 * Renders the 3-slide Daily Briefing carousel in preview mode.
 * The `exportRef` wraps the full-res slide artboards (hidden from view but
 * readable by html-to-image at 1080×1350).
 */
export default function CarouselComposer({ data, exportRef, onAssetsReady }) {
  const asOf = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  });

  useEffect(() => {
    // Signal ready after a short paint delay so images can finish loading
    const t = setTimeout(() => onAssetsReady?.(), 600);
    return () => clearTimeout(t);
  }, [data, onAssetsReady]);

  const slideProps = { data, asOf };

  return (
    <div className={styles.root}>
      {/* ── Scaled preview row ─────────────────────────── */}
      <div className={styles.previewRow}>
        {[DailyBriefingSlide1, DailyBriefingSlide2, DailyBriefingSlide3].map(
          (SlideComp, i) => (
            <div key={i} className={styles.previewWrapper}>
              <div className={styles.slideLabel}>Slide {i + 1}</div>
              <div className={styles.previewScaler}>
                <div className={styles.previewClip}>
                  <SlideComp {...slideProps} />
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Full-res artboards (used for export, visually hidden) ── */}
      <div className={styles.exportLayer} ref={exportRef} aria-hidden="true">
        <DailyBriefingSlide1 {...slideProps} data-slide="1" />
        <DailyBriefingSlide2 {...slideProps} data-slide="2" />
        <DailyBriefingSlide3 {...slideProps} data-slide="3" />
      </div>
    </div>
  );
}
