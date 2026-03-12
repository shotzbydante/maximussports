import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './VideoPreview.module.css';

/**
 * 9:16 video preview with IG Reels safe-zone guides and overlay zones.
 *
 * Now supports multi-segment edit plans: when playing, the preview
 * jumps across selected segments and approximates speed ramping by
 * adjusting playbackRate per segment.
 */
export default function VideoPreview({
  sourceUrl,
  trimStart = 0,
  trimEnd = 10,
  headline,
  subhead,
  overlayBeats = [],
  beatTimings = null,
  editPlan = null,
  showSafeZones = true,
}) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState('empty');
  const [footageProgress, setFootageProgress] = useState(0);
  const segIdxRef = useRef(0);
  const rafRef = useRef(null);

  const useEditPlan = editPlan && editPlan.segments?.length > 0;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !sourceUrl) return;
    if (useEditPlan) {
      v.currentTime = editPlan.segments[0]?.sourceStart ?? 0;
    } else {
      v.currentTime = trimStart;
    }
  }, [sourceUrl, trimStart, useEditPlan, editPlan]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !sourceUrl || !playing) return;

    if (useEditPlan) {
      const segs = editPlan.segments;
      const totalOut = editPlan.totalOutputDuration;
      let segIdx = segIdxRef.current;

      const tick = () => {
        if (!v || v.paused) return;
        const seg = segs[segIdx];
        if (!seg) {
          v.pause();
          setPlaying(false);
          setFootageProgress(0);
          segIdxRef.current = 0;
          v.currentTime = segs[0]?.sourceStart ?? 0;
          return;
        }

        if (v.currentTime >= seg.sourceEnd - 0.05) {
          segIdx += 1;
          segIdxRef.current = segIdx;
          const nextSeg = segs[segIdx];
          if (!nextSeg) {
            v.pause();
            setPlaying(false);
            setFootageProgress(0);
            segIdxRef.current = 0;
            v.currentTime = segs[0]?.sourceStart ?? 0;
            return;
          }
          v.currentTime = nextSeg.sourceStart;
          v.playbackRate = Math.min(nextSeg.speed || 1, 2);
        }

        let accum = 0;
        for (let i = 0; i < segIdx; i++) accum += segs[i].outputDuration;
        const curSeg = segs[segIdx];
        if (curSeg) {
          const segProg = (v.currentTime - curSeg.sourceStart) / curSeg.sourceDuration;
          accum += Math.min(1, Math.max(0, segProg)) * curSeg.outputDuration;
        }
        if (totalOut > 0) setFootageProgress(accum / totalOut);

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }

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
  }, [sourceUrl, trimStart, trimEnd, playing, useEditPlan, editPlan]);

  useEffect(() => {
    if (sourceUrl) setCurrentScene('footage');
    else setCurrentScene('empty');
  }, [sourceUrl]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      v.playbackRate = 1;
      setPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } else {
      if (useEditPlan) {
        const segs = editPlan.segments;
        segIdxRef.current = 0;
        v.currentTime = segs[0]?.sourceStart ?? 0;
        v.playbackRate = Math.min(segs[0]?.speed || 1, 2);
      } else {
        if (v.currentTime >= trimEnd || v.currentTime < trimStart) {
          v.currentTime = trimStart;
        }
        v.playbackRate = 1;
      }
      v.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing, trimStart, trimEnd, useEditPlan, editPlan]);

  const footageDuration = useEditPlan ? editPlan.totalOutputDuration : (trimEnd - trimStart);
  const headlineVisible = headline && footageDuration > 0;
  const subheadVisible = subhead && footageDuration > 0;

  const activeBeatIndex = overlayBeats.findIndex((beat, i) => {
    if (!beat) return false;
    const timing = beatTimings?.[i] || { startPct: i * 0.33, endPct: i * 0.33 + 0.28 };
    return footageProgress >= timing.startPct && footageProgress <= timing.endPct;
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
              <span className={`${styles.safeLabel} ${styles.safeLabelTop}`}>unsafe</span>
            </div>
            <div className={styles.unsafeBottom}>
              <span className={`${styles.safeLabel} ${styles.safeLabelBottom}`}>unsafe</span>
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
            <span className={`${styles.overlayText} ${styles.overlaySmall}`}>{subhead}</span>
          </div>
        )}

        {sourceUrl && playing && activeBeatIndex >= 0 && overlayBeats[activeBeatIndex] && (
          <div className={styles.overlayZone} style={{ top: '20%' }}>
            <span className={styles.overlayText}>{overlayBeats[activeBeatIndex]}</span>
          </div>
        )}

        {sourceUrl && (
          <div className={styles.sceneLabel}>
            {playing && useEditPlan
              ? `segment ${segIdxRef.current + 1}/${editPlan.segments.length}`
              : currentScene === 'footage' ? 'footage preview' : currentScene}
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
