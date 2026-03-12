/**
 * Client-side video render engine.
 *
 * Pipeline:  Canvas (1080×1920) → VideoEncoder (H.264) → mp4-muxer → Blob
 *
 * Render phases:
 *   1. Hook Boost (0.7s) — micro pattern-interrupt with bold hook text
 *   2. Intro card — branded template intro
 *   3. Footage — multi-segment with speed ramping + animated overlays
 *   4. Outro — CTA card with optional robot hero
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getTemplate } from '../templates/featureSpotlight';
import {
  loadLogo,
  loadRobotImage,
  drawHookBoostFrame,
  getHookBoostText,
  drawIntroCard,
  drawOutroCard,
  drawVideoFrame,
  drawHeadlineOverlay,
  drawBeatOverlay,
  drawStatOverlay,
  drawWatermark,
  easeAlpha,
  computeOverlaySafeZone,
} from './drawUtils';

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

  const hookBoostFrames = Math.round(0.7 * fps);
  const introFrames = Math.round((scenes.intro.durationMs / 1000) * fps);
  const outroFrames = Math.round((scenes.outro.durationMs / 1000) * fps);
  const totalFrames = hookBoostFrames + introFrames + footageTotalFrames + outroFrames;

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

  // Seek video to first segment's start for the hook boost blurred background
  const firstSeek = footageSegments[0]?.sourceStart ?? trimStart;
  await seekVideo(video, firstSeek + 1);

  // ── render loop ──────────────────────────────────────────────
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) { encoder.close(); throw new DOMException('Render aborted', 'AbortError'); }
    if (encodeError) throw encodeError;

    if (i < hookBoostFrames) {
      // Phase 1: Hook Boost Frame
      drawHookBoostFrame(ctx, video, {
        hookText,
        brand,
        frameIndex: i,
        totalFrames: hookBoostFrames,
        fps,
      });

    } else if (i < hookBoostFrames + introFrames) {
      // Phase 2: Intro card
      const introIdx = i - hookBoostFrames;
      const progress = introIdx / introFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawIntroCard(ctx, logo, { headline, brand, templateId }, alpha);

    } else if (i < hookBoostFrames + introFrames + footageTotalFrames) {
      // Phase 3: Footage with overlays
      const footageFrame = i - hookBoostFrames - introFrames;
      const footageProgress = footageFrame / footageTotalFrames;

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

      for (const ov of overlays) {
        const text = fieldValues[ov.field];
        if (!text) continue;
        if (footageProgress >= ov.startPct && footageProgress <= ov.endPct) {
          const ovLocal = (footageProgress - ov.startPct) / (ov.endPct - ov.startPct);
          const fadePct = ov.fadeMs / ((footageTotalFrames / fps * 1000) * (ov.endPct - ov.startPct));
          const alpha = easeAlpha(ovLocal, fadePct, fadePct);
          const yPct = overlayYPctOffset || ov.yPct;
          drawHeadlineOverlay(ctx, text, H * yPct, ov.maxFontSize, ov.lineHeight, alpha, accentColor, {
            templateId,
            animProgress: ovLocal,
          });
        }
      }

      for (const beat of beatConfigs) {
        if (footageProgress >= beat.startPct && footageProgress <= beat.endPct) {
          const beatLocal = (footageProgress - beat.startPct) / (beat.endPct - beat.startPct);
          const alpha = easeAlpha(beatLocal, 0.15, 0.15);
          if (templateId === 'stats-proof') {
            drawStatOverlay(ctx, beat.text, H * 0.72, 36, 1.3, alpha, accentColor, {
              animProgress: beatLocal,
            });
          } else {
            const beatOpts = {
              templateId,
              animProgress: beatLocal,
              ...(templateId === 'quick-walkthrough' ? { stepNum: beat.idx + 1 } : {}),
            };
            drawBeatOverlay(ctx, beat.text, H * 0.72, 36, 1.3, alpha, accentColor, beatOpts);
          }
        }
      }

      if (watermark) drawWatermark(ctx, logo);

    } else {
      // Phase 4: Outro with robot
      const outroIdx = i - hookBoostFrames - introFrames - footageTotalFrames;
      const progress = outroIdx / outroFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawOutroCard(ctx, logo, {
        cta,
        brand,
        templateId,
        robotImage,
        outroFrame: outroIdx,
        outroTotalFrames: outroFrames,
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

function buildBeatConfigs(beats, tpl, dynamicTimings) {
  if (!beats || beats.length === 0) return [];
  const beatDefs = tpl.overlayBeats || [];
  return beats
    .map((text, i) => {
      if (!text) return null;
      const timing = dynamicTimings?.[i] || beatDefs[i] || { startPct: i * 0.33, endPct: i * 0.33 + 0.28 };
      return { text, startPct: timing.startPct, endPct: timing.endPct, idx: i };
    })
    .filter(Boolean);
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
