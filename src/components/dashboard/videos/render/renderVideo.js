/**
 * Client-side video render engine.
 *
 * Pipeline:  Canvas (1080×1920) → VideoEncoder (H.264) → mp4-muxer → Blob
 *
 * Requires WebCodecs (Chrome 94+, Safari 16.4+).
 * Supports dynamic beat timing from clip analysis and template-defined
 * overlay positions. The render loop composites intro/outro cards
 * and text overlays onto a Canvas, encoding each frame.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getTemplate } from '../templates/featureSpotlight';
import {
  loadLogo,
  drawIntroCard,
  drawOutroCard,
  drawVideoFrame,
  drawTextOverlay,
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

/**
 * @param {object}   opts
 * @param {string}   opts.sourceUrl        Object URL or public URL
 * @param {number}   opts.trimStart        Trim start in seconds
 * @param {number}   opts.trimEnd          Trim end in seconds
 * @param {string}   opts.headline         Headline overlay text
 * @param {string}   opts.subhead          Subhead overlay text
 * @param {string}   opts.cta              CTA text for outro
 * @param {boolean}  [opts.watermark]      Show logo watermark
 * @param {string[]} [opts.overlayBeats]   Beat text array
 * @param {Array}    [opts.beatTimings]    Dynamic beat timing [{startPct, endPct}]
 * @param {string}   [opts.templateId]     Template ID
 * @param {function} [opts.onProgress]     (0-1) progress callback
 * @param {AbortSignal} [opts.signal]      Abort signal
 * @returns {Promise<Blob>}  H.264 MP4 blob
 */
export async function renderVideo(opts) {
  const {
    sourceUrl,
    trimStart,
    trimEnd,
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

  const footageDurMs = (trimEnd - trimStart) * 1000;
  const introFrames = Math.round((scenes.intro.durationMs / 1000) * fps);
  const footageFrames = Math.round((footageDurMs / 1000) * fps);
  const outroFrames = Math.round((scenes.outro.durationMs / 1000) * fps);
  const totalFrames = introFrames + footageFrames + outroFrames;

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

  // ── render loop ──────────────────────────────────────────────
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) { encoder.close(); throw new DOMException('Render aborted', 'AbortError'); }
    if (encodeError) throw encodeError;

    if (i < introFrames) {
      const progress = i / introFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawIntroCard(ctx, logo, { headline, brand }, alpha);

    } else if (i < introFrames + footageFrames) {
      const footageIdx = i - introFrames;
      const footageProgress = footageIdx / footageFrames;
      const seekTime = trimStart + footageIdx / fps;

      await seekVideo(video, seekTime);
      drawVideoFrame(ctx, video);

      for (const ov of overlays) {
        const text = fieldValues[ov.field];
        if (!text) continue;
        if (footageProgress >= ov.startPct && footageProgress <= ov.endPct) {
          const ovLocal = (footageProgress - ov.startPct) / (ov.endPct - ov.startPct);
          const fadePct = ov.fadeMs / (footageDurMs * (ov.endPct - ov.startPct));
          const alpha = easeAlpha(ovLocal, fadePct, fadePct);
          drawTextOverlay(ctx, text, H * ov.yPct, ov.maxFontSize, ov.lineHeight, alpha);
        }
      }

      for (const beat of beatConfigs) {
        if (footageProgress >= beat.startPct && footageProgress <= beat.endPct) {
          const beatLocal = (footageProgress - beat.startPct) / (beat.endPct - beat.startPct);
          const alpha = easeAlpha(beatLocal, 0.15, 0.15);
          drawTextOverlay(ctx, beat.text, H * 0.72, 36, 1.3, alpha);
        }
      }

      if (watermark) drawWatermark(ctx, logo);

    } else {
      const outroIdx = i - introFrames - footageFrames;
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
      // prefer dynamic (analysis-driven) timings, fall back to template defaults
      const timing = dynamicTimings?.[i] || beatDefs[i] || { startPct: i * 0.33, endPct: i * 0.33 + 0.28 };
      return { text, startPct: timing.startPct, endPct: timing.endPct };
    })
    .filter(Boolean);
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
