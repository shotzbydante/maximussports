/**
 * Client-side video render engine.
 *
 * Pipeline:  Canvas (1080×1920) → VideoEncoder (H.264) → mp4-muxer → Blob
 *
 * Supports two modes:
 *   1. Simple trim (trimStart/trimEnd) — single continuous segment
 *   2. Edit plan (editPlan) — multi-segment with per-segment speed ramping
 *
 * The edit plan takes priority when provided. Uses premium overlay
 * drawing (drawHeadlineOverlay, drawBeatOverlay) with template-specific
 * accent colors.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getTemplate } from '../templates/featureSpotlight';
import {
  loadLogo,
  drawIntroCard,
  drawOutroCard,
  drawVideoFrame,
  drawHeadlineOverlay,
  drawBeatOverlay,
  drawWatermark,
  easeAlpha,
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
    onProgress,
    signal,
  } = opts;

  const tpl = getTemplate(templateId);
  const { width: W, height: H, fps, scenes, overlays, brand } = tpl;
  const accentColor = brand.accentColor || '#3C79B4';

  // Determine footage segments
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

  const introFrames = Math.round((scenes.intro.durationMs / 1000) * fps);
  const outroFrames = Math.round((scenes.outro.durationMs / 1000) * fps);
  const totalFrames = introFrames + footageTotalFrames + outroFrames;

  const [logo, video] = await Promise.all([
    loadLogo(brand.logo),
    loadSourceVideo(sourceUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

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

  // Pre-compute segment frame ranges for fast lookup
  const segRanges = buildSegmentRanges(footageSegments);

  // ── render loop ──────────────────────────────────────────────
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) { encoder.close(); throw new DOMException('Render aborted', 'AbortError'); }
    if (encodeError) throw encodeError;

    if (i < introFrames) {
      const progress = i / introFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawIntroCard(ctx, logo, { headline, brand }, alpha);

    } else if (i < introFrames + footageTotalFrames) {
      const footageFrame = i - introFrames;
      const footageProgress = footageFrame / footageTotalFrames;

      // Find active segment and compute seek time
      const { segment, frameInSegment } = findActiveSegment(segRanges, footageFrame);
      const segProgress = segment.outputFrames > 0 ? frameInSegment / segment.outputFrames : 0;
      const seekTime = segment.sourceStart + segProgress * segment.sourceDuration;

      await seekVideo(video, seekTime);
      drawVideoFrame(ctx, video);

      // Draw headline/subhead overlays with premium styling
      for (const ov of overlays) {
        const text = fieldValues[ov.field];
        if (!text) continue;
        if (footageProgress >= ov.startPct && footageProgress <= ov.endPct) {
          const ovLocal = (footageProgress - ov.startPct) / (ov.endPct - ov.startPct);
          const fadePct = ov.fadeMs / ((footageTotalFrames / fps * 1000) * (ov.endPct - ov.startPct));
          const alpha = easeAlpha(ovLocal, fadePct, fadePct);
          drawHeadlineOverlay(ctx, text, H * ov.yPct, ov.maxFontSize, ov.lineHeight, alpha, accentColor);
        }
      }

      // Draw beat overlays with accent-dot styling
      for (const beat of beatConfigs) {
        if (footageProgress >= beat.startPct && footageProgress <= beat.endPct) {
          const beatLocal = (footageProgress - beat.startPct) / (beat.endPct - beat.startPct);
          const alpha = easeAlpha(beatLocal, 0.15, 0.15);
          drawBeatOverlay(ctx, beat.text, H * 0.72, 36, 1.3, alpha, accentColor);
        }
      }

      if (watermark) drawWatermark(ctx, logo);

    } else {
      const outroIdx = i - introFrames - footageTotalFrames;
      const progress = outroIdx / outroFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawOutroCard(ctx, logo, { cta, brand }, alpha);
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
      return { text, startPct: timing.startPct, endPct: timing.endPct };
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
