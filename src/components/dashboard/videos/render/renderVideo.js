/**
 * Client-side video render engine.
 *
 * Pipeline:  Canvas (1080×1920) → VideoEncoder (H.264) → mp4-muxer → Blob
 *
 * Render phases:
 *   1. Branded Intro (1.2s) — logo + hook text, always dark navy
 *   2. Footage — multi-segment with speed ramping + animated overlays
 *   3. Outro (2.2s) — CTA card with robot hero
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getTemplate } from '../templates/featureSpotlight';
import {
  loadLogo,
  loadRobotImage,
  getHookBoostText,
  drawBrandedIntroCard,
  drawOutroCard,
  drawVideoFrame,
  drawHeadlineOverlay,
  drawBeatOverlay,
  drawStatOverlay,
  drawWatermark,
  easeAlpha,
  computeOverlaySafeZone,
  ensureHeadlineEmoji,
} from './drawUtils';
import {
  CaptionLayoutState,
  buildExclusions,
  findSafeZone,
  getCaptionAlpha,
  getCaptionSlideOffset,
  CAPTION_ROLES,
  PREFERRED_CAPTION_GAP,
  MIN_CAPTION_GAP,
  MAX_ACTIVE_CAPTIONS,
} from '../../../../utils/reels/captionLayoutEngine';

// ─── capability check ────────────────────────────────────────────

export function isRenderSupported() {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined'
  );
}

export async function checkH264Support(width = 1080, height = 1920) {
  if (!isRenderSupported()) return false;
  try {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028',
      width,
      height,
      bitrate: 5_000_000,
      framerate: 30,
    });
    return supported;
  } catch {
    return false;
  }
}

// ─── main render function ────────────────────────────────────────

export async function renderVideo(opts) {
  const {
    sourceUrl,
    trimStart = 0,
    trimEnd = 10,
    editPlan = null,
    headline = '',
    subhead = '',
    cta = 'Get Maximus Sports',
    watermark = true,
    overlayBeats = [],
    beatTimings = null,
    templateId = 'feature-spotlight',
    hookStyle = 'product',
    hookAnimationVariant = null,
    textColor = '#ffffff',
    bgColor = '#071426',
    overlayYPositions = null,
    sportContext = 'ncaam',
    onProgress,
    signal,
  } = opts;

  const tpl = getTemplate(templateId);
  const { width: W, height: H, fps, scenes, overlays, brand } = tpl;
  const accentColor = brand.accentColor || '#3C79B4';

  let footageSegments;
  let footageTotalFrames;

  if (editPlan && editPlan.segments && editPlan.segments.length > 0) {
    footageSegments = editPlan.segments;
    footageTotalFrames = editPlan.totalOutputFrames;
  } else {
    const dur = trimEnd - trimStart;
    const frames = Math.max(1, Math.round(dur * fps));
    footageSegments = [{
      sourceStart: trimStart,
      sourceEnd: trimEnd,
      sourceDuration: dur,
      speed: 1.0,
      outputStart: 0,
      outputEnd: dur,
      outputDuration: dur,
      outputFrames: frames,
    }];
    footageTotalFrames = frames;
  }

  const brandedIntroFrames = Math.round(1.2 * fps);
  const outroFrames = Math.round(2.2 * fps);
  const totalFrames = brandedIntroFrames + footageTotalFrames + outroFrames;

  const hookText = getHookBoostText(hookStyle);

  const [logo, video, robotImage] = await Promise.all([
    loadLogo(brand.logo),
    loadSourceVideo(sourceUrl),
    loadRobotImage(),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
  });

  let encodeError = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });

  encoder.configure({
    codec: 'avc1.640028',
    width: W,
    height: H,
    bitrate: 5_000_000,
    framerate: fps,
    avc: { format: 'avc' },
  });

  const fieldValues = { headline, subhead };
  const beatConfigs = buildBeatConfigs(overlayBeats, tpl, beatTimings);
  const segRanges = buildSegmentRanges(footageSegments);

  let safeZone = null;
  let safeZoneComputed = false;

  const captionLayout = new CaptionLayoutState();

  // Pre-plan overlay timing to register with layout state for collision avoidance
  const footageDurationS = footageTotalFrames / fps;
  for (const ov of overlays) {
    const text = fieldValues[ov.field];
    if (!text) continue;
    const startS = ov.startPct * footageDurationS;
    const endS = ov.endPct * footageDurationS;
    captionLayout.addCaption({
      id: `overlay_${ov.id}`,
      startTime: startS,
      endTime: endS,
      x: W * 0.10,
      y: H * (ov.yPct - 0.06),
      width: W * 0.80,
      height: H * 0.12,
      priority: 8,
      zone: 'TOP_CENTER',
    });
  }

  for (const beat of beatConfigs) {
    const startS = beat.startPct * footageDurationS;
    const endS = beat.endPct * footageDurationS;
    captionLayout.addCaption({
      id: `beat_${beat.idx}`,
      startTime: startS,
      endTime: endS,
      x: W * 0.10,
      y: H * 0.66,
      width: W * 0.80,
      height: H * 0.12,
      priority: 6,
      zone: 'BOTTOM_CENTER',
    });
  }

  const firstSeek = footageSegments[0]?.sourceStart ?? trimStart;
  await seekVideo(video, firstSeek);

  const phaseEnd1 = brandedIntroFrames;
  const phaseEnd2 = phaseEnd1 + footageTotalFrames;

  const headlineWithEmoji = ensureHeadlineEmoji(headline);

  // ── render loop ──────────────────────────────────────────────
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) { encoder.close(); throw new DOMException('Render aborted', 'AbortError'); }
    if (encodeError) throw encodeError;

    if (i < phaseEnd1) {
      // Phase 1: Branded Intro Title Card (1.2s) — sport-aware, headline/subhead as hero text
      drawBrandedIntroCard(ctx, logo, { brand, hookText, headline, subhead, sportContext }, i, brandedIntroFrames);

    } else if (i < phaseEnd2) {
      // Phase 2: Footage with safe-zone-aware overlays
      const footageFrame = i - phaseEnd1;
      const footageProgress = footageFrame / footageTotalFrames;
      const footageTimeS = footageFrame / fps;

      const { segment, frameInSegment } = findActiveSegment(segRanges, footageFrame);
      const segProgress = segment.outputFrames > 0 ? frameInSegment / segment.outputFrames : 0;
      const seekTime = segment.sourceStart + segProgress * segment.sourceDuration;

      await seekVideo(video, seekTime);
      drawVideoFrame(ctx, video);

      if (!safeZoneComputed && footageFrame === 0) {
        try {
          safeZone = computeOverlaySafeZone(ctx, W, H);
        } catch { /* ignore */ }
        safeZoneComputed = true;
      }

      const overlayYPctOffset = safeZone ? safeZone.yPct : null;

      // Headline/subhead now live on intro card only — skip them during body footage.
      // Only render non-headline/subhead overlays (e.g. stat overlays) if any exist.
      const bodyOverlays = overlays.filter(ov => ov.field !== 'headline' && ov.field !== 'subhead');
      for (const ov of bodyOverlays) {
        const rawText = fieldValues[ov.field];
        if (!rawText) continue;
        if (footageProgress >= ov.startPct && footageProgress <= ov.endPct) {
          const ovLocal = (footageProgress - ov.startPct) / (ov.endPct - ov.startPct);
          const fadePct = ov.fadeMs / ((footageTotalFrames / fps * 1000) * (ov.endPct - ov.startPct));
          const alpha = easeAlpha(ovLocal, fadePct, fadePct);
          const customY = overlayYPositions?.[ov.field];
          const yPct = customY ?? overlayYPctOffset ?? ov.yPct;

          const slideOffset = getCaptionSlideOffset(footageTimeS, ov.startPct * footageDurationS);
          drawHeadlineOverlay(ctx, rawText, H * yPct - slideOffset, ov.maxFontSize, ov.lineHeight, alpha, accentColor, {
            templateId,
            animProgress: ovLocal,
            textColor,
            bgColor,
          });
        }
      }

      let headlineBottomY = 0;

      // Beat Intelligence Layer v2: safe zones + narrative spacing + hero beat
      const activeBeatCount = beatConfigs.length;
      for (const beat of beatConfigs) {
        if (footageProgress >= beat.startPct && footageProgress <= beat.endPct) {
          const beatLocal = (footageProgress - beat.startPct) / (beat.endPct - beat.startPct);
          const alpha = easeAlpha(beatLocal, 0.15, 0.15);

          const slideOffset = getCaptionSlideOffset(footageTimeS, beat.startPct * footageDurationS);

          // Safe-area Y: distribute beats across upper-mid / center / lower-mid
          // Hero beat gets center bias for visual impact
          const safeYPct = getBeatSafeY(beat.idx, activeBeatCount, beat.isHero);
          const beatY = H * safeYPct - slideOffset;

          // Hero beat (last beat): slightly larger font
          const baseFontSize = beat.isHero ? 42 : 36;

          if (templateId === 'stats-proof') {
            drawStatOverlay(ctx, beat.text, beatY, baseFontSize, 1.3, alpha, accentColor, {
              animProgress: beatLocal,
              textColor,
              bgColor,
            });
          } else {
            const beatOpts = {
              templateId,
              animProgress: beatLocal,
              textColor,
              bgColor,
              isHero: beat.isHero,
              ...(templateId === 'quick-walkthrough' ? { stepNum: beat.idx + 1 } : {}),
            };
            drawBeatOverlay(ctx, beat.text, beatY, baseFontSize, 1.3, alpha, accentColor, beatOpts);
          }
        }
      }

      if (watermark) drawWatermark(ctx, logo);

    } else {
      // Phase 3: Premium Maximus CTA Card (2.2s)
      const outroIdx = i - phaseEnd2;
      const progress = outroIdx / outroFrames;
      const alpha = easeAlpha(progress, 0.15, 0.10);
      drawOutroCard(ctx, logo, {
        cta,
        brand,
        templateId,
        robotImage,
        outroFrame: outroIdx,
        outroTotalFrames: outroFrames,
        sportContext,
      }, alpha);
    }

    const frame = new VideoFrame(canvas, {
      timestamp: i * (1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    if (i % 5 === 0) {
      onProgress?.(i / totalFrames);
      await yieldToMain();
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  onProgress?.(1);

  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ─── helpers ─────────────────────────────────────────────────────

// ── Beat Intelligence Layer v2 ──────────────────────────────────
// Narrative timing anchors: beats land at 15%, 50%, 80% of footage,
// snapped to nearest activity peak if available.
// Final beat is flagged as "hero" for larger/bolder rendering.

const NARRATIVE_ANCHORS = [0.15, 0.50, 0.80];
const BEAT_DISPLAY_DURATION = 0.22; // each beat visible for ~22% of its slot
const MIN_BEAT_GAP_PCT = 0.12; // minimum spacing between beat centers

function buildBeatConfigs(beats, tpl, dynamicTimings) {
  if (!beats || beats.length === 0) return [];
  const beatCount = beats.filter(Boolean).length;

  return beats
    .map((text, i) => {
      if (!text) return null;

      // Priority 1: dynamic timings from activity peaks (already good)
      if (dynamicTimings?.[i]) {
        const t = dynamicTimings[i];
        return { text, startPct: t.startPct, endPct: t.endPct, idx: i, isHero: i === beatCount - 1 };
      }

      // Priority 2: narrative anchors — distribute beats at 15/50/80%
      const anchor = NARRATIVE_ANCHORS[i] ?? (0.15 + i * 0.30);
      const halfDur = BEAT_DISPLAY_DURATION / 2;
      const startPct = Math.max(0.02, anchor - halfDur);
      const endPct = Math.min(0.98, anchor + halfDur);

      return { text, startPct, endPct, idx: i, isHero: i === beatCount - 1 };
    })
    .filter(Boolean);
}

// Safe-area Y zones — avoids scoreboard (top-left) and UI/nav (bottom)
const SAFE_BEAT_ZONES = [
  { yPct: 0.28, label: 'upper-mid' },   // below scoreboard area
  { yPct: 0.52, label: 'center' },       // true center
  { yPct: 0.72, label: 'lower-mid' },    // above nav/UI area
];

function getBeatSafeY(beatIdx, beatCount, isHero) {
  // Hero beat positional bias: final beat centers at ~50% for visual impact
  if (isHero && beatCount >= 3) return 0.50;

  // Distribute beats across safe zones to avoid collision
  // 1 beat → center, 2 beats → upper + lower, 3 → upper + lower-mid + center(hero)
  if (beatCount === 1) return SAFE_BEAT_ZONES[1].yPct;
  if (beatCount === 2) return SAFE_BEAT_ZONES[beatIdx === 0 ? 0 : 2].yPct;
  // 3+ beats: first two get upper and lower-mid, hero goes center
  if (beatIdx === 0) return SAFE_BEAT_ZONES[0].yPct;
  if (beatIdx === 1) return SAFE_BEAT_ZONES[2].yPct;
  return SAFE_BEAT_ZONES[1].yPct;
}

function buildSegmentRanges(segments) {
  const ranges = [];
  let frameOffset = 0;
  for (const seg of segments) {
    ranges.push({ segment: seg, startFrame: frameOffset, endFrame: frameOffset + seg.outputFrames - 1 });
    frameOffset += seg.outputFrames;
  }
  return ranges;
}

function findActiveSegment(ranges, footageFrame) {
  for (const r of ranges) {
    if (footageFrame >= r.startFrame && footageFrame <= r.endFrame) {
      return { segment: r.segment, frameInSegment: footageFrame - r.startFrame };
    }
  }
  const last = ranges[ranges.length - 1];
  return { segment: last.segment, frameInSegment: 0 };
}

function loadSourceVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load source video'));
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.01) {
      resolve();
      return;
    }
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
