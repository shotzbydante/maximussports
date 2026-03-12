import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './VideoPreview.module.css';

/**
 * 9:16 video preview with IG Reels safe-zone guides and overlay zones.
 *
 * This is a *preview-only* component — it shows the user an approximation
 * of the final render using HTML/CSS overlays over a <video> element.
 * The actual export uses Canvas + WebCodecs (see renderVideo.js).
 */
export default function VideoPreview({
  sourceUrl,
  trimStart = 0,
  trimEnd = 10,
  headline,
  subhead,
  overlayBeats = [],
  showSafeZones = true,
}) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState('empty');
  const [footageProgress, setFootageProgress] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !sourceUrl) return;

    v.currentTime = trimStart;

    const onTimeUpdate = () => {
      if (v.currentTime >= trimEnd) {
        v.pause();
        v.currentTime = trimStart;
        setPlaying(false);
        setFootageProgress(0);
      } else {
        const dur = trimEnd - trimStart;
        if (dur > 0) {
          setFootageProgress((v.currentTime - trimStart) / dur);
        }
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

  const footageDuration = trimEnd - trimStart;
  const headlineVisible = headline && footageDuration > 0;
  const subheadVisible = subhead && footageDuration > 0;

  const activeBeatIndex = overlayBeats.findIndex((beat, i) => {
    if (!beat) return false;
    const beatStart = i * 0.33;
    const beatEnd = beatStart + 0.28;
    return footageProgress >= beatStart && footageProgress <= beatEnd;
  });

  return (
    <div className={styles.previewWrap}>
      <div className={styles.inner}>
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

        {sourceUrl && headlineVisible && !playing && (
          <div className={styles.overlayZone} style={{ top: '20%' }}>
            <span className={styles.overlayText}>{headline}</span>
          </div>
        )}
        {sourceUrl && subheadVisible && !playing && (
          <div className={styles.overlayZone} style={{ top: '32%', opacity: 0.55 }}>
            <span className={`${styles.overlayText} ${styles.overlaySmall}`}>
              {subhead}
            </span>
          </div>
        )}

        {sourceUrl && playing && activeBeatIndex >= 0 && overlayBeats[activeBeatIndex] && (
          <div className={styles.overlayZone} style={{ top: '20%' }}>
            <span className={styles.overlayText}>{overlayBeats[activeBeatIndex]}</span>
          </div>
        )}

        {sourceUrl && (
          <div className={styles.sceneLabel}>
            {currentScene === 'footage' ? 'footage preview' : currentScene}
          </div>
        )}

        {sourceUrl && overlayBeats.some(b => b) && !playing && (
          <div className={styles.beatsPreview}>
            {overlayBeats.map((b, i) => b && (
              <div key={i} className={styles.beatChip}>
                <span className={styles.beatNum}>{i + 1}</span> {b}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
