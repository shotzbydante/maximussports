import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './VideoPreview.module.css';

/**
 * 9:16 video preview with IG Reels safe-zone guides and overlay zones.
 *
 * This is a *preview-only* component — it shows the user an approximation
 * of the final render using HTML/CSS overlays over an <video> element.
 * The actual export uses Canvas + WebCodecs (see renderVideo.js).
 */
export default function VideoPreview({
  sourceUrl,
  trimStart = 0,
  trimEnd = 10,
  headline,
  subhead,
  showSafeZones = true,
}) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState('empty');

  // clamp playback to trim window
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !sourceUrl) return;

    v.currentTime = trimStart;

    const onTimeUpdate = () => {
      if (v.currentTime >= trimEnd) {
        v.pause();
        v.currentTime = trimStart;
        setPlaying(false);
      }
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [sourceUrl, trimStart, trimEnd]);

  useEffect(() => {
    if (sourceUrl) setCurrentScene('footage');
    else setCurrentScene('empty');
  }, [sourceUrl]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      if (v.currentTime >= trimEnd || v.currentTime < trimStart) {
        v.currentTime = trimStart;
      }
      v.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing, trimStart, trimEnd]);

  // compute overlay visibility based on footage progress
  const footageDuration = trimEnd - trimStart;
  const headlineVisible = headline && footageDuration > 0;
  const subheadVisible = subhead && footageDuration > 0;

  return (
    <div className={styles.previewWrap}>
      <div className={styles.inner}>
        {/* source video */}
        {sourceUrl ? (
          <>
            <video
              ref={videoRef}
              className={styles.video}
              src={sourceUrl}
              muted
              playsInline
              preload="auto"
            />

            {/* play button */}
            {!playing && (
              <div className={styles.playOverlay} onClick={togglePlay}>
                <div className={styles.playBtn}>
                  <div className={styles.playIcon} />
                </div>
              </div>
            )}
            {playing && (
              <div
                className={styles.playOverlay}
                style={{ background: 'transparent' }}
                onClick={togglePlay}
              />
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📱</div>
            <div className={styles.emptyLabel}>Upload a clip to preview</div>
          </div>
        )}

        {/* safe zone guides */}
        {showSafeZones && sourceUrl && (
          <div className={styles.safeOverlay}>
            <div className={styles.unsafeTop}>
              <span className={`${styles.safeLabel} ${styles.safeLabelTop}`}>
                unsafe
              </span>
            </div>
            <div className={styles.unsafeBottom}>
              <span className={`${styles.safeLabel} ${styles.safeLabelBottom}`}>
                unsafe
              </span>
            </div>
          </div>
        )}

        {/* text overlay previews */}
        {sourceUrl && headlineVisible && (
          <div className={styles.overlayZone} style={{ top: '20%' }}>
            <span className={styles.overlayText}>{headline}</span>
          </div>
        )}
        {sourceUrl && subheadVisible && (
          <div className={styles.overlayZone} style={{ top: '20%', opacity: 0.45 }}>
            <span className={`${styles.overlayText} ${styles.overlayPlaceholder}`}>
              {subhead} <span style={{ fontSize: 9, opacity: 0.6 }}>(appears after headline)</span>
            </span>
          </div>
        )}

        {/* scene label */}
        {sourceUrl && (
          <div className={styles.sceneLabel}>
            {currentScene === 'footage' ? 'footage preview' : currentScene}
          </div>
        )}
      </div>
    </div>
  );
}
