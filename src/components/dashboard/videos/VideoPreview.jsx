import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './VideoPreview.module.css';

const SAFE_TOP = 0.16;
const SAFE_BOTTOM = 0.76;
const MIN_GAP = 0.10;

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
  overlayYPositions = null,
  onOverlayPositionChange = null,
}) {
  const videoRef = useRef(null);
  const innerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState('empty');
  const [footageProgress, setFootageProgress] = useState(0);
  const segIdxRef = useRef(0);
  const rafRef = useRef(null);
  const [dragging, setDragging] = useState(null);

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

  const headlineY = overlayYPositions?.headline ?? 0.20;
  const subheadY = overlayYPositions?.subhead ?? 0.32;
  const canDrag = !playing && onOverlayPositionChange && sourceUrl;

  const handleDragStart = useCallback((field, e) => {
    if (!canDrag || !innerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = innerRef.current.getBoundingClientRect();
    const startClientY = e.clientY ?? e.touches?.[0]?.clientY;
    const startPct = field === 'headline' ? headlineY : subheadY;
    setDragging(field);

    const handleMove = (moveE) => {
      const clientY = moveE.clientY ?? moveE.touches?.[0]?.clientY;
      const dy = (clientY - startClientY) / rect.height;
      let newY = startPct + dy;

      if (field === 'headline') {
        newY = Math.max(SAFE_TOP, Math.min(SAFE_BOTTOM - MIN_GAP, newY));
        onOverlayPositionChange('headline', parseFloat(newY.toFixed(3)));
        const currentSubY = overlayYPositions?.subhead ?? 0.32;
        if (currentSubY < newY + MIN_GAP) {
          onOverlayPositionChange('subhead', parseFloat(Math.min(SAFE_BOTTOM, newY + MIN_GAP).toFixed(3)));
        }
      } else {
        const currentHeadY = overlayYPositions?.headline ?? 0.20;
        newY = Math.max(currentHeadY + MIN_GAP, Math.min(SAFE_BOTTOM, newY));
        onOverlayPositionChange('subhead', parseFloat(newY.toFixed(3)));
      }
    };

    const handleUp = () => {
      setDragging(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  }, [canDrag, headlineY, subheadY, onOverlayPositionChange, overlayYPositions]);

  return (
    <div className={styles.previewWrap}>
      <div className={styles.inner} ref={innerRef}>
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
          <div
            className={`${styles.overlayZone} ${canDrag ? styles.overlayDraggable : ''} ${dragging === 'headline' ? styles.overlayDragging : ''}`}
            style={{ top: `${headlineY * 100}%` }}
            onMouseDown={canDrag ? (e) => handleDragStart('headline', e) : undefined}
            onTouchStart={canDrag ? (e) => handleDragStart('headline', e) : undefined}
          >
            {canDrag && <span className={styles.dragHandle}>⠿</span>}
            <span className={styles.overlayText}>{headline}</span>
          </div>
        )}
        {sourceUrl && subheadVisible && !playing && (
          <div
            className={`${styles.overlayZone} ${canDrag ? styles.overlayDraggable : ''} ${dragging === 'subhead' ? styles.overlayDragging : ''}`}
            style={{ top: `${subheadY * 100}%`, opacity: 0.55 }}
            onMouseDown={canDrag ? (e) => handleDragStart('subhead', e) : undefined}
            onTouchStart={canDrag ? (e) => handleDragStart('subhead', e) : undefined}
          >
            {canDrag && <span className={styles.dragHandle}>⠿</span>}
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
